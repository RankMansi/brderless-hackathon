import { describe, expect, it } from 'vitest';
import { tickets } from '../server/data/tickets';
import { adjacentTicketId } from '../src/ticketNavigation';

const ids = tickets.map((ticket) => ticket.id);

describe('ticket navigation', () => {
  it('returns adjacent ticket ids in list order', () => {
    expect(adjacentTicketId(ids, 'T-1002', -1)).toBe('T-1001');
    expect(adjacentTicketId(ids, 'T-1002', 1)).toBe('T-1003');
  });

  it('stops at the first and last ticket', () => {
    expect(adjacentTicketId(ids, 'T-1001', -1)).toBeNull();
    expect(adjacentTicketId(ids, 'T-1014', 1)).toBeNull();
  });

  it('returns null when the selection is not in the list', () => {
    expect(adjacentTicketId(ids, 'T-MISSING', 1)).toBeNull();
  });
});
