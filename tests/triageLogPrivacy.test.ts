import { beforeEach, describe, expect, it } from 'vitest';
import { MockLLM } from '../server/llm/mock';
import { setLLMClient } from '../server/llm/client';
import { db, getTicket } from '../server/store';
import { runTriage } from '../server/triage/triageService';

describe('triage log privacy', () => {
  beforeEach(() => {
    db.triageResults.clear();
    setLLMClient(new MockLLM());
  });

  it('keeps customer identity, message, and drafted reply out of logs', async () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (message?: unknown) => lines.push(String(message));
    try {
      await runTriage(getTicket('T-1002')!);
    } finally {
      console.log = original;
    }

    const output = lines.join('\n');
    expect(output).not.toContain('Marcus Chen');
    expect(output).not.toContain('money is tight');
    expect(output).not.toContain('unable to process a refund');
    expect(output).toContain('policy-refund-v3');
    expect(output).toContain('REDACTED CUSTOMER TICKET');
    const entry = JSON.parse(lines[0]) as { raw: string };
    expect(JSON.parse(entry.raw)).toMatchObject({
      reply: '[REDACTED]',
      reasoning: '[REDACTED]',
    });
  });
});
