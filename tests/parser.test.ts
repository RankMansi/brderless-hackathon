import { describe, expect, it } from 'vitest';
import { parseTriageResponse } from '../server/triage/parser';

const validPayload = {
  category: 'billing',
  urgency: 'medium',
  escalate: false,
  reply: 'Hi, thanks for reaching out.',
  reasoning: 'Standard billing question.',
};

describe('parseTriageResponse', () => {
  it('parses a bare JSON response', () => {
    const result = parseTriageResponse(JSON.stringify(validPayload));
    expect(result.category).toBe('billing');
    expect(result.escalate).toBe(false);
  });

  it('parses JSON wrapped in a markdown code fence', () => {
    const raw = '```json\n' + JSON.stringify(validPayload) + '\n```';
    const result = parseTriageResponse(raw);
    expect(result.reply).toContain('thanks for reaching out');
  });

  it('parses JSON surrounded by prose', () => {
    const raw = `Sure! Here is the triage:\n${JSON.stringify(validPayload)}\nHope that helps.`;
    const result = parseTriageResponse(raw);
    expect(result.urgency).toBe('medium');
  });

  it('throws when no JSON object is present', () => {
    expect(() => parseTriageResponse('I could not triage this ticket.')).toThrow(
      /No JSON object/
    );
  });

  it('throws when a required field is missing', () => {
    const { reply, ...withoutReply } = validPayload;
    expect(() => parseTriageResponse(JSON.stringify(withoutReply))).toThrow(
      /missing field: reply/
    );
  });

  it('normalizes drifted category and urgency labels', () => {
    const cases: Array<[string, string, string, string]> = [
      ['billing_issue', 'High', 'billing', 'high'],
      ['Refund', 'urgent', 'refund', 'high'],
      ['general', 'normal', 'general', 'medium'],
      ['other', 'Low', 'general', 'low'],
      ['incident', 'medium', 'outage', 'medium'],
      ['churn', 'medium', 'cancellation', 'medium'],
      ['data_request', 'medium', 'privacy', 'medium'],
      ['refund_request', 'normal', 'refund', 'medium'],
    ];
    for (const [category, urgency, expectedCategory, expectedUrgency] of cases) {
      const result = parseTriageResponse(
        JSON.stringify({ ...validPayload, category, urgency })
      );
      expect(result.category).toBe(expectedCategory);
      expect(result.urgency).toBe(expectedUrgency);
    }
  });

  it('parses the string "false" as boolean false', () => {
    const result = parseTriageResponse(
      JSON.stringify({ ...validPayload, escalate: 'false' })
    );
    expect(result.escalate).toBe(false);
  });

  it('rejects an unknown category', () => {
    expect(() =>
      parseTriageResponse(JSON.stringify({ ...validPayload, category: 'spaceship' }))
    ).toThrow(/unknown category/i);
  });

  it('rejects an empty reply', () => {
    expect(() => parseTriageResponse(JSON.stringify({ ...validPayload, reply: '   ' }))).toThrow(
      /reply/i
    );
  });

  it('rejects malformed JSON instead of throwing a raw syntax error', () => {
    expect(() => parseTriageResponse('prefix { "category": } trailing')).toThrow(/malformed JSON/);
  });
});
