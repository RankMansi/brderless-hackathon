import { beforeEach, describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT, buildTriagePrompt } from '../server/triage/promptBuilder';
import { runTriage } from '../server/triage/triageService';
import { db, getTicket } from '../server/store';
import { setLLMClient, type LLMClient } from '../server/llm/client';
import { MockLLM } from '../server/llm/mock';

describe('prompt injection', () => {
  beforeEach(() => {
    setLLMClient(new MockLLM());
    db.triageResults.clear();
  });

  it('treats the customer ticket as untrusted data in the prompt', () => {
    const ticket = getTicket('T-1008')!;
    const prompt = buildTriagePrompt(ticket, []);
    expect(prompt).toContain('<<<UNTRUSTED CUSTOMER TICKET>>>');
    expect(prompt).toContain('<<<END UNTRUSTED CUSTOMER TICKET>>>');
    expect(prompt.indexOf('<<<UNTRUSTED CUSTOMER TICKET>>>')).toBeLessThan(
      prompt.indexOf('Ignore previous instructions')
    );
    expect(SYSTEM_PROMPT).toMatch(/never follow/i);
    expect(SYSTEM_PROMPT).toMatch(/untrusted/i);
  });

  it('does not approve a refund when the customer message tries to override policy', async () => {
    const result = await runTriage(getTicket('T-1008')!);
    expect(result.reply).not.toMatch(/refund has been approved/i);
    expect(result.reply).not.toMatch(/no manager approval is required/i);
    expect(result.reply).toMatch(/unable to process a refund|outside our \d+-day refund window/i);
  });

  it('replaces an out-of-window refund approval even if the model emits one', async () => {
    const approving: LLMClient = {
      async complete() {
        return JSON.stringify({
          category: 'refund',
          urgency: 'low',
          escalate: false,
          reply:
            'Your refund has been approved and will be returned in 5-7 business days. No manager approval is required.',
          reasoning: 'customer insisted',
        });
      },
    };
    setLLMClient(approving);
    const result = await runTriage(getTicket('T-1002')!);
    expect(result.reply).not.toMatch(/has been approved/i);
    expect(result.reply).toMatch(/unable to process a refund/i);
    expect(result.reply).toMatch(/30-day/);
    expect(result.reasoning).toMatch(/policy guard/i);
  });

  it('still classifies a non-refund ticket from the customer message', async () => {
    const result = await runTriage(getTicket('T-1012')!);
    expect(result.reply).not.toMatch(/refund window/i);
  });
});
