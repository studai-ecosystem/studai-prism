# Prism — Critical Product Flow Repair: Implementation Map

Original audit and subsequent execution checkpoints. The inherited tables are
historical snapshots, not current completion claims. Latest checkpoints below
take precedence. Runtime findings are based on traced code paths; comments
alone are not treated as proof.

Status key: `OPEN` · `PARTIAL` · `DONE` · `VERIFIED-ALREADY-CORRECT`

## Independent V3 presentation repairs - 2026-10-02

Implemented against the current server contract, without changing assessment
start, duration, stimulus, scoring, evidence generation, authorization or retention:

| Item | Result | Verification |
| --- | --- | --- |
| P9 empty workspace | DONE for V3 presentation | No-artifact conversation centered at max 896px; no workspace or pane switch |
| P10/P11 active layout | DONE for V3 presentation | 100dvh at every width; no body/document overflow; independent conversation/material scroll; fixed header and full-width docked composer |
| Mobile pane composer | DONE | Same composer node/draft stays mounted across panes; sending returns to the conversation through the unchanged message API |
| Countdown receipt reset | DONE for client presentation | Network receipt stored with timing snapshot; monotonic elapsed time, not cache `dataUpdatedAt` or device wall time |
| Timer display/warnings | DONE for existing contract | Zero-padded MM:SS, valid timestamps, existing warnings, deadline-zero send disable and retained unsubmitted draft tested |
| P25 repeated absence copy | DONE for V3 capability cards | One missing-evidence explanation; no null-level badge or repeated NO_EVIDENCE reason |
| Release flag consistency | IMPROVED | Workspace also requires Evidence Fail Closed per the existing human-action register; enabled production V3 requires PG store |

**P13/P14 remain OPEN:** the server still supplies its existing 35-minute limit;
no 30-minute/pre-intro-start administration contract was changed or simulated in
production. Intro-before-clock, server cutoff/grace separation, canonical routing,
ownership backfill, evaluator integration, persistent jobs/locks, report security,
erasure and full recovery still require their open work packets.

Gates: build PASS; frontend full suite 345 passed/0 failed; server 631 total,
607 passed/0 failed/24 DB skips; static audit PASS; scoped browser 84 passed/0
failed across Chromium/Firefox/WebKit/mobile Chromium. A load-sensitive Campus
test failed in the first frontend run, passed unchanged in isolation, then all
345 tests passed with bounded worker concurrency. No assertions were weakened.

Browser fixtures are labelled test-only. Active-player checks cover both pane
modes at 1440/1280/1024/768/430/390/360, plus a compact-height frame, keyboard,
finish-dialog focus trap, cache-update/reload clock stability and axe serious/
critical checks. Screenshots at 1440/390 were inspected. This is not a real
evaluator, database-concurrency, privacy/security or full student-journey proof.

## Approved V3-only plan checkpoint - 2026-10-02

The forward journey will be V3-only. Previously issued reports remain
discoverable, read-only and unchanged. The user confirmed mandatory domain-owner
review gates and a strict deadline with unscored recovery of unsent drafts.

The remaining programme is blocked at the contract gates, not production-ready:

- No reviewed ownership-claiming implementation or live backfill approval supplied.
- No approved formal-capability evaluator/opportunity implementation supplied.
  The formal scoring route still evaluates legacy dimensions; the strict
  production evidence call is only the unjudged artifact action writer.
- Pre-intro start and the shared 35-minute timing contract require an approved
  administration implementation, including existing active sessions/accommodations.
- New source-retention dependency: `storePg.saveReport()` removes session history,
  while V3 verifies quotes against that history. Do not silently change retention
  or fabricate citation provenance to bridge it.
- Timing receipt dependency: local message-cache updates change React Query
  `dataUpdatedAt`; it is currently reused as the server-clock receipt timestamp.
