import type { Ticket, TriageResult } from '../../shared/types';
import { db } from '../store';
import { searchPolicies } from '../retrieval/policySearch';
import { buildTriagePrompt, SYSTEM_PROMPT } from './promptBuilder';
import { parseTriageResponse } from './parser';
import { enforceEscalationFloor, enforceRefundWindow } from './policyGuards';
import { findLeakedInternalNote } from './replySafety';
import { getLLMClient } from '../llm/client';

export async function runTriage(ticket: Ticket): Promise<TriageResult> {
  const query = `${ticket.subject} ${ticket.message}`;
  const retrieved = searchPolicies(query, db.policies, 3);

  const prompt = buildTriagePrompt(
    ticket,
    retrieved.map((r) => r.doc)
  );

  const retrievedLog = retrieved.map((r) => ({
    id: r.doc.id,
    title: r.doc.title,
    score: r.score,
    status: r.doc.status,
  }));

  let raw = '';
  try {
    const llm = getLLMClient();
    raw = await llm.complete({ system: SYSTEM_PROMPT, user: prompt });
    const parsed = enforceEscalationFloor(
      ticket,
      enforceRefundWindow(ticket, parseTriageResponse(raw))
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
        query,
        retrieved: retrievedLog,
        prompt,
        raw,
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
        query,
        retrieved: retrievedLog,
        prompt,
        raw,
        error: err instanceof Error ? err.message : String(err),
      })
    );
    throw err;
  }
}
