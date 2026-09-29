import { describe, expect, it } from 'vitest';
import { policies } from '../server/data/policies';
import { tickets } from '../server/data/tickets';
import { searchPolicies } from '../server/retrieval/policySearch';
import type { PolicyDoc } from '../shared/types';

function policiesFor(ticketId: string): string[] {
  const ticket = tickets.find((item) => item.id === ticketId)!;
  return searchPolicies(`${ticket.subject} ${ticket.message}`, policies).map(
    (result) => result.doc.id
  );
}

describe('retrieval quality', () => {
  it.each([
    ['T-1001', 'policy-refund-v3'],
    ['T-1003', 'policy-enterprise-sla'],
    ['T-1004', 'policy-security-incident'],
    ['T-1005', 'policy-cancellation'],
    ['T-1006', 'policy-billing-dispute'],
    ['T-1007', 'policy-data-privacy'],
  ])('ranks the applicable policy first for %s', (ticketId, expectedPolicy) => {
    expect(policiesFor(ticketId)[0]).toBe(expectedPolicy);
  });

  it.each(['T-1011', 'T-1012', 'T-1014'])(
    'returns no policy instead of a weak unrelated citation for %s',
    (ticketId) => {
      expect(policiesFor(ticketId)).toEqual([]);
    }
  );

  it('does not attach policies from generic vocabulary overlap', () => {
    expect(policiesFor('T-1003')).toEqual(['policy-enterprise-sla']);
    expect(policiesFor('T-1007')).toEqual(['policy-data-privacy']);
    expect(policiesFor('T-1008')).toEqual(['policy-refund-v3']);
  });

  it('matches plurals and common label variants', () => {
    expect(searchPolicies('suspicious sign-ins from unknown cities', policies)[0]?.doc.id).toBe(
      'policy-security-incident'
    );
    expect(searchPolicies('duplicate charges were billed', policies)[0]?.doc.id).toBe(
      'policy-billing-dispute'
    );
  });

  it('breaks equal-score ties by the newest policy date', () => {
    const docs: PolicyDoc[] = [
      {
        id: 'older',
        title: 'Alpha policy',
        body: 'beta terms',
        status: 'active',
        audience: 'public',
        updatedAt: '2025-01-01',
      },
      {
        id: 'newer',
        title: 'Alpha policy',
        body: 'beta terms',
        status: 'active',
        audience: 'public',
        updatedAt: '2026-01-01',
      },
    ];
    expect(searchPolicies('alpha beta', docs)[0]?.doc.id).toBe('newer');
  });
});