- Distributed locks/jobs must include engine side effects and the
  effect-before-receipt crash window; adding a Map replacement alone is insufficient.
- Backend access, erasure/source-retention and independent security review gates
  remain open. No new independent security findings were produced.

Read-only runtime audit and domain-owner handoff packets were prepared in the
session workspace. New validation: targeted server contract baseline 77 passed,
0 failed; existing V3 player/report baseline 30 passed, 0 failed. These are
synthetic/memory contract checks, not proof of the unfinished production pipeline.

No backend behavior, scientific policy, authorization, retention, production
data, flags, migration or deployment was changed at this checkpoint.

## Repair execution checkpoint - 2026-10-02

**The student journey is NOT repaired end-to-end. Release decision: NO-GO.**
The tables below are the inherited audit map, not a declaration that every
listed file was re-audited or every phase completed during this run.

Changes in this run:

- Returning-user `/app` landing already existed at `c645a73`; retained and
  regression-tested. Explicit `next` now takes priority over a stale stored
  assessment invitation, including already-authenticated navigation.
- AuthGuard preserves path, query and fragment. `/dashboard` and `/profile`
  now authenticate before redirecting to `/app/home` and
  `/app/settings#profile`.
- Signed-out personal shell links reach login even when the shell is dark.
  Authenticated dark personal links show an explicit unavailable state, an
  assessment-launcher link and support. They no longer silently redirect to
  marketing. This is recovery UI, NOT activation of the portal or a working
  dark-flag Profile implementation. Campus dark routes remain unchanged.
- Home reads the existing workspace-scoped assessments API using the existing
  query hook. It shows the latest three completed assessments, issued report
  links supplied by the API (including legacy URLs), completion dates and
  scope. History errors remain errors, never an empty-history fallback.
- Completed cards display report availability or under-review copy using
  existing contract fields. No processing/failed state is invented when the
  API does not provide one.
- `npm run audit:flow-flags` checks environment combinations without changing
  flags, printing secrets or claiming release approval.

Dependency checkpoint:

| Repair phase | Current status | Reason |
| --- | --- | --- |
| 1 runtime audit | PARTIAL | Entry/history/scenario/evidence contract traces verified; complete requested-file audit and security review not finished |
| 2 auth and shell entry | PARTIAL | Redirects and aliases tested; shell-off recovery explicit; actual portal/settings still require approved activation |
| 3 historical discovery | PARTIAL / BLOCKED | Owned history UI repaired; null/mismatched owner reconciliation and admin claiming not implemented |
| 4-12 dependent player/evidence/report/hardening | NOT COMPLETED | Ownership, measurement and security dependencies remain open; no new evaluator, timer contract, authorization or retention behavior introduced |
| 13 validation | PARTIAL | Local regression gates and scoped browser checks only; no full real-student journey proof |
| 14 rollout | NO-GO | Configuration checker and [runbook](./FLOW_REPAIR_READINESS.md) are preparation, not permission to enable production flags |

No ownership links or historical report data were written. No migration,
backfill, production flag flip, deployment, push or completed-phase commit
was performed. The security-review agent could not execute (tool failure);
the inherited security findings below are not a fresh successful audit.

---

## P0 — Auth & post-login routing

| # | Problem | Status | Evidence / root cause | Fix site |
|---|---|---|---|---|
| 1 | Login defaults to `/payment` | PARTIAL | `src/pages/Auth.jsx` now uses `next \|\| (isRegister ? '/payment' : '/app')` (commit `c645a73`). Still needs: entitlement-aware decision for registrations, and `next=` preservation proven by test. | `src/pages/Auth.jsx` |
| 2 | `PRISM_APP_SHELL_V3` dark ⇒ `/app/home` bounces to `/` | OPEN | `src/app/AppRouter.jsx` `/app` sits behind `FlagRoute PRISM_APP_SHELL_V3`; `server/domain/flags/index.js` `isEnabled` reads `process.env` only. No validation of inconsistent combinations. | `AppRouter.jsx`, flag registry, runbook |
| 3 | `/dashboard` does not exist | OPEN | `grep dashboard src/app/AppRouter.jsx` → **no match**. 404 → `*` → `/`. | `AppRouter.jsx` |
| 4 | `/profile` must reach authenticated Settings | PARTIAL | `AppRouter.jsx:327` `<Route path="/profile" element={<Navigate to="/app/settings#profile" replace />} />` — no auth guard, no `next=` capture; signed-out users bounce to `/`. | `AppRouter.jsx` |

