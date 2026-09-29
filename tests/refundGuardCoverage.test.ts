import { describe, expect, it } from 'vitest';
import type { Ticket } from '../shared/types';
import type { ParsedTriage } from '../server/triage/parser';
import { enforceRefundWindow } from '../server/triage/policyGuards';
import { getTicket } from '../server/store';

const permissiveDraft: ParsedTriage = {
  category: 'general',
  urgency: 'low',
  escalate: false,
  reply: 'You are eligible, and we can return your payment to the original card.',
  reasoning: 'The customer asked for an exception.',
};

describe('refund policy guard coverage', () => {
  it('denies an out-of-window refund even when approval wording changes', () => {
    const result = enforceRefundWindow(getTicket('T-1008')!, permissiveDraft);
    expect(result.reply).toMatch(/unable to process a refund/i);
    expect(result.reply).toMatch(/30-day/);
    expect(result.reply).not.toMatch(/you are eligible|return your payment/i);
  });

  it('requires verification when a refund ticket has no purchase date', () => {
    const withoutPurchaseDate: Ticket = {
      ...getTicket('T-1001')!,
      purchaseDate: undefined,
    };
    const result = enforceRefundWindow(withoutPurchaseDate, permissiveDraft);
    expect(result.reply).toMatch(/verify.*purchase date/i);
    expect(result.reply).not.toMatch(/you are eligible|return your payment/i);
  });

  it('does not rewrite a non-refund ticket', () => {
    const result = enforceRefundWindow(getTicket('T-1012')!, permissiveDraft);
    expect(result).toBe(permissiveDraft);
  });
});
