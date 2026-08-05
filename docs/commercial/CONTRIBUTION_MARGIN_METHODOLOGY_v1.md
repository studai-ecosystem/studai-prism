# CONTRIBUTION-MARGIN METHODOLOGY v1

Charter §23. Governs `server/lib/margin.js`, the `/admin/margin` dashboard
and the finance export. **Honesty laws are code-enforced and CI-tested.**

## Laws

1. **UNKNOWN is never zero.** A cost with no instrumentation or no configured
   model rate renders as `UNKNOWN` (`estimated_cost_usd = NULL` at the row
   level; `{status:'unknown', amount:null}` at every aggregate). Sums over
   any unknown component are labelled `partial`.
2. **No cross-currency fabrication.** Revenue is INR (Razorpay paise); AI
   costs are USD (Bedrock). Margins mixing the two are UNKNOWN unless
   `MARGIN_FX_INR_PER_USD` is explicitly configured by an operator.
3. **No profitability claims.** The dashboard reports measurements and their
   status. Contribution margin stays UNKNOWN until *every* category below is
   measured or explicitly allocated in writing.

## Category status (2026-08-05)

| §23 category | Status | Source |
| --- | --- | --- |
| Conversation model | measured | ai_usage_events (opening, conversation) |
| Judge panel | measured | ai_usage_events (judge_full) |
| Micro-rater / estimator | measured | ai_usage_events (entry_estimator, calibration, micro_rater) |
| Speech-to-text | measured | ai_usage_events (speech_to_text) |
| Text-to-speech (Polly) | UNKNOWN — not instrumented | per-call logging not built |
| Infrastructure allocation | UNKNOWN — not instrumented | needs an allocation decision |
| Payment-gateway fee | UNKNOWN — not instrumented | Razorpay fee schedule not captured per txn |
| Email/PDF | UNKNOWN — not instrumented | — |
| Human review | UNKNOWN — not instrumented | no human raters engaged (HA-009) |
| Support allocation | UNKNOWN — not instrumented | — |
| Refunds | UNKNOWN — not instrumented | — |

## Mechanics

- Every Bedrock call writes an `ai_usage_events` row (task, model, tokens,
  `estimated_cost_usd` from the versioned rate table in
  `services/ai/costTracker.js`; NULL when the model has no rate). Persistence
  is fire-and-forget — cost accounting never blocks or fails an assessment.
- Rows are session-keyed and pseudonymous; they join the erasure cascade, so
  **aggregates exclude erased sessions** — totals are therefore lower bounds,
  stated as such wherever surfaced.
- Rates: `BEDROCK_COST_RATES_JSON` overrides the in-repo defaults; rate
  changes are code/config changes with history, never silent edits.
- Channels: `b2c_paid` (mode='paid') vs `institution_sponsored`
  (mode='invite'; candidate pays nothing; institutional revenue is contracted
  offline and reported UNKNOWN until invoicing is instrumented).
- Cohort view joins invites → redemptions → reports → usage.

## Revenue

- B2C: `v1_payments.amount` (paise) on completed assessments — measured.
- Institution-sponsored: NOT instrumented (no invoicing system) — UNKNOWN.
