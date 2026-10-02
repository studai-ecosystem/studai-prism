# P0 - Actual learner-path baseline

Scope: approved **diagnostic-only P0**. Stop before P1. Local source inspection
and synthetic test evidence do not establish production configuration or readiness.
Overall learner release remains **NO-GO**. See [results](./TEST_RESULTS.md),
[requirements](./IMPLEMENTATION_STATE.md), [decisions](./DECISIONS.md),
[review intake](./CONTENT_REVIEW.md) and [handoff](./FINAL_REPORT.md).

## Provenance and preserved checkout

The supplied [master plan](../../../.github/prompts/document.md) and
[P0 prompt](../../../.github/prompts/plan.prompt.md) cite historical snapshot
`609f748277d4462e4c113c9c2e5b66fe05e016bb`. They are not a fresh production audit.
The HTML companion and illustrative screens were not supplied or inspected.

Initial local branch: `ui/prism-brand-transformation`.
Initial HEAD: `f40bd1c6e3bd514a3d5266ce579c27373312b034`.
Node `v24.12.0`; npm `11.6.2`. Existing dependencies/runners were available.
No dependency manifest or lockfile was changed for P0.
The installed embedded-postgres development dependency and the entry/lock
fixtures are part of preserved pending work, not the isolated P0 commit.
These results describe this exact working tree, not a clean-checkout release
gate. A clean checkout needs that pending dependency/fixture work separately
reviewed/integrated before reproducing every optional isolated-runner selector;
missing embedded-postgres fails explicitly without using another database.
The repository has 39 up-migration files, ending at
`0039_evidence_rating_queue`; actual production applied state is unknown.
The isolated P0 test database is created afresh and applies all 39.

Pre-existing dirty files, excluded from P0 staging:

```text
D .github/copilot-instructions.md
M server/db/pool.js
M server/domain/assessments/sessionService.js
M server/domain/campusStore/defaultContext.js
M server/domain/campusStore/index.js
M server/package-lock.json
M server/package.json
M src/app/AppRouter.jsx
M src/app/AppRouter.test.jsx
M src/app/guards/AuthGuard.jsx
M src/app/guards/guards.test.jsx
M src/components/states/ErrorState.jsx
M src/features/assessments/components/AssessmentAssignmentCard.jsx
M src/features/home/pages/HomePage.jsx
M src/features/student/studentPages.test.jsx
M src/pages/Auth.jsx
M src/pages/publicSite.test.jsx
M tests/e2e/campus-shell.spec.js
?? StudAI_Prism_Complete_Brand_Pack.zip
?? StudAI_Prism_Complete_Brand_Pack/
?? data/
?? server/domain/assessments/sessionLocks.js
?? server/test/sessionLocks.test.js
?? tests/e2e/flow-entry.spec.js
```

In particular, pending advisory-lock and pool wiring is not P0 work and is not
automatically proved multi-instance safe by a passing synthetic lock test.
Earlier [repair map](../ui/FLOW_REPAIR_MAP.md),
[readiness](../ui/FLOW_REPAIR_READINESS.md) and
[UI A-M state](../ui/UI_PROGRAM_STATE.md) retain their own historical evidence.

## Route and boundary matrix

Source: [router](../../src/app/AppRouter.jsx),
[flag routing](../../src/app/routing.jsx),
[app middleware](../../server/app.js),
[legacy gates](../../server/lib/legacyReportGuard.js),
[V1 router](../../server/routes/v1/index.js). Production flags are unknown.

S = APP_SHELL_V3; W = ASSESSMENT_WORKSPACE_V3; R = STUDENT_REPORT_V3;
D = DEVELOPMENT_V2; C = CAMPUS_ENABLED. Operational readiness additionally
requires governed evidence/persistence prerequisites, not just route flags.
Client guards are UX; server identity/scope checks remain authoritative.

