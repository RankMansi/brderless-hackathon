import { describe, expect, it } from 'vitest';
import { shouldApplyTriage } from '../src/triageFreshness';

describe('shouldApplyTriage', () => {
  it('rejects a response for a ticket the agent already left', () => {
    expect(shouldApplyTriage('T-1012', { ticketId: 'T-1003' }, 1, 1)).toBe(false);
  });

  it('rejects a response from an older request on the same ticket', () => {
    expect(shouldApplyTriage('T-1003', { ticketId: 'T-1003' }, 1, 2)).toBe(false);
  });

  it('accepts the response for the request that is still current', () => {
    expect(shouldApplyTriage('T-1012', { ticketId: 'T-1012' }, 2, 2)).toBe(true);
  });
});
