# PRISM Master Remediation — Programme State

**Living document.** This is the single source of truth for programme progress, decisions
and deviations. Every remediation session MUST read this file first and update it before
ending. The charter itself ([MASTER_PROMPT_2026-08-04.md](./MASTER_PROMPT_2026-08-04.md))
is frozen — record all interpretation and deviation here, never there.

## 0. Programme status

| Field | Value |
| --- | --- |
| Charter | MASTER-2026-08-04 (frozen) |
| Programme status | PHASE 1 COMPLETE — ready for Phase 2 (P0 incident OPEN pending provider consoles: HA-001/HA-002) |
| Starting commit | `ad4be54df1ad9d39e4c279834f21138b4c6c9d0c` (main = origin/main) |
| Uncommitted at start | Foundation docs only: `.github/copilot-instructions.md` (M), `docs/PRISM_Product_Reference.md`, `docs/PRISM_Review_Response_Action_Plan.md`, `docs/remediation/` (untracked). No product code at risk. Worktrees wt-phase1/2/3 detached (historical). |
| Baseline tests | Server: 286 tests / 275 pass / 0 fail / 11 skipped (DB-gated, no local DB). Python: 57 passed (`py -3.12 -m pytest`, 1.58s). 48 server test files; runner `node --test`. |
| Production baseline | main @ ad4be54, image ad4be54df1ad, EKS StudAI-Prod-EKS-Cluster ns `prism`. Live-verified 2026-08-04: health `{status:ok}`; payments LIVE (₹499 INR, keyId rzp_live_TItHtKm7Qs0CPQ, dummyMode=false, skipVerification=false); TTS amazon-polly enabled; `/api/admin` 401 (console on); velocity 404 (dark) |
| Current phase | Phase 1 done → next: Phase 2 (`/prism-phase2-trust-reporting`) |
| Last session | 2026-08-04 — Phase 1 executed: §5 identity isolation shipped + tested; §4.1 incident record/runbook prepared (rotation itself = HA-001/002); §4.2 split design frozen for Phase 4 |

## 1. Phase ledger

Rule: one phase per session/branch, commit per phase, update this table before ending a session.

