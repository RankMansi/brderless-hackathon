import { beforeEach, describe, expect, it } from 'vitest';
import { MockLLM } from '../server/llm/mock';
import { setLLMClient } from '../server/llm/client';
import { db, getTicket } from '../server/store';
import { runTriage } from '../server/triage/triageService';

describe('customer reply grounding', () => {
  beforeEach(() => {
    db.triageResults.clear();
    setLLMClient(new MockLLM());
  });

  it('does not claim an eligible refund was already started', async () => {
    const result = await runTriage(getTicket('T-1001')!);
    expect(result.reply).toMatch(/eligible|within our 30-day/i);
    expect(result.reply).not.toMatch(/i(?:'ve| have) started|has been (?:started|approved)/i);
  });

  it('does not present a reported SLA breach as verified or promise credits before review', async () => {
    const result = await runTriage(getTicket('T-1003')!);
    expect(result.reply).toMatch(/suspected SLA breach|needs immediate escalation/i);
    expect(result.reply).not.toMatch(/confirmed the incident|credits will be applied|arranging a follow-up/i);
  });

  it('does not invent a cancellation data-retention period', async () => {
    const result = await runTriage(getTicket('T-1005')!);
    expect(result.reply).not.toMatch(/data is retained for 30 days/i);
    expect(result.reply).toMatch(/retention period.*not specified|confirm.*retention/i);
  });
});
