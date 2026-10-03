# Experience programme - source traceability and execution checkpoints

## P9 code-safe gap closure - 2026-10-03

State: CODE-SAFE COMPLETE and AUTOMATED LAYERS VERIFIED from starting HEAD
`92d5e3a` on `ui/prism-brand-transformation`. Release remains **NO-GO**.
Human, manual and Layer C gates remain OPEN/BLOCKED/UNVERIFIED.

- CH-44/CH-45 and P9.1-P9.2: metric definitions v1 were stored before results,
  with exact denominators/exclusions and independent operational, measurement
  and customer views. All 21 source events are allowlisted. Essential
  operational and voluntary research purposes are separate; research events
  require explicit permission. Payloads fail closed for response/private
  context/name/institution/raw-audio/token/payment-secret keys.
- T01-T60: `scripts/programme-validation-ledger.mjs` is the machine-readable
  source and `scripts/check-programme-validation.mjs` validates exact IDs,
  outcomes, layers, evidence paths and blocker ownership. Current result:
  **56 PASS / 3 BLOCKED / 1 UNVERIFIED**. There is no inherited blanket pass.
- T60: executable rollback proof covers a pinned compatible active-run handler
  and safe new-run disablement. T49-T52 fault/race coverage remains executable.
- Layer B: the existing isolated runner proves real HTTP, disposable PostgreSQL,
  workers, evidence, publication, report and practice, including meaningful and
  sparse/early-ended runs. Final database result: 21/21.
- P9 visual matrix: all required widths and four projects, axe, keyboard and
  overflow; 5 passed / 3 intentional skips, 18 screenshots inspected. Manual
  assistive-technology/real-device checks are not claimed.
- Layer C: redacted manifest template and fail-closed command are ready, but no
  live model was called. T58 remains BLOCKED on authorization, credentials,
  spend, approved target/form and content/measurement/security approval.
- Load: local controlled-adapter results met the stated planning targets on this
  host. They are not an SLA, real-provider or Layer C result.
- Human studies: research forms, 12+12 interview guide, matched-effort generic-AI
  comparator, map/list tasks, rater programme and Studies A-E are prepared but
  NOT RUN. No participant or payment outcome exists.
- Final verification: build PASS; unit 516/516; server 858 pass / 26 skip;
  static PASS; critical browser 217 pass / 3 recovered retries; database 21/21;
  calibration 64/64; full browser 805 pass / 81 intentional skips / 6 recovered
  retries; programme ledger PASS. Exact evidence is in `TEST_RESULTS.md`.

Remaining blockers: T46 measurement-owner comparable-form approval; T54
product/finance/support recovery and refund policy; T58 authorised Layer C
evidence; T56 screen-reader, forced-colour, voice-control and real-device
evidence. Engineering, Content, Measurement, Security/Privacy, Product-Finance
and Operations sign-offs remain independently OPEN.

## P7 remaining gaps closed - 2026-10-03

State: P7 code-safe work IMPLEMENTED and INTEGRATION_VERIFIED (Layer B: real `/api/v1` router with
memory repos and the deterministic provider; real browser journey on the 4174 audit server with
throwaway PostgreSQL, 52 migrations). Human gates stay BLOCKED: prompt review of
`preparation_participant.v2` / `preparation_action_card.v2` / `preparation_assist.v1`
(CONTENT_REVIEW.md), privacy/retention review of the preparation copy and minimal-retention
approach, approval of any formal form pair for comparison (T46 is fixture-approved only), and the
operator flip of `PRISM_PREPARATION_V1` (HA-C001). Live-model wording (Layer C) not run. Source ids:
CH-34, CH-35, CH-36; T07, T43, T44, T45, T46, T47, T52, T56 (T41 regression green).

- P7.1 wizard (`PreparationWizard.jsx`): six bounded situations, one field per step, five
  practice targets, omit-names guidance before any detail; the server returns a sanitized summary
  and six restated assumptions (`summaryOf`, `defaultAssumptions`), editable and removable before
  confirm; confirm sends only edits (`ConfirmEdits`, strict). Route `/app/prepare(/:attemptId)`
  shows an honest in-shell "not yet available" state when the flag is off (no silent redirect).
- P7.2 safety and bounded personalisation (`domain/preparation/safety.js`): deterministic
  REFUSED (harassment, coercion, deception, unauthorised disclosure, crisis) ? 422
  `PREPARATION_OUT_OF_SCOPE` with a bounded message and no row; LIMITED (legal, medical) ? the
  rehearsal runs with a scoped limitation shown on review, rehearsal and in the system prompt;
  ordinary firm disagreement passes. Learner text travels only in the user message inside
  `<learner_context>` / `<candidate_transcript>`; system prompts never contain it. Model output is
  validated with strict zod schemas: extra keys (mode, scope, authorization, rubric, timer,
  publication, billing) fail and nothing is saved. Telemetry serializer carries ids/counts only.
  **Gateway fix:** `modelRouter.js` now routes the three preparation tasks (the real gateway
  threw "Unknown AI task" ? every rehearsal line was PROVIDER_ERROR; found by the browser journey,
  now unit-tested).
- P7.3 rehearsal (`RehearsalView.jsx`, service `sendTurn`/`assist`): untimed, "Personal
  preparation ? Private to you" + "Not a formal assessment" badges, explicit allowance
  (unlimited preparations; 40 learner lines and 5 AI suggestions per rehearsal). Authorship per
  turn `LEARNER | ASSISTANT | SYSTEM`; a requested sample sentence is an `AI_ASSISTANT` turn shown
  under "Need a hand?", never in the conversation and never in the transcript the card sees
  (T44). Pause = leave (saved), resume from the list, rename (`PATCH /preparation/:id`), delete
  with confirmation (`DELETE`, cascades turns/card/linked check-ins; T52: a late model result is
  discarded after re-read). Counterpart failure keeps the learner line with an honest reason.
- P7.4 card (`ActionCardView.jsx`, `CardOutputSchema`): situation, 3?5 plan steps, opening, 1?3
  questions, ?3 trade-offs, one boundary/escalation option, self-check; labelled "AI assistance";
  edit (`PATCH /card`, "You adjusted this card?") and discard (`DELETE /card` ?
  `DISCARDED_BY_LEARNER`, rehearsal kept). Observations describe the learner's behaviours
  (clarified a constraint, explained a trade-off, negotiated a boundary, asked a question,
  confirmed ownership, left a question unresolved), quote only verbatim LEARNER lines, and say
  the counterpart's agreement is not the measure. Missing card = explicit reason, nothing
  generic.
- P7.5 application card + check-ins: one behaviour from the chosen practice target
  (`APPLICATION_SUGGESTIONS`, labelled "Suggested from your practice target" ? "Your wording"
  once edited), dismissable, in-app reminder opt-in only (Prepare list; nothing sent anywhere).
  Check-ins `SELF_REPORT` / PERSONAL with what tried / what happened / what next; editable and
  deletable; `mode` in the body is rejected; never enters the evidence normalizer (T45).
- P7.6 history and growth (`HistoryList.jsx`, `GrowthPage.jsx`, `growth/service.js`): History
  groups Formal / Practice / Private preparation / Your own note (self-reported); private items
  carry "Personal ? Private to you" and "Finished" / "Self-reported", never "Personal
  assessment" / "Completed". Growth shows Formal history (one dated snapshot per published
  result with form version, retired marker and comparability reason), Practice history and
  Application reflections; no arrows, deltas or trends. `choosePair` withdraws eligibility for a
  retired form or a report under correction even on an approved pair (`growthEligibility.test.js`).
- P7.7 privacy: every route `NOT_FOUND` outside PERSONAL; hooks keyed `['ws', id, ?]` are dropped
  on workspace switch and the whole cache on sign-out; campus page explains scope and makes no
  call; static scan proves no analytics/report/evidence/growth/campus/sharing module names a
  preparation table.
- Schema: `0052_preparation_hardening(.down).sql` ? `preparation_attempts.title /
  observations_json / application_json`, `AI_ASSISTANT` actor, `application_checkins.next_step /
  updated_at`. Additive, reversible; still no FK to a formal table.
- Verification: see TEST_RESULTS.md "P7 remaining gaps closed" (server 842/0, unit 513/0, build,
  static, database 6/6 @52, `p7` browser journey 1/0 with 18 screenshots inspected; four real
  defects fixed).
- Next: P8 (admin/support workflows) per the sequence; carry the P7 human gates above as
  activation blockers.

## P6 remaining gaps closed - 2026-10-03

State: P6 code-safe work IMPLEMENTED and INTEGRATION_VERIFIED (Layer B: real `/api/v1` router per
mission M01–M10 with the deterministic provider; real browser journey on the 4174 audit server with
throwaway PostgreSQL). Human gates stay BLOCKED: content / measurement / accessibility review and
publication of M01–M10 (all `DRAFT`, `review_record.approval = NOT_APPROVED`), live-model (Layer C)
meaning wording. Source ids: CH-30, CH-31, CH-32, CH-33; T39–T42, T55 (slice), T57.

- P6.2 reviewer package (`missionSchema.js`, `missionLibrary.p6.js`): every mission now carries
  `situation_facts`, `learner_actions`, `clarifications`, `examples` (≥ 1 EXAMPLE and ≥ 1
  COUNTEREXAMPLE, each bound to criterion ids), `first_attempt_feedback` (completed / next-change
  priority), `transfer` (unfamiliar-setting version: new setting, objective, facts, optional
  artifact starting state, fact-bound `rule_overrides` and `meaning_overrides`; same behaviour and
  criterion ids), `accessibility_note`, `confounds`, `review_record` (DRAFT-only, never an
  approval). `missionPackageGaps()` / `P6_PACKAGE_FIELDS` (17) report completeness; all ten are
  complete. `applyVariant(mission, 'BASE'|'TRANSFER')` is the single place a scene is swapped.
  DRAFT v1 content was revised in place (never seeded into a persistent store; disposable DBs
  reseed); `MIS-MKT-EXP-01` v1 and handover v1 are byte-identical.
- P6.3 M09 escalation: "I cannot assign X; escalating to Priya because …" is a defensible answer
  (`C-REALISTIC` / M10 `C-DEFER` phrasings and guidance), never forced assignment; a missing owner
  fails exactly `C-OWNERS` and is the next change.
- P6.4 evaluator and assistance (`feedback.js`, `evaluate.js` v3, `service.js`): copy detection
  (≥ 80 % of the word pairs of a shown example/hint sentence of ≥ 6 words reproduced in the
  criterion's artifacts → `COPIED_ASSISTANCE`, shown as "This matches the example you were shown,
  so it is not counted as your own", never quoted, never a practice unit, behaviour not
  demonstrated); exposure spans every attempt of the mission in the workspace. Provenance persisted
  in `assistance_json` (no new table): `hintsExposed[]`, `examplesExposed[]`, `coachedRevision`,
  `retryOrigin {kind FIRST|RETRY|REPLAY|CHALLENGE, previousAttemptId, reissued}`, `variant`,
  `copyCheck {sources, flagged}`, `feedbackVersion`, `evaluatorVersion`, `promptVersion`; exposed
  as `attempt.provenance`. New `POST /mission-attempts/:id/examples` (explicit request, also after
  feedback; 409 when uncoached; audited). Criterion views carry `reason`. Summary no longer says
  "Mission completed" when nothing was shown.
- P6.5 focus feedback: `result.focus = {completed {criterionId, description, quote, source},
  nextChange {criterionId, description, because, yourWords}, allMet, reviewIncomplete, note}` from
  the mission's first-attempt logic; all-met acknowledges without inventing a flaw; a failed review
  says the review failed. Reissue: a retry after `EVALUATION_UNAVAILABLE` charges no allowance unit
  even when exhausted. Retry dedupe: key `retry:<mission>:<previousAttemptId>` — same client key or
  two simultaneous retries yield one attempt; the chain tip is followed, not timestamps.
- P6.6 replay and comparison: `stimulusFor` uses only a PRESENTED opportunity's own stimulus (a
  never-presented later stage falls back to the mission briefing); `result.comparison =
  {previousAttemptId, newlyMet[], noLongerMet[], notCompared[], note}` on a retry, criterion ids
  only, UNCERTAIN excluded, no percentage.
- P6.7 fresh challenge: candidates are the transfer version of a practised mission (same behaviour
  ids, different setting) first, then an unmet mission of the capability; base/transfer exposure
  tags, replayed opportunity ids and attempted variants are excluded and recorded
  (`exposureTags`, `excludedExposure`); hints AND examples refused (409). Reachable from a
  completed guided attempt (`MissionNextSteps`) and from History (`item.practice`
  {capabilityId, assistanceMode, variant}; finished practice `permittedAction = VIEW` to
  `?attempt=`).
- P6.1 UI: catalogue cards state target behaviour / family, situation, "About N minutes, untimed",
  "Text, English", Reviewed / Draft availability and Open mission; "Choose a different goal"
  (family filter, `?goal=`); exact bounded allowance. Player: first view (focus, duration, mode,
  allowance, scene, What to do, What you know) with "What will be checked" folded; the attempt's
  own scene (transfer note when applicable); feedback = focus → comparison → folded "All checks";
  tips/examples drawer only on request (`Show examples`, after submission or during the attempt);
  copied text labelled "Matches an example". Catalogue cards and the scene use API data only.
- Verification: `missionsEndToEnd.test.js` (16), `practiceReplay.test.js` updated,
  `development.test.jsx` +4, `history.test.jsx` +1, `tests/e2e/p6-practice-journey.spec.js` +
  runner mode `p6`; results and the per-mission matrix in `TEST_RESULTS.md`. Five defects found
  and fixed during the run (listed there).
- Next unfinished task: human review packets for M01–M10 (CONTENT_REVIEW.md Appendix B), Layer C
  live-model wording check, firefox/webkit pass of the p6 spec; then P7 remaining gaps.

## P5 remaining gaps closed - 2026-10-03

State: P5 code-safe work IMPLEMENTED and INTEGRATION_VERIFIED (Layer B browser run of the real
report plus the fixture state matrix). Human gates stay BLOCKED: comprehension study (protocol
ready, not run), AT/zoom manual pass, content/measurement approvals, live-model wording.