## P0 — Returning-student history

| # | Problem | Status | Evidence / root cause | Fix site |
|---|---|---|---|---|
| 5 | Previous assessments not discoverable | PARTIAL | `/app/assessments` tabs exist (`assignmentService.js:137` `tab` = UPCOMING/ACTIVE/COMPLETED). `completedAt` **is** present on the card (`:161`) but `AssessmentAssignmentCard.jsx` renders only `dueAt`/`opensAt`. UI-only gap. | `AssessmentAssignmentCard.jsx` |
| 6 | Legacy sessions with `userId = null` | OPEN | `server/domain/student/sessionDirectory.js`: `const owner = session?.userId \|\| report?.userId \|\| null; if (owner !== user.id) continue` — null owner silently drops. Seeded by `legacy.listSessionIds(user.id)`. | `sessionDirectory.js` + backfill script + UNCLAIMED state |
| 7 | Home must show RECENT ASSESSMENTS | OPEN | `server/domain/student/readModels.js` `home()` computes `lists.completed` / `recentReport` internally but **does not return them** — returns only `{user, workspace, primaryAction, capabilitySnapshot, assessedCount, focus, sponsor, levelLabelsStatus}`. Needs server payload change **and** HomePage section. | `readModels.js`, `HomePage.jsx` |

## P0 — Assessment player consolidation

| # | Problem | Status | Evidence / root cause | Fix site |
|---|---|---|---|---|
| 8 | Three competing players | PARTIAL | `AssessmentPlayerPage.jsx` (418 lines) is already the production contract holder. **Helpful finding:** `createCampusSessionLock` (`server/lib/legacyReportGuard.js:55`) already 404s *all* legacy HTTP session routes for V3 sessions — explicitly closing the `/workspace/:id?legacy=1` restart escape. Consolidation is therefore a routing/redirect job, not a data-safety job. | `AppRouter.jsx`, legacy pages → adapters |

## P0 — Layout

| # | Problem | Status | Evidence / root cause | Fix site |
|---|---|---|---|---|
| 9 | Empty right half | PARTIAL | `AssessmentPlayerPage.jsx` already does `hasWork && wide ? 'w-[45%] border-r' : 'mx-auto max-w-3xl'`. Needs width audit (~800–900px) + test. | `AssessmentPlayerPage.jsx` |
| 10 | Whole page scrolls | OPEN | `src/layouts/AssessmentShell.jsx` (19 lines) applies the 100dvh frame **only at `md:`** (`md:h-[100dvh] md:overflow-hidden`). Mobile scrolls the document. | `AssessmentShell.jsx` |
| 11 | Independent pane scrolling | OPEN | Follows from 10. | `AssessmentShell.jsx`, panes |

## P0 — Timer

| # | Problem | Status | Evidence / root cause | Fix site |
|---|---|---|---|---|
| 12 | No visible countdown in `/workspace` | PARTIAL | V3 header has `role="timer"` + sr-only label + server-offset `useRemaining`. `formatRemaining` does **not** zero-pad minutes. Legacy `/workspace` lacks it entirely. | `AssessmentHeader.jsx` |
| 13 | User timer vs server grace conflated | **OPEN — confirmed defect** | `server/domain/campusStore/context.js:70` `limitMs = 35 * 60 * 1000` flows into `buildSessionContract` ⇒ the candidate countdown **starts at 35:00, not 30:00**. `server/routes/assessment.js:102` `SESSION_LIMIT_MS = 35 * 60 * 1000 // 30 min + 5 min grace` confirms intent. Separately `catalog.js ESTIMATED_MINUTES = 35` is the *published admin* duration and surfaces in Briefing §4. Three distinct numbers must be separated: published duration, candidate clock (30), server grace (5). | `context.js`, `sessionContract.js`, `catalog.js` |

