import type { PolicyDoc, Ticket } from '../../shared/types';
import type { ParsedTriage } from './parser';

const SECURITY_INCIDENT =
  /unauthorized|wasn'?t me|was not me|suspicious (?:sign-?in|login)|credential compromise|account (?:was )?hacked/i;

const PRIVACY_REQUEST =
  /\bgdpr\b|\bccpa\b|personal data|data export|delete(?: my| all)? (?:my )?data|right to (?:access|erasure|be forgotten)/i;

const SLA_BREACH = /outage|\buptime\b|\bsla\b|service credit|dashboard down/i;
const BILLING_DISPUTE = /charg(?:e|ed)|billing|billed|invoice|dispute/i;
const LEGAL_REFUND_EXCEPTION =
  /consumer law|statutory|legally required|required by law|legal right/i;
const PASSWORD_RESET_SUPPORT =
  /password reset|reset (?:email|link|message)|reset my password/i;

function ticketText(ticket: Ticket): string {
  return `${ticket.subject}\n${ticket.message}`;
}

function supportReply(body: string): string {
  return ['Hi, thanks for reaching out.', '', body, '', 'Best regards,', 'Support Team'].join(
    '\n'
  );
}

function hasBillingDisputeOverLimit(ticket: Ticket): boolean {
  const text = ticketText(ticket);
  if (!BILLING_DISPUTE.test(text)) return false;
  return [...text.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)].some(
    (match) => Number(match[1].replaceAll(',', '')) > 500
  );
}

function hasLegalRefundException(ticket: Ticket): boolean {
  const text = ticketText(ticket);
  return REFUND_REQUEST.test(text) && LEGAL_REFUND_EXCEPTION.test(text);
}

export function enforceCategoryRules(ticket: Ticket, parsed: ParsedTriage): ParsedTriage {
  const text = ticketText(ticket);
  if (
    parsed.category === 'security' &&
    PASSWORD_RESET_SUPPORT.test(text) &&
    !SECURITY_INCIDENT.test(text)
  ) {
    return {
      ...parsed,
      category: 'account',
      reasoning: `${parsed.reasoning} Policy guard: password-reset delivery failure is account support, not a reported security incident.`,
    };
  }
  return parsed;
}

/**
 * Policies require escalation for security incidents, privacy requests, and
 * enterprise SLA breaches. The model may raise this floor, not lower it.
 * Password-reset friction is not treated as a security incident.
 */
