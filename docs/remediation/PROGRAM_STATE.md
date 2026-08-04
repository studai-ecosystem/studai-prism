# PRISM Master Remediation — Programme State

**Living document.** This is the single source of truth for programme progress, decisions
and deviations. Every remediation session MUST read this file first and update it before
ending. The charter itself ([MASTER_PROMPT_2026-08-04.md](./MASTER_PROMPT_2026-08-04.md))
is frozen — record all interpretation and deviation here, never there.

## 0. Programme status

| Field | Value |
| --- | --- |
| Charter | MASTER-2026-08-04 (frozen) |
| Programme status | PHASE 3 IN PROGRESS — §9/§10/§11/§12/§14/§18-access COMPLETE (part 1); REMAINING: §13 accommodations, §15 fairness data, §16 retention (part 2, next session). P0 incident OPEN (HA-001/HA-002) |
| Starting commit | `ad4be54df1ad9d39e4c279834f21138b4c6c9d0c` (main = origin/main) |
| Uncommitted at start | Foundation docs only: `.github/copilot-instructions.md` (M), `docs/PRISM_Product_Reference.md`, `docs/PRISM_Review_Response_Action_Plan.md`, `docs/remediation/` (untracked). No product code at risk. Worktrees wt-phase1/2/3 detached (historical). |
| Baseline tests | Server: 286 tests / 275 pass / 0 fail / 11 skipped (DB-gated, no local DB). Python: 57 passed (`py -3.12 -m pytest`, 1.58s). 48 server test files; runner `node --test`. |
| Production baseline | main @ ad4be54, image ad4be54df1ad, EKS StudAI-Prod-EKS-Cluster ns `prism`. Live-verified 2026-08-04: health `{status:ok}`; payments LIVE (₹499 INR, keyId rzp_live_TItHtKm7Qs0CPQ, dummyMode=false, skipVerification=false); TTS amazon-polly enabled; `/api/admin` 401 (console on); velocity 404 (dark) |
| Current phase | Phase 3 part 1 done → resume with `/prism-phase3-governance` for §13 + §15 + §16 (part 2) |
| Last session | 2026-08-04 — Phase 3 part 1: §12 age gate (register + confirm-age + /start commencement gate, migration 0018); §9 assurance levels stamped on reports/credentials (L2 = recorded institution event, L3 flag-gated); §10 buyer access (buildVerifyView boundary, tri-status integrity, prohibited-class tests, share preview); §11 appeals (one free review, blinded packet, 4-outcome decide, review_grant reassessment, credential revocation, 7-bd monitoring); §14 proctoring minimization (phone-cam + gaze flags OFF, event drop, soft-disclosure copy); §18 bank/prompt read audits. Suites: 346 node / 335 pass / 0 fail / 11 DB-skips + 57 py; vite green |

## 1. Phase ledger

Rule: one phase per session/branch, commit per phase, update this table before ending a session.

