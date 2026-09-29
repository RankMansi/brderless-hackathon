import { beforeEach, describe, expect, it } from 'vitest';
import { runTriage } from '../server/triage/triageService';
import { db, getTicket } from '../server/store';
import { setLLMClient } from '../server/llm/client';
import { MockLLM } from '../server/llm/mock';

describe('triage logging', () => {
  beforeEach(() => {
    setLLMClient(new MockLLM());
    db.triageResults.clear();
  });

  it('logs the query, retrieved policies with scores, prompt, and raw model output', async () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (msg?: unknown) => {
      lines.push(String(msg));
    };
    try {
      await runTriage(getTicket('T-1002')!);
    } finally {
      console.log = original;
    }

    const entry = lines
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .find((item) => item?.event === 'triage');

    expect(entry).toBeTruthy();
    expect(entry?.ticketId).toBe('T-1002');
    expect(String(entry?.query)).toContain('Refund');
    const retrieved = entry?.retrieved as Array<{ id: string; score: number }>;
    expect(retrieved[0]?.id).toBe('policy-refund-v3');
    expect(retrieved[0]?.score).toBeGreaterThan(0);
    expect(String(entry?.prompt)).toContain('UNTRUSTED CUSTOMER TICKET');
    expect(String(entry?.raw)).toContain('"reply"');
    expect(entry?.category).toBe('refund');
  });
});