function escalationRequired(ticket: Ticket, category: string): string | null {
  const text = ticketText(ticket);
  if (SECURITY_INCIDENT.test(text)) return 'security incident';
  if (PRIVACY_REQUEST.test(text)) return 'privacy request';
  if (hasLegalRefundException(ticket)) return 'claimed legal refund exception';
  if (hasBillingDisputeOverLimit(ticket)) return 'billing dispute over $500';

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

export function enforceUrgencyFloor(ticket: Ticket, parsed: ParsedTriage): ParsedTriage {
  const reason = escalationRequired(ticket, parsed.category);
  if (
    parsed.urgency === 'high' ||
    (reason !== 'security incident' &&
      reason !== 'enterprise SLA breach' &&
      reason !== 'claimed legal refund exception')
  ) {
    return parsed;
  }
  return {
    ...parsed,
    urgency: 'high',
    reasoning: `${parsed.reasoning} Policy guard: urgency is high (${reason}).`,
  };
}

export function enforceBillingReview(ticket: Ticket, parsed: ParsedTriage): ParsedTriage {
  if (!hasBillingDisputeOverLimit(ticket)) return parsed;
  return {
    ...parsed,
    reply: supportReply(
      'Because this dispute is over $500, our billing team must review the charge history before any commitment is made. A support agent will route it for specialist review and follow up after verification.'
    ),
    reasoning: `${parsed.reasoning} Policy guard: billing disputes over $500 require billing-team review before any commitment.`,
  };
}

export function enforceGroundedReply(
  ticket: Ticket,
  parsed: ParsedTriage,
  policies: PolicyDoc[]
): ParsedTriage {
  const text = ticketText(ticket);
  const days = daysSincePurchase(ticket);

  if (PRIVACY_REQUEST.test(text)) {
    return {
      ...parsed,
      reply: supportReply(
        'We have received your request and will route it to our privacy team. The privacy team will verify your identity against the account email and handle the export within 30 days. Support agents cannot fulfil data requests directly.'
      ),
      reasoning: `${parsed.reasoning} Policy guard: privacy requests must be routed to the privacy team rather than fulfilled directly by support.`,
    };
  }

  if (
    REFUND_REQUEST.test(text) &&
    days !== null &&
    days <= REFUND_WINDOW_DAYS &&
    /(?:i(?:'ve| have) |has been |already )(?:started|approved|processed)|refund (?:is|was) (?:started|approved|processed)/i.test(
      parsed.reply
    )
  ) {
    return {
      ...parsed,
      reply: supportReply(
        `Based on the purchase date, your request is within our ${REFUND_WINDOW_DAYS}-day refund window and is eligible for processing. We have not yet started the refund; a support agent can verify the order and initiate it to the original payment method.`
      ),
      reasoning: `${parsed.reasoning} Policy guard: the draft cannot claim the refund was initiated because triage does not perform account actions.`,
    };
  }

  if (
    ticket.customer.plan === 'enterprise' &&
    SLA_BREACH.test(text)
  ) {
    return {
      ...parsed,
      reply: supportReply(
        'I’m sorry for the disruption. This report is a suspected SLA breach and needs immediate escalation to the enterprise success team. They will verify the incident duration, assess any service credits under the SLA, and coordinate the appropriate follow-up.'
      ),
      reasoning: `${parsed.reasoning} Policy guard: the draft must not present a reported incident or service-credit decision as already verified.`,
    };
  }

  const asksAboutRetention =
    /cancel/i.test(text) && /data|retention|retain|deleted|deletion/i.test(text);
  const hasRetentionPolicy = policies.some((policy) =>
    /data.{0,30}(?:retain|retention|delete|deletion)|(?:retain|retention).{0,30}data/i.test(
      policy.body
    )
  );
  if (asksAboutRetention && !hasRetentionPolicy) {
    return {
      ...parsed,
      reply: supportReply(
        'You can cancel at any time, and access continues until the end of the current billing period. A pause of up to 3 months is also available as an alternative. The data-retention period is not specified in the available cancellation policy, so a support agent must confirm that detail before giving you a timeline.'
      ),
      reasoning: `${parsed.reasoning} Policy guard: the available policy does not support a specific post-cancellation data-retention period.`,
    };
  }

  return parsed;
}

/** Matches the active refund policy (policy-refund-v3), not the deprecated 90-day text. */
export const REFUND_WINDOW_DAYS = 30;

const REFUND_REQUEST = /\brefund\b|money back/i;
const PURCHASE_DATE_VERIFICATION =
  /verify|confirm|need|provide|share|check/i;

function daysSincePurchase(ticket: Ticket): number | null {
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
  if (!REFUND_REQUEST.test(text) && parsed.category !== 'refund') return parsed;

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
      reply: supportReply(
        'Before we can determine refund eligibility, we need to verify the purchase date for this order. Once confirmed, we can check it against our 30-day refund window.'
      ),
      reasoning: `${parsed.reasoning} Policy guard: refund eligibility cannot be confirmed without a valid purchase date.`,
    };
  }

  if (days <= REFUND_WINDOW_DAYS) return parsed;

  if (hasLegalRefundException(ticket)) {
    return {
      ...parsed,
      reply: supportReply(
        'Your request is outside our standard 30-day refund window, and you have raised a potential legal exception. A support agent must route it to a specialist for review before making an eligibility decision.'
      ),
      reasoning: `${parsed.reasoning} Policy guard: a claimed legal exception requires specialist review rather than an automatic approval or denial.`,
    };
  }

  return {
    ...parsed,
    reply: supportReply(
      `Unfortunately your purchase was ${days} days ago, which is outside our ${REFUND_WINDOW_DAYS}-day refund window, so we are unable to process a refund.`
    ),
    reasoning: `${parsed.reasoning} Policy guard: outside-window refund replies are replaced with a deterministic denial required by policy-refund-v3.`,
  };
}
