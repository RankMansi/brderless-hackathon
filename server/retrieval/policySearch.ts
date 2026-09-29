import type { PolicyDoc } from '../../shared/types';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'i', 'my', 'me', 'we', 'our',
  'you', 'your', 'it', 'its', 'to', 'of', 'for', 'and', 'or', 'in', 'on', 'at',
  'this', 'that', 'be', 'been', 'do', 'does', 'did', 'have', 'has', 'had',
  'with', 'from', 'by', 'as', 'not', 'no', 'so', 'if', 'but', 'about', 'please',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Score a document against query terms using simple term-frequency matching.
 * Good enough for a corpus of this size; swap for embeddings if the doc set grows.
 */
export function scoreDoc(queryTerms: string[], doc: PolicyDoc): number {
  const haystack = `${doc.title}\n${doc.body}`.toLowerCase();
  let score = 0;
  for (const term of queryTerms) {
    let idx = haystack.indexOf(term);
    while (idx !== -1) {
      score += 1;
      idx = haystack.indexOf(term, idx + term.length);
    }
  }
  return score;
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
  // Deprecated docs stay in the corpus so agents can see history, but they
  // must not outrank the current policy. Internal playbooks are not customer
  // context; the same retrieved set is pasted into the reply prompt.
  return docs
    .filter((doc) => doc.status === 'active' && doc.audience === 'public')
    .map((doc) => ({ doc, score: scoreDoc(terms, doc) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