- P5.4 capability detail (CH-26, CH-27): `GET /api/v1/me/capabilities/:id`
  (`readModels.capabilityDetail`) binds one capability to the latest formal snapshot that measured
  it: `latestSnapshot {sessionId, version, issuedAt, reason, priorVersion, completedAt,
  assessmentTitle, scope, formId, methodVersion, sufficiencyRulesVersion}`, this capability's
  moments / evidence / bounded observation from the STORED report version (the pure builder when no
  version exists yet), `nextBehavior`, `whyItMatters`, one read-time `recommendation`, open-review
  count and a plain `limitation`; `state` is one of DESCRIBED, BOUNDED_ONLY, INSUFFICIENT,
  UNDER_REVIEW, STRETCH, NOT_MEASURED. `CapabilityDetailPage` renders meaning → level with a
  separate evidence chip (`CapabilityEvidenceChip` reused from the map) → `MomentCard`s with
  attribution → next behaviour and why → `RecommendationCard` (reviewed mission / optional stretch /
  honest none) → scope, date, method, limitation → "Ask for a review" (dialog pre-scoped to the
  capability). Database vocabulary only under Details; one state when nothing is publishable.
- P5.6 recommendations outside findings (T39): `domain/development/recommendations.js`
  (`behaviourGaps`, `resolveRecommendations`, pure) + `development.recommendFor`; the report
  service attaches `recommendations[]` to the OWNER response at read time. Stored versions keep
  `recommendedMission: null`; a mission publication or an allowance change never changes a
  version or `evidence_set_hash` (tested). Eligible content: PUBLISHED missions whose
  `form_behaviour_ids` meet the gap's behaviour ids (from unit provenance), DRAFT only behind
  `PRISM_DRAFT_CONTENT` and labelled "Draft practice mission (test content)"; `MIS-MKT-EXP-01`
  has no form behaviours and is never recommended. Each item states availability, duration,
  label, allowance and whether starting consumes an activity.
- P5.7 reviewed correction (CH-29, T36): migration 0051 `report_review_decisions` (CHECKs,
  append-only trigger); `repos.reportReviews.{get,listOpen,addDecision,listDecisions,
  listWithheldEvidenceIds}` (memory + pg); `reports.listOpenReviews` / `reports.decideReview`;
  admin router `routes/admin/reportReviews.js` (`GET /api/admin/report-reviews`,
  `POST /:id/decide`, permission `reports:review` added to the catalogue and to product_admin /
  assessment_ops). CORRECT validates the withheld ids against the session's own units, publishes a
  NEW version through the existing publication path (reason `REVIEW_CORRECTION`, prior version
  set, `report.review.withheldEvidenceIds`), then records the decision; version 1 stays
  byte-identical; decide twice → 409. Withholding is a provenance flag in the review ledger — the
  evidence unit is never mutated; the builder and every directory-backed read model exclude the
  withheld ids. Owner response carries `review {openRequests, pending}`; the report page shows the
  pending chip and the corrected banner; `AdminReports` has a "Review requests" panel with the
  decide form.
- P5.8 audience hardening (T47/T48): `reportAudiences.test.js` proves SUMMARY sponsor/share
  projections carry no quotes, moments, recommendations or review state; nested owner endpoints
  and `/shared/:token/*` deny; staff cannot create a learner share; served dates are stored facts;
  legacy reader paths unchanged. No gap required a server change beyond keeping the new fields
  owner-only.
- P5.9 state matrix: `tests/e2e/p5-report-states.spec.js` + runner mode `p5` (all four projects);
  screenshots in `audit-results/ui/p5/`. Comprehension protocol script and recording sheet added
  to `RESEARCH_PROTOCOLS.md` §3a (no results).
- Defect fixed on the way (T35): `sessionDirectory` now treats a DONE evaluation run as a report
  (stored worker time / stored version issue time), so new-run completions reach home, history,
  capabilities and capability detail without a legacy report row.

## P4 remaining gaps closed - 2026-10-03

- P4.8 content review tooling: `domain/content/tooling.js` + `routes/admin/content.js`
  (`createFormsRouter`): version package, structured diff (facts / stages / world changes /
  opportunities / behaviours / anchors / board / director), synthetic preview (Director + fact
  boundary over a canned script, `is_synthetic`, no session, no evidence), opportunity coverage
  matrix, exemplar / counterexample / note attachments, comments, role-checked reviewer decisions
  (`REVIEWER_ROLES` CONTENT / MEASUREMENT / ACCESSIBILITY by existing admin permissions), and draft
  edits that always create a NEW version (zod `FormPackageSchema` + referential checks; existing
  versions immutable). `APPROVED_FOR_PILOT` now needs recorded APPROVE decisions from a CONTENT and
  a MEASUREMENT reviewer (distinct people) or the transition is 409. Migration 0050
  (`content_attachments`, `content_comments`, `content_review_decisions`, `content_form_drafts`),
  in-process store without a database. Every mutation audited. Admin UI: Forms tab on
  `/admin/content` (`AdminContentForms.jsx`) with versions, diff, coverage, preview, attachments,
  comments, decisions and transition buttons disabled unless permitted and gated.
  **No content was approved: CORE-TEAMREADY-A stays DRAFT.**
- T21: `/api/assessment/calibrate` answers `purpose: CALIBRATION` and the label "Difficulty
  calibration (not part of your assessment context)"; a Director-driven universal run refuses it
  (409 `CALIBRATION_NOT_APPLICABLE`); every session contract carries `purpose: FORMAL`. Legacy
  Briefing copy relabelled. Legacy calibration behaviour and tiers unchanged.
- T33: `sliceEvaluator` takes exactly one extra sample (N=2) for a rated unit with an ambiguity /
  contrary-evidence marker; ≥ 2 anchor levels apart or rated-vs-abstain → `HUMAN_REVIEW_REQUIRED`
  with reason `JUDGE_DISAGREEMENT`, the learner's verified words kept and no level (never an
  average). Audit event `assessment.judge_disagreement`; `onHumanReviewRequired` feeds the existing
  rating queue when `PRISM_V3_RATING_QUEUE` is on. Fault `PRISM_AUDIT_AI_FAULT=disagree`.
- P4.5 / P4.7: `coverageReport` (counts only) on the owner contract once input is closed and on the
  report (`coverage`, limitation notes "Review coverage: X of Y planned moments were presented.",
  "One moment was withheld for review." for REVIEW_REQUIRED render mismatches); processing view and
  Report V3 show the notes. Message responses of universal runs carry the task-only stage strip.
- Browser proof `tests/e2e/p4-six-stages.spec.js` (runner mode `p4`); defects fixed: stage strip
  not advancing, stale-contract rewind of a saved board edit (`artifactStore.load`).
- Results: TEST_RESULTS.md "P4 remaining gaps closed". No scoring, psychometrics, legacy
  stimulus / 35-minute timing, sufficiency floors, entitlement or authorization change. Open:
  content / measurement / accessibility approvals (human), Layer C live model, manual AT/zoom.

## P3 acceptance gaps closed - 2026-10-03

- Real-browser canonical journey `tests/e2e/p3-real-journey.spec.js` (runner mode `p3`, no route
  fixtures): dev entitlement → server-pinned DRAFT universal form → intro (Escape never begins) →
  Begin → message → keyboard board edit → reload (same deadline) → Finish → real `EVALUATE_RUN`
  worker → published Report V3, on all four browser projects; screenshots in `audit-results/ui/p3/`.
- P3.6: `ConversationPane` follows only near the latest message and offers "New reply — jump to
  latest" (polite live region); `PlanBoard.jsx` (PLAN_BOARD) with labelled owner/due/status/
  dependency/why controls from the contract's server-validated `schema`, "Provided" vs "Your edit".
- P3.5/T11: missing required material → recovery with retry/support; zero-artifact stays centred.
- P3.7: Briefing during ACTIVE states the clock keeps running, Escape/Close return focus to the
  toggle; intro without situation/role disables Begin and offers reload.
- P3.8: contract `timing.policyDurationMs`/`policyStatus`; 10/5/1 warnings only for longer policies;
  late drafts read-only and "not submitted". P3.9: text-only decision (DECISIONS.md), static
  no-hint/no-auto-send test. P3.3: Home `PREPARATION_IN_PROGRESS` and `PRACTICE_AVAILABLE`.
- Results: TEST_RESULTS.md "P3 acceptance gaps closed". No scoring, evidence, legacy stimulus/timing,
  entitlement or authorization change. Open: manual AT/zoom, T18 approved adjustments, T21 copy,
  Layer C.

## P2.9 Layer B gap closed - 2026-10-03

- Draft/universal runs (only with `PRISM_DRAFT_CONTENT=true`) no longer call the legacy engine to
  start, talk or save the board: `sessionService` creates the session through the legacy store
  (owner, pinned scenario, no model history; timing from `assessment_run_timing`), saves board
  changes there, and the handover segment answers only from pinned conditional facts
  (`answerSegmentQuestion`). Finish uses the `EVALUATE_RUN` job only; a DRAFT scenario without a
  readable pin fails closed. Legacy runs, stimulus, scoring and 35-minute timing are unchanged.
- Reachability: `draftPersonalDefinition()` pins an unstarted non-production `dev` entitlement to the
  DRAFT universal form server-side (flag on, never production, never paid/invite/coupon/dummy).
- `server/test/p2Slice.db.test.js` + runner mode `p2`: 14/14 on real PG (see TEST_RESULTS.md); no PG
  repository bug found. Layer C live-model run remains the open blocker.

## Current P9-P10 checkpoint - 2026-10-03

Status: **Code-safe programme COMPLETE locally. Release: NO-GO until human gates close.**

- P9.1/9.2: `domain/metrics/events.js` (21 canonical events + legacy aliases, strict allow-list),
  `definitions.js` METRIC_DEFINITIONS v1 (frozen; synthetic/DEV excluded), admin quality views
  `/quality/{operational,measurement,customer}` (aggregates only; 503 NO_DB). `alerts.js` 8 detectors.
- P9.3: `faultInjection.test.js` 12 real-router fault cases (timeout, malformed, ack loss, dup key,
  payload mismatch, If-Match conflict, race, lease reclaim + fencing, quote mismatch → review,
  publication race, ownership/share 404, erasure mid-job, sparse early-ended honest report).
- P9.5/9.6: `scripts/live-model-smoke.mjs` (manifest; BLOCKED without authorization — no transcript),
  `scripts/load-pilot.mjs` (refuses without target + --synthetic; planning targets, not SLA).
- P9.7/9.8: `RESEARCH_PROTOCOLS.md`, `VALIDATION_PLAN.md`, `METRICS.md` — prepared, NOT executed.
- P10.2: `domain/release/config.js` RELEASE_CONFIG v1 per stage; `readiness()` never collapses
  UNVERIFIED into READY; `assertAllocatable()` runs before any credit reserve for new universal runs
  (`RUN_NOT_ALLOCATABLE` 503); legacy start unchanged. Diagnostic `--stage` shows `allocatable:false`
  locally with named blockers and no secrets.
- P10.3: `scripts/rehearse-migrations.mjs` on a disposable cluster: up 49 → down 0049..0040 → up,
  schema identical, every ≥0040 migration has `.down.sql` (static test).
- P10.5: `rollback.js` (stop allocations → pin/drain V3 → keep readers/shares; `canDisable` false
  with active runs); `RUN_VERSION_UNSUPPORTED` instead of legacy fallback; stale fenced/late/erased
  writes rejected (tests).
- P10.6: `route-usage-inventory.mjs` (LEGACY_CREATION 8 / LEGACY_READER 7 / V3 25; deletions 0);
  `legacyReadersRetained.test.js`. No pages or readers removed.
- P10.7/10.8/10.9: `MANUAL_JOURNEYS.md`, `SUPPORT_RUNBOOK.md`; `goNoGo.js` → NO_GO while any HA-C
  item is OPEN (tested). ROLLOUT appendix lists stage order and drain-window criteria.

Verification: server 808 (783/0/25 DB skips); frontend 35 files 474/0; static + flag checks PASS;
isolated PG 6/6 (49 migrations); browser-p1 124/0; full browser-all in progress at commit time.

### What remains (human / external)
HA-C001 flags, HA-C002 thresholds/labels, HA-C003 content approval (CORE_TEAMREADY_A, M01-M10 are DRAFT),
HA-C004 form equivalence, HA-C005 counsel copy, HA-C006 pricing (₹499 is a test hypothesis;
professional pack has no quota), HA-C008 validation studies, HA-C012 security review, HA-C013 manual
accessibility; live-model Layer C run; production migration/backfill operations; retention/backup policy.

## P8 gap-closing pass - 2026-10-03

Status: **IMPLEMENTED + FIXTURE_TESTED + INTEGRATION_VERIFIED (isolated PG, real browser, provider TEST
mode).** Pricing, tax, recovery policy, content approval, professional-pack allowance, live payment
activation and research use remain HUMAN_APPROVED gates (ROLLOUT.md, P8 table). Builds on c2a38dd.

- P8.1: Hero "Understand how you work. / Practise what matters next."; sample card labelled
  "Illustration, not a real result" with no number; FAQ rewritten (no 0-100 score, Prism Score, Hire
  marketplace, employer filtering), items `type=button` + `aria-controls` + focus ring + reduced
  motion; Pricing reads `/api/payment/config` and shows the server's "Not yet purchasable: ..." line
  and a privacy line; `publicSite.test.jsx` +2 (FAQ keyboard/claims, server-blocked row).
- P8.2: migration 0053 (`display_name`, `research_permission`, `research_permission_at`); route schema
  + `support` disclosure (TEXT supported, SPEECH not yet available, English only; CV/grades/employer/
  photograph/college not required and refused as fields); IntentStep shows the disclosure, an optional
  display-only name and a SEPARATE research checkbox (null until touched). Static test: no scoring/
  evaluation/report/preparation/AI module imports the preferences plane.
