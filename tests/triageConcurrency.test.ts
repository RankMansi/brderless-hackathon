import { beforeEach, describe, expect, it } from 'vitest';
import type { LLMClient } from '../server/llm/client';
import { setLLMClient } from '../server/llm/client';
import { getTicket, db } from '../server/store';
import { runTriage } from '../server/triage/triageService';

describe('concurrent triage', () => {
  beforeEach(() => {
    db.triageResults.clear();
  });

  it('coalesces simultaneous runs for the same ticket', async () => {
    let calls = 0;
    const delayed: LLMClient = {
      async complete() {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return JSON.stringify({
          category: 'general',
          urgency: 'low',
          escalate: false,
          reply: 'Thanks for writing. We will follow up.',
          reasoning: 'general request',
        });
      },
    };
    setLLMClient(delayed);
    const ticket = getTicket('T-1012')!;

    const [first, second] = await Promise.all([runTriage(ticket), runTriage(ticket)]);

    expect(calls).toBe(1);
    expect(second).toEqual(first);
    expect(db.triageResults.get(ticket.id)).toEqual(first);
  });

  it('allows a new run after the previous one settles', async () => {
    let calls = 0;
    const immediate: LLMClient = {
      async complete() {
        calls += 1;
        return JSON.stringify({
          category: 'general',
          urgency: 'low',
          escalate: false,
          reply: 'Thanks for writing. We will follow up.',
          reasoning: 'general request',
        });
      },
    };
    setLLMClient(immediate);
    const ticket = getTicket('T-1012')!;

    await runTriage(ticket);
    await runTriage(ticket);

    expect(calls).toBe(2);
  });
});