## P0 — Scenario intro

| # | Problem | Status | Evidence / root cause | Fix site |
|---|---|---|---|---|
| 14 | Scenario Intro modal before clock starts | OPEN | `ScenarioCard.jsx` (132 lines) exists but: CTA reads `Got it — continue` (must be **BEGIN ASSESSMENT**); no `role="dialog"`, no `aria-modal`, no focus trap, no Escape handling; the ✕ at `:122` **also calls `onDismiss`**, starting the clock without affirmative confirmation; missing Objective, Relevant work materials, Estimated duration. The V3 player renders briefing as an *inline collapsible* (`id="player-briefing"`), not a pre-start modal. **The clock already starts in `SystemCheckPage` `V3Start.begin()`**, so the player mounts with time already running. Chosen approach: record a server-side intro-acknowledgement timestamp and derive the candidate deadline from it — preserves server authority and does not disturb entitlement reservation/idempotency ordering in `sessionService.start`. | `ScenarioCard.jsx`, `AssessmentPlayerPage.jsx`, `sessionContract.js` |
| 15 | Header "Briefing" reopens without pausing | PARTIAL | Control exists with `aria-expanded`/`aria-controls`. Must reopen the same content as the intro. | `AssessmentHeader.jsx` |

## P0 — Scenario selection semantics

| # | Problem | Status | Fix site |
|---|---|---|---|
| 16 | Calibration appears to choose scenario | OPEN | Rename to SHORT DIFFICULTY CALIBRATION + disclaimer copy |
| 17 | Separate calibration from context; only governed families | OPEN | Calibration UI + family list |
| 18 | Never generate arbitrary formal scenarios | VERIFIED-ALREADY-CORRECT | `server/domain/assessments/catalog.js` header: definitions/forms are **derived** from the frozen scenario bank, "never authored here" |
| 19 | Unknown scenario must fail closed | VERIFIED-ALREADY-CORRECT | `sessionContract.js` `scenarioView` throws `SCENARIO_NOT_FOUND`; `/artifacts/:sessionId` returns `SESSION_NOT_FOUND`/`SCENARIO_NOT_FOUND` ("Unknown sessions get no scenario content at all (C2.05)"); `SystemCheckPage` has matching fail-closed copy |

## P0 — Evidence pipeline (the core defect)

| # | Problem | Status | Evidence / root cause | Fix site |
|---|---|---|---|---|
| 20 | "0 of 5 capabilities have enough evidence" | **OPEN — root-caused** | `grep evidenceGraph\|recordEvidenceUnit server/routes/assessment.js` → **exactly 2 hits**: the import (`:75`) and ONE writer (`:1931`, artifact handler). `runEvaluation` never writes a strict unit. `POST /message` never writes one. The single writer omits `rubric_level`, so `normalizeEvidenceUnit` forces `INSUFFICIENT_EVIDENCE` + `NOT_JUDGED`. **Its own comment ("judging happens only through the governed scoring pipeline") is false** — no judged writer exists anywhere. | `server/routes/assessment.js`, new capability-space evaluator |
| 21 | Legacy dimensions ≠ new capabilities | **OPEN — now proven, not merely mandated** | `server/lib/competencyModelV2.js` `legacyKeys` map **many-to-one**: `problemSolving` feeds REASONING, ADAPTABILITY *and* EXECUTION; `criticalThinking`+`problemSolving` both feed REASONING. No deterministic inversion exists ⇒ any legacy→capability mapping is arithmetically fabrication. | enforce isolation; no mapping |
| 22 | Dialogue evidence lost | OPEN | Same root cause as 20: no dialogue writer. | `POST /message` path |
| 23 | Genuine "no evidence" vs pipeline failure | OPEN | `StudentReportPage.jsx` handles `REPORT_NOT_READY`/`REPORT_UNDER_REVIEW` only. No `EVALUATION_INCOMPLETE` / `EVIDENCE_CAPTURE_FAILED`. | report schema + page |