| Phase | Charter sections | Status | Branch/commit | Evidence |
| --- | --- | --- | --- | --- |
| 0 — Baseline | §1, §28.0 (+ record git state, traceability matrix) | **COMPLETE 2026-08-04** | main @ ad4be54 (read-only; no code changed) | §0 baseline row; §2 matrix; suites 286/0-fail + 57 py; prod endpoints verified |
| 1 — P0 remediation | §4 (credentials, secret split), §5 (identity out of models) | **COMPLETE 2026-08-04** (code+docs; provider rotation = HA-001/002, incident stays OPEN) | main — baseline docs @ d2efbd9 + phase commit (see git log `feat(remediation-p1)`) | identityIsolation.js + avatar_system.v3 (+3 lang variants) + 9-test §5 suite; 295 tests/0 fail; incident record + rotation runbook + split design |
| 1 — P0 remediation | §4 (credentials, secret split), §5 (identity out of models) | NOT STARTED | — | — |
| 2 — Trust & reporting | §2, §3 (scope doc), §6, §7, §8, §17 (labels, "300 sessions" removal) | NOT STARTED | — | — |
| 3 — Candidate & buyer governance | §9, §10, §11, §12, §13, §14, §15, §16, §18 (access controls) | NOT STARTED | — | — |
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
| §2 | Pilot positioning, visible pilot notice, "not sole basis" policy | Nothing — no pilot/sole-basis copy anywhere in src/pages or content.json | Notice + policy on marketing/report/verify/institutional surfaces | 2 | Copy-presence test; claimsCeiling extension | TODO |
| §3 | Job-family scope doc + scenario mapping | 8 active scenarios in routes/assessment.js (frozen bank; items=96 in prod incl. 48 retired) | Versioned scope doc; governed mapping; copy ceiling | 2 | Doc-exists + copy-scope test | TODO |
| §4.1 | Credential rotation + incident record | Secrets in /studai/prism/aws-prod/runtime (35 keys); exposed Razorpay pair CONFIRMED live in prod config; SendPulse pw in secret | DONE (agent side): incident record INC-2026-08-04-01 + rotation runbook. OPEN: provider-console rotation (HA-001/2) + provider log review (HA-018) | 1 | Post-rotation live verification | PREPARED — human-blocked |
| §4.2 | Split runtime secret by function, least-privilege IRSA | Single secret; IRSA role studai-prod-prism-runtime (secretsmanager+bedrock+kms+polly) | Design frozen (SECRET-SPLIT-DESIGN.md, 8 secrets + loader contract + rotation SOPs); implementation in Phase 4 | 1 (design) / 4 (complete) | Secret-loading tests (Phase 4) | DESIGN DONE |
| §5 | No candidate identity in model payloads | sanitizeCandidateName + buildCandidateLine → CANDIDATE_LINE in avatar_system.v2.md; judge transcript includes avatar lines VERBATIM (name reaches judge); micro-rater clean (candidateText only); credential bundle pseudonymous by construction | DONE: lib/identityIsolation.js ({{candidate}} token, post-generation substitution, scrub, legacy-history tokenization); avatar_system.v3 + 3 lang variants; buildJudgeTranscript scrubs judge/dual-scorer/rater/director payloads; /speech accepts rendered lines (Polly exception); activePromptVersions + VARIANT_BASES bumped. Residual: /calibrate entry-estimator sample is pre-name free-text (documented, tested handler references no identity) | 1 | server/test/identityIsolation.test.js (9 tests: payloads, substitution, scrubbing, source-scan wiring, anchor invariance) | **DONE** |
| §6 | Composite hidden on new external surfaces | Exposed: /evaluate + /report/:sid responses, ScoreReport.jsx headline, mailer.js subject+body ("${overall}/100"), credential bundle scores.overall, Verify.jsx, admin invite roster (commit 1e81e8f "roster shows assessment outcome") | Profile-first rendering; API/PDF/email/verify/roster/admin scrub; research-role-only internal access; legacy immutable (report_versions blobs — safe) | 2 | Per-surface leak tests + legacy immutability | TODO |
| §7.1 | `Collaboration` → `Collaborative Behaviour` | sharedConstants.js DIMENSION_LABELS (5 dims; weights 25/25/20/20/10) | Label change via sharedConstants + public definition | 2 | Label-consistency test | TODO |
| §7.2 | AI & Digital Fluency requires direct probe | Scored today from ordinary conversation (judge+micro-rater, weight 0.1); no direct probe exists | Versioned direct probe; evidence threshold; `Insufficient evidence` rendering | 2 | Direct-probe requirement + insufficient-evidence tests | TODO |
| §7.3 | CT/PS distinction marked provisional | dimension_rubric.v1.json separates them | Docs/interpretation-guide labelling only | 2 | Doc content test (optional) | TODO |
| §7.4 | Terminology downgrades + claims ceiling | claimsCeiling.test.js scans src/**+content.json ONLY; mailer.js says "certified report" (LIVE VIOLATION — server copy unscanned) | Sweep incl. server-side copy; ceiling extended to server/lib templates; new banned terms ("verified skills", judge "reliability", bare "confidence band", "300 sessions") | 2 | claimsCeiling extension | TODO |
| §8 | Standardized core: anchor probes, evidence floors, adaptivity after floor | Fixed opening stimulus exists; NO anchor-probe bank — probes procedural (engine/probeSelector.js + executiveConfig.js, mostly behind OFF flag; v1 path = free avatar conversation) | Versioned anchor probes, per-dim min evidence opportunities, sufficiency thresholds, fixed-vs-adaptive turn marking, probe-presented audit rows | 2 | Structural + runtime delivery tests; avatar-invariance | TODO |
| §9 | Identity-assurance levels (3) | Binary verification only (VerifyIdentity.jsx OCR in-browser; recordVerification); no assurance concept on reports/credentials; PRISM_SKIP_VERIFICATION flag | Level model, storage, rendering on new reports/credentials + verify pages; L3 feature-gated (HA-007) | 3 | Assurance-rendering tests | TODO |
| §10 | Buyer access model + share-token preview | Share token = UUID shown once, sha256 stored; default view = scores(+overall!), full view += evidence+judgeVotes; NO preview; transcript not shareable today | Access-class redesign; candidate preview; separate transcript authorization; integrity tri-status; prohibited-class authz tests | 3 | Per-prohibited-class access tests | TODO |
| §11 | Appeals/supersession policy | 9-state admin_dispute_workflow (0012), report_versions append-only, candidate "Request human review" button → /dispute; supersession dual-approved | One-free-review entitlement, blinded reviewer packet, 7-business-day monitor, shared-report invalidation notices, token revocation | 3 | Lineage + invalidation tests | TODO |
| §12 | 18+ age gate | NOT FOUND (Terms copy only) | Explicit versioned+audited confirmation blocking commencement, all entitlement routes; under-18 path gated off | 3 | Gate tests: register/invite/coupon/payment/existing | TODO |
| §13 | Accommodations + alternate administration | NOT FOUND | Request flow, admin review, text-only/no-camera modes, disclosure logic, privacy from buyers | 3 | Alternate-admin + leak-prevention tests | TODO |
| §14 | Proctoring minimization defaults | All proctoring consent-gated but ON by default: fullscreen enforcement + keyboard lock, tab/screenshot detection, face-api, phone relay (Assessment.jsx, Briefing.jsx CONSENT_ITEMS) | Phone-cam + gaze default OFF; fullscreen → soft disclosure; report copy re integrity≠scores; high-integrity configs gated | 3 | Default-state + config tests | TODO |
| §15 | Fairness-research framework, collection gated | No demographics table/collection (track4 test asserts nothing writes candidate_demographics); DIF jobs exist in calibration/ | Storage separation, consent split, suppression, UNDERPOWERED labelling, erasure interplay — capability stays OFF (HA-005/012) | 3 | No-leak + gate tests | TODO |
| §16 | Retention: registry, jobs, holds, overrides | data_retention_rules (0016) seeded retention_days=NULL; privacyPlanner erasure cascade works; NO scheduled enforcement | Provisional defaults (labelled pending counsel), scheduler, dry-run receipts, legal hold, contract overrides, alternate-store deletion proof | 3 | Retention/erasure interaction + legal-hold tests | TODO |
| §17 | Science-programme support + honest labels | Studies registry (6 preregistered), rater workbench + kappa gate, flip-check 9 flags NO-GO, tech manual honest-PENDING; pilot dashboard uses 300-session floor | Rater manual draft, power-analysis framework, "300 sessions" removed from external material, report templates | 2 (labels) / 5 (docs) | Copy sweep test | TODO |
| §18 | Ecosystem separation | Admin RBAC (13 roles) restricts bank/rubrics/calibration in console | Separation policy doc; verify + tighten item-bank/rubric access audit | 3 (controls) / 5 (policy) | Access-audit tests | TODO |
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
- ⚠ NEW (Phase 0 finding): `server/lib/mailer.js` report email says "certified report"
  and puts `overall/100` in subject+body — BOTH violate charter (§6, §7.4) and the
  spirit of the existing claims ceiling, which only scans `src/**` + content.json.
  Fix + extend ceiling to server-side copy in Phase 2.
- ⚠ Discrepancy: Explore found no overall score in invite roster, but commit 1e81e8f
  ("roster shows assessment outcome per redeemer") added `overall` to the roster API/UI
  per repo memory. Treat roster as an exposure surface in Phase 2; verify then.
- ⚠ Discrepancy: PG flip runbook cited in remediation docs (2026-07-04) but not found
  as a repo file. Phase 4 must (re)write it as a governed doc rather than rely on memory.

## 5. Unresolved risks register

| Risk | Severity | Owner | Mitigation | Blocking |
| --- | --- | --- | --- | --- |
| Razorpay + SendPulse credentials still exposed/unrotated — exposed Razorpay keyId CONFIRMED serving live payments (prod /api/payment/config, 2026-08-04). Runbook + incident record PREPARED; awaiting provider consoles | P0 | Operator (HA-001/HA-002) | INC-2026-08-04-01 + RUNBOOK-credential-rotation.md | Phase 6 sign-off |
| Candidate identity in model payloads — RESOLVED IN CODE 2026-08-04 (identityIsolation.js, v3 prompts, scrubbed scoring payloads; 9-test regression suite). NOT YET DEPLOYED — prod still runs ad4be54 with the leak until Phase 6 release | P0 (deploy pending) | Agent (Phase 6 deploy) | Ship with next release; post-deploy Bedrock payload verification in §21 checklist | Phase 6 sign-off |
| "certified report" wording + overall score in live report emails (server/lib/mailer.js — outside claims-ceiling scan) | P1 | Agent (Phase 2) | §7.4 sweep + ceiling extension to server copy | Phase 2 exit |
| No standardized anchor probes — sessions not comparable in the charter's sense; v1 path is fully adaptive | P1 | Agent (Phase 2) | §8 standardized core | Phase 2 exit |
| No age gate, no accommodations path (DPDP exposure for student cohorts) | P1 | Agent (Phase 3) + counsel (HA-005) | §12/§13 | Phase 3 exit |
| No retention enforcement (data_retention_rules all NULL; manual-only) | P2 | Agent (Phase 3) | §16 registry + scheduler | Phase 3 exit |
| Single-writer JSON/EFS store remains system of record; 1 replica Recreate | P2 | Agent (Phase 4) | §20 migration | Phase 4 exit |
| Zero cost instrumentation — margin unknown | P2 | Agent (Phase 5) | §23 dashboard | Phase 5 exit |

## 6. Session handoff protocol

1. Read this file + the [charter](./MASTER_PROMPT_2026-08-04.md) §§ for the active phase.
2. Read [HUMAN_ACTION_REGISTER.md](./HUMAN_ACTION_REGISTER.md) for blockers.
3. `git -C studai-prism status` — never overwrite uncommitted human work.
4. Work ONE phase only. Commit per phase.
5. Before ending: update §0, §1, §3, §5 here; update the human-action register; note
   evidence (test counts, commits, live-verification URLs/outputs).
