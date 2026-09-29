import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runTriage } from '../server/triage/triageService';
import { db, getTicket } from '../server/store';
import { setLLMClient, type LLMClient } from '../server/llm/client';
import { MockLLM } from '../server/llm/mock';
import { llmTimeoutMs } from '../server/llm/timeout';

describe('LLM failure handling', () => {
  beforeEach(() => {
    setLLMClient(new MockLLM());
    db.triageResults.clear();
    delete process.env.LLM_TIMEOUT_MS;
  });

  afterEach(() => {
    delete process.env.LLM_TIMEOUT_MS;
  });

  it('does not replace a stored triage when the model throws', async () => {
    const ticket = getTicket('T-1011')!;
    const stored = await runTriage(ticket);
    const failing: LLMClient = {
      async complete() {
        throw new Error('LLM request failed (429): rate limit');
      },
    };
    setLLMClient(failing);
    await expect(runTriage(ticket)).rejects.toThrow(/rate limit/);
    expect(db.triageResults.get(ticket.id)).toEqual(stored);
  });

  it('times out a hung model and keeps the previous result', async () => {
    const ticket = getTicket('T-1012')!;
    const stored = await runTriage(ticket);
    const hung: LLMClient = {
      complete() {
        return new Promise(() => {});
      },
    };
    setLLMClient(hung);
    process.env.LLM_TIMEOUT_MS = '40';
    await expect(runTriage(ticket)).rejects.toThrow(/timed out after 40ms/);
    expect(db.triageResults.get(ticket.id)).toEqual(stored);
  }, 1500);

  it.each(['not-a-number', '0', '-10'])(
    'rejects invalid LLM timeout configuration: %s',
    (configured) => {
      process.env.LLM_TIMEOUT_MS = configured;
      expect(() => llmTimeoutMs()).toThrow(/must be a positive number/i);
    }
  );
});