**Raw material available for Phase 8 (no fabrication required):** every capability in
`competencyModelV2.js` carries governed `anchors: {1..5}`, each with a `label` **and**
`criteria`. So `rubric_level`, `rubric_label` and `behavior_anchor_id` are all sourced
from governance. Eligibility predicate from `server/domain/evidence/sufficiency.js`:
`evidence_status ∈ {SUFFICIENT, PROVISIONAL}` **and** finite `rubric_level` **and**
`candidate_action_json` **and** `provenance_json`. `opportunityKey` keys on
`source_turn` / `source_artifact_id`, so dialogue turns are the natural second
independent opportunity (`minimum_independent_opportunities: 2`,
`minimum_evidence_units: 3`).

**Open design constraint:** the existing PoLL panel scores in legacy `DIMENSION_KEYS`
space. Problem 21 forbids crossing. Therefore Phase 8 requires a **capability-space
evaluator** that uses the governed anchors directly as its rubric — not a translation
layer over the legacy panel.

## P0 — Report

| # | Problem | Status | Evidence / root cause | Fix site |
|---|---|---|---|---|
| 24 | Fix evidence first | — | Ordering constraint on 25/26. | — |
| 25 | Duplicate "Insufficient evidence" UI | **OPEN — located** | `ReportView.jsx:98` renders a global `<Callout tone="insufficient" title="Not enough evidence yet">` when `describedCount === 0`, **while** each of five `ReportCapabilityCard`s (`:100–102`) independently renders its own insufficient state (`ReportCapabilityCard.jsx:37–42` + `EvidenceSufficiencyBadge` at `:23`). A zero-evidence report shows **six** insufficiency surfaces. | `ReportView.jsx` |
| 26 | Report system fragmented | PARTIAL | `/score?session=`, `/report/:id/v2`, `/app/reports/:id` all live. V3 already canonical in `AppRouter.jsx:245`. | routing + completion redirect |
| 27 | Old reports preserved as issued | VERIFIED-ALREADY-CORRECT | `reports/v3/service.js` uses `reportContentHash` (sha256 over canonical JSON) + `repos.reportVersions.findByHash` dedupe ⇒ re-rendering never overwrites. `persist()` nulls `candidateName` so per-audience views don't fork versions. |

## P0 — Report security

