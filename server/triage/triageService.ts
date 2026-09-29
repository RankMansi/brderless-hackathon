import type { Ticket, TriageResult } from '../../shared/types';
import { db } from '../store';
import { searchPolicies } from '../retrieval/policySearch';
import { buildTriagePrompt, SYSTEM_PROMPT } from './promptBuilder';
import { parseTriageResponse } from './parser';
import { findLeakedInternalNote } from './replySafety';
import { getLLMClient } from '../llm/client';

export async function runTriage(ticket: Ticket): Promise<TriageResult> {
  const query = `${ticket.subject} ${ticket.message}`;
  const retrieved = searchPolicies(query, db.policies, 3);

  const prompt = buildTriagePrompt(
    ticket,
    retrieved.map((r) => r.doc)
  );

  const llm = getLLMClient();
  const raw = await llm.complete({ system: SYSTEM_PROMPT, user: prompt });
  const parsed = parseTriageResponse(raw);

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

  db.triageResults.set(ticket.id, result);
  console.log(`[triage] ${ticket.id} -> ${result.category}/${result.urgency}`);
  return result;
}