- P8.3: guessed attempt id / wrong signature -> 404; `previewMetrics()` (memory + PG) counts real rows
  only and reports `syntheticExcluded` (T59); TryPage package panel shows the exact allowance and the
  server status; 390 polish (header label, Due column).
- P8.4/P8.6: `offerAvailability` / `liveOfferView` gate `purchasable` on `PRISM_OFFER_PRICE_APPROVED`,
  >= 4 reviewed missions (latest per `mission_id`) and an approved universal form; named blockers in
  config, offer table, checkout; `create-order` -> 409 `OFFER_NOT_PURCHASABLE`; `taxLabel` "Tax: as
  configured by finance - not yet approved" when unset; `testMode: true`; checkout shows price status,
  blockers, "Not yet purchasable" (disabled) and an "unpaid test session (not a purchase)" path when the
  server allows one. Razorpay keys read lazily (behaviour unchanged when set).
- P8.5: `ledger.reserve` honours the repository replay flag under a race (real bug: concurrent Begin
  could double-reserve). `server/test/commerceGaps.test.js` 14/14: forged verify -> 400 + no grant;
  abandoned checkout; signed verify -> one grant; verify retry -> same grant; webhook-before-verify;
  webhook-only x2; expiry during run finalizes, new start blocked; repeated finish no double consume;
  T57 grandfathering snapshot (legacy `v1_payments` record + Campus contract row byte-identical);
  finance records outside the erasure cascade.
- P8.7: assignments record `participation` (COMPULSORY/VOLUNTARY/UNKNOWN) and `incentive` in
  `reminder_policy` JSONB via `POST /organizations/:id/assignments`; sponsor -> 404 on preparation/
  practice/previews/grants/export paths (test).
- P8.8: `softBudget.js` (UNCONFIGURED/UNKNOWN_SPEND/OK/ALERT/NEW_STARTS_LIMITED; never interrupts an
  active paid run); formulas unchanged and documented in METRICS.md.
- P8.9: events `recommendation_viewed/followed`, `practice_started/completed/retried` (aliased to P9
  canonical names); props `purchaseKind`, `accountClass`, `workspaceClass`, `mode`, `version`;
  serializer test rejects transcript/preparation text/names/institution ids/JWT/payment secrets.
- Browser: `tests/e2e/p8-commercial-journey.spec.js`, runner mode `p8`, screenshots
  `audit-results/ui/p8/01..08-{1440,390}.png` (16, inspected; defects fixed: hero thread layout,
  FAQ hover contrast, Try 390 wrapping, mission count "0 of 4").
- Tests touched: `campusStudent.test.js` (preferences shape), `preview.test.js` (404 for guessed ids),
  `experienceBaseline.db.test.js` (52 -> 53 migrations), `preview.test.jsx` (tax label, blockers, dev
  path), `studentPages.test.jsx` (+1 P8.2). No copy-ceiling test was weakened.

Verification: server 882 (856/0/26 skips); frontend 38 files 516/0; isolated PG 6/6 (53 migrations);
`p8` browser 1/1; build + audit:static PASS. Details: TEST_RESULTS.md (P8 section, newest-first).
## Current P8 checkpoint - 2026-10-03

Status: **IMPLEMENTED locally; pricing/tax/policy/live payment remain external gates.**

- CH-42 / T53-T55: `domain/commerce/*` PRODUCTS frozen (FREE_FIRST_EXPERIENCE; PERSONAL_DEVELOPMENT_SPRINT
  reusing existing PRICE_PAISE 49900 as TEST_HYPOTHESIS_PENDING_APPROVAL; PROFESSIONAL_PREPARATION_PACK
  UNAVAILABLE_PENDING_OWNER_QUOTA). Migration 0048 `product_grants`; grant idempotent on
  provider_event_key/purchase_ref; `POST /api/payment/webhook` HMAC-verified, replay → one grant;
  `PACKAGE_EXPIRED`/`ALLOWANCE_EXHAUSTED` gate new activity only (report reads untouched, asserted);
  `releaseForTechnicalFailure` audited, policy PROPOSED (no refund issued). Existing ₹499 entitlement
  semantics unchanged; `assertNewActivity` deliberately not enforced on the legacy start path.
- CH-43 / T59: `/try` free first experience (briefing + one prompt, deterministic quoted observation,
  one retry, HMAC scoped claim token 1h hashed at rest, `preview_attempts` 0049 with is_synthetic;
  no formal map, no credential). Landing: "Try a short situation" / "See how Prism works"; offer table
  shows allowance, window, limits, provisional results, policy "proposed, pending approval"; one ₹499.
- P8.2: skippable IntentStep (segment/intention/response mode; display-only preferences).
- P8.6: checkout reads server offer config (tax treatment null → "to be confirmed"; purchase disabled
  when not purchasable). No tax rate in frontend.
- CH-37 / T07/T43/T47: Campus can assign only content ≥ APPROVED_FOR_PILOT (409 CONTENT_NOT_APPROVED
  for DRAFT); sponsor isolation from preparation/practice/self-report tested (table scan + 404).
- T58: cost tags {mode, runIdHash, methodVersion, productCode}; `unitEconomics.contribution`;
  telemetry allow-lists extended with pseudonymous ids only.

Verification: server 754 (729/0/25 skips); frontend 35 files 474/0; isolated PG 6/6 (49 migrations).

## Current P6-P7 checkpoint - 2026-10-03

Status: **IMPLEMENTED locally (DRAFT content, flag-gated); P8 in progress.**

- CH-30 / P6.1: ten original DRAFT missions, two per family (`missionLibrary.p6.js`), exposure
  tags = real form opportunity ids; behind `PRISM_DRAFT_CONTENT`; never recommended by default.
- CH-31 / T40: MEANING criterion type (paraphrase accepted, keyword stuffing alone not;
  EMPTY_WORK for empty input without a model call); pipeline v2 with quote verification.
- CH-32 / T41: replay copies only the presented stimulus text (ledger) into a new PRACTICE
  attempt; formal report hash unchanged (tested).
- CH-33 / T42: fresh challenge selects an unexposed mission; `assistance.mode: UNCOACHED`,
  hints refused 409; exposure metadata recorded.
- Allowance: migration 0046 `practice_allowances` (no row = unlimited in non-production);
  `ALLOWANCE_EXHAUSTED` blocks only new activity. No pricing here.
- CH-34 / T43-T44: `domain/preparation/*` + migration 0047 (PERSONAL + PREPARATION CHECKs,
  no FK to formal tables); sanitization (emails/phones/URLs) with explicit confirm step;
  bounded AI participant with no tools; zod-validated action card, failure → `card: null`
  with explicit error (nothing fabricated). Flag `PRISM_PREPARATION_V1` default OFF;
  Campus workspaces get NOT_FOUND; static scan proves analytics/reports/evidence never
  read preparation tables. Nav "Prepare" enabled only with the flag.
- CH-35 / T45: `application_checkins` mode SELF_REPORT; shown as "Your own notes" on Growth
  and in History as a separate type; cannot change any capability.
- CH-36 / T46: Growth separates Practice history / Self-reported notes / formal comparison
  (existing comparable-form gate unchanged, no deltas).

Verification: server 730 (705/0/25 skips); frontend 34 files 463/0; isolated PG 6/6 (47 migrations).

## Current P5 checkpoint - 2026-10-03

Status: **IMPLEMENTED locally; comprehension study (P5/P9 human) open.**

- CH-23 / P5.1: publication snapshot before reportReady (P2) + `GET /report/versions`;
  review requests (migration 0045 `report_review_requests`, `POST /report/review-request`,
  owner-only, OPEN row, audited, no silent rewrite). Builder v3.1.
- CH-24 / P5.2-P5.3 / T37-T38: `CapabilityMap` — five labelled rows, four-band ordinal track
  from server bands only, separate evidence-state chip, neutral "Not yet measured" (never
  red/zero/percent), keyboard rows filter evidence, list equivalent for SR/mobile. Plain
  display labels (Making decisions, Getting your point across, Working with people,
  Responding to change, Making things happen) alongside precise ids.
- CH-25 / CH-26 / T32: `moments` (≤3) only from verified-quote units; action → context
  (presented stimulus via the 0044 ledger or exchange N) → quote → what it showed → next
  behaviour → "Practise this"; `plainStatement` null when nothing is supported.
- CH-27/CH-28: one absence state per capability; stored issue dates only.
- CH-29: interpretation review dialog → request row; outcome never fabricated.
- SUMMARY disclosure strips quotes/moments. PDF built from statement + moments + structured data.

Verification: server 712 (687/0/25 skips); frontend 449/0; isolated PG 6/6 (45 migrations);
browser-p1 (isolated, 4 projects) 124/0 incl. legacy report, account entry, flow entry.

## Current P4 checkpoint - 2026-10-03

Status: **IMPLEMENTED locally (DRAFT content, not approved); P5 next.**

- CH-15 / P4.1-P4.2: `universalForm.js` CORE_TEAMREADY_A v0.1.0-draft — original domain-light
  "Get the team ready": 6 stages, 6 public + 3 conditional facts with ids, two colleagues,
  stage-3 world change preserving the board, AI-generated recommendation explicitly labelled.
- CH-16 / P4.4: 20 draft behaviour ids across 5 families with L1-5 anchors; 10 exemplars/
  counterexamples incl. concise effective, verbose empty, spoken, non-native, refusal, uncertain,
  repaired mistake, workable alternative; confound list. Proposed authoring, not validated scores.
- CH-17 / P4.5 / T22-T23: migration 0044 `assessment_opportunities` ledger (PLANNED→PRESENTED→
  ACTION_RECEIVED→EVALUATION_PENDING→EVALUATED + side states); 16 opportunities, ≥2 distinct
  groups per family; dependent board-change+explanation share a group → one independent count;
  unanswered/unpresented opportunities never produce units.
- CH-18 / P4.6: deterministic `director.js` (policy 1-5, seeded tie-break, budget stop with
  partial/review reasons); stage strip exposes task names only (contract `stages`, UI strip).
- CH-19 / P4.3: board schema task/owner/due/dependency/status/rationale; seeded rows TEMPLATE;
  `validateBoardPatch` never fills answers.
- T34 / P4.7: `factBoundary.js` — authored stimulus from permitted facts, render hash,
  REVIEW_REQUIRED on mismatch, unknown fact stays unknown, already-given → neutral pointer,
  forbidden mutations (deadline/identity/scope/payment/threshold/fact/version) rejected; tool deny-list.
- CH-21 / P4.8: evaluator consumes the ledger (only targeted behaviours per answered opportunity);
  content governance `domain/content/versions.js` DRAFT→REVIEW→APPROVED_FOR_PILOT→
  APPROVED_FOR_INTENDED_USE→RETIRED with reviewer+reason guard; admin routes under
  `/content/forms` (audited). Form stays DRAFT; activation is HA-C003/HA-C002 human gate.
- Sufficiency floors unchanged. Legacy engine/scenario bank/scoring/timing untouched.

Verification: server 708 (683/0/25 skips); isolated PG 6/6 with 44 migrations; player 34/34.

## Current P3 checkpoint - 2026-10-03

Status: **IMPLEMENTED locally; full browser matrix pending; P4 content/Director next.**

- CH-13 / T14-T16 / P3.7-P3.8: migration 0043 `assessment_run_timing`; `timingPolicy.js`
  (LEGACY_35 preserved byte-for-byte for existing/legacy runs; DRAFT_UNIVERSAL 25+5 min
  `PROPOSED_PENDING_REVIEW` applied only to draft-segment runs). `POST /begin` is
  idempotent (same key → same timestamps; concurrent begins → one start time; version
  mismatch → CONFLICT). Draft runs reject answers before begin (`ASSESSMENT_NOT_BEGUN`)
  and after server cutoff (`SESSION_TIME_LIMIT`); finish allowed anytime for accepted work.
  Contract exposes `timing.begun/graceDeadlineAt/policyVersion`, status `ALLOCATED` pre-begin.
  Frontend `ScenarioIntroDialog`: pinned title/situation/role/participants/materials/time;
  focus on "Begin timed assessment"; Escape/X/backdrop = "Not yet" (never begins);
  one idempotency key per mount; clock appears only after server begin.
- CH-05 / P3.3: Home = one dominant NextActionCard (resume / processing / technical
  failure → recovery not purchase / report ready / new learner IntentChooser);
  RecentActivityList from `/me/history` (stored dates, Formal/Practice labels).
  Server `home()` adds ASSESSMENT_PROCESSING / ASSESSMENT_TECHNICAL_FAILED kinds.
- P3.2 nav: Home, Assessments, My Prism, Practice, Prepare (honest disabled), History;
  Evidence/Growth as section links under My Prism; aliases kept; Campus staff nav unchanged.
- CH-11/CH-12 / T10-T13: fixed frame, independent panes, conversation-only centring
  and processing/failure states carried from P0/P1 fixes; now shown with real
  `processing` state copy ("work saved, review continuing").
- CH-48 / CH-49: no persona picker or proctoring added to the V3 path; legacy funnel untouched.
- Open: real dialogue renderer for the draft segment (P4), speech review path (P3.9
  deferred — text path only in V3), T22/T23 coverage (P4), full seven-width browser
  matrix for the new intro dialog (recorded when the isolated runner completes).

Verification: server 684 (659/0/25 skips); frontend 446/0; build PASS. Browser: see TEST_RESULTS.

## Current P2 checkpoint - 2026-10-03

Status: **IMPLEMENTED locally (Layer A + B); live-model (Layer C) and content approval open.**

- CH-20 / T25-T26: accepted actions persisted before engine (P1), re-verified on real PG.
- CH-21 / T24/T27/T28/T29/T30: `server/domain/evidence/sliceEvaluator.js` turns
  APPLIED CANDIDATE actions (never SYSTEM/AI/TEMPLATE) into strict units via the
  existing normalizer with action/opportunity/rubric/method provenance. Exact-quote
  check: mismatch → HUMAN_REVIEW_REQUIRED (QUOTE_MISMATCH), sparse → INSUFFICIENT
  with reason, level 2 → a real developing observation. Sufficiency floors untouched.
