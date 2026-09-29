/** Ignore a triage response that belongs to an older request or a different ticket. */
export function isCurrentRequest(
  requestGeneration: number,
  currentGeneration: number
): boolean {
  return requestGeneration === currentGeneration;
}

export function shouldApplyTriage(
  requestedTicketId: string,
  result: { ticketId: string },
  requestGeneration: number,
  currentGeneration: number
): boolean {
  return (
    isCurrentRequest(requestGeneration, currentGeneration) &&
    result.ticketId === requestedTicketId
  );
}