| Route | Loaded version and client entry | API/server boundary | Off/error/refresh baseline |
| --- | --- | --- | --- |
| `/login`, `/register` | Public Auth; returning login uses `/app`; registration retains existing checkout unless explicit safe next | `/api/auth/*`, account identity/age declaration | Safe explicit next preserved; auth-loading and expired-session tests; no new onboarding/payment policy |
| `/app` | S on: authenticated Home alias; off: existing launcher | `/api/v1/me` flags, legacy launcher APIs | Dark launcher remains supported; not proof of Home activation |
| `/app/home` | AuthGuard + shell + workspace | `/api/v1/me/home`, `/me/assessments`; scoped student read models | Explicit unavailable/error/retry/offline states; history links provided by server |
| `/dashboard`, `/profile` | AuthGuard aliases to Home / settings profile anchor | Same destination handlers | Query/fragment retained through sign-in; no general homepage bounce |
| `/app/assessments` and `/:assignmentId` | AuthGuard + shell; definition/form/owned assignment view | Student scope + assignment service; active workspace header | Loading, denied, unavailable, empty and retry states; no ownership claiming |
| `/:assignmentId/briefing`, `/system-check` under personal or Campus assignments | Existing funnel; consent and server start/resume | `POST /api/v1/assessment-assignments/:id/start`; user/workspace, consent, entitlement and idempotency gates | Starts engine before arriving in active player; separate pre-clock introduction acknowledgement not implemented |
| `/assessment` | Legacy conversational player; no router AuthGuard | Legacy start/message/evaluate/status and voice APIs; entitlement/age/consent plus global session classification gates | Legacy behavior preserved; cannot infer anonymity permissions from route alone |
| `/workspace/:sessionId` | W+S on: V3 alias; off or legacy escape: legacy artifact player | Legacy session/material APIs; global V3/shared-session lock | Flag-only fallback is not pinned-engine rollback; a closed legacy endpoint may strand a V3 run |
| `/app/assessment/:sessionId` | W+S on: AuthGuard + canonical V3 component | `/api/v1/assessment-sessions/:id`; owner + active workspace; engine adapter | Flag-source error shown; off redirects to workspace; refreshed server deadline authoritative |
| `/score?session=...` | Existing issued legacy report | Raw legacy report, global conditional report gate | Preserve original format; not the same read boundary as V2 or V3 |
| `/report/:sessionId/v2` | R+S alias or StudentReportV2 legacy view | Legacy V2 endpoint with mounted owner guard | Preserve format/owned history; flag routing is not an immutable-version resolver |
| `/report/:sessionId/employee` | Existing EmployeeReportV2 | Legacy employee endpoint with mounted owner guard | Historical format unchanged |
| `/app/reports/:sessionId` | R+S: authenticated shell + StudentReportPage | V1 owner/workspace report service; held reports fail closed | Pending/review states and read-only UI recheck tested; backend GET can append a version |
| `/shared/:token` | Existing public shared-report view | Scoped hashed/revocable grant resolution; disclosure checked server-side | Expired/revoked/held states; not a general report access bypass |
| `/app/development`, `/app/development/missions/:id` | Existing practice catalogue/mission; mission needs D+S | Existing development service/evaluator; practice store separate | D off remains honest/unavailable or legacy fallback; not formal assessment evidence |
| `/missions`, `/missions/:id`, `/app/missions/:id` | Legacy development and aliases | Existing mission APIs | No second practice ledger introduced |
| `/app/capabilities`, `/evidence`, `/growth`, `/explore`, `/settings` | Existing scoped student views; exploration/growth also governed | Existing student, growth, exploration and account APIs | No merging of formal/practice/self-report; no new readiness/growth claim |
| `/app/prepare`, `/app/prepare/:id`, standalone new History | No dedicated preparation route in inspected router; history already groups assessments | No preparation domain added | PLANNED, not delivered; no invented screen |
| `/app/campus/:org/...` | S+C + AuthGuard + CAMPUS_STUDENT WorkspaceGuard | User, membership/role, organization scope and sponsorship checks | Explicit scope retained; report/development flags independently apply |
| `/campus/:org/...` | S+C + CAMPUS_STAFF shell/permissions | Organization permissions; sponsored report/share disclosure, not private personal preparation | Existing operational features remain; no analytics expansion |

Legacy V2/employee owner guards, shared/V3 session locks and the raw report gate
are mounted **before** the legacy router. Raw undisclosed personal report behavior
is explicitly different in the current gate. This is a traced contract, not a
new independent security review or permission change.