| Phase | Charter sections | Status | Branch/commit | Evidence |
| --- | --- | --- | --- | --- |
| 0 — Baseline | §1, §28.0 (+ record git state, traceability matrix) | **COMPLETE 2026-08-04** | main @ ad4be54 (read-only; no code changed) | §0 baseline row; §2 matrix; suites 286/0-fail + 57 py; prod endpoints verified |
| 1 — P0 remediation | §4 (credentials, secret split), §5 (identity out of models) | **COMPLETE 2026-08-04** (code+docs; provider rotation = HA-001/002, incident stays OPEN) | main — baseline docs @ d2efbd9 + phase commit (see git log `feat(remediation-p1)`) | identityIsolation.js + avatar_system.v3 (+3 lang variants) + 9-test §5 suite; 295 tests/0 fail; incident record + rotation runbook + split design |
| 2 — Trust & reporting | §2, §3 (scope doc), §6, §7, §8, §17 (labels, "300 sessions" removal) | **COMPLETE 2026-08-04** (behavioral §8 delivery dark behind PRISM_STANDARDIZED_CORE until Phase 6 release — HA-021) | main — one phase commit (see git log `feat(remediation-p2)`) | JOB_FAMILY_SCOPE_v1.md + JOB_FAMILY_SCOPE constant; reportPolicy.js + per-surface §6 strip; anchor_probes.v1.json + anchorProbes.js; bundle schema v2; trustReporting (20 tests) + anchorProbes (10 tests) suites; ceiling extended to server copy; 328 node/0 fail + 57 py |
| 3 — Candidate & buyer governance | §9, §10, §11, §12, §13, §14, §15, §16, §18 (access controls) | **IN PROGRESS** — part 1 COMPLETE 2026-08-04 (§9, §10, §11, §12, §14, §18-access); part 2 REMAINING: §13 accommodations, §15 fairness-data framework, §16 retention | main — part-1 commit (see git log `feat(remediation-p3)`) | migration 0018; identityAssurance.js + integrityStatus.js + buildVerifyView; age gate 3-point enforcement; disputes decide/packet endpoints; 4 new governance flags (all OFF); governance.test.js (18 tests); 346 node/0 fail + 57 py |
| 4 — Platform resilience | §20, §21 (CI/CD, replicas), §4.2 remainder | NOT STARTED | — | — |
| 5 — Commercial readiness | §22, §23, §25, §18 (policy docs) | NOT STARTED | — | — |
| 6 — Verification & release | §26, §27 (verify), §21 (deploy + smoke), §29, §30 | NOT STARTED | — | — |

Cross-cutting (every phase): §19 freeze list, §24 human-action register upkeep, §27 audit
events, no fabrication, no secret exposure.

## 2. Requirement-to-code traceability matrix

Built 2026-08-04 from read-only inventory (Explore pass over server/, src/, calibration/,
docs/ + live prod checks). Paths relative to repo root.

