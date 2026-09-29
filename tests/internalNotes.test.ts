import { beforeEach, describe, expect, it } from 'vitest';
import { tickets } from '../server/data/tickets';
import { buildTriagePrompt } from '../server/triage/promptBuilder';
import { findLeakedInternalNote } from '../server/triage/replySafety';
import { runTriage } from '../server/triage/triageService';
import { db, getTicket } from '../server/store';
import { setLLMClient, type LLMClient } from '../server/llm/client';
import { MockLLM } from '../server/llm/mock';

const noted = tickets.filter((t) => t.internalNotes.length > 0);

describe('internal notes stay out of customer-facing triage', () => {
  beforeEach(() => {
    setLLMClient(new MockLLM());
    db.triageResults.clear();
  });

  it('does not place internal notes in the model prompt', () => {
    for (const ticket of noted) {
      const prompt = buildTriagePrompt(ticket, []);
      expect(prompt).not.toContain('Internal notes:');
      for (const note of ticket.internalNotes) {
        expect(prompt).not.toContain(note);
      }
    }
  });

  it('does not copy internal notes into the drafted reply', async () => {
    for (const ticket of noted) {
      const result = await runTriage(ticket);
      for (const note of ticket.internalNotes) {
        expect(result.reply).not.toContain(note);
      }
    }
  }, 20000);

  it('refuses to store a reply that repeats an internal note', async () => {
    const ticket = getTicket('T-1009')!;
    const leaking: LLMClient = {
      async complete() {
        return JSON.stringify({
          category: 'refund',
          urgency: 'low',
          escalate: false,
          reply: `Hi. Also, regarding your account: ${ticket.internalNotes[0]}`,
          reasoning: 'grounded in the note',
        });
      },
    };
    setLLMClient(leaking);

    await expect(runTriage(ticket)).rejects.toThrow(/internal notes/i);
    expect(db.triageResults.get(ticket.id)).toBeUndefined();
  });

  it('detects an internal incident identifier copied without the rest of its note', () => {
    const ticket = getTicket('T-1003')!;
    expect(findLeakedInternalNote('We tracked this as incident INC-4432.', ticket.internalNotes))
      .toBe(ticket.internalNotes[0]);
  });

  it('refuses to store a sensitive score copied from part of an internal note', async () => {
    const ticketId = 'T-1009';
    const leaking: LLMClient = {
      async complete() {
        return JSON.stringify({
          category: 'general',
          urgency: 'low',
          escalate: false,
          reply: 'The account has a Fraud risk score: 87.',
          reasoning: 'model-generated',
        });
      },
    };
    setLLMClient(leaking);

    await expect(runTriage(getTicket(ticketId)!)).rejects.toThrow(/internal notes/i);
    expect(db.triageResults.get(ticketId)).toBeUndefined();
  });
});
