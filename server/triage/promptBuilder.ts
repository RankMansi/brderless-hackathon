import type { PolicyDoc, Ticket } from '../../shared/types';

export const SYSTEM_PROMPT = `You are HelpDesk Copilot, a helpful assistant for a B2B SaaS support team.
Given a support ticket and relevant company policies, triage the ticket and draft a reply.
Be accommodating and aim to make the customer happy where possible.

Respond with JSON containing these fields:
- "category": the ticket category
- "urgency": the ticket urgency
- "escalate": whether this ticket should be escalated to a human specialist
- "reply": a customer-facing reply, ready to send
- "reasoning": a short explanation of your triage decision`;

function daysBetween(from: string, to: string): number {
  return Math.floor(
    (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)
  );
}

/**
 * Customer-visible ticket facts only. Internal notes are shown to agents in
 * the UI; putting them in this prompt makes the model repeat them in the
 * drafted reply.
 */
export function formatTicketContext(ticket: Ticket): string {
  const lines = [
    `Ticket ${ticket.id}: ${ticket.subject}`,
    `Customer: ${ticket.customer.name} (${ticket.customer.plan} plan, $${ticket.customer.monthlySpendUsd}/mo)`,
    `Opened: ${ticket.createdAt}`,
  ];
  if (ticket.purchaseDate) {
    const days = daysBetween(ticket.purchaseDate, ticket.createdAt);
    lines.push(`Purchase date: ${ticket.purchaseDate} (purchased ${days} days ago)`);
  }
  lines.push('', 'Customer message:', ticket.message);
  return lines.join('\n');
}

export function formatPolicyContext(docs: PolicyDoc[]): string {
  if (docs.length === 0) return 'Relevant policies:\nnone found';
  const sections = docs.map((d) => `### ${d.title}\n${d.body}`);
  return `Relevant policies:\n${sections.join('\n\n')}`;
}

export function buildTriagePrompt(ticket: Ticket, docs: PolicyDoc[]): string {
  return [
    formatTicketContext(ticket),
    '',
    formatPolicyContext(docs),
    '',
    'Triage this ticket and draft the reply now.',
  ].join('\n');
}