The [screen inventory](./CONTENT_REVIEW.md#appendix-a-screen-inventory) is broader
than this route matrix; planned surfaces are not claimed implemented.

## Lineage and actual observed failure boundary

| P0 question | Executable source / local observation | Remaining boundary |
| --- | --- | --- |
| Owned run and scope? | Session directory filters user ID and Personal/Campus scope; isolated second owner gets 404 | Production reconciliation/conflicts unknown; do not grant ownership |
| Selected engine/form/method? | V3 adapter calls legacy router; isolated run requests existing `prism-sim-mkt-l1` and returned scenario agrees | No new versioned universal engine introduced |
| Candidate work durably saved? | Real V1 HTTP messages use legacy engine then persist receipts; isolated accepted messages appear in PG history/receipts | Save-before-evaluate on failure and effect-before-receipt crash are not proved |
| Actual approved opportunities acknowledged? | Frozen bank/context and exchange count exist | No complete durable opportunity lifecycle proved; progress count is not an opportunity ledger |
| Interpretation jobs completed? | Actual scorer produces a legacy report in isolated DB | Jobs/failures are process-local Maps; restart/lease behavior not proved |
| Strict evidence units generated? | Dialogue-only isolated run completes but has zero judged strict units | T27 reproduced FAIL; artifact writer records actions without assigning a judged level |
| Sufficiency decisions? | V3 derives profile from strict units, not legacy percentages | No evidence cannot be repaired by relabelling legacy scores |
| Original and V3 versions? | Real scorer saves original; V3 GET can append a version | GET is not a strictly read-only support diagnostic; historical snapshot correction remains later work |
| What does learner see? | Scoped history lists completed owned run; V3 report route responds without judged dialogue evidence | A rendered report is not proof of a publishable capability finding |

The 35-minute answer window is an existing server contract. Local source traces
show system-check start calls the engine before a separate intro acknowledgement;
do not shorten the clock, change stimulus or invent a new begin contract in P0.

`storePg.saveReport()` removes `v1_sessions.data.history`; V3 quote verification
reads that history. Telemetry may retain separate source material when enabled,
but the inspected V3 builder does not use that as its source. Missing history
therefore does **not** establish that all source records were erased or that
production customer data is lost. Retention/source recovery requires review.

## Diagnostic interface

From the repository:

```powershell
node scripts\check-experience-baseline.mjs
node scripts\check-experience-baseline.mjs --database
node scripts\run-experience-baseline-tests.mjs database
node scripts\run-experience-baseline-tests.mjs browser
node scripts\run-experience-baseline-tests.mjs browser-smoke
```

Without `--database`, safe allowlisted configuration is shown and database status
is UNVERIFIED with nonzero exit. This is intentional, not a passing readiness gate.
For a database probe an authorized operator must inject
`PRISM_DIAGNOSTIC_DATABASE_URL` through the approved environment mechanism.
The command never falls back to DATABASE_URL, loads `.env`, boots the app,
seeds RBAC/catalogues, migrates, settles entitlements or calls a report builder.
It accepts no run ID or connection string argument. Use a least-privilege read-only
role; every query runs on one bounded repeatable-read/read-only connection.

Output is schema-checked aggregate metadata, never candidate material or identifiers.
MATCHED means agreeing stored references to an existing account, **not** a claim grant.
Conflicting owners stay CONFLICTING; absent proof stays UNCLAIMED. DELETED/EXCLUDED
remain null without authoritative manifests, rather than guessed zero.
Store/schema/query/cleanup failures are explicit nonzero failures.
An AVAILABLE schema probe is not worker/content/scientific/release approval.

Do not run `migrate:store` for read-only diagnosis: it calls `migrateUp()` even
without `--enforce`. Do not assume any GET is read-only: session completion
settlement, report-version creation and admin RBAC initialization are side effects.

The isolated runner uses the already-installed server development dependency
embedded-postgres, an ephemeral port, a new UTF-8 cluster and temporary data.
It clears inherited runtime/Campus flags in child processes and never changes
private `.env` files. The audit server's optional `PRISM_AUDIT_DATA_ROOT` lets each
server retain an independent store within the runner-owned cleanup directory,
without changing its default or explicit `PRISM_AUDIT_DATA_DIR` contract.
Browser-smoke selects returning-login and withheld-report checks in all four
projects for test-harness changes; it is not the full browser baseline.
Its database fixture invokes real HTTP/persistence/report
paths with only the external model provider stubbed. Its browser suite still
contains labelled UI/API fixtures; those do not become Layer B pipeline proof.

## Missing operator evidence

Effective production flags; frontend/backend deployment build IDs; current applied
migrations; an authorized affected and successful real owned run; worker/runtime
availability; retention/deletion/exclusion manifests; named reviewers; signed
recovery/commercial/content/measurement decisions are **not supplied**.
No production queries, customer replay, live-model spending or participant contact
were performed. Follow the [read-only support procedure](./ROLLOUT.md), not a
production backfill or re-score, to resolve those questions.
