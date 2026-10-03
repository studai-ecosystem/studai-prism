# Prism metrics — definitions v1 (P9.2, CH-44)

Status: DEFINED and FIXTURE_TESTED. No pilot result has been analysed with these definitions yet. The definitions are frozen in code (`server/domain/metrics/definitions.js`, `METRIC_DEFINITIONS_VERSION = 'v1'`) and tested by `server/test/metricsDefinitions.test.js`. Changing a numerator, denominator or exclusion requires a new version, recorded here with the reason, BEFORE the changed definition is used on any outcome.

Rule: denominators are not redefined after seeing results. The compute functions accept rows and an optional options bag; no helper exists to override a population.

## Event catalogue (`server/domain/metrics/events.js`, schema v1)

Canonical events (source plan order): `intent_selected`, `preview_started`, `preview_feedback_seen`, `package_viewed`, `purchase_verified`, `formal_begin_acknowledged`, `candidate_action_saved`, `opportunity_presented`, `evaluation_completed`, `evaluation_failed`, `report_published`, `report_opened`, `moment_opened`, `practice_recommended`, `practice_started`, `practice_feedback_seen`, `practice_retried`, `fresh_challenge_completed`, `application_self_reported`, `review_requested`, `share_created`.

Existing telemetry names are reconciled by alias, not renamed (no client or test breaks): `assessment_started → formal_begin_acknowledged`, `preview_completed → preview_feedback_seen`, `offer_viewed → package_viewed`, `purchase_completed → purchase_verified`, `report_viewed → report_opened`, `mission_started → practice_started`.

Payload allow-list (strict; any other key is rejected): `sessionId`, `assignmentId`, `definitionId`, `formId`, `missionId`, `opportunityId`, `momentId`, `reportVersion`, `scope`, `surface`, `outcome`, `method`, `mode`, `productCode`, `fundingSource`, `channel` (VOLUNTARY | COMPULSORY | UNKNOWN), `availability`, `reminded`, `incentivised`, `refunded`, `isSynthetic`, `count`, `at`. Ids, enums, counts, flags and timestamps only. No response text, private context, names, institution identity, raw audio, tokens or payment secrets can be represented. The server telemetry route (`server/routes/v1/telemetry.js`) keeps its existing drop-and-store behaviour for current clients; the strict schema is the contract for new emitters and for metric computation.

Actor identity is a keyed hash (`PRISM_TELEMETRY_KEY`), never a user id.

## Synthetic exclusion (applies to every metric)

Removed from numerator and denominator and reported under `excluded.synthetic`: rows with `is_synthetic` / `isSynthetic` true, preview attempts marked synthetic, and anything funded by a `DEV` grant. Researcher and staff accounts are excluded by account list at analysis time (recorded in the analysis note, not inferred).

## Definitions

| Metric | View | Numerator | Denominator | Exclusions / separately reported |
|---|---|---|---|---|
| `saved_action_reliability` | Operational | Acknowledged candidate actions whose payload is recoverable from the durable store (row present with the acknowledged payload hash) | Candidate actions the server acknowledged (ACCEPTED, APPLIED or FAILED) | Synthetic, DEV; client-only actions never acknowledged. A FAILED action is still acknowledged and recoverable — this is durability, not evaluation success. |
| `required_opportunity_delivery` | Measurement | Required, eligible opportunities with a recorded presentation (PRESENTED, ACTION_RECEIVED, EVALUATION_PENDING, EVALUATED) | Required, eligible opportunities scheduled for the run | Synthetic; optional opportunities; opportunities made ineligible by an approved accommodation. Interrupted runs stay in the denominator and are counted separately. |
| `technical_empty_report_rate` | Operational | Submitted eligible runs with no usable output because of a technical fault (job FAILED with TECHNICAL_FAILURE, missing publication) | Submitted eligible runs (a FINISH action was accepted) | Synthetic; unsubmitted runs. Genuinely limited evidence (INSUFFICIENT_EVIDENCE units with a reason) is reported separately and is not a technical empty report. |
| `evidence_yield` | Measurement | Applicable capability decisions meeting the governed sufficiency rule for their method | Applicable decisions (opportunity delivered and a decision attempted) | Synthetic; decisions on undelivered opportunities. Segmented by method. A yield of the instrument, never a learner score; the governed rule's thresholds cannot be tuned by this metric. |
| `comprehension` | Customer | Tested users who correctly explained one bounded finding AND one next behaviour from their own report without coaching | Users who completed the comprehension task | Synthetic; coached sessions; researcher/staff. MANUAL_ONLY: recorded by a researcher under RESEARCH_PROTOCOLS.md, never inferred from clicks. |
| `voluntary_practice_activation` | Customer | Distinct actors who started a practice mission voluntarily after viewing a relevant AVAILABLE recommendation | Distinct actors who viewed a relevant AVAILABLE recommendation under a VOLUNTARY channel | Synthetic; COMPULSORY channel; UNAVAILABLE recommendations; UNKNOWN channel. Compulsory starts counted separately. |
| `seven_day_return` | Customer | Cohort actors with at least one voluntary return 1–7 days after their first qualifying session | Actors whose first qualifying session is at least 7 days old at analysis time | Synthetic; immature cohort. Returns that only follow a reminder or an incentive are flagged separately. |
| `paid_conversion` | Customer | Distinct actors with a provider-verified, non-refunded purchase | Distinct actors who viewed an eligible package offer | Synthetic; DEV and INVITE funding; refunds (reported separately). VOLUNTARY and COMPULSORY channels are computed separately and never summed. |
| `transfer` | Customer | Independently rated performance on an unfamiliar task under the Study D/E protocol | Participants completing the protocol | MANUAL_ONLY. Not computable from product events; produced only by the human-validation programme. |

