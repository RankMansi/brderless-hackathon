import { CATEGORIES, URGENCIES, type Category, type Urgency } from '../../shared/types';

export interface ParsedTriage {
  category: Category;
  urgency: Urgency;
  escalate: boolean;
  reply: string;
  reasoning: string;
}

const CATEGORY_SYNONYMS: Record<string, Category> = {
  refund: 'refund',
  refund_request: 'refund',
  billing: 'billing',
  billing_issue: 'billing',
  outage: 'outage',
  incident: 'outage',
  security: 'security',
  cancellation: 'cancellation',
  churn: 'cancellation',
  privacy: 'privacy',
  data_request: 'privacy',
  account: 'account',
  general: 'general',
  other: 'general',
};

const URGENCY_SYNONYMS: Record<string, Urgency> = {
  low: 'low',
  medium: 'medium',
  normal: 'medium',
  high: 'high',
  urgent: 'high',
};

/**
 * Extract the triage JSON from a model response. Models sometimes wrap JSON
 * in code fences or prose, so we locate the outermost object first.
 * Labels are normalized here so every caller sees the closed category and
 * urgency sets; the UI filters and badge classes compare those strings exactly.
 */
export function parseTriageResponse(raw: string): ParsedTriage {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error('Model response contained malformed JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Model response JSON must be an object');
  }
  const record = parsed as Record<string, unknown>;

  for (const field of ['category', 'urgency', 'escalate', 'reply']) {
    if (!(field in record)) {
      throw new Error(`Model response missing field: ${field}`);
    }
  }

  const reply = String(record.reply);
  if (!reply.trim()) {
    throw new Error('Model response missing field: reply');
  }

  return {
    category: normalizeCategory(record.category),
    urgency: normalizeUrgency(record.urgency),
    escalate: parseEscalate(record.escalate),
    reply,
    reasoning: String(record.reasoning ?? ''),
  };
}

function normalizeCategory(value: unknown): Category {
  const key = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
  const mapped = CATEGORY_SYNONYMS[key];
  if (!mapped) {
    throw new Error(
      `Model response has unknown category: ${String(value)} (expected one of ${CATEGORIES.join(', ')})`
    );
  }
  return mapped;
}

function normalizeUrgency(value: unknown): Urgency {
  const key = String(value).trim().toLowerCase();
  const mapped = URGENCY_SYNONYMS[key];
  if (!mapped) {
    throw new Error(
      `Model response has unknown urgency: ${String(value)} (expected one of ${URGENCIES.join(', ')})`
    );
  }
  return mapped;
}

function parseEscalate(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === 'yes') return true;
    if (v === 'false' || v === 'no') return false;
  }
  throw new Error('Model response has invalid escalate value');
}
