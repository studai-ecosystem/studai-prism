# HA-015 / HA-C006 — Pricing approval sheet

PROD-READY Phase 10. **No price on this sheet is approved, and engineering
proposes none.** HA-015 (approve and publish B2B pilot pricing, founder) and
HA-C006 (approve each campus contract's prices and record them, business
owner + finance) are human decisions. This sheet sets out the cost method the
product already uses on `/admin/margin`, which inputs are measured and which
are UNKNOWN, and the blanks a human fills in.

Governing documents: [CONTRIBUTION_MARGIN_METHODOLOGY_v1.md](../../commercial/CONTRIBUTION_MARGIN_METHODOLOGY_v1.md)
("UNKNOWN is never zero"), [PILOT_PRICING_PACKAGE_v1.md](../../commercial/PILOT_PRICING_PACKAGE_v1.md)
("PROVISIONAL — NOT APPROVED, NOT PUBLISHED"), [QUOTE_PROPOSAL_TEMPLATE_v1.md](../../commercial/QUOTE_PROPOSAL_TEMPLATE_v1.md)
(insert only founder-approved prices).

## 1. The `/admin/margin` method (as implemented)

Code: `server/lib/margin.js`, routes `server/routes/admin/margin.js`
(mounted `server/routes/admin/index.js:142`; permission `margin:read` —
`finance_admin`, `auditor`, `super_admin`; needs the database, else 503),
page `src/pages/admin/AdminMargin.jsx`.

### 1.1 Value model

Every money value is `known`, `partial` or `unknown` (`margin.js:32-52`).
A sum containing any unknown component is `partial` ("known components only")
and never presented as a complete figure; with no known component it is
`UNKNOWN`. The page renders UNKNOWN as the word "UNKNOWN", never 0.

### 1.2 Formulas

```
AI call cost (USD)      = input_tokens  × inputPerMillion  / 1e6
                        + output_tokens × outputPerMillion / 1e6
                        + cache_read    × (cacheReadPerMillion  || inputPerMillion) / 1e6
                        + cache_write   × (cacheWritePerMillion || inputPerMillion) / 1e6
                          (server/services/ai/costTracker.js:63-76; NULL when the model has no rate)

B2C revenue (INR)       = Σ v1_payments.amount (paise) of completed paid sessions / 100      (margin.js:136-137, 162)
Gross margin (INR)      = B2C revenue − AI cost (USD) × MARGIN_FX_INR_PER_USD               (margin.js:61-74)
                          scope: "b2c revenue vs KNOWN AI costs only"; UNKNOWN if revenue or
                          AI cost is not fully known or no FX rate is configured
Contribution margin     = UNKNOWN, always (margin.js:193-196):
                          "not all cost categories are instrumented"
```

The fuller contribution formula exists in `server/domain/commerce/unitEconomics.js:3-8`
(not wired to the dashboard; used by tests only):

```
Net collected revenue = collected amount − taxes payable − refunds/credits
Direct delivery cost  = dialogue + evaluation + verification + audio + variable infrastructure
                      + payment fees + allocated review/support + retry/recovery
Contribution          = net collected revenue − direct delivery cost
Contribution margin   = contribution / net collected revenue   (withheld if revenue unknown or 0)
```

This is the formula a pricing decision needs. Every input to it is listed in
§2 with its current state.

## 2. Inputs per completed assessment

| Input (unitEconomics key / dashboard category) | State today | Source | Value for the decision |
| --- | --- | --- | --- |
| Dialogue — conversation model (`conversation_model`) | **Measured** tokens × **configured** rate | `ai_usage_events` (migration 0020); rates `DEFAULT_RATES` in `costTracker.js:22-37` or `BEDROCK_COST_RATES_JSON` | Read from `/admin/margin` → per-assessment view; production figure **UNKNOWN to engineering** (no production data read) |
| Evaluation — judge panel (`judge_panel`) | Measured × configured | same | **UNKNOWN** until read from production |
| Evaluation — micro-rater / estimator (`micro_rater`) | Measured × configured | same | **UNKNOWN** until read from production |
| Audio — speech-to-text (`stt`) | Measured × configured | same | **UNKNOWN** until read from production |
| Audio — text-to-speech, Polly (`tts`) | **UNKNOWN — not instrumented** | per-call logging not built | **UNKNOWN** |
| Variable infrastructure (`infrastructure`) | **UNKNOWN — not instrumented** | needs an allocation decision (EKS, RDS, EFS, ALB) | **UNKNOWN** |
| Payment fees (`payment_gateway_fee`) | **UNKNOWN — not instrumented** | Razorpay fee schedule not captured per transaction | **UNKNOWN** (B2C only; institution invoices offline) |
| Email / PDF delivery (`email_pdf`) | **UNKNOWN — not instrumented** | SendPulse | **UNKNOWN** |
| Human review (`human_review`) | **UNKNOWN — not instrumented** | no raters engaged (HA-009); review allowance per cohort from the plan | **UNKNOWN** |
| Support allocation (`support`) | **UNKNOWN — not instrumented** | — | **UNKNOWN** |
| Refunds (`refunds`) | **UNKNOWN — not instrumented** | — | **UNKNOWN** |
| Verification (identity check) | Not a dashboard category | V3 identity check (Phase 4) has no cost telemetry | **UNKNOWN** |
| Retry / recovery | Not a dashboard category | — | **UNKNOWN** |
| Taxes payable | Not modelled | tax presentation is part of the offer gate (P13) | **UNKNOWN** — finance |
| FX rate INR/USD | Configuration (`MARGIN_FX_INR_PER_USD`); unset → margin UNKNOWN | operator | **UNKNOWN** until set |
| Institution revenue | **UNKNOWN — not instrumented** ("institution billing is contracted offline") | contracts | Decided by this sheet |
| B2C price | Live constant `PRICE_PAISE = 49900` (₹499), `server/routes/payment.js:12`; voluntary individual only | code | Not part of HA-015 |

