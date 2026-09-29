import type { Ticket } from '../../shared/types';
import type { ParsedTriage } from './parser';

const SECURITY_INCIDENT =
  /unauthorized|wasn'?t me|was not me|signed in|suspicious (?:sign-?in|login)|credential compromise|account (?:was )?hacked/i;

const PRIVACY_REQUEST =
  /\bgdpr\b|\bccpa\b|personal data|data export|delete(?: my| all)? (?:my )?data|right to (?:access|erasure|be forgotten)/i;

const SLA_BREACH = /outage|\buptime\b|\bsla\b|service credit|dashboard down/i;

/**
 * Policies require escalation for security incidents, privacy requests, and
 * enterprise SLA breaches. The model may raise this floor, not lower it.
 * Password-reset friction is not treated as a security incident.
 */
export function escalationRequired(ticket: Ticket, category: string): string | null {
  const text = `${ticket.subject}\n${ticket.message}`;
  if (SECURITY_INCIDENT.test(text)) return 'security incident';
  if (PRIVACY_REQUEST.test(text)) return 'privacy request';

  const cat = category.trim().toLowerCase();
  if (cat === 'privacy' || cat === 'data_request') return 'privacy request';
  if (
    ticket.customer.plan === 'enterprise' &&
    (SLA_BREACH.test(text) || cat === 'outage' || cat === 'incident')
  ) {
    return 'enterprise SLA breach';
  }
  return null;
}

export function enforceEscalationFloor(ticket: Ticket, parsed: ParsedTriage): ParsedTriage {
  const reason = escalationRequired(ticket, parsed.category);
  if (!reason || parsed.escalate) return parsed;
  return {
    ...parsed,
    escalate: true,
    reasoning: `${parsed.reasoning} Policy guard: escalation is required (${reason}) and cannot be lowered by the model.`,
  };
}

/** Matches the active refund policy (policy-refund-v3), not the deprecated 90-day text. */
export const REFUND_WINDOW_DAYS = 30;

const REFUND_REQUEST = /\brefund\b|money back/i;
const REFUND_DENIAL =
  /outside (?:our |the )?\d+-day refund window|not eligible|unable to (?:process|approve)|cannot (?:process|approve)|can't (?:process|approve)/i;
const PURCHASE_DATE_VERIFICATION =
  /verify|confirm|need|provide|share|check/i;

export function daysSincePurchase(ticket: Ticket): number | null {
  if (!ticket.purchaseDate) return null;
  const ms = new Date(ticket.createdAt).getTime() - new Date(ticket.purchaseDate).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * The model can be talked into approving a refund. Eligibility is a date
 * comparison, so an approval outside the active window is replaced before
 * anything is stored.
 */
export function enforceRefundWindow(ticket: Ticket, parsed: ParsedTriage): ParsedTriage {
  const text = `${ticket.subject}\n${ticket.message}`;
  if (!REFUND_REQUEST.test(text)) return parsed;

  const days = daysSincePurchase(ticket);
  if (days === null) {
    if (
      /purchase date/i.test(parsed.reply) &&
      PURCHASE_DATE_VERIFICATION.test(parsed.reply)
    ) {
      return parsed;
    }
    return {
      ...parsed,
      reply: [
        'Hi, thanks for reaching out.',
        '',
        'Before we can determine refund eligibility, we need to verify the purchase date for this order. Once confirmed, we can check it against our 30-day refund window.',
        '',
        'Best regards,',
        'Support Team',
      ].join('\n'),
      reasoning: `${parsed.reasoning} Policy guard: refund eligibility cannot be confirmed without a valid purchase date.`,
    };
  }

  if (days <= REFUND_WINDOW_DAYS || REFUND_DENIAL.test(parsed.reply)) return parsed;

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
