import type { Ticket, TriageResult } from '../../shared/types';
import { db } from '../store';
import { searchPolicies } from '../retrieval/policySearch';
import { buildTriagePrompt, SYSTEM_PROMPT } from './promptBuilder';
import { parseTriageResponse } from './parser';
import {
  enforceBillingReview,
  enforceCategoryRules,
  enforceEscalationFloor,
  enforceGroundedReply,
  enforceRefundWindow,
  enforceUrgencyFloor,
} from './policyGuards';
import { findLeakedInternalNote } from './replySafety';
import { getLLMClient } from '../llm/client';
import { llmTimeoutMs, withTimeout } from '../llm/timeout';

const inFlight = new Map<string, Promise<TriageResult>>();
const CUSTOMER_BLOCK =
  /<<<UNTRUSTED CUSTOMER TICKET>>>[\s\S]*?<<<END UNTRUSTED CUSTOMER TICKET>>>/;

function promptForLog(prompt: string): string {
  return prompt.replace(
    CUSTOMER_BLOCK,
    '<<<UNTRUSTED CUSTOMER TICKET>>>\n[REDACTED CUSTOMER TICKET]\n<<<END UNTRUSTED CUSTOMER TICKET>>>'
  );
}

export function runTriage(ticket: Ticket): Promise<TriageResult> {
  const existing = inFlight.get(ticket.id);
  if (existing) return existing;

  const request = runTriageOnce(ticket).finally(() => {
    if (inFlight.get(ticket.id) === request) inFlight.delete(ticket.id);
  });
  inFlight.set(ticket.id, request);
  return request;
}

async function runTriageOnce(ticket: Ticket): Promise<TriageResult> {
  const query = `${ticket.subject} ${ticket.message}`;
  const retrieved = searchPolicies(query, db.policies, 3);
  const policies = retrieved.map((result) => result.doc);

  const prompt = buildTriagePrompt(ticket, policies);

  const retrievedLog = retrieved.map((r) => ({
    id: r.doc.id,
    title: r.doc.title,
    score: r.score,
    status: r.doc.status,
  }));

  let raw = '';
  try {
    const llm = getLLMClient();
    raw = await withTimeout(
      llm.complete({ system: SYSTEM_PROMPT, user: prompt }),
      llmTimeoutMs()
    );
    const parsed = enforceUrgencyFloor(
      ticket,
      enforceEscalationFloor(
        ticket,
        enforceGroundedReply(
          ticket,
          enforceBillingReview(
            ticket,
            enforceRefundWindow(
              ticket,
              enforceCategoryRules(ticket, parseTriageResponse(raw))
            )
          ),
          policies
        )
      )
    );

    if (findLeakedInternalNote(parsed.reply, ticket.internalNotes)) {
      throw new Error(
        `Refusing to store triage for ${ticket.id}: drafted reply repeats internal notes`
      );
    }

    const result: TriageResult = {
      ticketId: ticket.id,
      category: parsed.category,
      urgency: parsed.urgency,
      escalate: parsed.escalate,
      reply: parsed.reply,
      reasoning: parsed.reasoning,
      citations: retrieved.map((r) => ({
        docId: r.doc.id,
        title: r.doc.title,
        snippet: r.doc.body.slice(0, 140) + '…',
      })),
      generatedAt: new Date().toISOString(),
    };

    // One structured line so a bad citation or a bad draft can be traced
    // without guessing. Internal notes are not included; they are not in the prompt.
    console.log(
      JSON.stringify({
        event: 'triage',
        ticketId: ticket.id,
        query: ticket.subject,
        retrieved: retrievedLog,
        prompt: promptForLog(prompt),
        raw: JSON.stringify({
          category: result.category,
          urgency: result.urgency,
          escalate: result.escalate,
          reply: '[REDACTED]',
          reasoning: '[REDACTED]',
        }),
        category: result.category,
        urgency: result.urgency,
        escalate: result.escalate,
      })
    );

    db.triageResults.set(ticket.id, result);
    return result;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'triage_error',
        ticketId: ticket.id,
        query: ticket.subject,
        retrieved: retrievedLog,
        prompt: promptForLog(prompt),
        raw: raw ? '[REDACTED MODEL OUTPUT]' : '',
        error: err instanceof Error ? err.message : String(err),
      })
    );
    throw err;
  }
}
