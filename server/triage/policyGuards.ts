import type { Ticket } from '../../shared/types';
import type { ParsedTriage } from './parser';

/** Matches the active refund policy (policy-refund-v3), not the deprecated 90-day text. */
export const REFUND_WINDOW_DAYS = 30;

const REFUND_APPROVAL =
  /refund has been approved|started the refund|no manager approval is required/i;

export function daysSincePurchase(ticket: Ticket): number | null {
  if (!ticket.purchaseDate) return null;
  const ms = new Date(ticket.createdAt).getTime() - new Date(ticket.purchaseDate).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * The model can be talked into approving a refund. Eligibility is a date
 * comparison, so an approval outside the active window is replaced before
 * anything is stored.
 */
export function enforceRefundWindow(ticket: Ticket, parsed: ParsedTriage): ParsedTriage {
  const days = daysSincePurchase(ticket);
  if (days === null || days <= REFUND_WINDOW_DAYS) return parsed;
  if (!REFUND_APPROVAL.test(parsed.reply)) return parsed;

  return {
    ...parsed,
    reply: [
      'Hi, thanks for reaching out.',
      '',
      `Unfortunately your purchase was ${days} days ago, which is outside our ${REFUND_WINDOW_DAYS}-day refund window, so we are unable to process a refund. As an alternative, we can offer account credit.`,
      '',
      'Best regards,',
      'Support Team',
    ].join('\n'),
    reasoning: `${parsed.reasoning} Policy guard: the draft approved a refund, but the purchase is outside the ${REFUND_WINDOW_DAYS}-day window required by policy-refund-v3, so the reply was replaced with a denial.`,
  };
}
