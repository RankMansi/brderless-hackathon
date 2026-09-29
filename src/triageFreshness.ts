/** Ignore a triage response that belongs to an older request or a different ticket. */
export function shouldApplyTriage(
  requestedTicketId: string,
  result: { ticketId: string },
  requestGeneration: number,
  currentGeneration: number
): boolean {
  return requestGeneration === currentGeneration && result.ticketId === requestedTicketId;
}