| Charter § | Requirement | Existing asset | Gap | Phase | Planned tests | Status |
| --- | --- | --- | --- | --- | --- | --- |
| §2 | Pilot positioning, visible pilot notice, "not sole basis" policy | PILOT_NOTICE + NOT_SOLE_BASIS_POLICY in sharedConstants; rendered in Footer (all marketing pages), ScoreReport (PDF-captured), Verify, both report emails; policy in scope doc | None | 2 | trustReporting §2 presence tests | **DONE** |
| §3 | Job-family scope doc + scenario mapping | docs/JOB_FAMILY_SCOPE_v1.md + JOB_FAMILY_SCOPE governed constant (2 families, 8-scenario mapping, sparing-advanced marks, no weights) | None — public copy ≤ scope verified via ceiling | 2 | doc-exists + mapping-vs-bank + no-weights tests | **DONE** |
| §4.1 | Credential rotation + incident record | Secrets in /studai/prism/aws-prod/runtime (35 keys); exposed Razorpay pair CONFIRMED live in prod config; SendPulse pw in secret | DONE (agent side): incident record INC-2026-08-04-01 + rotation runbook. OPEN: provider-console rotation (HA-001/2) + provider log review (HA-018) | 1 | Post-rotation live verification | PREPARED — human-blocked |
| §4.2 | Split runtime secret by function, least-privilege IRSA | Single secret; IRSA role studai-prod-prism-runtime (secretsmanager+bedrock+kms+polly) | Design frozen (SECRET-SPLIT-DESIGN.md, 8 secrets + loader contract + rotation SOPs); implementation in Phase 4 | 1 (design) / 4 (complete) | Secret-loading tests (Phase 4) | DESIGN DONE |
| §5 | No candidate identity in model payloads | sanitizeCandidateName + buildCandidateLine → CANDIDATE_LINE in avatar_system.v2.md; judge transcript includes avatar lines VERBATIM (name reaches judge); micro-rater clean (candidateText only); credential bundle pseudonymous by construction | DONE: lib/identityIsolation.js ({{candidate}} token, post-generation substitution, scrub, legacy-history tokenization); avatar_system.v3 + 3 lang variants; buildJudgeTranscript scrubs judge/dual-scorer/rater/director payloads; /speech accepts rendered lines (Polly exception); activePromptVersions + VARIANT_BASES bumped. Residual: /calibrate entry-estimator sample is pre-name free-text (documented, tested handler references no identity) | 1 | server/test/identityIsolation.test.js (9 tests: payloads, substitution, scrubbing, source-scan wiring, anchor invariance) | **DONE** |
| §6 | Composite hidden on new external surfaces | lib/reportPolicy.js: finalizeReportForIssuance moves composite → report.composite (internal research namespace, incl. percentile + CI); toExternalReport (candidate/buyer/verify/email) + toOperationalReport (ALL admin ops views, legacy included); bundle v2 composite-free; mailer composite-free; roster/sessions/users/disputes/reports admin routes stripped; listReports projection + filters composite-free; research access = pilot incident (psychometrics:read, composite_accessed audit). Legacy blobs render as issued (structural detection) | Deploy (Phase 6) | 2 | trustReporting per-surface + legacy-immutability tests | **DONE (code)** |
| §7.1 | `Collaboration` → `Collaborative Behaviour` | DIMENSION_LABELS + DIMENSION_PUBLIC_DEFINITIONS (charter-verbatim definition); client pages import or match; content.json prose updated | None | 2 | Label + definition + no-hardcode tests | **DONE** |
| §7.2 | AI & Digital Fluency requires direct probe | UNCONDITIONAL gate at /evaluate: AIDF scored only with anchor probe + response ≥ word floor, else null + `Insufficient evidence` (first-class in ScoreReport/Verify); corrections cannot fabricate (sanitizeCorrectionScores nullDimensions) | Deploy (Phase 6) | 2 | anchorProbes §7.2 tests + trustReporting correction tests | **DONE (code)** |
| §7.3 | CT/PS distinction marked provisional | Scope doc §5 + ValidityStudy.jsx copy | None | 2 | Doc content test | **DONE** |
| §7.4 | Terminology downgrades + claims ceiling | mailer rewritten (no "certified", no composite); "AI panel consistency" + "AI panel variation interval" across measurement.jsx/ScoreReport/Verify/story/research pages; ceiling now scans server/lib/mailer.js + bans: verified skills, independently verified credential, (high\|moderate\|low\|score) reliability/reliability label, confidence band, 300 sessions | None | 2 | claimsCeiling extension (live) | **DONE** |
| §8 | Standardized core: anchor probes, evidence floors, adaptivity after floor | server/prompts/anchor_probes.v1.json (5 versioned probes, fixed schedule exch 1–5, thresholds) + engine/anchorProbes.js (verbatim server-side append — avatar-invariant by construction); /message delivery + anchor_probe_presented audit + fixed/adaptive turn marking; /evaluate evidence_sufficiency audit; flag PRISM_STANDARDIZED_CORE registered, DEFAULT OFF (HA-021 human flip at release) | Human flag flip (HA-021) + deploy | 2 | anchorProbes suite (structural + runtime invariance, determinism, sufficiency) | **DONE (code, dark)** |
| §9 | Identity-assurance levels (3) | lib/identityAssurance.js: L1 default; L2 ONLY via recorded institution_verifications event (migration 0018; admin endpoint on invites plane; invite alone ≠ identity); L3 = verified record + PRISM_IDENTITY_L3 (OFF, HA-007). Stamped on every new report (identity_assurance_stamped audit) + credential bundle; explained on report + verify surfaces (ASSURANCE_LEVELS) | Deploy (Phase 6); L3 activation = HA-007 | 3 | governance.test.js §9 tests | **DONE (code)** |
| §10 | Buyer access model + share-token preview | buildVerifyView = THE serving boundary (exported, tested): integrity tri-status only, assurance stated, full disclosure adds ONLY evidence+judgeVotes; prohibited-class regex test over both views; transcript shareable NOWHERE; preview = candidate opens own verify link ("Preview exactly what a recipient will see" on share card); raw integrityEvents stripped for legacy v1 bundles too (serving surface, artifact untouched) | Deploy (Phase 6) | 3 | §10 authorization tests per prohibited class (live) | **DONE (code)** |
| §11 | Appeals/supersession policy | One free review (idempotent while open; 409 REVIEW_ALREADY_USED after resolution); blinded review packet endpoint (identity-free, audited); 4-outcome decide endpoint (upheld/invalidated_reassessment/superseded/second_review) — invalidation mints mode='review_grant' REAL entitlement + revokes credential (link-holders see the change); candidate-readable resolution on GET /dispute; 7-business-day monitoring (businessDaysSince + overdue badges, "not a guaranteed legal SLA") | Deploy (Phase 6) | 3 | §11 governance tests + DB-plane flows in CI | **DONE (code)** |
| §12 | 18+ age gate | AGE_DECLARATION_VERSION 'age-18plus-v1' (no DOB collected): register REQUIRES explicit ageConfirmed (400 otherwise); /confirm-age for pre-gate accounts (write-once); /start hard commencement gate (403 AGE_CONFIRMATION_REQUIRED + age_gate audit rows) covering paid/invite/coupon/review_grant; PRISM_UNDER18_PATH registered OFF (HA-005/006); UI: register checkbox + Briefing confirm + invite-page + admin-console notices | Deploy (Phase 6) | 3 | governance.test.js: register/confirm/commencement-per-mode/flag tests | **DONE (code)** |
| §13 | Accommodations + alternate administration | NOT FOUND | Request flow, admin review, text-only/no-camera modes, disclosure logic, privacy from buyers | 3 | Alternate-admin + leak-prevention tests | TODO |
| §14 | Proctoring minimization defaults | PRISM_PROCTOR_PHONE_CAM + PRISM_PROCTOR_GAZE registered, DEFAULT OFF (HA-005/020): link-phone step exists only when enabled; looking_away accepted-and-dropped server-side + suppressed client-side while dark; Briefing RULES copy = soft disclosure ("recorded as integrity signals — never change your scores"); INTEGRITY_SCORING_NOTE on report + verify | Deploy (Phase 6); high-integrity activation = human governance | 3 | §14 default-state + drop tests (live) | **DONE (code)** |
| §15 | Fairness-research framework, collection gated | No demographics table/collection (track4 test asserts nothing writes candidate_demographics); DIF jobs exist in calibration/ | Storage separation, consent split, suppression, UNDERPOWERED labelling, erasure interplay — capability stays OFF (HA-005/012) | 3 | No-leak + gate tests | TODO |
| §16 | Retention: registry, jobs, holds, overrides | data_retention_rules (0016) seeded retention_days=NULL; privacyPlanner erasure cascade works; NO scheduled enforcement | Provisional defaults (labelled pending counsel), scheduler, dry-run receipts, legal hold, contract overrides, alternate-store deletion proof | 3 | Retention/erasure interaction + legal-hold tests | TODO |
| §17 | Science-programme support + honest labels | Studies registry (6 preregistered), rater workbench + kappa gate, flip-check 9 flags NO-GO, tech manual honest-PENDING; "300 sessions" ABSENT from external material (verified) + permanently banned in ceiling; construct definitions published (DIMENSION_PUBLIC_DEFINITIONS) | Rater manual draft, power-analysis framework, report templates → Phase 5 | 2 (labels **DONE**) / 5 (docs) | Copy sweep test (live) | LABELS DONE |
| §18 | Ecosystem separation | Admin RBAC (13 roles) restricts bank/rubrics/calibration; Phase 3: item-bank reads (item_bank_accessed) + prompt-content reads (prompt_content_accessed) now write admin_audit_events | Separation policy doc → Phase 5 | 3 (controls **DONE**) / 5 (policy) | §18 audit source tests (live) | CONTROLS DONE |
| §19 | Freeze list | All frozen features flag-off (velocity 404 live-verified; catalogue in flagRegistry.js) | None — keep dark | standing | Dark-flag sweep (exists) | HOLDING |
| §20 | PG system-of-record migration | storePg.js twins ALL store methods; contract test storePg.db.test.js; RDS PG 17 live (telemetry+admin planes already PG); JSON store on EFS = candidate/session/report data; flip runbook referenced in memory but NOT FOUND as doc | Inventory, rehearsal, prod backup, reversible cutover, reconciliation, ≥2 replicas + RollingUpdate after | 4 | Migration reconciliation + multi-replica readiness | TODO |
| §21 | Deployment hardening + post-deploy verification | build-image.yml (build-only) + manual kubectl set image; deploy-aws.yml PROHIBITED (ECS double-writer); CFN stack studai-prism-prod owns EFS/RDS-ingress (DO NOT DELETE) | Environment approval, migration gates, health verification, immutable release records, rollback docs | 4 | Pipeline gate checks | TODO |
| §22 | B2B pilot packaging | invites.js: seats 1–100, windows, coupon codes, idempotent redemption, roster; NO cohort plan/pricing metadata, review allowance, or completion accounting | Cohort plan metadata, seat/completion/review accounting, quote+terms templates, renewal fields, admin visibility | 5 | Packaging logic tests | TODO |
| §23 | Contribution-margin dashboard | NOT FOUND — zero runtime cost instrumentation (FinOps docs are static analysis only) | Per-call cost capture → per-assessment rollup, unknowns-as-unknown, finance exports, admin dashboard | 5 | Margin computation tests | TODO |
| §24 | Human-action register | HUMAN_ACTION_REGISTER.md (HA-001…020) | Maintain per session | standing | — | LIVE |
| §25 | Documentation set | docs/remediation/ established; studies protocols + admin plan exist | ~24 governed docs per §25, drafts labelled | 2–5 | Doc presence checks | TODO |
| §26 | Test & quality gates | Baseline: 286 node (0 fail, 11 DB-skips) + 57 py; CI ci.yml runs both + fingerprint | New invariant suites per phase; scans (dep/container/secret); accessibility; E2E | all | — | BASELINE SET |
| §27 | Audit coverage | telemetry.js auditLog() → audit_log (payload col); adminAudit() → admin_audit_events (immutable) | New event types per new decision class (probes, sufficiency, assurance, retention, etc.) | all | Audit-event presence tests | TODO |

