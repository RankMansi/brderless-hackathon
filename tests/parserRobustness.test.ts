import { describe, expect, it } from 'vitest';
import { parseTriageResponse } from '../server/triage/parser';

const payload = {
  category: 'billing',
  urgency: 'medium',
  escalate: false,
  reply: 'We will review the charge.',
  reasoning: 'Billing question.',
};

describe('parser robustness', () => {
  it('finds the valid JSON object when surrounding prose contains braces', () => {
    const raw = `Use {carefully} when reviewing this result.\n${JSON.stringify(payload)}\nSee {manual}.`;
    expect(parseTriageResponse(raw)).toMatchObject(payload);
  });

  it('handles braces inside JSON string fields', () => {
    const raw = JSON.stringify({
      ...payload,
      reply: 'Use the value {account_id} from your invoice.',
    });
    expect(parseTriageResponse(raw).reply).toContain('{account_id}');
  });

  it('rejects a null reply instead of displaying the string "null"', () => {
    expect(() => parseTriageResponse(JSON.stringify({ ...payload, reply: null }))).toThrow(
      /reply must be a non-empty string/i
    );
  });

  it('rejects a non-string reasoning value', () => {
    expect(() =>
      parseTriageResponse(JSON.stringify({ ...payload, reasoning: { detail: 'hidden' } }))
    ).toThrow(/reasoning must be a string/i);
  });
});