Notes on the configured AI rates: they are code defaults (USD per million
tokens; e.g. Claude Sonnet 5 standard 3 / 15 after the promotion ending
2026-08-31; Nova 2 Lite 0.35 / 2.95), recorded with a "July 2026" source
comment. Whether they match the current Bedrock invoice is **UNKNOWN** to
engineering; finance should reconcile one month of `ai_usage_events` against
the AWS bill before relying on them. Aggregates exclude erased sessions, so
totals are lower bounds (methodology doc).

Do **not** use `docs/finops/EXECUTIVE_SUMMARY.md`, `PROFITABILITY_REPORT.md`
or `PRICING_STRATEGY.md`: they are a July 2026 Azure-era audit built on a
$10 price, do not use the UNKNOWN convention and contradict the §23 method
(e.g. they treat infrastructure and payment fees as known). They carry no
"historical" banner; that is recorded here rather than edited, as they are
records.

## 3. Steps to produce the evidence (finance, read-only)

1. Sign in to the admin console as `finance_admin`; open **Contribution
   margin** (`/admin/margin`). Choose the window.
2. Record per channel: starts, completions, completion rate, revenue
   (B2C known; institution UNKNOWN), AI cost (known / partial / UNKNOWN).
3. Export **Finance export (CSV)** (audited, `margin_export`). Compute the AI
   cost distribution per completed assessment (p50 / p95; count unpriced runs
   separately — never as zero).
4. For each UNKNOWN row in §2, either obtain a measured value or write an
   explicit allocation with its basis, owner and date. Contribution margin
   stays UNKNOWN until **every** row is measured or explicitly allocated in
   writing (methodology, law 3).
5. Only then compare candidate prices against the full cost.

## 4. HA-015 — B2B pilot price approval (founder)

The indicative ranges in [PILOT_PRICING_PACKAGE_v1.md](../../commercial/PILOT_PRICING_PACKAGE_v1.md)
are PROVISIONAL and may not be quoted. They are not repeated here.
Fixed principles (not provisional): institution-required candidates never
pay; ₹499 B2C stays voluntary individual only.

| Component (package) | Approved price (INR, excl./incl. tax — state which) | Cost basis (§2 rows, measured or allocated) | Contribution per unit | Approved by / date |
| --- | --- | --- | --- | --- |
| Platform / setup, per institution per term | `______` | `______` | `______` | `______` |
| Completed assessment | `______` | `______` | `______` | `______` |
| Minimum cohort | `______` | — | — | `______` |
| Human-review allowance included | `______` | `______` | `______` | `______` |
| Additional human review | `______` | `______` | `______` | `______` |
| Custom validation / integrations | `______` | `______` | `______` | `______` |

Evidence required to close HA-015 (register): written approval **and** the
margin evidence reviewed (§3 outputs attached). Publishing also needs the
terms reviewed (HA-004) before any quote goes out.

## 5. HA-C006 — campus contract prices (per institution)

Schema: `campus_contract_pricing` (migration 0038) — `platform_fee`,
`per_assessment_rate`, `reassessment_rate` (NUMERIC(14,2)), `currency`
(ISO 4217), `approved_by`, `approved_at` (both or neither). Every column is
nullable with no default, and **no application path writes them**
(`server/domain/billing/repository.js` only reads; test
`server/test/campusBilling.test.js:266`). A price is shown to the
institution's billing roles and on the invoice CSV only once `approved_by`
and `approved_at` are both set (`server/domain/billing/service.js:54-60`).
Contracts are created, activated and closed in the admin console without
prices (`contracts:manage`, `finance_admin`).

| Institution / contract id | platform_fee | per_assessment_rate | reassessment_rate | currency | approved_by | approved_at | Signed contract ref |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `______` | `______` | `______` | `______` | `______` | `______` | `______` | `______` |

Recording the prices is a human database write outside the application
(by the finance owner, with a second person checking), after the contract is
signed. Engineering does not supply the SQL in this sheet so that the write is
consciously authored by the approver; the columns above are the complete set.

## 6. Status

HA-015: register status unchanged at `PREPARED (materials ready)`; this
sheet is added to its materials. HA-C006: `PREPARED (materials ready)` with
this sheet. Neither is closed: no price is approved and no contract is
signed.
