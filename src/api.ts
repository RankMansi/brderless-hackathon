import type { Ticket, TicketSummary, TriageResult } from '../shared/types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      (body as { error?: string }).error ?? `Request failed: ${res.status}`
    );
  }
  return res.json() as Promise<T>;
}

export function shouldGenerateMissingTriage(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export const fetchTickets = () => request<TicketSummary[]>('/api/tickets');
export const fetchTicket = (id: string) => request<Ticket>(`/api/tickets/${id}`);
export const fetchTriage = (id: string) => request<TriageResult>(`/api/tickets/${id}/triage`);
export const generateTriage = (id: string) =>
  request<TriageResult>(`/api/tickets/${id}/triage`, { method: 'POST' });
