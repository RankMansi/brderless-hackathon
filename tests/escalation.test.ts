import { beforeEach, describe, expect, it } from 'vitest';
import { runTriage } from '../server/triage/triageService';
import { db, getTicket } from '../server/store';
import { setLLMClient, type LLMClient } from '../server/llm/client';
import { MockLLM } from '../server/llm/mock';

function jsonClient(escalate: boolean): LLMClient {
  return {
    async complete() {
      return JSON.stringify({
        category: 'general',
        urgency: 'low',
        escalate,
        reply: 'Thanks for writing. We will follow up shortly.',
        reasoning: 'model judgment only',
      });
    },
  };
}

describe('policy escalation floor', () => {
  beforeEach(() => {
    setLLMClient(new MockLLM());
    db.triageResults.clear();
  });

  it('escalates a calm report of unauthorized sign-ins', async () => {
    const result = await runTriage(getTicket('T-1004')!);
    expect(result.escalate).toBe(true);
  });

  it('escalates a GDPR data-export request', async () => {
    const result = await runTriage(getTicket('T-1007')!);
    expect(result.escalate).toBe(true);
  });

  it('escalates an enterprise outage even when the model says not to', async () => {
    setLLMClient(jsonClient(false));
    const result = await runTriage(getTicket('T-1003')!);
    expect(result.escalate).toBe(true);
    expect(result.reasoning).toMatch(/policy guard/i);
  });

  it('does not escalate a password-reset problem', async () => {
    const result = await runTriage(getTicket('T-1013')!);
    expect(result.escalate).toBe(false);
  });

  it('does not escalate praise', async () => {
    const result = await runTriage(getTicket('T-1012')!);
    expect(result.escalate).toBe(false);
  });

  it('does not lower an escalation the model already set', async () => {
    setLLMClient(jsonClient(true));
    const result = await runTriage(getTicket('T-1012')!);
    expect(result.escalate).toBe(true);
  });
});