## 3. Decisions and deviations log

Format: date · decision · reason · charter § affected · reversibility.

| Date | Decision | Reason | § | Reversible |
| --- | --- | --- | --- | --- |
| 2026-08-04 | Charter stored verbatim as frozen doc; §16 retention table reformatted to markdown table (content unchanged) | Source transmission lost table formatting | §16 | Yes |
| 2026-08-04 | Discovery layer (skill/prompts/agent) lives at workspace root `.github/`; governed docs live in `studai-prism/docs/remediation/` (version-controlled) | Workspace folder root is `PRISM/`, git repo root is `studai-prism/` — VS Code only discovers customizations at workspace root | §1 | Yes |
| 2026-08-04 | §18 split: technical access controls → Phase 3; separation policy doc → Phase 5 | Charter §28 does not assign §18 explicitly | §18, §28 | Yes |
| 2026-08-04 | §3 job-family scope document assigned to Phase 2 (with positioning copy), not Phase 5 | Public copy changes in Phase 2 must not exceed the scope doc, so the doc must exist first | §3, §28 | Yes |
| 2026-08-04 | Phase 0 baseline run with 11 DB-gated server tests skipped (no local PG) | Local environment has no DB; suites are green in CI and prod-verified; DB suites will run in Phase 4 rehearsal environment | §26 | Yes |
| 2026-08-04 | Foundation docs (docs/remediation/, product reference, action plan, updated copilot-instructions) remain uncommitted during Phase 0 | Phase 0 is read-only for product code; these are the programme's own artifacts — commit them at Phase 1 start as the remediation baseline commit | §1 | Yes |
| 2026-08-04 | Prod state verified from public edge only (health, payment config, TTS, dark sweeps) — no kubectl/SSM session opened | Sufficient for baseline; image tag corroborated by repo memory (ad4be54df1ad); full cluster verification deferred to Phase 4/6 | §28.0 | Yes |
| 2026-08-04 | §5 neutral token chosen as literal `{{candidate}}` (lowercase) | renderPrompt only substitutes `{{UPPER_CASE}}` placeholders, so the token survives template rendering untouched; matches the charter's own example | §5 | Yes |
| 2026-08-04 | Conversation-model context re-tokenized on every /message call (tokenizeForModel) | Covers legacy in-flight sessions whose pre-v3 avatar lines carry real names, and names candidates type about themselves | §5 | Yes |
| 2026-08-04 | /calibrate entry-estimator input NOT name-scrubbed | The writing sample is collected before any name exists in the session; there is nothing to scrub against. Source-scan test pins that the handler references no identity fields | §5 | Yes |
| 2026-08-04 | /speech accepts both tokenized (stored) and rendered (displayed) line forms | Client displays rendered text; history stores tokens; Polly receiving the rendered sentence is the charter's explicit narrow exception | §5 | Yes |
| 2026-08-04 | Phase 1 split into two commits: baseline-docs commit (d2efbd9) + one phase implementation commit | Phase 0 decision — programme scaffolding is not phase code; phases themselves remain one-commit | §1, §28 | Yes |
| 2026-08-04 | §6 composite detection is STRUCTURAL: new reports carry `report.composite` (internal) and no `scores.overall`; legacy blobs keep `scores.overall` and render as issued | Every future surface fails safe: a legacy report is byte-identical through the external boundary, a new report physically lacks the composite | §6 | Yes |
| 2026-08-04 | Composite-derived percentile + composite-level CI also moved internal on new reports | A percentile/interval over a hidden composite is a monotone transform of it — and a universal ranking is an explicit §2 pilot non-goal. Per-dimension bands remain | §2, §6 | Yes |
| 2026-08-04 | Ordinary admin views strip the composite for ALL report shapes (legacy included); research access = pilot incident file (psychometrics:read) with `composite_accessed` audit rows | "As issued" protects issued artifacts, not live operational views; charter §6 names ordinary-admin views explicitly | §6 | Yes |
| 2026-08-04 | §7.2 AIDF gate applied UNCONDITIONALLY at scoring time (not flag-gated): without the direct probe, AIDF = Insufficient evidence | Charter precedence over the historical v1-reproducibility rule; the change is claim-REDUCING (suppresses an unsupported score), the opposite of what ONE LAW guards against | §7.2 | Yes |
| 2026-08-04 | §8 anchor DELIVERY behind PRISM_STANDARDIZED_CORE, default OFF; humans flip at Phase 6 release (HA-021) | Changing the live conversation experience is a release decision; ONE LAW: the agent flips no flags | §8, §28 | Yes |
| 2026-08-04 | Anchor probes appended VERBATIM server-side to the generated avatar turn (never LLM-delivered); schedule = exchanges 1–5, one probe per dimension, v1 floor = 1 opportunity + 5-word response | Deterministic wording is the only way to guarantee the §8 identical-wording invariant; LLM paraphrase risk is structural | §8 | Yes (new bank version) |
| 2026-08-04 | §8 "fixed scenario opening stimulus" interpreted as the frozen scenario brief (context + yourRole, calibration-frozen bank) — the generated avatar greeting remains non-scored colour | The brief is already fixed + versioned; the greeting carries no anchor and no scoring weight | §8 | Yes |
| 2026-08-04 | Corrections can never assign a number to an Insufficient-evidence dimension (sanitizeCorrectionScores nullDimensions); internal composite renormalizes weights over scored dims | "Do not fabricate evidence merely to complete all five dimensions" applies to supersessions too | §7.2, §11 | Yes |
| 2026-08-04 | ALL new credential issuance uses composite-free bundle v2 — even when re-credentialling a legacy report; issued v1 bundles verify unchanged forever | §6 governs new issuance; immutability governs already-signed artifacts | §6 | Yes |
| 2026-08-04 | Profile.jsx client-side percentile approximation (overall × 0.95) REMOVED | It fabricated a rank — violated audit C19 honesty and §6; found during the Phase 2 sweep | §6, C19 | Yes |
| 2026-08-04 | Phase 3 split at a whole-section boundary: part 1 = §9/§10/§11/§12/§14/§18-access; part 2 (next session) = §13/§15/§16 | Charter Phase 3 is too large for one session; the split follows the phase prompt's sub-boundary rule | §28 | Yes |
| 2026-08-04 | §12 enforcement points: registration (explicit ageConfirmed) + /confirm-age (pre-gate accounts, write-once) + /start commencement HARD gate. Entitlement purchase itself is not separately gated — every entitlement mode still cannot commence without the declaration (test-proven per mode) | Commencement is the charter's blocking requirement; real candidates are always signed in (payment/invite flows require auth); gating 3 points covers registration/invite/coupon/payment/existing-account flows without triple client UX | §12 | Yes |
| 2026-08-04 | Anonymous /start (no account) stays possible ONLY on dev/trial paths and writes an age_gate audit row noting it | Dev/dummy sessions are synthetic by construction; production real candidates always carry accounts | §12 | Yes |
| 2026-08-04 | No date of birth collected for age gating; VerifyIdentity's optional dob field (ID-match aid, L3 machinery, gated) left unchanged | Charter: no exact DOB unless necessary | §12 | Yes |
| 2026-08-04 | §9: with PRISM_IDENTITY_L3 off, a session with a 'verified' OCR record reports L1 (or L2 via institution event) — never a downgraded 'L3-ish' claim | No claim that Aadhaar/OCR verification is approved until counsel signs off (HA-007) | §9 | Yes |
| 2026-08-04 | institution_verifications stores NO user/account id — session-keyed only (+ invite id, authority, method, admin) | Data minimization; also keeps the track0 PII schema gate intact | §9 | Yes |
| 2026-08-04 | §10 candidate preview = the candidate opening their own /verify link (same URL a recipient gets); no separate preview endpoint | The verify page IS byte-identical to what a recipient sees at each disclosure level — a separate endpoint would duplicate the boundary it must mirror | §10 | Yes |
| 2026-08-04 | Raw integrityEvents stripped from the verify VIEW for legacy v1 bundles too; the signed artifact is untouched | The view is a live serving surface, not the issued artifact; §10 prohibits raw integrity events to buyers with no legacy exception | §10 | Yes |
| 2026-08-04 | judgeVotes (AI model ids + levels) stay in the candidate-authorized full-disclosure view | Glass-box policy explicitly publishes AI evaluator provenance; no human evaluator identity exists in the system | §10 | Yes |
| 2026-08-04 | §11 invalidation notification mechanism = credential revocation (verify/share links show 'revoked' with reason); no recipient registry exists to push notices to | Share links are bearer URLs — revocation is the only channel every link-holder actually sees | §11 | Yes |
| 2026-08-04 | 'review_grant' added to REAL_ENTITLEMENT_MODES | A review-granted reassessment is a real candidate; synthetic-flagging it would corrupt calibration eligibility | §11 | Yes |
| 2026-08-04 | businessDaysSince uses Mon–Fri with no holiday calendar | A holiday-aware calendar would overstate precision; the target is monitoring-only, not an SLA | §11 | Yes |
| 2026-08-04 | §14: consent copy (CONSENT_ITEMS) NOT reworded despite gaze/phone-cam now defaulting off | Consent canon is byte-identical test-enforced pending legal review (HA-003); the items disclose what MAY run ("If I link my phone…") — over-disclosure is safe, silent under-disclosure is not | §14 | Yes |
| 2026-08-04 | Briefing RULES copy softened to disclosure tone ("recorded as integrity signals — they never change your scores") | §14: aggressive enforcement language → soft disclosure + telemetry | §14 | Yes |

