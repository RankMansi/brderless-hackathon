import { describe, expect, it } from 'vitest';
import { isCurrentRequest } from '../src/triageFreshness';

describe('triage request lifecycle', () => {
  it('does not start fallback generation after the request was superseded', () => {
    expect(isCurrentRequest(1, 2)).toBe(false);
  });

  it('allows fallback generation for the current request', () => {
    expect(isCurrentRequest(2, 2)).toBe(true);
  });
});