## Three quality views (P9.1)

`GET /api/admin/quality/operational`, `/measurement`, `/customer` (permission `system:read`, admin plane, aggregate counts only, 7-day window, honest `503 NO_DB` without a database). The views read existing tables (`assessment_candidate_actions`, `assessment_jobs`, `student_report_versions`, `report_review_requests`, `assessment_opportunities`, `behavioral_evidence_units`, `product_events`). No session ids, actor hashes, payloads, report bodies or learner text leave the router (`server/test/qualityViews.test.js` scans every response). Comprehension and transfer appear as `MANUAL_ONLY`, never as a number.

One attractive number is not a substitute for the three views.

## Alerts (P9.6)

Pure detectors in `server/domain/metrics/alerts.js` (tested by `server/test/metricsAlerts.test.js`): zero-evidence clusters, accepted FINISH without a job, DONE jobs without publication, claim-rejection spikes, expired leases, repeated Begin, history ownership conflicts, cross-scope denials. Alerts carry request/run/job references and counts under approved access, never learner content. Thresholds are planning defaults (`DEFAULT_THRESHOLDS`) and are printed with each quality view.

## Initial business hypotheses (P9.9) — labels, not benchmarks

80% unassisted comprehension; 40% voluntary relevant-practice activation; 25% seven-day voluntary return; at least 30 genuine purchases with refunds separately reported; a specific user-articulated advantage over a strong generic AI alternative; positive contribution under measured realistic use and recovery costs. These are the source plan's initial hypotheses for go/no-go discussion. None has been measured. Kill/redesign logic: misunderstood reports → explanation/UX work; understood but unused practice → relevance/effort investigation; same-script improvement without fresh-task transfer → learning-method revision; no willingness to pay → buyer/offer/distribution work. No additional dashboards compensate for a failed hypothesis.

## Unit economics (P8.8, `server/domain/commerce/unitEconomics.js`, `softBudget.js`)

Formulas are applied exactly as the source plan states, over ACTUAL figures only:

```text
Net collected revenue = collected amount - taxes payable - refunds/credits
Direct delivery cost  = dialogue + evaluation + verification + audio
                      + variable infrastructure + payment fees
                      + allocated review/support + retry/recovery
Contribution          = net collected revenue - direct delivery cost
Contribution margin   = contribution / net collected revenue
```

Rules: one key per cost category (payment fees and support are never counted twice; an unknown
key throws); any unknown component makes the total PARTIAL, never zero; margin is `null` for a
zero or unknown denominator; `basis` is `ACTUAL` or `HYPOTHESIS` so price experiments never mix
with historical revenue. Per-run costs carry `{ mode, runIdHash, methodVersion, productCode }`
(`costTracker.usageTags`); `costPercentiles` reports p50/p95 over known runs and counts unknown
runs separately. Soft budgets (`PRISM_SOFT_BUDGET_USD`) produce UNCONFIGURED / UNKNOWN_SPEND /
OK / ALERT (≥80%) / NEW_STARTS_LIMITED (≥100%) and can only alert or limit NEW starts — never
interrupt an active paid run, change evidence criteria or swap the evaluator.

Funnel payload enums added in P8.9: `purchaseKind` (GENUINE / REFUND / INCENTIVE / COMPULSORY /
TEST), `accountClass` (GENUINE / TEST / RESEARCH_PARTICIPANT / STAFF), `workspaceClass`,
`version`. Telemetry aliases: `recommendation_viewed → practice_recommended`,
`recommendation_followed → practice_started`, `practice_completed` / `mission_completed →
practice_feedback_seen`. Preview metrics (`previewMetrics()`) count real rows only and report
`syntheticExcluded` (T59).

## Version history

- v1.1 (P8 gap pass, 2026-10-03): unit-economics and soft-budget section; purchase-kind /
  account-class enums; recommendation/practice aliases. No metric definition changed.
- v1 (P9, build c2a38dd): initial definitions, stored before any pilot analysis.