## 4. Known conflicts with prior product laws (Phase 0 resolution status)

- ✅ Scenario freeze vs charter §3: CONSISTENT. Charter's 8 names map onto the frozen
  bank (`group-project, fest-budget, clinic-triage, delayed-launch, supplier-failure,
  brand-crisis, ethical-ai, team-restructure`); charter "Clinic Backlog" = clinic-triage,
  "Supplier Crisis" = supplier-failure. Advanced pair (ethical-ai, team-restructure)
  used sparingly per §3.
- ✅ §7.1 rename path confirmed: labels live ONLY in `server/lib/sharedConstants.js`
  (DIMENSION_LABELS) — change there + test updates; legacy reports are frozen JSONB
  blobs in report_versions (0012), so old artifacts keep old labels automatically.
- ✅ §6 vs legacy immutability: reports stored as frozen blobs, NOT re-rendered — hiding
  composite on new surfaces cannot corrupt history. Credential evidence-bundle schema
  v1 is frozen and contains scores.overall → new issuance needs a v2 bundle schema
  (schema doc docs/evidence-bundle-schema-v1.json), old credentials verify unchanged.
- ✅ Prompt law reconfirmed: §5 work = avatar_system.v3 (+3 @extends lang variants) +
  renderPrompt + activePromptVersions + track4 VARIANT_BASES. Never in-place.
