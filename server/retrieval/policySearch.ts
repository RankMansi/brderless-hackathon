import type { PolicyDoc } from '../../shared/types';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'i', 'my', 'me', 'we', 'our',
  'you', 'your', 'it', 'its', 'to', 'of', 'for', 'and', 'or', 'in', 'on', 'at',
  'this', 'that', 'be', 'been', 'do', 'does', 'did', 'have', 'has', 'had',
  'with', 'from', 'by', 'as', 'not', 'no', 'so', 'if', 'but', 'about', 'please',
]);

const LOW_SIGNAL_TERMS = new Set([
  'account', 'agent', 'annual', 'before', 'customer', 'day', 'enterprise',
  'full', 'like', 'month', 'plan', 'policy', 'pro', 'request', 'support',
  'team', 'time', 'want', 'within', 'would',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function normalizeTerm(term: string): string {
  const aliases: Record<string, string> = {
    billed: 'billing',
    bills: 'billing',
    cancellation: 'cancel',
    cancelled: 'cancel',
    canceled: 'cancel',
    charged: 'charge',
    charges: 'charge',
    credits: 'credit',
    deletion: 'delete',
    outages: 'outage',
    refunded: 'refund',
    refunds: 'refund',
    requesting: 'request',
    requests: 'request',
    signed: 'login',
    signin: 'login',
    sign: 'login',
  };
  return aliases[term] ?? term;
}

function scoreDetails(
  queryTerms: string[],
  doc: PolicyDoc
): { score: number; matched: string[]; titleMatched: number } {
  const terms = [
    ...new Set(queryTerms.map(normalizeTerm).filter((term) => !LOW_SIGNAL_TERMS.has(term))),
  ];
  const titleTerms = new Set(tokenize(doc.title).map(normalizeTerm));
  const bodyTerms = new Set(tokenize(doc.body).map(normalizeTerm));
  const matched: string[] = [];
  let titleMatched = 0;
  let score = 0;
  for (const term of terms) {
    if (titleTerms.has(term) || bodyTerms.has(term)) {
      matched.push(term);
      score += 10;
      if (titleTerms.has(term)) {
        titleMatched += 1;
        score += 20;
      }
    }
  }
  return { score, matched, titleMatched };
}

function matchesPolicyIntent(docId: string, queryTerms: Set<string>): boolean {
  switch (docId) {
    case 'policy-refund-v3':
      return queryTerms.has('refund');
    case 'policy-enterprise-sla':
      return ['outage', 'sla', 'uptime'].some((term) => queryTerms.has(term));
    case 'policy-security-incident':
      return (
        queryTerms.has('security') ||
        queryTerms.has('unauthorized') ||
        (queryTerms.has('suspicious') && queryTerms.has('login'))
      );
    case 'policy-cancellation':
      return queryTerms.has('cancel');
    case 'policy-billing-dispute':
      return ['billing', 'charge', 'duplicate', 'dispute'].some((term) =>
        queryTerms.has(term)
      );
    case 'policy-data-privacy':
      return (
        queryTerms.has('privacy') ||
        queryTerms.has('gdpr') ||
        queryTerms.has('ccpa') ||
        (queryTerms.has('data') &&
          (queryTerms.has('export') || queryTerms.has('delete')))
      );
    default:
      return false;
  }
}

export interface ScoredDoc {
  doc: PolicyDoc;
  score: number;
}

export function searchPolicies(
  query: string,
  docs: PolicyDoc[],
  limit = 3
): ScoredDoc[] {
  const terms = tokenize(query);
  if (/wasn'?t me|was not me|someone .{0,30}(?:signed in|logged in)/i.test(query)) {
    terms.push('unauthorized');
  }
  if (/hacked|compromis(?:e|ed)|stolen (?:password|credential)/i.test(query)) {
    terms.push('unauthorized');
  }
  const normalizedQueryTerms = new Set(terms.map(normalizeTerm));
  // Deprecated docs stay in the corpus so agents can see history, but they
  // must not outrank the current policy. Internal playbooks are not customer
  // context; the same retrieved set is pasted into the reply prompt.
  return docs
    .filter((doc) => doc.status === 'active' && doc.audience === 'public')
    .map((doc) => ({ doc, ...scoreDetails(terms, doc) }))
    .filter(
      ({ doc, matched, titleMatched }) =>
        matchesPolicyIntent(doc.id, normalizedQueryTerms) ||
        (matched.length >= 2 && titleMatched > 0)
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.doc.updatedAt.localeCompare(a.doc.updatedAt) ||
        a.doc.id.localeCompare(b.doc.id)
    )
    .map(({ doc, score }) => ({ doc, score }))
    .slice(0, limit);
}