- CH-22 / T31: `assessment_jobs` EVALUATE_RUN with lease/fencing; draft runs no
  longer call legacy scoring; failure → job FAILED, `processing.state` exposed,
  finish retry re-queues; player shows "work saved, review continuing" and a
  technical-failure state distinct from insufficient evidence.
- CH-23 / T36: migration 0041 adds evidence_set_hash/issued_at/reason/prior_version;
  report GET serves the stored version unchanged while the hash matches;
  `REPORT_PROCESSING_FAILED` surfaces as a technical state in the report page.
  Quote verification now uses candidate turns from history ∪ accepted actions,
  so it survives the PG history purge (P0 T32 dependency closed for new runs).
- P2.7 UI: `boundedObservations` — one verified moment (quote, observed behaviour,
  next behaviour, limitation, "Practise this moment" link) when a capability is
  below floor; never a level.
- P2.8 / CH-04 / T41: DRAFT mission `MIS-CORE-HANDOVER-01` (flag `PRISM_DRAFT_CONTENT`),
  migration 0042 `mission_attempts.origin_json`; attempts carry GOAL|ASSESSMENT_MOMENT
  origin (ids only); retry = new attempt; practice evidence only; formal report
  hash unchanged (tested). History links practice ↔ formal as separate record types.
- P2.1: `DRAFT_CORE_TEAMREADY_A_HANDOVER` versioned snapshot + run pin; exposed in the
  bank only behind `PRISM_DRAFT_CONTENT`. Legacy stimulus/engine untouched; the real
  dialogue renderer for the draft segment is P3/P4 (currently exercised via the
  deterministic test provider and fake engine path).

Verification: server 676 (651 pass / 0 fail / 25 DB skips); frontend 33 files pass;
isolated PG 6/6 (42 migrations); see TEST_RESULTS. Browser: P1 legacy spec selectors
being corrected; full four-project run to be recorded.

## Current P1 checkpoint - 2026-10-02

Status: **IN_PROGRESS - foundation implemented locally; external gates still open.**
The P1 execution block starts after P0 `ff6002c`. Per user direction the protected
foundation is implemented locally (additive, reversible, disposable data), while
production execution, backfill and the review gates stay with their human owners.

- CH-06 / T01-T04: account creation without an explicit purchase next now opens
  `/app`; explicit checkout/invitations/deep links remain compatible. Approved
  path validation rejects external/malformed/unsupported next values with a
  recoverable notice. Legacy guarded actions preserve their path/query/fragment.
- CH-02/04/07 / T07-T08: old account/workspace requests are cancelled; late 401
  and profile replies cannot overwrite/sign out another account. Account changes
  clear known candidate browser drafts/pending text/preferences/workspace and
  reset mounted input state; a legacy continuation page is not remounted under
  the new account. Same-owner token refresh retains drafts. Server authorization unchanged.
- CH-07 / P1.2: `GET /api/v1/me/history` projects formal sessions, legacy reports
  and practice attempts into labelled groups (stored dates only); Assessments
  page gains a History section with honest states (see history agent evidence).
- CH-07/38 / T05/T47: real disposable PostgreSQL/HTTP/scorer path opens the
  issued V2 reader, denies another owner and anonymous caller, and proves the
  stored original blob unchanged after reads.
- CH-03 / P1.4: legacy ScoreReport keeps stored text/scores/method/dates and
  removes generated narratives, demo identifiers and view-date issuance/expiry.
- CH-40 / T25-T26 / P1.5-P1.6: migration `0040_candidate_actions_jobs` adds
  immutable-payload candidate actions, leased/fenced jobs and erasure markers.
  `sendMessage`/`saveArtifact` persist the accepted action BEFORE the engine;
  same key + same payload replays, same key + different payload is CONFLICT;
  erased sessions fail closed. Real PG: 3 durable APPLIED actions, payload
  immutability enforced. Legacy `/evaluate` Maps remain (job registry prepared,
  not yet wired to legacy scoring - no scoring behaviour change in P1).
- CH-39 / T52 / P1.7: `server/lib/campusErasure.js` cascades V3 tables
  (receipts, artifact versions, strict evidence, report versions, actions, jobs,
  scopes, share resources, rating items) and writes an erasure marker; wired into
  `DELETE /data`, `/candidate-data` and `privacyPlanner.executeErasure`. Real PG:
  zero rows remain, late write rejected 404. Backup-expiry and finance retention
  remain policy questions for the designated reviewer.
- CH-08 / T06 / P1.3: `scripts/reconcile-ownership.mjs` dry run by default; applies
  only proven fills (all stored owner refs agree, account exists, null gaps),
  idempotent and audited in `assessment_ownership_reconciliation`. CONFLICTING/
  UNCLAIMED are never auto-resolved. Production execution is operator-gated.

Verification: see [TEST_RESULTS](TEST_RESULTS.md) P1 section. Full P1 acceptance
of T48-T50/T57 and the legacy scoring job cutover remain open for P2+.

Date: 2026-10-02. Scope: **approved P0 diagnostic-only documentation**.
**Programme release: NO-GO. P0 code-safe diagnostic baseline: COMPLETE.**
Parent phase-close authority and limits: [FINAL_REPORT](FINAL_REPORT.md).
This ledger is complete as a source mapping, not as an implementation or acceptance
claim. No application, schema, content, flag, customer record or entitlement was
changed by this documentation work. No commit, deployment or live-model call was made.

## Authority, boundaries and evidence

- Source requirements: `..\..\..\.github\prompts\document.md`, sections 5, 31,
  32, 34 and 39. Source phase assignments:
  `..\..\..\.github\prompts\plan.prompt.md`, each phase's CH/T tables.
- Execution authority: approved session `plan.md` for session
  `02dcb662-6d57-42a7-b583-59b4a7c1e3d1`. Its diagnostic-only P0 limit
  overrides automatic progression and runtime-repair instructions in the attachment.
  Stop before P1. Missing HTML companion and reference screens were **not inspected**.