- ✅ RESOLVED (Phase 2): `server/lib/mailer.js` "certified report" + `overall/100`
  violations fixed — mailer rewritten composite-free with §2 notices, and the claims
  ceiling now scans server-side candidate copy permanently (SERVER_PUBLIC_COPY).
- ✅ RESOLVED (Phase 2): roster discrepancy confirmed — commit 1e81e8f HAD added
  `overall` to the invite roster API/UI; both removed (reportReady only), and every
  other ordinary admin surface (sessions, users, disputes, reports list/detail)
  was swept in the same pass.
- ⚠ Discrepancy: PG flip runbook cited in remediation docs (2026-07-04) but not found
  as a repo file. Phase 4 must (re)write it as a governed doc rather than rely on memory.

## 5. Unresolved risks register

| Risk | Severity | Owner | Mitigation | Blocking |
| --- | --- | --- | --- | --- |
| Razorpay + SendPulse credentials still exposed/unrotated — exposed Razorpay keyId CONFIRMED serving live payments (prod /api/payment/config, 2026-08-04). Runbook + incident record PREPARED; awaiting provider consoles | P0 | Operator (HA-001/HA-002) | INC-2026-08-04-01 + RUNBOOK-credential-rotation.md | Phase 6 sign-off |
| Candidate identity in model payloads — RESOLVED IN CODE 2026-08-04 (identityIsolation.js, v3 prompts, scrubbed scoring payloads; 9-test regression suite). NOT YET DEPLOYED — prod still runs ad4be54 with the leak until Phase 6 release | P0 (deploy pending) | Agent (Phase 6 deploy) | Ship with next release; post-deploy Bedrock payload verification in §21 checklist | Phase 6 sign-off |
| "certified report" + composite in live report emails — RESOLVED IN CODE 2026-08-04 (mailer rewritten, ceiling extended to server copy). NOT DEPLOYED — prod emails still violate until Phase 6 release | P1 (deploy pending) | Agent (Phase 6 deploy) | Ship with next release | Phase 6 sign-off |
| Composite still exposed in PROD on all surfaces until the Phase 2 code deploys | P1 (deploy pending) | Agent (Phase 6 deploy) | §6 code complete + tested; deploy at Phase 6 | Phase 6 sign-off |
| Standardized anchor probes built but DARK (PRISM_STANDARDIZED_CORE off): sessions remain non-comparable in the charter's sense, and AIDF becomes Insufficient-evidence-only at deploy | P1 | Human (HA-021) + agent (Phase 6) | Flag flip at release after operator review of candidate-facing impact | Phase 6 sign-off |
| No age gate, no accommodations path (DPDP exposure for student cohorts) — age gate RESOLVED IN CODE 2026-08-04 (deploy pending); accommodations (§13) still open → Phase 3 part 2 | P1 | Agent (Phase 3 part 2) + counsel (HA-005) | §13 next session; age gate ships at Phase 6 | Phase 3 exit |
| No retention enforcement (data_retention_rules all NULL; manual-only) — §16 deferred to Phase 3 part 2 | P2 | Agent (Phase 3 part 2) | §16 registry + scheduler next session | Phase 3 exit |
| Single-writer JSON/EFS store remains system of record; 1 replica Recreate | P2 | Agent (Phase 4) | §20 migration | Phase 4 exit |
| Zero cost instrumentation — margin unknown | P2 | Agent (Phase 5) | §23 dashboard | Phase 5 exit |

## 6. Session handoff protocol

1. Read this file + the [charter](./MASTER_PROMPT_2026-08-04.md) §§ for the active phase.
2. Read [HUMAN_ACTION_REGISTER.md](./HUMAN_ACTION_REGISTER.md) for blockers.
3. `git -C studai-prism status` — never overwrite uncommitted human work.
4. Work ONE phase only. Commit per phase.
5. Before ending: update §0, §1, §3, §5 here; update the human-action register; note
   evidence (test counts, commits, live-verification URLs/outputs).