| # | Problem | Status | Evidence / root cause | Fix site |
|---|---|---|---|---|
| 28 | Private reports need auth + ownership | **PARTIAL — two concrete holes** | Guards live in `server/app.js` **before** the mount, not in the router (a router-only grep is misleading). `/report/:sessionId/v2` and `/employee` → `createLegacyReportGuard` = authenticated **and** `owner === user.id`, else uniform 404. **Correct.** But `/report/:sessionId` → `createCampusReportGate`, which calls `next()` **with no authentication at all** when `!status.v3 && !status.shared`. ⇒ **(a)** an unshared personal legacy session's full report — which the guard's own comment says "returns dimension scores, theta, coverage and the account id/email" — is readable by anyone holding the UUID. That is exactly "UUID secrecy as authorization", and it leaks the account email. **(b)** `campusSessionStatusFrom` returns `{v3:false, shared:false}` when `repos()` is null, so if the campus store is unavailable the gate **fails open for every session**. | `legacyReportGuard.js`, `app.js` |
| 29 | Sharing via explicit scope/token/expiry | VERIFIED-ALREADY-CORRECT | `reports/v3/service.js`: owner-only `createShare`, `MAX_SHARE_DAYS = 180`, hashed token, LINK-only, revocation, expiry, owner re-verification, disclosure scoping, `NOT_FOUND` masking. `routes/v1/reports.js`: rate limit, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`. Verify, do not rebuild. |

## P1

| # | Problem | Status | Evidence / root cause |
|---|---|---|---|
| 30 | Home answers "what next?" | OPEN | Depends on 7's payload change |
| 31 | Stable report link per completed assessment | OPEN | `assignmentService.js:145` sets `VIEW_REPORT` only when `session?.hasReport`; otherwise `cta = {kind:'NONE', to:null}` and `AssessmentAssignmentCard.jsx` suppresses the button **with no explanation**. Needs explicit processing / under-review / failed / legacy states |
| 32 | Controlled flag rollout | OPEN | `server/domain/flags/index.js` is 32 lines of `process.env[key] === 'true'`; no combination validation |
| 33 | Multi-instance session locking | OPEN | `server/domain/assessments/sessionService.js` `createSessionLocks()` is a literal in-process `Map` |
| 34 | `evaluationJobs = new Map()` | OPEN | In-process Maps at `assessment.js`. **Existing recovery contract to preserve:** `GET /evaluate-status` returns `idle` when "the process restarted mid-scoring — the client should re-POST /evaluate, which is idempotent" (idempotent via `getReport`) |
| 35 | Erasure cascade | OPEN | `DELETE /data/:sessionId` (`:2356`), `DELETE /candidate-data` (`:2375`). Cascade must reach `behavioral_evidence_units`, `practice_evidence_units`, `report_versions`, `share_grants` |
| 36 | Human review / accommodation paths in V3 | OPEN | `/accommodation` (`:2266`, `:2294`), `/dispute` (`:2309`, `:2343`), `/human-rating` (`:2401`), `/verify-identity` (`:1623`, `:1657`) exist on the **legacy router only** |
| 37 | Safe rollback / reissue | OPEN | Depends on 32/34 |

---

## Execution order (dependency-ordered)

1. ~~Audit + map~~ ✅
2. Auth routing, app-shell entry, `/dashboard` + `/profile` aliases — P1,2,3,4
3. Historical discovery + ownership reconciliation — P5,6,7
4. Consolidate onto V3 player — P8
5. Fixed-height layout + responsive panes — P9,10,11
6. Scenario Intro + server-authoritative 30-minute timer — P12,13,14,15
7. Scenario-selection semantics + calibration copy — P16,17,18,19
8. Connect actions to strict evidence generation — P20,21,22
9. Capability aggregation + system-failure states — P23
10. Report V3 canonical — P24,25,26,27
11. Report ownership + sharing security — P28,29
12. Locking / recovery / erasure hardening — P33,34,35,36,37
13. Full test suite + E2E + accessibility
14. Feature-flag rollout documentation — P32

## Anti-fabrication machinery that must survive every phase

`verifiedQuote` · `validateClaims` · `ADMISSIBLE` gating · `change: null` /
`changeStatus: 'NOT_COMPARABLE'` · the `normalizeEvidenceUnit` status ladder ·
`readEvidenceRow`'s legacy cap at `PROVISIONAL` · `evidenceGraph`'s throw-on-read-failure
("a read failure is an outage, not missing evidence") · `sufficiency.js` purity and
`RULE_FLOORS` · `ReportView`'s `strengths` band filter and `c.level &&` guards ·
`availability: {missions:'NOT_YET_AVAILABLE', reassessment:'NOT_YET_AVAILABLE'}` ·
`reportContentHash` immutability · the catalog's derive-from-frozen-bank rule · strict
separation of `practice_evidence_units` from `behavioral_evidence_units`.