- Source snapshot `609f748277d4462e4c113c9c2e5b66fe05e016bb` is historical.
  Read-only checkout inspection observed branch `ui/prism-brand-transformation`,
  HEAD `f40bd1c`. The dirty entry/history/routing, persistence, package-lock and
  session-lock work is pre-existing, not attributed to this ledger.
  The deleted repository instruction file, untracked brand pack/zip and `data\`
  are preserved. The parent owns the immutable dirty snapshot and final diff.
- [UI A-M state](..\ui\UI_PROGRAM_STATE.md) is a different programme. Its COMPLETE
  markers and earlier repair test counts do not close experience P0-P10.
  [Flow repair map](..\ui\FLOW_REPAIR_MAP.md) and
  [flow readiness](..\ui\FLOW_REPAIR_READINESS.md) retain the end-to-end NO-GO.
- Fresh parent evidence has been read in [BASELINE](BASELINE.md) and
  [TEST_RESULTS](TEST_RESULTS.md). The checkpoint below and affected rows now
  distinguish executed diagnostics from unexecuted full source acceptance.
  [ROLLOUT](ROLLOUT.md), [CONTENT_REVIEW](CONTENT_REVIEW.md) and
  [FINAL_REPORT](FINAL_REPORT.md) remain parent-owned handoff records.
  The final browser runner completed; FINAL_REPORT closes diagnostic-only P0.
  Product/science/production gates remain FAIL/OPEN, not satisfied by that closure.

### Reading the ledger

There are exactly **52 CH rows and 60 T rows**, one row per source ID. Source
wording and K/U/A/R/D distinctions are retained. `K/U` and `A/U` are composite
source decisions, not normalization errors. Retirement means retirement from
**new creation**, never deletion of old reports, active runs or bought rights.

**Primary phase** is the earliest explicit assignment in the source prompt's
CH/T tables. **All source phases** preserves every repeated assignment, including
P9/P10 final verification. Thus T01/T04/T05/T25/T31/T59 have primary P0 **baseline**
work; P0 cannot close their subsequent repair/acceptance obligations.
The session plan also requests supplemental P0 baselines for later-phase tests;
those are identified below without changing their source phase.

Roles are accountable functions, not invented staff appointments:

| Role | Accountability | Named owner |
| --- | --- | --- |
| ENG | Engineering lead: architecture, compatibility, diagnostic safety | Awaiting named owner |
| FE | Frontend engineer: route/player/report implementation | Awaiting named owner |
| BE | Backend/AI engineer: durable actions, evidence, API/job contracts | Awaiting named owner |
| UX | Product designer/UX lead: comprehension and interaction quality | Awaiting named owner |
| QA | QA engineer: reproducible tests and environment-labelled evidence | Awaiting named owner |
| CONTENT | Learning/assessment specialist: content provenance and review intake | Awaiting named owner |
| MEASURE | External psychometrician/I-O specialist: interpretation and equivalence | Awaiting named owner |
| SECURITY | Designated security reviewer: authorization and independent assessment | Awaiting named owner |
| PRIVACY | Counsel/DPO: retention, consent and scope | Awaiting named owner |
| OPS | Authorized operator/support: production diagnostics, recovery and rollout | Awaiting named owner |
| PRODUCT | Product/commercial owner | Paul Jeevanesan A.; finance sign-off remains unassigned |

Code status is separate from external approval:

- `EXISTING/UNVERIFIED`: a relevant path exists; complete source behavior is not proved.
- `HISTORICAL/PARTIAL`: a prior repair record reports a bounded implementation;
  fresh evidence is recorded separately where supplied; remaining obligations stay open.
- `FIXTURE/PARTIAL` / `INTEGRATION/PARTIAL`: fresh A/B evidence supports only
  the stated slice, not the complete source assertion or later-phase acceptance.
- `FAIL/OPEN`: a specified product invariant failed in a fresh diagnostic;
  passing diagnostic assertions do not turn that product failure into a pass.
- `GAP/OPEN`: an inherited trace identifies an unresolved dependency; no repair here.
- `MAPPED/FUTURE`: later-phase requirement, inventoried only; not implemented here.
- `RETIREMENT/MAPPED`: compatibility retirement direction only, no deletion here.
- `DEFERRED`: deliberate source exclusion; not a completed implementation.
- `P0/DIAGNOSTIC_VERIFIED`: diagnostic code and scoped safety checks exist and
  passed; diagnostic-only P0 closure is documented by the parent, while
  production readiness and complete source acceptance remain separate and open.

Evidence codes:

| Code | Meaning and limit |
| --- | --- |
| S | Fresh read-only **path inventory/source mapping only**; not a test or runtime outcome |
| N | Exact proposed path absent at this ledger's inventory; absence of a filename does not prove absence of all equivalent functionality |
| H-entry | Historical 2026-10-02 entry/recovery checkpoint in FLOW_REPAIR_MAP and FLOW_REPAIR_READINESS; counts not rerun |
| H-player | Historical V3 presentation/clock/repeated-absence checkpoint in the same documents; fixture/layout checks do not prove the pipeline |
| H-runtime | Historical contract/lineage findings in those repair records and the approved session plan; parent must reproduce or explicitly block |
| NR | Remaining complete source acceptance **NOT RUN/unverified**; partial parent results may be recorded alongside it, never promoted to full acceptance |
| F-A | Fresh parent deterministic results in TEST_RESULTS; exact executed selector/counts and fixture limits apply |
| F-B | Fresh parent 3-test isolated PostgreSQL/actual HTTP/scorer run; 39 migrations, external model stub only, no seeded report/evidence; observed product FAILs preserved |
| F-browser | Initial 92 assertions passed but wrapper exited 1 on EBUSY cleanup; final scoped four-browser rerun: 91 passed + 1 flaky (total 92), 0 final failures, runner exit 0 and bounded cleanup completed |
| P0-close | Parent FINAL_REPORT closes code-safe diagnostic-only P0; no product repair, later-phase acceptance, human approval or production readiness implied |

NR marks remaining full acceptance, not absence of all testing. Historical counts
in earlier repair documents remain historical; fresh parent execution is F-A/F-B
or F-browser below. No application suite was rerun by this document owner.
Structural ledger validation is not an application test. Exact commands, counts,
environment, fixture boundary and failures remain authoritative in TEST_RESULTS.

### Fresh parent P0 checkpoint - synchronized 2026-10-02

| Check | Supplied evidence | Limit / disposition |
| --- | --- | --- |
| Read-only diagnostic | I30 implemented; final V22 selector 9 pass, 0 fail, 0 skip; B write attempt rejected with SQLSTATE 25006 and unchanged record count | Narrow aggregate projection; no app initialization, mutation or owner transfer. Conflict/unclaimed fixtures are diagnostic evidence, not approved claiming. |
| Normal HTTP/scorer run | V23: 3 pass, 0 fail, 0 skip; new isolated PostgreSQL cluster, all 39 actual migrations, real HTTP/store/report boundary, external model stub only | No report/evidence preseeded. Successful normal completion does not supply judged dialogue evidence or failure-window recovery. |
| Frontend/server | Frontend 360 pass, 0 fail; server 649 total, 624 pass, 0 fail, 25 skip | Skipped DB suites remain unverified; separate 3-test B invocation does not close them. |
| Build/static/flags | Build, static audit and explicitly dark test-process flag consistency PASS | Configuration-only evidence, not effective production flags or release approval. |
| Browser | Initial 92 assertions passed across four projects; runner exited 1 on EBUSY cleanup. Final cleanup-fix rerun: **91 passed + 1 flaky = total 92**, 0 final failures, runner exit 0 | Firefox materials at 360 initially failed in sign-in setup (`page.goto` load timeout); unchanged automatic retry passed. Bounded cleanup fix validated; not 92 clean passes. |
| Failed product invariants | T25/T26 A fault injection: 2 engine effects / 1 receipt; T27 B: zero judged strict dialogue units; T32 B: history purged from the source V3 reads; T36 B: report GET appends a version | **FAIL/OPEN** for the measured failure boundary, even though diagnostic tests pass. No runtime repairs here. |
| Partial B evidence | T05/T47 owned completed synthetic run visible and second owner denied; T59 actual dev timeline row marked synthetic | Not an old customer's report/full audience matrix; full conversion/research exclusion manifest unknown. |
| C / human gates | No live model, production/customer access, participant contact or new approval | NOT AUTHORIZED / NOT RUN; all later-phase acceptance remains OPEN. |

T32 is a reproduced dependency failure, not evidence that every source copy is
erased: separate telemetry retention is not the V3 builder's source access.
T36's observed append-on-GET fails the read/publication boundary; complete
same-version-content and correction acceptance remains unverified. T25/T26's
fault reproduction is **Layer A**, not a process-crash or multi-instance B test.

### Verification layers and test references

- **A**: deterministic unit/component/API-fixture contracts. Intercepted browser
  responses and seeded reports are A, never proof of a working writer.
- **B**: disposable PostgreSQL, actual HTTP/persistence/evidence/report boundaries;
  stub only the external model provider. No preseeded completed evidence/report.
  Missing writer/worker or failed invariant must remain FAIL/BLOCKED, not a pass.
- **C**: authorized live-model staging and relevant real-session evidence;
  **not authorized/not run in P0**. Operator budget/access and consent are required.
- **Human gates** (content, science, counsel, manual accessibility, finance) are
  separate approvals; neither A/B/C software results nor a drafted ADR replace them.

The verification column specifies **required future evidence**, not current results.
V codes name existing candidate suites; coverage of the entire source assertion
must be confirmed by the parent, not inferred from the filename.

| Ref | Existing verification path(s), repository-relative |
| --- | --- |
| V01 | `src\pages\publicSite.test.jsx`; `src\app\AppRouter.test.jsx`; `src\app\guards\guards.test.jsx`; `tests\e2e\flow-entry.spec.js` |
| V02 | `src\features\student\studentPages.test.jsx`; `server\test\campusStudent.test.js`; `server\test\campusStudent.db.test.js` |
| V03 | `server\test\studentFlowFlags.test.js`; `server\test\campusFlags.test.js` |
| V04 | `server\test\legacyReportGuard.test.js`; `server\test\campusReports.test.js`; `server\test\v1Http.test.js` |
| V05 | `server\test\campusIsolation.test.js`; `server\test\identityIsolation.test.js`; `tests\e2e\campus-shell.spec.js` |
| V06 | `src\features\assessments\player.test.jsx`; `tests\e2e\flow-player-layout.spec.js` |
| V07 | `src\features\assessments\hooks\useAssessmentClock.test.jsx`; `server\test\campusSessions.test.js`; `tests\e2e\flow-player-layout.spec.js` |
| V08 | `server\test\sessionLocks.test.js` (pre-existing untracked); `server\test\campusSessions.test.js`; `server\test\evaluateAsync.test.js` |
| V09 | `server\test\scenarioBank.test.js`; `server\test\anchorProbes.test.js`; `server\test\probeSelector.test.js` |
| V10 | `server\test\evidenceLedger.test.js`; `server\test\evidenceSufficiency.test.js`; `server\test\failClosed.test.js`; `server\test\evidenceAudit.db.test.js` |
| V11 | `server\test\reportClaims.test.js`; `server\test\campusReports.test.js`; `src\features\reports\reports.test.jsx` |
| V12 | `tests\e2e\flow-recovery.spec.js`; `src\phaseK.test.jsx`; `server\test\evaluateAsync.test.js` |
| V13 | `server\test\campusDevelopment.test.js`; `server\test\campusDevelopment.db.test.js`; `src\features\development\development.test.jsx` |
| V14 | `server\test\campusGrowth.test.js`; `server\test\campusGrowth.db.test.js`; `src\features\growth\growth.test.jsx` |
| V15 | `server\test\campusBilling.test.js`; `server\test\campusBilling.db.test.js`; `server\test\campusEntitlements.test.js`; `server\test\paymentDummy.test.js` |
| V16 | `server\test\security.test.js`; `server\test\promptSecurity.test.js`; `server\test\campusPermissions.test.js` |
| V17 | `tests\e2e\accessibility.spec.js`; `tests\e2e\campus-a11y-sweep.spec.js`; `tests\e2e\campus-keyboard.spec.js`; `docs\campus\A11Y_MANUAL_CHECKLIST.md` |
| V18 | `server\test\telemetry.flag.test.js`; `server\test\commercial.test.js`; `server\test\campusClaims.test.js` |
| V19 | `server\test\validationRatingQueue.test.js`; `server\test\validationRatingQueue.db.test.js`; `docs\studies\HUMAN_LLM_AGREEMENT_PROTOCOL.md` |
| V20 | `server\test\designSystem.test.js`; `server\test\claimsCeiling.test.js`; `server\test\campusCopyCeiling.test.js` |
| V21 | `server\test\campusMigrations.db.test.js`; `server\test\storePg.db.test.js`; `docs\campus\ROLLOUT_PLAN.md` |
| V22 | `server\test\experienceBaseline.test.js` (parent P0 diagnostic selector: 9 pass; product receipt invariant separately FAIL) |
| V23 | `server\test\experienceBaseline.db.test.js` (parent isolated B selector: 3 pass; product lineage/publication invariants separately FAIL) |

### Implementation path register

I references below are **existing** at inventory time. They identify the extension
or diagnosis boundary; existence alone neither satisfies nor approves a requirement.
Paths are relative to `studai-prism\`.

| Ref | Existing path(s) |
| --- | --- |
| I01 | `src\design\tokens.js`; `src\design\tokens.css`; `src\components\ui\PrismLogo.jsx` |
| I02 | `src\app\AppRouter.jsx`; `src\app\routing.jsx`; `src\app\guards\AuthGuard.jsx`; `src\pages\Auth.jsx` |
| I03 | `src\features\home\pages\HomePage.jsx`; `src\features\assessments\components\AssessmentAssignmentCard.jsx` |
| I04 | `server\domain\student\sessionDirectory.js`; `server\domain\student\readModels.js`; `server\routes\v1\student.js` |
| I05 | `server\routes\v1\me.js`; `server\routes\v1\workspaces.js`; `server\routes\v1\studentScope.js`; `server\domain\scopes\` |
| I06 | `src\features\assessments\pages\AssessmentPlayerPage.jsx`; `src\layouts\AssessmentShell.jsx`; `src\features\assessments\components\` |
| I07 | `src\pages\Assessment.jsx`; `src\pages\AssessmentWorkspace.jsx`; `src\pages\ScoreReport.jsx`; `src\pages\StudentReportV2.jsx`; `src\pages\EmployeeReportV2.jsx` |
| I08 | `src\features\assessments\hooks\useAssessmentClock.js`; `src\features\assessments\api\assessmentSessionApi.js`; `server\domain\assessments\sessionContract.js` |
| I09 | `server\domain\assessments\sessionService.js`; `server\domain\assessments\engine.js`; `server\routes\v1\assessmentSessions.js`; `server\routes\assessment.js` |
| I10 | `server\domain\assessments\sessionIoRepository.js`; `server\domain\assessments\repository.pg.js`; `server\domain\assessments\sessionLocks.js` (pre-existing untracked) |
| I11 | `server\lib\scenarioBank.js`; `server\lib\contentCms.js`; `server\domain\assessments\catalog.js`; `server\lib\director.js`; `server\lib\directorV2.js` |
| I12 | `server\domain\evidence\evidenceUnit.js`; `server\domain\evidence\sufficiency.js`; `server\domain\evidence\sufficiencyRules.js`; `server\lib\evidenceGraph.js` |
| I13 | `server\domain\reports\v3\build.js`; `server\domain\reports\v3\service.js`; `server\domain\reports\v3\repository.js`; `server\routes\v1\reports.js` |
| I14 | `src\features\reports\components\ReportView.jsx`; `src\features\reports\components\ReportCapabilityCard.jsx`; `src\features\reports\pages\StudentReportPage.jsx` |
| I15 | `src\features\capabilities\pages\CapabilitiesPage.jsx`; `src\features\capabilities\pages\CapabilityDetailPage.jsx` |
| I16 | `server\domain\development\service.js`; `server\domain\development\missionLibrary.js`; `server\domain\development\missionSchema.js`; `server\domain\development\evaluator.js`; `server\routes\v1\development.js` |
| I17 | `src\features\development\pages\DevelopmentPage.jsx`; `src\features\development\pages\MissionPlayerPage.jsx` |
| I18 | `server\domain\growth\service.js`; `server\domain\growth\snapshot.js`; `server\routes\v1\growth.js`; `src\features\growth\pages\GrowthPage.jsx` |
| I19 | `server\lib\legacyReportGuard.js`; `server\domain\sharing\`; `src\features\reports\components\ShareReportDialog.jsx` |
| I20 | `server\lib\privacyPlanner.js`; `server\lib\retentionEnforcement.js`; `docs\RETENTION_POLICY_v1.md`; `server\lib\storePg.js` |
| I21 | `server\domain\entitlements\ledger.js`; `server\domain\entitlements\legacyAdapter.js`; `server\domain\billing\service.js`; `server\routes\payment.js` |
| I22 | `scripts\check-student-flow-flags.mjs`; `server\lib\flagRegistry.js`; `server\domain\flags\`; `server\db\migrations\` |
| I23 | `server\domain\telemetry\events.js`; `server\routes\v1\telemetry.js`; `server\lib\telemetry.js` |
| I24 | `server\domain\validation\ratingQueue.js`; `server\domain\validation\service.js`; `docs\studies\`; `docs\FAIRNESS_RESEARCH_FRAMEWORK_v1.md` |
| I25 | `server\domain\organizations\`; `server\domain\memberships\`; `server\routes\v1\campusAdmin.js`; `docs\campus\CAMPUS_HUMAN_ACTIONS.md` |
| I26 | `server\lib\promptSecurity.js`; `server\lib\judgePanel.js`; `server\lib\scoreAggregator.js` |
| I27 | `server\lib\proctorSocket.js`; `docs\ACCOMMODATIONS_POLICY_v1.md`; `docs\IDENTITY_ASSURANCE_SPEC_v1.md` |
| I28 | `docs\campus\ROLLOUT_PLAN.md`; `docs\DEPLOYMENT_RUNBOOK_v1.md`; `docs\ui\FLOW_REPAIR_READINESS.md` |
| I29 | `src\pages\LandingPage.jsx` |
| I30 | `scripts\check-experience-baseline.mjs`; `server\test\experienceBaseline.test.js` (parent P0 diagnostic implementation; F-A/F-B scoped safety evidence) |
| I31 | `scripts\run-experience-baseline-tests.mjs`; `server\test\experienceBaseline.db.test.js` (parent isolated diagnostic runner and B tests; final browser runner exit 0, 91 passed + 1 flaky) |

I30 was absent in the initial inventory and appeared during parallel parent P0
work. I30/I31 now have parent-supplied scoped execution/safety evidence, not a
completed product or production-readiness claim. Their implementation and
results remain parent-owned; this owner did not rerun those application checks.

N references are **explicit proposed absent paths at inventory**, not a request to
create them in P0. Names remain non-binding; use existing equivalent domains first.

| Ref | Proposed absent path / missing deliverable boundary |
| --- | --- |
| N01 | `server\domain\student\ownershipReconciliation.js`: reviewed claim/reconciliation workflow not evidenced |
| N02 | `server\domain\assessments\opportunities.js`: approved delivered/answered/judged ledger not evidenced |
| N03 | `server\domain\assessments\runtime\`: version-pinned governed new-run runtime not evidenced |
| N04 | `server\domain\jobs\`: durable outbox/worker/lease implementation not evidenced; existing evaluation Maps are not durable-job proof |
| N05 | `src\features\reports\components\CapabilityMap.jsx`; `src\features\reports\components\MomentCard.jsx`: source-specific map/moment additions proposed |
| N06 | `server\domain\reports\v3\reviewService.js`: interpretation challenge/correction workflow proposed |
| N07 | `src\features\assessments\components\PlanBoard.jsx`: reviewed shared board proposed |
| N08 | `src\features\preparation\`; `server\domain\preparation\`: private preparation domain proposed |
| N09 | `src\features\growth\components\ApplicationCard.jsx`; `server\domain\growth\applicationCheckins.js`: separate SELF_REPORT check-ins proposed |
| N10 | `server\domain\development\replayAdapter.js`; `server\domain\development\freshChallenges.js`: source-linked replay/exposure additions proposed |
| N12 | `docs\experience\content\CORE-TEAMREADY-A.md`; `docs\experience\content\M01-M10.md`: proposed reviewer intake only; content approval absent |
| N13 | `src\features\preview\`: proposed bounded free-experience integration; Landing is not proof of a real preview |
| N14 | `server\domain\privacy\erasureManifest.js`: proposed manifest adapter; reuse I20, do not create duplicate privacy authority |
| N15 | `server\domain\assessments\timingPolicy.js`; `src\features\assessments\components\ScenarioIntroDialog.jsx`: reviewed pre-clock administration additions proposed |

## CH register - exact source change requirements

External refs resolve in [DECISIONS](DECISIONS.md). `Owner pending` means the role
must be assigned to a human; `C pending` means no authorized live-environment evidence.
Deps name prerequisites, not work authorized by this P0 ledger.

| ID | Decision | Action and boundary (source) | Release evidence required (source) | Role | Primary | All source phases | Dependencies | Existing / proposed absent path | Verification required | Code status | External-gate status | Evidence now |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CH-01 | K | Approved Prism logo, tokens, typography and accessibility primitives | Same issued assets; no new brand fork | FE | P3 | P3 | Existing brand system; ADR-01 | I01 | A V20; B rendered journeys; manual V17 | EXISTING/UNVERIFIED | HA-C013 OPEN; UX owner pending | S; NR; UI A-M historical |
| CH-02 | K | Global user identity and scoped Personal/Campus workspaces | Existing users remain one identity | BE | P1 | P1 | P0 scope trace | I05/I25 | A V05; B two-owner HTTP/PG | EXISTING/UNVERIFIED | HA-C005/012 OPEN | S; NR |
| CH-03 | K/U | Report V3 builder, claims and share service | New UX uses existing report boundary | BE | P5 | P5 | CH-21/23/38; ADR-02 | I13/I19 | A V04/V11; B actual publication/read | EXISTING/UNVERIFIED | HA-C002/005/012 OPEN | S; H-runtime; NR |
| CH-04 | K | Practice/formal evidence separation | Isolation tests across every read model | BE | P1 | P1 | CH-02; server-set mode/scope | I12/I16/I18 | A V05/V13/V14; B separate attempts | EXISTING/UNVERIFIED | HA-C009/004 OPEN | S; NR |
| CH-05 | U | Home around next action, latest report and recent assessments | Returning customer finds report in one action | FE | P3 | P3 | CH-06/07; CH-23 | I03/I04 | A V01/V02; B owned history; C comprehension | HISTORICAL/PARTIAL | OPS runtime access and UX owner pending | S; H-entry; NR |
| CH-06 | U | Login/deep-link/profile/dashboard handling | Merged login fix preserved and regression tested | FE | P1 | P1 | CH-02; P0 auth baseline | I02 | A V01; B auth HTTP; C supported deployment | FIXTURE/PARTIAL; source acceptance OPEN | HA-C001/007 OPEN; deployed build unknown | S; H-entry; F-A; NR |
| CH-07 | U | History discovery, owned legacy reports and honest states | Reconciled before/after counts | BE | P1 | P1 | CH-02/06/38; CH-08 for unmatched | I04/I19; N01 absent | A V02/V04; B scoped PG; authorized read-only counts | INTEGRATION/PARTIAL; legacy/reconciliation acceptance OPEN | Production ownership proof/access and OPS owner pending | S; N; H-entry; F-B owned synthetic history only; NR |
| CH-08 | A | Safe support claim workflow for unmatched historical records | No link-possession-only ownership claims | BE | P1 | P1 | CH-02/07; reviewed ownership rules | I04; N01 absent | A conflict fixtures; B owner/non-owner HTTP/PG | GAP/OPEN | SECURITY/PRIVACY review and named support owner pending | S; N; H-runtime; NR |
| CH-09 | U | One canonical assessment player | New runs converge on V3 | ENG | P3 | P3, P10 | CH-20/23/40; ADR-01/03 | I02/I06/I09/I07 | A V01/V06; B version-aware run; C canary | HISTORICAL/PARTIAL | HA-C001/003/007 OPEN | S; H-runtime; NR |
| CH-10 | R | Duplicate player logic for new runs | Redirect/adapter plan, no active-run breakage | ENG | P3 | P3, P10 | CH-09; T60 active-run inventory/drain | I02/I07/I09 | A routing; B pinned active/legacy runs; C monitored drain | RETIREMENT/MAPPED | HA-C001/007 OPEN; OPS usage evidence absent | S; NR |
| CH-11 | U | Fixed-height player and independently scrolling panes | Long transcript and mobile tests | FE | P3 | P3 | CH-09; unchanged stimulus/timing | I06 | A V06; B real run render; manual V17 | HISTORICAL/PARTIAL | HA-C013 OPEN | S; H-player; NR |
| CH-12 | U | Hide absent work panel, display meaningful materials on demand | Zero-artifact and loading/failure distinctions | FE | P3 | P3 | CH-09/19; pinned material contract | I06/I09 | A V06; B material/no-material/error HTTP | HISTORICAL/PARTIAL | CONTENT/accessibility review pending | S; H-player; NR |
| CH-13 | A/U | Intro acknowledgement and server-authoritative answer clock | Refresh does not restart time | BE | P3 | P3 | CH-40; reviewed administration; ADR-07 | I08/I09; N15 absent | A V07/V08; B begin/replay/cutoff/race | GAP/OPEN | MEASURE/accessibility/product timing approval pending | S; N; H-player/H-runtime; NR |
| CH-14 | U | Clear scenario selection separate from calibration | Selected approved form is pinned | FE | P3 | P3 | CH-15; pinned form/version; ADR-03/05 | I06/I09/I11 | A V09; B request/resume selection | MAPPED/FUTURE | HA-C003/008 OPEN | S; NR |
| CH-15 | A | Domain-light flagship scenario with real decisions | Content reviewed, versioned and testable | CONTENT | P4 | P4 | ADR-05/06/07; independent review | I11; N12 absent | A approved form fixtures; B delivered segment; C reviewed pilot | MAPPED/FUTURE | HA-C003/008 OPEN; intake only in P0 | S; N; NR |
| CH-16 | U | Five capability rubrics, including assertiveness/help-seeking | Approved rubric revision; no format bias | MEASURE | P4 | P4 | CH-15; ADR-06; diverse exemplars | I12/I26 | A held-out policy fixtures; B linked evidence; C ratings | MAPPED/FUTURE | HA-C002/008 OPEN | S; NR |
| CH-17 | A | Opportunity ledger with delivered/answered/judged states | Per-run coverage and failure diagnostics | BE | P4 | P4 | CH-15/16/20/40 | I09/I10; N02 absent | A coverage/independence; B delivered stimulus lineage | GAP/OPEN | HA-C003/008 OPEN | S; N; H-runtime; NR |
| CH-18 | U | Director selects approved events, not arbitrary facts | Deterministic policy and factual-state tests | BE | P4 | P4 | CH-15/17; N03 reviewed runtime | I11/I09; N03 absent | A V09/V16; B event facts; C QA | MAPPED/FUTURE | HA-C003/008 OPEN | S; N; NR |
| CH-19 | A | Simple shared plan board with meaningful changes | Learner-authored changes attributed correctly | FE | P4 | P4 | CH-15/17/20; attribution contract | I06; N07 absent | A learner/template distinction; B persisted patch evidence | MAPPED/FUTURE | HA-C003/013 OPEN | S; N; NR |
| CH-20 | U | Durable action capture before model evaluation | Save acknowledgements match durable writes | BE | P2 | P2 | CH-40; P1 action/scope foundation | I09/I10 | A V08; B model-outage/crash HTTP/PG | GAP/OPEN; receipt fault reproduced | Local normal-path B supplied; actual crash/live recovery unverified | F-A T25/T26 FAIL; F-B normal accepted messages/receipts partial; NR |
| CH-21 | U | Dialogue and artifact evaluation generate strict evidence | Real pipeline integration test | BE | P2 | P2 | CH-20/17/16; approved evaluator | I09/I12/I26; N02 absent | A V10; B actual action-to-evidence-to-report; C QA | FAIL/OPEN; judged dialogue evidence absent | HA-C002/003/008 OPEN | F-B T27 zero judged strict dialogue units; no report/evidence preseeded; NR |
| CH-22 | A | System-processing status separate from evidence sufficiency | No outage shown as learner weakness | BE | P2 | P2 | CH-20/21/40; job status contract | I09/I13/I14; N04 absent | A V12; B schema/model/write fault injection | HISTORICAL/PARTIAL | OPS/support owner pending; HA-C002 OPEN | S; N; H-entry/H-runtime; NR |
| CH-23 | U | Versioned publication and stable historical reports | GET cannot silently change issued findings | BE | P2 | P2, P10 | CH-20/21/40; ADR-02/12 | I13/I20 | A V11; B immutable versions/read side effects/races | GAP/OPEN; GET publication side effect reproduced | HA-C005/012 OPEN; source-retention review pending | F-B T36 GET appends version; T32 source dependency FAIL; immutable correction/races NR |
| CH-24 | A | Capability Map with ordinal labels and accessible list | Five-second comprehension study | UX | P5 | P5 | CH-21/23; ADR-06/10 | I14/I15; N05 absent | A V11/V17; B source-backed render; human study | MAPPED/FUTURE | HA-C002/008/013 OPEN; consent/recruitment pending | S; N; NR |
| CH-25 | A | Moments that mattered, linked to real actions | Claim-to-source audit | FE | P5 | P5 | CH-21/23; retained authorized source | I13/I14; N05 absent | A V11; B quote/action provenance | MAPPED/FUTURE | HA-C005/008 OPEN; ADR-12 review pending | S; N; NR |
| CH-26 | U | Meaning -> evidence -> next behaviour -> practice | No generic unsupported weaknesses | UX | P5 | P5 | CH-21/23/30/31 | I14/I16/I17 | A V11/V13; B real relevant mission; C comprehension | EXISTING/UNVERIFIED | HA-C002/009 OPEN | S; NR |
| CH-27 | R | Duplicate insufficient-evidence badges and technical-first copy | Single state, helpful explanation | FE | P5 | P5 | CH-22/23; preserve evidence meaning | I14 | A V11/V12; B partial/failure report; human comprehension | HISTORICAL/PARTIAL | HA-C002/013 OPEN | S; H-player; NR |
| CH-28 | R | Hard-coded report narratives and view-date issuance dates | Stored facts only; missing dates stay unknown | FE | P5 | P5 | CH-23; stored version/date facts | I14/I13/I07 | A V11; B stable historical facts | RETIREMENT/MAPPED | MEASURE interpretation review pending | S; NR |
| CH-29 | A | Report interpretation challenge/review workflow | Versioned correction, no silent overwrite | BE | P5 | P5 | CH-23/38; ADR-02/10/12 | I13/I24; N06 absent | A review authorization; B audited correction/version | MAPPED/FUTURE | MEASURE/counsel/support approval pending | S; N; NR |
| CH-30 | A | Ten original universal practice missions | Two reviewed missions per capability family | CONTENT | P6 | P6 | CH-16; ADR-08; reviewer intake | I16/I17; N12 absent | A V13; B library/attempts; C content QA | MAPPED/FUTURE | HA-C009 OPEN; M01-M10 DRAFT intake only | S; N; NR |
| CH-31 | U | Mission evaluator checks meaning, not required phrases alone | Semantic equivalence and empty-work tests | BE | P6 | P6 | CH-30; human-rated practice exemplars | I16 | A V13; B semantic/empty attempts; C held-out QA | EXISTING/UNVERIFIED | HA-C009/008 OPEN | S; NR |
| CH-32 | A | Try that moment again in a separate practice attempt | Formal snapshot unchanged | BE | P6 | P6 | CH-04/23/25/30 | I16/I17; N10 absent | A V13; B replay origin/formal immutability | MAPPED/FUTURE | HA-C009 OPEN; private source consent pending | S; N; NR |
| CH-33 | A | Unfamiliar uncoached practice challenges | Training/form exposure tracked | CONTENT | P6 | P6 | CH-30/31; reviewed challenge/exposure rules | I16; N10 absent | A V13; B fresh challenge; C blinded comparison | MAPPED/FUTURE | HA-C009/008 OPEN | S; N; NR |
| CH-34 | A | Preparation wizard and sanitized user context | Private, non-formal, no unsafe tool execution | BE | P7 | P7 | CH-02/04/39; ADR-09/12 | N08 absent; reuse I06/I16 | A privacy/injection contracts; B owned attempt; C safety | MAPPED/FUTURE | HA-C005/012 OPEN | S; N; NR |
| CH-35 | A | Application cards and optional check-ins | Clearly self-reported, no automatic growth claim | FE | P7 | P7 | CH-04/34; ADR-09/10 | I18; N09 absent | A mode/attribution; B isolated SELF_REPORT | MAPPED/FUTURE | PRIVACY/MEASURE consent/claims review pending | S; N; NR |
| CH-36 | U | Growth view separates practice history from formal comparison | Unapproved form pairs remain non-comparable | BE | P7 | P7 | CH-04/23/35; approved equivalence only | I18 | A V14; B non-comparable snapshots | EXISTING/UNVERIFIED | HA-C002/004/008 OPEN | S; NR |
| CH-37 | U | Campus uses same learner experience but only authorized data | Sponsor cannot view private preparation | BE | P8 | P8 | CH-02/04/34/38/39 | I05/I25/I19; N08 absent | A V05/V16; B sponsor/private negative matrix | EXISTING/UNVERIFIED | HA-C005/010/012 OPEN | S; N; NR |
| CH-38 | U | Report API authorization including legacy routes | Owner/non-owner/anonymous matrix passes | SECURITY | P1 | P1, P10 | CH-02/07; intentional share boundary | I19/I13/I07 | A V04/V16; B every read/export/version | GAP/OPEN | HA-C005/012 OPEN | S; H-runtime; NR |
| CH-39 | U | Erasure across evidence, jobs, reviews and derived material | Deletion rehearsal, no job resurrection | BE | P1 | P1, P10 | CH-02/40; ADR-12; erasure manifest | I20; N14/N04 absent | A tombstone/fencing; B worker/derived erasure | GAP/OPEN | HA-C005/012 OPEN; counsel retention decision pending | S; N; H-runtime; NR |
| CH-40 | A/U | Durable jobs, leases, event versions and idempotency | Crash/race tests and reconciliation | BE | P1 | P1, P10 | CH-02; versioned durable actions; ADR-03 | I09/I10; N04 absent | A V08; B crash/multi-instance/effect-before-receipt | GAP/OPEN; receipt-window invariant FAIL | HA-C012 OPEN; dirty PG locks not distributed proof | F-A T25/T26 2 engine effects/1 receipt; full crash/lease/multi-instance NR |
| CH-41 | A | Safe production readiness diagnostic | No secrets or unsupported flag activation | ENG | P0 | P0, P10 | P0 trace; allowlisted projections; ADR-13 | I22/I30/I31 (parent P0 additions) | A V22 redaction/error contracts; B V23 write-rejected read-only connection | P0/DIAGNOSTIC_VERIFIED; production acceptance OPEN | HA-C001/007/012 OPEN; real-environment operator access pending | F-A 9 diagnostic tests; F-B SQLSTATE 25006/unchanged count/conflict categories; F-browser; P0-close |
| CH-42 | U | Pricing as bounded development package | Existing entitlements grandfathered | PRODUCT | P8 | P8 | CH-30/31/40; ADR-08/11 | I21 | A V15; B grandfathered grants/webhooks/usage; human finance | MAPPED/FUTURE | HA-C006 OPEN; Personal offer finance approval pending | S; NR |
| CH-43 | A | Free experience that provides real value | Cost/rate limits, voluntary conversion | PRODUCT | P8 | P8 | CH-21/31/44; ADR-10/11 | I29/I16; N13 absent | A V18; B actual preview/retry/rate limits; C voluntary cohort | MAPPED/FUTURE | Product/content/finance approval pending | S; N; NR |
| CH-44 | A | Instrumentation for quality, value and cost | No transcript/PII in product analytics | BE | P9 | P9 | CH-02/04; run/mode/version; consent | I23 | A V18; B redacted lineage/cost events; C measured spend | EXISTING/UNVERIFIED | HA-C005/010 OPEN; OPS budget pending | S; NR |
| CH-45 | A | Human-validation programme and generic-AI comparison | Predefined study plan and independent ratings | MEASURE | P9 | P9 | CH-15/16/30/44; ADR-04/10 | I24 | A V19; B safe exports; C authorized study; independent ratings | MAPPED/FUTURE | HA-C008/005 OPEN; recruitment/consent/raters pending | S; NR |
| CH-46 | D | New broad Campus analytics and sales modules | Resume only after learner loop passes | PRODUCT | P0 | P0, P10 | Proven core learner loop; later product approval | I25 (retain existing); no new module here | A/B existing-contract regressions only | DEFERRED | HA-C006/010 remain OPEN; no expansion approval | S; NR; deferred by source |
| CH-47 | D | Formal standalone creativity/personality/emotion scores | No new construct without evidence | MEASURE | P0 | P0 | Independent construct/intended-use evidence | I12/I24 (existing foundations only) | Human science review; no new construct tests/activation here | DEFERRED | HA-C002/008 OPEN | S; NR; deferred by source |
| CH-48 | R | Mandatory persona picker before basic value | Optional display preference, never scoring input | UX | P3 | P3 | CH-09/15; attribution/neutrality | I06/I09 | A entry/payload; B unchanged formal method | RETIREMENT/MAPPED | CONTENT/MEASURE review pending | S; NR |
| CH-49 | U | Proctoring based on purpose and approved policy | No camera/phone gate for ordinary practice | SECURITY | P3 | P3 | CH-04; ADR-07/09; approved integrity policy | I27/I16 | A V16; B mode-specific gates; manual accessibility | MAPPED/FUTURE | HA-C005/012/013 OPEN | S; NR |
| CH-50 | R | Infinite auto-generated formal scenarios | Draft practice generation only; formal approvals required | CONTENT | P0 | P0 | ADR-05; versioned reviewed formal catalog | I11 (retain old-version behavior) | A catalog/policy; B pinned versions; human content review | RETIREMENT/MAPPED | HA-C003/008/009 OPEN; no formal publication authority | S; NR |
| CH-51 | D | Subscription as default pricing model | Prove voluntary repeat value first | PRODUCT | P0 | P0 | CH-30/43/44/45; demand/economics evidence | I21 (existing rights retained) | Human demand/finance review; no subscription activation here | DEFERRED | ADR-11 pending commercial approval | S; NR; deferred by source |
| CH-52 | R | Frontend-only completion and fake progress | Backend publication and real task state | BE | P2 | P2, P10 | CH-20/21/23/40 | I09/I13/I14 | A state contracts; B real publication/task state | GAP/OPEN | HA-C002/003/008 OPEN | S; H-runtime; NR |

## T register - exact source acceptance requirements

No T row is full-source PASS or complete. Fresh parent A/B results support only
the stated diagnostic/partial slice; required further reproductions and full
acceptance remain open. Primary P0 rows record a diagnostic baseline, never a
repaired product invariant. For every row, C execution remains unauthorized.

| ID | Requirement (source) | Expected result (source) | Role | Primary | All source phases | Dependencies | Existing / proposed absent path | Verification required | Code status | External-gate status | Evidence now |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T01 | Returning login and registration | Returning customer reaches supported Home; new user sees appropriate options, not forced duplicate payment | QA | P0 | P0, P1, P9, P10 | CH-02/05/06/42 | I02/I03/I21 | A V01; B actual auth/entitlement/history | FIXTURE/PARTIAL; P1 commercial/acceptance OPEN | Production runtime/build unknown; PRODUCT offer pending | F-A returning entry; F-browser final 91 + 1 flaky; registration offer NR |
| T02 | Explicit deep link and expired auth | Login preserves safe owned destination; external redirects rejected | QA | P1 | P1, P9, P10 | CH-06/38 | I02 | A V01; B expired/owned HTTP session | FIXTURE/PARTIAL; source acceptance OPEN | HA-C012 OPEN; deployed config unknown | F-A deep-link fixture; F-browser final 91 + 1 flaky; full B NR |
| T03 | Dashboard/profile aliases | No homepage bounce or redirect loop | QA | P1 | P1, P9, P10 | CH-05/06 | I02/I03 | A V01; B actual aliases/auth | FIXTURE/PARTIAL; source acceptance OPEN | OPS production build/flags pending | F-A aliases; F-browser final 91 + 1 flaky; full B NR |
| T04 | Feature flags loading/failure/off | Correct loading/error/supported fallback; no accidental activation | QA | P0 | P0, P1, P9, P10 | CH-06/41; ADR-13 | I02/I22/I30 | A V01/V03; B isolated flag matrix | FIXTURE/PARTIAL; source acceptance OPEN | HA-C001 OPEN; effective production flags unknown | F-A loading/dark/recovery fixtures; dark config PASS only; full acceptance NR |
| T05 | Legacy owned report | Visible in history and readable in original format | QA | P0 | P0, P1, P9, P10 | CH-07/23/38 | I04/I07/I19 | A V02/V04; B owned original report | INTEGRATION/PARTIAL; old-report/reader acceptance OPEN | Authorized real legacy ownership/source access pending | F-B completed owned synthetic run visible/nonowner denied; not old-customer/original-format proof; NR |
| T06 | Unclaimed/conflicting ownership | Not exposed or auto-transferred; review workflow available | SECURITY | P1 | P1, P9, P10 | CH-08/38 | I04/I19/I30; N01 absent | A conflict categories; B two-owner/review HTTP | GAP/OPEN; diagnostic categories verified | SECURITY/PRIVACY proof/review rules pending | F-A/F-B conflict/unclaimed fixtures; no owner transfer; claiming/review workflow NR |
| T07 | Personal/Campus history | No cross-scope rows, credits or cached results | QA | P1 | P1, P7, P8, P9, P10 | CH-02/04/37 | I04/I05/I21 | A V05; B scoped PG/browser sessions | EXISTING/UNVERIFIED | HA-C005/012 OPEN | NR; S; P0 supplemental baseline |
| T08 | Two users on same browser | Prior user's data cleared during logout/login | QA | P1 | P1, P9, P10 | CH-02/06/37 | I02/I05 | A V05; B actual account/workspace switch | EXISTING/UNVERIFIED | HA-C005/012 OPEN | NR; S; P0 supplemental baseline |
| T09 | New-run canonical player | Correct version-aware route; no new fourth player | QA | P3 | P3, P9, P10 | CH-09/10/40 | I02/I06/I07/I09 | A V01/V06; B version-pinned new/active/legacy run | GAP/OPEN | HA-C001/003 OPEN | NR; H-runtime |
| T10 | No work materials | Centered conversation; no empty reserved half-screen | QA | P3 | P3, P9, P10 | CH-11/12 | I06 | A V06; B real no-material form | FIXTURE/PARTIAL; source acceptance OPEN | HA-C013 OPEN | F-A; F-browser seven-width fixtures/final 91 + 1 flaky; real-form B NR |
| T11 | Required material unavailable | Recovery state; not silently treated as no-material form | QA | P3 | P3, P9, P10 | CH-12/22 | I06/I09 | A V06; B material-fetch fault | EXISTING/UNVERIFIED | CONTENT approved material/access review pending | NR; S; P0 supplemental baseline |
| T12 | Long transcript | Header/composer remain usable; only intended region scrolls | QA | P3 | P3, P9, P10 | CH-11 | I06 | A V06; B actual long run; manual V17 | FIXTURE/PARTIAL; source acceptance OPEN | HA-C013 OPEN | F-A; F-browser seven-width/compact fixtures; actual long-run/manual NR |
| T13 | Long artifact and mobile keyboard | Independent scrolling, tabs, no hidden controls | QA | P3 | P3, P9, P10 | CH-11/12/19 | I06; N07 absent | A V06; B saved work/mobile keyboard; manual devices | FIXTURE/PARTIAL; source acceptance OPEN | HA-C013 OPEN | F-A; F-browser pane/composer fixtures; real-artifact/device/manual NR |
| T14 | Scenario intro | Actual pinned facts/role; accessible; explicit begin | QA | P3 | P3, P9, P10 | CH-13/14/15 | I06/I09; N15 absent | A intro facts; B before-clock acknowledgement | GAP/OPEN; existing start baselined | ADR-07 administration; HA-C003/013 OPEN | F-B existing marketing form/35-minute started clock; separate pre-clock begin NR |
| T15 | Begin replay/concurrency | One start time and one credit reservation | QA | P3 | P3, P9, P10 | CH-13/40/42 | I09/I10/I21 | A V08; B concurrent/multi-instance begin | GAP/OPEN | HA-C012 OPEN; disposable DB needed | NR; H-runtime; P0 supplemental baseline |
| T16 | Timer refresh/reconnect | No reset; server deadline remains authoritative | QA | P3 | P3, P9, P10 | CH-13/40 | I08/I09 | A V07; B reconnect/server deadline | FIXTURE/PARTIAL; server/full acceptance OPEN | ADR-07 pending new administration approval | F-A; F-browser deadline-receipt fixtures; full reconnect B NR |
| T17 | Deadline versus grace | No new late answer accepted through client timestamp spoofing | QA | P3 | P3, P9, P10 | CH-13/20/40 | I08/I09; N15 absent | A cutoff policy; B spoof/late send vs recovery draft | GAP/OPEN | MEASURE/OPS timing review pending | NR; H-runtime; P0 supplemental baseline |
| T18 | Approved timing adjustment | Correct policy/version; no unfair hidden deadline | QA | P3 | P3, P9, P10 | CH-13/49; ADR-07 | I08/I27; N15 absent | A adjustment version; B approved accommodation | MAPPED/FUTURE | MEASURE/accessibility/product approval pending | NR; N; P0 supplemental baseline |
| T19 | Requested scenario | Valid approved selection respected; unknown ID fails without substitution | QA | P3 | P3, P4, P9, P10 | CH-14/15/18 | I09/I11 | A V09; B create/request/unknown form | INTEGRATION/PARTIAL; source acceptance OPEN | HA-C003 OPEN | F-B requested existing marketing form agrees; unknown-ID/full-selection NR |
| T20 | Resume existing session | Same scenario, state, artifact versions and conversation | QA | P3 | P3, P9, P10 | CH-13/14/20/40 | I09/I10/I06 | A V08; B refresh/persisted resume | INTEGRATION/PARTIAL; source acceptance OPEN | HA-C012 OPEN; compatible deployed version unknown | F-B existing form/state baselined; full artifact/resume/crash acceptance NR |
| T21 | Calibration versus context | Wording and payload reflect separate purposes | QA | P3 | P3, P4, P9, P10 | CH-14/16 | I06/I09/I11 | A copy/payload separation; B selected context/form | MAPPED/FUTURE | HA-C002/003/008 OPEN | NR; S |
| T22 | Opportunity coverage | Required stages delivered with correct actual stimulus records | QA | P4 | P4, P9, P10 | CH-15/17/18 | I09/I11; N02 absent | A V09; B stimulus/opportunity ledger | GAP/OPEN | HA-C003/008 OPEN | NR; N; H-runtime |
| T23 | Opportunity independence | Duplicate probes/ratings cannot inflate independent evidence | MEASURE | P4 | P4, P9, P10 | CH-16/17/21 | I12/I24; N02 absent | A duplicate policy; B linked opportunities/ratings | MAPPED/FUTURE | HA-C002/008 OPEN | NR; N |
| T24 | Candidate attribution | System opening, avatar and template content never counted as learner work | QA | P2 | P2, P3, P4, P9, P10 | CH-19/20/21 | I09/I10/I12; N07 absent | A origin fixtures; B learner patch vs system material | GAP/OPEN | HA-C003/008 OPEN | NR; H-runtime; P0 supplemental baseline |
| T25 | Save before evaluate | Model failure leaves acknowledged action recoverable | QA | P0 | P0, P1, P2, P9, P10 | CH-20/40 | I09/I10 | A V08/V22; B real HTTP/PG with model failure | FAIL/OPEN; measured receipt-fault boundary | Local disposable B available; actual model-failure/crash recovery unverified; C unauthorized | F-A same-event retry: 2 engine effects/1 receipt; F-B normal messages durable only; full recovery NR |
| T26 | Duplicate message/artifact request | Same key produces same effect; changed payload conflicts | QA | P1 | P1, P2, P9, P10 | CH-20/40 | I09/I10 | A V08/V22; B duplicates/conflicts/crash receipt window | FAIL/OPEN; same-event duplicate effect | HA-C012 OPEN; process-crash/multi-instance proof absent | F-A one receipt-write fault then retry: 2 engine effects/1 receipt; full B NR |
| T27 | Dialogue evidence | Actual accepted response produces linked governed evidence where appropriate | QA | P2 | P2, P4, P9, P10 | CH-17/20/21 | I09/I12; N02 absent | A V10; B V23 actual dialogue writer without seeded evidence; C QA | FAIL/OPEN; zero judged strict dialogue units | HA-C002/003/008 OPEN | F-B actual HTTP/scorer completed; 0 judged strict units; no seeded report/evidence |
| T28 | Artifact evidence | Saved learner patch linked to relevant opportunity and interpretation | QA | P2 | P2, P4, P9, P10 | CH-17/19/20/21 | I09/I10/I12; N02/N07 absent | A V10; B saved patch-to-judged evidence | GAP/OPEN | HA-C002/003/008 OPEN | NR; H-runtime |
| T29 | Missing/contradictory evidence | Abstention or review, not fabricated consensus | MEASURE | P2 | P2, P4, P5, P9, P10 | CH-16/21/22/29 | I12/I13/I26; N06 absent | A V10/V11; B sparse/conflicting actual run | EXISTING/UNVERIFIED | HA-C002/008 OPEN | NR; S |
| T30 | Clear developing behaviour | Valid low-level observation, not blanket insufficiency | MEASURE | P2 | P2, P4, P5, P9, P10 | CH-16/21/22 | I12/I13/I26 | A held-out exemplars; B low-level actual run; C ratings | MAPPED/FUTURE | HA-C002/008 OPEN | NR; S |
| T31 | Evaluator/schema/write outage | Technical state, not learner weakness | QA | P0 | P0, P2, P4, P5, P9, P10 | CH-20/21/22/40 | I09/I13/I14/I30; N04 absent | A V12/V22; B actual evaluation/schema/write faults | GAP/OPEN; diagnostic/UI failure states verified only | Durable processing-state repair/recovery policy pending | F-A probe/schema/read/cleanup errors and visible failed retry; full processing-outage B NR |
| T32 | Source quote mismatch | Claim withheld/reviewed; no invented quotation | QA | P2 | P2, P4, P5, P9, P10 | CH-21/23/25/29 | I12/I13/I20; N06 absent | A V11; B V23 retained source/quote mismatch after completion | FAIL/OPEN; V3 source-history dependency | HA-C005/008 OPEN; ADR-12 retention review | F-B normal completion purges history V3 reads; not proof all source erased; full mismatch/review NR |
| T33 | Judge disagreement | Policy-defined review; no unsupported precision | MEASURE | P2 | P2, P4, P5, P9, P10 | CH-16/21/29 | I26/I24; N06 absent | A V10/V19; B disagreement/review; C independent ratings | EXISTING/UNVERIFIED | HA-C002/008 OPEN | NR; S |
| T34 | Malicious learner prompt | Cannot change facts, score, mode, access, timer or billing | SECURITY | P2 | P2, P4, P9, P10 | CH-02/04/13/18/21/42 | I09/I26/I21 | A V16; B adversarial actual HTTP; C approved QA | EXISTING/UNVERIFIED | HA-C012 OPEN | NR; S |
| T35 | Publish without legacy report | New-run completion supports V3 directly; no fake legacy result needed | QA | P2 | P2, P5, P9, P10 | CH-21/23/52 | I09/I13/I20 | A V11; B actual V3 publication without legacy result | GAP/OPEN | HA-C002/003/008 OPEN | NR; H-runtime |
| T36 | Historical snapshot | Same version returns same content; correction creates new version | QA | P2 | P2, P5, P9, P10 | CH-23/29 | I13/I20; N06 absent | A V11; B V23 repeat GET/correction/immutable version | FAIL/OPEN; GET publication side effect | PRIVACY/MEASURE retention/correction approval pending | F-B report GET appends stored version; same-version content/correction acceptance NR |
| T37 | Report map semantics | Missing is not zero; ordinal labels readable; no overall hidden score | QA | P5 | P5, P9, P10 | CH-16/24/27; ADR-10 | I14/I15; N05 absent | A V11/V20; B governed source-backed map; human study | MAPPED/FUTURE | HA-C002/008/013 OPEN | NR; N |
| T38 | Duplicate insufficient badges | One clear state and recovery/next step | QA | P5 | P5, P9, P10 | CH-22/27 | I14 | A V11/V12; B real partial/failure state | HISTORICAL/PARTIAL | HA-C002/013 OPEN | NR; H-player; P0 supplemental baseline |
| T39 | Development recommendation | Reviewed, relevant, reachable mission only; no invented deficit | QA | P5 | P5, P6, P9, P10 | CH-21/26/30/31 | I13/I14/I16/I17 | A V11/V13; B real recommendation/approved mission | EXISTING/UNVERIFIED | HA-C009 OPEN | NR; S |
| T40 | Mission meaningfulness | Valid paraphrase accepted; keywords alone do not prove behaviour | QA | P6 | P6, P9, P10 | CH-30/31 | I16 | A V13 paraphrase/empty fixtures; B actual attempts; C ratings | EXISTING/UNVERIFIED | HA-C009/008 OPEN | NR; S |
| T41 | Practice retry | New practice attempt; original formal snapshot unchanged | QA | P6 | P6, P7, P9, P10 | CH-04/23/30/32 | I16/I17; N10 absent | A V13; B retry/formal snapshot comparison | EXISTING/UNVERIFIED; source-linked replay future | HA-C009 OPEN | NR; S; N |
| T42 | Fresh challenge | No hidden coaching; exposure metadata recorded | QA | P6 | P6, P9, P10 | CH-30/31/33 | I16; N10 absent | A challenge/exposure policy; B unfamiliar attempt | MAPPED/FUTURE | HA-C009/008 OPEN | NR; N |
| T43 | Preparation privacy | Personal by default; no Campus/raw analytics leakage | SECURITY | P7 | P7, P8, P9, P10 | CH-02/34/37/39/44 | N08 absent; reuse I05/I20/I23 | A negative scope/redaction; B owner/sponsor/private matrix | MAPPED/FUTURE | HA-C005/012 OPEN | NR; N |
| T44 | Preparation output attribution | Generated suggestions not scored as learner responses | QA | P7 | P7, P9, P10 | CH-04/34; T24 | N08 absent; reuse I12/I16 | A generated/learner origin; B private rehearsal actions | MAPPED/FUTURE | CONTENT/MEASURE review pending | NR; N |
| T45 | Application check-in | Clearly SELF_REPORT; cannot raise formal capability | QA | P7 | P7, P9, P10 | CH-04/35/36 | I18; N09 absent | A mode/claim boundary; B independent read models | MAPPED/FUTURE | PRIVACY/MEASURE consent/claims review pending | NR; N |
| T46 | Growth not approved | No comparative claim or delta; separate dated snapshots | QA | P7 | P7, P9, P10 | CH-23/36 | I18 | A V14; B unapproved-pair UI/API | EXISTING/UNVERIFIED | HA-C002/004/008 OPEN | NR; S |
| T47 | Report and evidence authorization | Owner/sponsor scope/share checked at every read/export | SECURITY | P1 | P1, P5, P7, P8, P9, P10 | CH-02/37/38 | I13/I19/I05 | A V04/V16; B owner/non-owner/sponsor/share/export matrix | INTEGRATION/PARTIAL; full audience/access acceptance OPEN | HA-C005/012 OPEN | F-B owned synthetic session/report visible; second owner 404; every audience/export/source NR |
| T48 | Revoked/expired share | Hosted access stops; scope preview matches content | SECURITY | P1 | P1, P5, P8, P9, P10 | CH-23/38; ADR-12 | I13/I19 | A V04; B revoke/expiry/preview/export | EXISTING/UNVERIFIED | HA-C005/012 OPEN | NR; S |
| T49 | Session job crash/lease expiry | Safe retry; no duplicate applied result or permanent scoring state | QA | P1 | P1, P2, P9, P10 | CH-20/40 | I09/I10; N04 absent | A V08; B multi-instance/crash/lease/fencing | GAP/OPEN | HA-C012 OPEN; disposable PG required | NR; H-runtime; P0 supplemental baseline |
| T50 | Start/send/finish race | State remains coherent; no late overwrite | QA | P1 | P1, P2, P9, P10 | CH-13/20/40 | I09/I10 | A V08; B real engine effects plus durable receipts | GAP/OPEN | HA-C012 OPEN; dirty advisory locks unproven | NR; H-runtime; P0 supplemental baseline |
| T51 | Report-version race | One consistent publication/version sequence | QA | P2 | P2, P5, P9, P10 | CH-23/40 | I13/I10 | A V11; B concurrent publish/read/correction | GAP/OPEN | MEASURE/counsel publication policy pending | NR; H-runtime |
| T52 | Deletion with active worker | No resurrection of erased evidence/report/preparation | QA | P1 | P1, P7, P9, P10 | CH-39/40; future CH-34 | I20; N04/N08/N14 absent | A tombstone fixtures; B active worker/stale callback erasure | GAP/OPEN | HA-C005/012 OPEN | NR; H-runtime |
| T53 | Payment/webhook retries | Exactly one entitlement grant/application, no duplicated consumption | QA | P8 | P8, P9, P10 | CH-40/42 | I21 | A V15; B duplicate/out-of-order payment callback | EXISTING/UNVERIFIED | HA-C006 OPEN; finance/provider approval pending | NR; S |
| T54 | System failure credit policy | Reissue/refund path consistent and auditable | PRODUCT | P8 | P8, P9, P10 | CH-22/40/42; approved recovery policy | I21/I28 | A V15; B authorized synthetic reissue audit | MAPPED/FUTURE | Finance/support policy pending; no issuance authorized | NR; S |
| T55 | Package expiry | New activity gated correctly; eligible issued history remains readable | QA | P6 | P6, P8, P9, P10 | CH-07/23/30/42 | I21/I16/I04 | A V13/V15; B expiry vs issued-history rights | EXISTING/UNVERIFIED | Product/finance bounded allowance approval pending | NR; S |
| T56 | Keyboard/screen reader/zoom | End-to-end usable without pointer or colour-only cues | UX | P3 | P3, P5, P7, P9, P10 | CH-01/11/24/34 | I01/I06/I14; N08 absent | A V17; B complete supported journeys; manual AT/device study | HISTORICAL/PARTIAL; full human audit open | HA-C013 OPEN | NR; H-player; manual NOT RUN |
| T57 | Existing direct and Campus regression | No change to unrelated entitlements/contracts/visibility | QA | P1 | P1, P6, P8, P9, P10 | CH-02/04/37/42 | I05/I21/I25 | A V05/V15; B existing rights/contracts regression | EXISTING/UNVERIFIED | HA-C005/006/012 OPEN | NR; S |
| T58 | Cost and trace coverage | Usage attached to mode/run/version with no sensitive analytics payload | QA | P8 | P8, P9, P10 | CH-04/40/44 | I23/I21 | A V18; B run/mode/cost projection; C budgeted spend | EXISTING/UNVERIFIED | OPS budget/PRIVACY approval pending | NR; S |
| T59 | Synthetic data isolation | Test/example sessions excluded from real research and conversion metrics | QA | P0 | P0, P2, P8, P9, P10 | CH-44/45; disposable store designation | I23/I24/I30/I31 | A isolation fixtures; B actual metric/research exclusion | INTEGRATION/PARTIAL; full exclusion acceptance OPEN | HA-C005/008 OPEN; conversion/research manifest unknown | F-B actual dev timeline row marked synthetic; telemetry enabled only in isolated test; full exclusion NR |
| T60 | Rollback during active run | Pinned compatible handler or safe drain/reissue; no stranded learner | OPS | P9 | P9, P10 | CH-09/10/23/39/40/41; ADR-13 | I28/I09/I13; N03/N04 absent | A compatible routing; B local crash/drain rehearsal; C authorized canary | GAP/OPEN | HA-C001/007/012 OPEN; active-run inventory/recovery policy absent | NR; H-runtime; P0 supplemental baseline |

## Dependency-aware handoff

1. Parent P0: code-safe diagnostic baseline COMPLETE per FINAL_REPORT. Retain
   the final browser result (91 passed + 1 flaky, runner exit 0), the initial
   EBUSY failure and all reproduced product FAILs. Partial fixture/integration
   evidence does not close later-phase requirements, skipped suites or external gates.
2. P1, **not authorized here**: prove ownership/scoped history first; durable
   versioned actions/jobs, authorization and reviewed erasure/source-retention
   contracts next. Existing PostgreSQL advisory-lock changes must include engine
   effects and the effect-before-receipt crash window in testing.
3. P2: real action -> evaluation -> strict evidence -> immutable V3 -> separate
   practice attempt. Stop at the first missing writer/worker; no seeded report
   can bridge the gap. Keep outages distinct from genuine insufficiency.
4. P3/P4: compatible canonical player and reviewed administration/content/
   opportunities. Existing 35-minute timing is preserved; no cosmetic
   30-minute clamp, new pre-clock start or stimulus change in P0.
5. P5-P8: useful source-backed reports, ten reviewed missions, private preparation/
   SELF_REPORT and bounded commercial/Campus integration, each behind its own gates.
6. P9/P10: full acceptance, authorized live-model/human studies, preflight,
   active-run-safe rollout/retirement. Configuration consistency is not release approval.

Support diagnosis must not invoke a report GET that builds/appends versions,
a session GET that settles entitlements, admin initialization that seeds RBAC,
or `migrate:store` as a purported read-only dry run. Parent diagnostics use
narrow repository/SQL projections and write-rejected transactions instead.
Ownership categories MATCHED/CONFLICTING/UNCLAIMED/DELETED/EXCLUDED require
authoritative proof; missing rows alone never establish deletion or ownership.

## Structural verification and phase-close condition

**Documentation mapping: COMPLETE (2026-10-02).** A read-only Node comparison
against both source files verified 52 CH + 60 T = 112 unique row IDs, exact
source decision/action/requirement/evidence wording, primary phases and all
phase memberships. It also verified 13 source-matching ADR rows, 13 unique
HA-C rows and 190 path references (including 20 proposed absent path references),
with zero mismatches after correcting initial filename assumptions and recording
the parent's I30/I31 and V22/V23 diagnostic paths. The synchronization recheck
preserved exact source wording and phase assignments. The editor reported no errors in either
document. These are structural/document checks, **not application test counts**.

Structural acceptance for these documents: IDs CH-01 through CH-52 and T01
through T60 occur exactly once as ledger row IDs; all source wording and phase
memberships match the two source tables; every row has role, primary phase,
dependencies, path, verification, distinct code/external status and evidence.
ADR-01 through ADR-13 and HA-C001 through HA-C013 are carried in DECISIONS.

This structural check closes only the **documentation mapping deliverable**.
The parent separately closes **code-safe diagnostic-only P0** in FINAL_REPORT,
using the supplied diagnostic/safety evidence and final browser runner exit 0
with 91 passed + 1 flaky. Neither closure completes a later-phase requirement
or external gate. The parent owns exact counts, the final report and the
explicit-path local P0 commit; this document owner makes no commit. Product
release remains NO-GO while critical ownership, evidence, persistence,
publication, source-retention, security or active-run recovery gates remain open.
