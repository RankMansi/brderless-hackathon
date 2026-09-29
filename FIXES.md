# Fixes

### 1. Internal notes leaked into customer-facing replies  [priority: high]
- Symptom: Drafted replies quoted agent-only notes. T-1009 told the customer they were flagged for refund abuse with fraud risk score 87. T-1003 disclosed incident INC-4432. T-1006 disclosed an unverified Stripe auth-hold conclusion. T-1010 and T-1013 did the same with their notes.
- Reproduction: `POST /api/tickets/T-1009/triage` (mock LLM). The reply contained `Also, regarding your account: Refund-abuse flag: 4 refunds in the last 12 months. Fraud risk score: 87.` The same pattern appeared for every seed ticket with `internalNotes`.
- Root cause: `formatTicketContext` appended `Internal notes:` to the single prompt used to draft the customer reply. The model grounds the reply in whatever context it is given. Wording such as "do not mention the notes" would still leave the secret in the prompt.
- Fix (and why this layer): Stopped putting internal notes in `formatTicketContext`, which is the prompt boundary. Added `findLeakedInternalNote` in the triage service so a reply that still repeats a note is rejected and not stored. The agent UI still shows notes, labeled internal only.
- Verification (test name or manual steps): `tests/internalNotes.test.ts` — prompt exclusion, reply exclusion for every noted seed ticket, and refusal to store a leaking reply.
- Commit: (this commit)

### 2. Customer text could override policy and approve an out-of-window refund  [priority: high]
- Symptom:
- Reproduction:
- Root cause:
- Fix (and why this layer):
- Verification (test name or manual steps):
- Commit:

### 3. Deprecated refund policy outranked the current one  [priority: high]
- Symptom:
- Reproduction:
- Root cause:
- Fix (and why this layer):
- Verification (test name or manual steps):
- Commit:

### 4. Escalation ignored mandatory policy rules  [priority: high]
- Symptom:
- Reproduction:
- Root cause:
- Fix (and why this layer):
- Verification (test name or manual steps):
- Commit:

### 5. Model label drift broke urgency filters and badges  [priority: med]
- Symptom:
- Reproduction:
- Root cause:
- Fix (and why this layer):
- Verification (test name or manual steps):
- Commit:

### 6. Switching tickets showed another ticket's triage  [priority: med]
- Symptom:
- Reproduction:
- Root cause:
- Fix (and why this layer):
- Verification (test name or manual steps):
- Commit:

### 7. Triage was not debuggable from logs  [priority: med]
- Symptom:
- Reproduction:
- Root cause:
- Fix (and why this layer):
- Verification (test name or manual steps):
- Commit:

## Found but not fixed

## Priority reasoning
