export function adjacentTicketId(
  ticketIds: string[],
  selectedId: string,
  offset: -1 | 1
): string | null {
  const index = ticketIds.indexOf(selectedId);
  if (index === -1) return null;
  return ticketIds[index + offset] ?? null;
}
