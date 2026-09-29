import { beforeEach, describe, expect, it } from 'vitest';
import { runTriage } from '../server/triage/triageService';
import { db, getTicket } from '../server/store';
import { setLLMClient } from '../server/llm/client';
import { MockLLM } from '../server/llm/mock';

describe('refund replies follow the active policy', () => {
  beforeEach(() => {
    setLLMClient(new MockLLM());
    db.triageResults.clear();
  });

  it('cites the 30-day policy for an in-window refund', async () => {
    const result = await runTriage(getTicket('T-1001')!);
    expect(result.citations.map((c) => c.docId)).not.toContain('policy-refund-v2');
    expect(result.citations[0]?.docId).toBe('policy-refund-v3');
    expect(result.reply).toMatch(/30-day/);
    expect(result.reply).not.toMatch(/90-day/);
    expect(result.reply).toMatch(/started the refund/i);
  });

  it('denies a refund at 75 days and does not cite the deprecated policy', async () => {
    const result = await runTriage(getTicket('T-1002')!);
    expect(result.citations.map((c) => c.docId)).not.toContain('policy-refund-v2');
    expect(result.citations[0]?.docId).toBe('policy-refund-v3');
    expect(result.reply).toMatch(/unable to process a refund/i);
    expect(result.reply).not.toMatch(/90-day/);
  });

  it('does not honor a customer quote of the old 90-day window', async () => {
    const result = await runTriage(getTicket('T-1010')!);
    expect(result.citations.map((c) => c.docId)).not.toContain('policy-refund-v2');
    expect(result.reply).toMatch(/unable to process a refund|outside our 30-day/i);
    expect(result.reply).not.toMatch(/90-day/);
    expect(result.reply).not.toContain('pre-2025');
  });
});
