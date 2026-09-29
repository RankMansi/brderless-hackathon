import { beforeEach, describe, expect, it } from 'vitest';
import type { Ticket } from '../shared/types';
import type { LLMClient } from '../server/llm/client';
import { MockLLM } from '../server/llm/mock';
import { setLLMClient } from '../server/llm/client';
import { db, getTicket } from '../server/store';
import { runTriage } from '../server/triage/triageService';

const lowRiskClient: LLMClient = {
  async complete() {
    return JSON.stringify({
      category: 'billing',
      urgency: 'low',
      escalate: false,
      reply: 'We will handle this without specialist review.',
      reasoning: 'Routine request.',
    });
  },
};

describe('deterministic business policy', () => {
  beforeEach(() => {
    db.triageResults.clear();
    setLLMClient(new MockLLM());
  });

  it('marks a security incident high urgency because policy requires action within 30 minutes', async () => {
    const result = await runTriage(getTicket('T-1004')!);
    expect(result.escalate).toBe(true);
    expect(result.urgency).toBe('high');
  });

  it('escalates a billing dispute over $500 even when the model declines', async () => {
    const ticket: Ticket = {
      ...getTicket('T-1006')!,
      id: 'T-BILLING-750',
      message: 'I was charged $750 twice. Please reverse the duplicate charge.',
      internalNotes: [],
    };
    setLLMClient(lowRiskClient);

    const result = await runTriage(ticket);
    expect(result.escalate).toBe(true);
    expect(result.reasoning).toMatch(/billing dispute over \$500/i);
    expect(result.reply).toMatch(/billing team.*review/i);
    expect(result.reply).not.toMatch(/without specialist review/i);
  });

  it('routes a claimed legal refund exception for review instead of issuing a denial', async () => {
    const ticket: Ticket = {
      ...getTicket('T-1002')!,
      id: 'T-REFUND-LAW',
      message:
        'I bought this 75 days ago. Consumer law requires a refund for this defective service.',
      internalNotes: [],
    };

    const result = await runTriage(ticket);
    expect(result.escalate).toBe(true);
    expect(result.urgency).toBe('high');
    expect(result.reply).toMatch(/specialist.*review|legal review/i);
    expect(result.reply).not.toMatch(/unable to process a refund/i);
  });

  it('routes data exports to the privacy team without promising support fulfilment', async () => {
    const result = await runTriage(getTicket('T-1007')!);

    expect(result.escalate).toBe(true);
    expect(result.reply).toMatch(/privacy team/i);
    expect(result.reply).not.toMatch(/we will.*provide.*(?:complete |full )?export/is);
  });
});
