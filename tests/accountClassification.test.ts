import { beforeEach, describe, expect, it } from 'vitest';
import { MockLLM } from '../server/llm/mock';
import { setLLMClient } from '../server/llm/client';
import { db, getTicket } from '../server/store';
import { runTriage } from '../server/triage/triageService';

describe('password-reset classification', () => {
  beforeEach(() => {
    db.triageResults.clear();
    setLLMClient(new MockLLM());
  });

  it('treats delivery failure as account support, not a security incident', async () => {
    const result = await runTriage(getTicket('T-1013')!);
    expect(result.category).toBe('account');
    expect(result.escalate).toBe(false);
    expect(result.citations).toEqual([]);
  });
});
