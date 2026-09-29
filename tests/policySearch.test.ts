import { describe, expect, it } from 'vitest';
import { searchPolicies, tokenize } from '../server/retrieval/policySearch';
import { policies } from '../server/data/policies';

describe('tokenize', () => {
  it('lowercases and strips stopwords', () => {
    expect(tokenize('I would like a REFUND for my purchase')).toEqual([
      'would',
      'like',
      'refund',
      'purchase',
    ]);
  });
});

describe('searchPolicies', () => {
  it('returns refund-related policies for a refund query', () => {
    const results = searchPolicies('I want a refund for my subscription', policies);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].doc.title.toLowerCase()).toContain('refund');
  });

  it('returns the SLA policy for an outage query', () => {
    const results = searchPolicies('outage uptime SLA breach service credits', policies);
    expect(results[0].doc.id).toBe('policy-enterprise-sla');
  });

  it('respects the result limit', () => {
    const results = searchPolicies('refund billing cancel data', policies, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('returns nothing for an unrelated query', () => {
    const results = searchPolicies('zzz qqq xyzzy', policies);
    expect(results).toEqual([]);
  });

  it('excludes deprecated and internal policies and ranks the active refund policy first', () => {
    const results = searchPolicies('I want a refund within 90 days of purchase', policies, 10);
    expect(results.map((r) => r.doc.id)).not.toContain('policy-refund-v2');
    expect(results.map((r) => r.doc.id)).not.toContain('policy-internal-playbook');
    expect(results[0]?.doc.id).toBe('policy-refund-v3');
    expect(results.every((r) => r.doc.status === 'active' && r.doc.audience === 'public')).toBe(
      true
    );
  });
});
