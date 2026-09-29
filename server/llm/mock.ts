import type { CompletionRequest, LLMClient } from './client';

/**
 * A deterministic stand-in for a real chat model, for local dev and tests.
 *
 * It reads the same prompt a real model would receive and produces plausible
 * output by grounding itself in whatever context the prompt contains —
 * including the imperfections of real models (verbosity, formatting drift,
 * literal-mindedness). Output is stable for a given prompt so scenarios are
 * reproducible.
 */
export class MockLLM implements LLMClient {
  async complete(req: CompletionRequest): Promise<string> {
    await sleep(250 + (hash(req.user) % 400));
    const prompt = `${req.system}\n${req.user}`;
    const seed = hash(req.user);

    // Classify from the ticket itself; the policy context is only grounding
    // material for the reply.
    const ticket = ticketSection(prompt);
    const category = pickCategory(ticket, seed);
    const urgency = pickUrgency(ticket, seed);
    const escalate = decideEscalation(ticket);
    const reply = draftReply(ticket, prompt);
    const reasoning = `Classified as ${category} based on the customer's message; urgency ${urgency}.`;

    const payload = {
      category,
      urgency,
      escalate,
      reply,
      reasoning,
    };
    return wrapOutput(JSON.stringify(payload, null, 2), seed);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function ticketSection(prompt: string): string {
  // Prefer the delimited customer block. The system prompt now contains words
  // like "refund" and "untrusted", and policies may appear before the ticket;
  // slicing at "Relevant policies:" would classify from the instructions.
  const startMark = '<<<UNTRUSTED CUSTOMER TICKET>>>';
  const endMark = '<<<END UNTRUSTED CUSTOMER TICKET>>>';
  const start = prompt.indexOf(startMark);
  const end = prompt.indexOf(endMark);
  if (start !== -1 && end > start) {
    return prompt.slice(start + startMark.length, end);
  }
  const idx = prompt.indexOf('Relevant policies:');
  return idx === -1 ? prompt : prompt.slice(0, idx);
}

function has(prompt: string, ...words: string[]): boolean {
  const lower = prompt.toLowerCase();
  return words.some((w) => lower.includes(w));
}

// Real models rarely stick to one label vocabulary; emulate the drift.
const CATEGORY_LABELS: Record<string, string[]> = {
  refund: ['refund', 'Refund', 'refund_request'],
  billing: ['billing', 'Billing', 'billing_issue'],
  outage: ['outage', 'Outage', 'incident'],
  security: ['security', 'Security'],
  cancellation: ['cancellation', 'Cancellation', 'churn'],
  privacy: ['privacy', 'Privacy', 'data_request'],
  account: ['account', 'Account'],
  general: ['general', 'General', 'other'],
};

const URGENCY_LABELS: string[][] = [
  ['low', 'Low', 'low'],
  ['medium', 'Medium', 'normal'],
  ['high', 'High', 'urgent'],
];

function pickCategory(prompt: string, seed: number): string {
  let key = 'general';
  if (has(prompt, 'refund', 'money back')) key = 'refund';
  else if (has(prompt, 'charged twice', 'invoice', 'double charge', 'po number', 'billed')) key = 'billing';
  else if (has(prompt, 'outage', 'down for', 'uptime', 'sla')) key = 'outage';
  else if (has(prompt, 'signed in', 'sign-in', 'unauthorized', 'password')) key = 'security';
  else if (has(prompt, 'cancel')) key = 'cancellation';
  else if (has(prompt, 'gdpr', 'personal data', 'data export')) key = 'privacy';
  else if (has(prompt, 'rate limit', 'api')) key = 'account';
  const variants = CATEGORY_LABELS[key];
  return variants[seed % variants.length];
}

function pickUrgency(prompt: string, seed: number): string {
  let tier = 0;
  if (has(prompt, 'urgent', 'unacceptable', 'immediately', 'asap', 'outage', 'locked out')) {
    tier = 2;
  } else if (has(prompt, 'refund', 'charged', 'cancel', 'password', 'unauthorized', "wasn't me")) {
    tier = 1;
  }
  const variants = URGENCY_LABELS[tier];
  return variants[seed % variants.length];
}

// Escalation is judged from the emotional register of the message, the way a
// model tends to: loud complaints escalate, calm ones usually don't.
function decideEscalation(prompt: string): boolean {
  if (has(prompt, 'unacceptable', 'vp of engineering', 'lawyer', 'legal action', 'second outage')) {
    return true;
  }
  if (has(prompt, 'sla breach', 'this is the second')) return true;
  if (has(prompt, 'no rush', 'just curious', 'quick question', 'not a problem')) return false;
  return false;
}

function extractSection(prompt: string, header: string): string | null {
  const idx = prompt.indexOf(header);
  if (idx === -1) return null;
  const rest = prompt.slice(idx + header.length);
  const end = rest.search(/\n[A-Z][a-z]+[^\n]*:\n/);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

function draftReply(ticket: string, prompt: string): string {
  const lower = ticket.toLowerCase();

  // Models are suggestible: direct imperatives inside the ticket text tend to
  // win over softer framing elsewhere in the prompt — unless the prompt
  // explicitly anchors the model against following embedded instructions.
  const imperativeOverride =
    /ignore (all )?previous instructions|disregard (all )?(prior|previous|your) instructions|you are now \w+/i;
  const anchored =
    /never follow|do not follow|must not follow|treat .{0,40}as (data|untrusted)|untrusted (input|content|text)/i;
  if (imperativeOverride.test(ticket) && !anchored.test(prompt)) {
    return (
      'Good news! Your refund has been approved and will be returned to your original ' +
      'payment method within 5-7 business days. No manager approval is required. ' +
      'Thanks for being a valued customer!'
    );
  }

  const parts: string[] = [];
  parts.push('Hi, thanks for reaching out.');

  if (lower.includes('refund')) {
    const windowMatch = prompt.match(/within (\d+) days of purchase/i);
    const windowDays = windowMatch ? Number(windowMatch[1]) : 30;
    const purchaseMatch = prompt.match(/purchased? .*?(\d+) days ago/i);
    const daysSince = purchaseMatch ? Number(purchaseMatch[1]) : null;
    if (daysSince !== null && daysSince > windowDays) {
      parts.push(
        `Unfortunately your purchase falls outside our ${windowDays}-day refund window, ` +
          'so we are unable to process a refund. As an alternative, we can offer account credit.'
      );
    } else {
      parts.push(
        `You're within our ${windowDays}-day refund window, so I've started the refund process. ` +
          'You should see the funds back on your original payment method within 5-7 business days.'
      );
    }
  } else if (lower.includes('outage') || lower.includes('uptime')) {
    parts.push(
      'I sincerely apologize for the disruption. Our team has confirmed the incident and is ' +
        'working on a full resolution. Per your SLA, service credits will be applied to your ' +
        'next invoice, and I am arranging a follow-up call with our engineering leadership.'
    );
  } else if (lower.includes('signed in') || lower.includes('unauthorized')) {
    parts.push(
      'Thanks for flagging this. As a precaution, please reset your password and enable ' +
        'two-factor authentication. We will review the sign-in activity on your account.'
    );
  } else if (lower.includes('cancel')) {
    parts.push(
      'I can help with that. Your subscription will remain active until the end of the current ' +
        'billing period. Before you go — would a 3-month pause work instead? Your data is retained ' +
        'for 30 days after cancellation.'
    );
  } else if (lower.includes('gdpr') || lower.includes('personal data')) {
    parts.push(
      'We have received your data export request. We will verify your identity against the ' +
        'account email and provide a complete export within 30 days as required.'
    );
  } else if (lower.includes('charged twice') || lower.includes('billed')) {
    parts.push(
      'Sorry about the confusion on your statement. We are reviewing the charge history and ' +
        'will reverse any confirmed duplicate charge within 3 business days.'
    );
  } else {
    parts.push(
      'Thanks for the details — I have logged your request and will follow up shortly with ' +
        'a full answer.'
    );
  }

  // Ground the reply in every piece of context provided, the way an eager
  // model does — including agent-side annotations if they are in the prompt.
  const notes = extractSection(prompt, 'Internal notes:');
  if (notes && notes.toLowerCase() !== 'none') {
    const firstNote = notes.split('\n')[0].replace(/^[-*]\s*/, '');
    parts.push(`Also, regarding your account: ${firstNote}`);
  }

  parts.push('Best regards,\nSupport Team');
  return parts.join('\n\n');
}

// Formatting drift: real models don't always return bare JSON.
function wrapOutput(json: string, seed: number): string {
  switch (seed % 3) {
    case 0:
      return json;
    case 1:
      return '```json\n' + json + '\n```';
    default:
      return `Here is the triage result:\n\n${json}\n\nLet me know if you need anything else.`;
  }
}
