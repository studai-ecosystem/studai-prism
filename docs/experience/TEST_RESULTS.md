# P0 - Verification results

## P1 checkpoint - 2026-10-02 (final)

| Check | Layer | Result |
| --- | --- | --- |
| Complete frontend `npm run test:unit -- --maxWorkers=2 --minWorkers=1` | A | 434 tests: 433 passed, 1 failed under load (Campus overview); same test 10/10 in isolation (known load-sensitive case, see P0) |
| Complete server `npm --prefix server test` | A | 664 tests: 639 passed, 0 failed, 25 DB skips |
| `node scripts\run-experience-baseline-tests.mjs database` | B | 6 passed, 0 skipped: 40 migrations, read-only probe, real scorer/report, V2 owner read + denials, durable APPLIED actions with immutable payload, erasure cascade zero rows + late write 404 |
| `npm run build`, `npm run audit:static`, `git diff --check` | Build/static | PASS |
| Full four-project `browser-all` | A UI + isolated journeys | Running in background at commit time; first interrupted run reached 377 passes with no failures; result appended below when complete |

New P1 tests: `durableActions.test.js` (9), `studentHistory.test.js` (2), `ownershipReconciliation.test.js` (4), `experienceBaseline.test.js` T25/T26 now PASS invariant, `history.test.jsx` (6), `legacyReport.test.jsx` (24), `authDestination.test.js` (27), `session.test.js` (5), `p1-account-entry.spec.js`, `p1-legacy-report.spec.js`.
Known noise: with telemetry enabled in the isolated DB test the legacy engine logs `item_responses` FK errors (unseeded item bank); non-fatal, pre-existing, unrelated to P1 changes.


Starting code checkpoint `ff6002c`, including the preserved dirty work described
in BASELINE. The historical P0 results below remain historical. P1 is not a
completed durable-acceptance/ownership/erasure phase.

| Current check | Layer | Fresh P1 result |
| --- | --- | --- |
| Targeted auth destinations/session/client/providers/public entry/player | A | 114 passed |
| Legacy presentation + existing V3 report unit tests | A | 24 + 15 passed (included in full suite) |
| Legacy copy/report-policy checks | A | 30 passed (included in server regression) |
| Complete frontend `npm run test:unit -- --maxWorkers=2 --minWorkers=1` | A | 427 passed, 31 files; 0 failed |
| Complete server `npm --prefix server test` | A + unavailable DB suites | 624 passed, 0 failed, 25 skips; skips remain UNVERIFIED |
| `node scripts\run-experience-baseline-tests.mjs database` | B | 4 passed, no skips; real normal scorer/report storage, issued V2 owner read, non-owner/anonymous denial, original blob unchanged |
| `npm run build` and `npm run audit:static` | Build/static | PASS |
| Full four-project `node scripts\run-experience-baseline-tests.mjs browser-all` | A UI + existing isolated journeys | PENDING |

Intentional contract changes: bare registration assertion now requires supported
`/app`, not mandatory checkout. Existing paid browser journeys now explicitly
request `next=/payment`; their checkout/consent/start assertions remain strict.
No copy-ceiling/scientific/authorization test was relaxed.

Development regression fixed before checkpoint: initial full frontend run had
9 failures from a stale workspace accessor at root initialization and over-broad
workspace remounting that discarded confirmation/focus. Cleanup resets the
accessor; missing workspace maps to the existing personal default; page-content
scope resets preserve shell/switcher/toast state. The affected 117 tests and then
the complete 427-test suite passed unchanged except new requirement tests.

The PG check does not backfill old customer ownership, pre-save before the model,
implement durable jobs or prove erasure/restart safety. T25/T26/T27/T32/T36
diagnostic failures from P0 remain explicit, not fixed by these passing UI/read
checks. No live model, real customer, migration of production data or human
approval occurred. Logs: TEMP `prism-p1-target-ui.log`, `prism-p1-scope-regressions.log`,
`prism-p1-ui-final.log`, `prism-p1-server-final.log`, `prism-p1-build-final.log`,
`prism-p1-static.log`, `prism-p1-database.log`.

Environment: local checkout starting at `f40bd1c`, Node v24.12.0, npm 11.6.2,
including preserved pre-existing dirty work. All results below are fresh P0
execution results, not inherited historical counts.

**A green diagnostic test is not a green product invariant.** The completed
synthetic learner run has no judged strict dialogue evidence. The failure-window
fixture duplicates an engine effect on retry. These remain explicit FAILs below.
No live model, production database or real customer was used.

## Commands and exact outcomes

Run from the repository unless `server` working directory is specified.

| Command/check | Layer | Result | Interpretation |
| --- | --- | --- | --- |
| Editor `runTests` on two Node server files | A | No tests discovered | Editor provider does not discover these Node tests; used repository Node runner instead |
| `node --test test\experienceBaseline.test.js test\studentFlowFlags.test.js test\campusSessions.test.js test\campusReports.test.js test\legacyReportGuard.test.js test\evaluateAsync.test.js test\sessionLocks.test.js` from server | A | 60 pass, 0 fail, 0 skip at initial checkpoint | Existing memory/HTTP fixtures and initial 8 diagnostic tests, before the ninth fault-window test |
| `node --test test\experienceBaseline.test.js` from server, final diagnostic selector | A | 9 pass, 0 fail, 0 skip | Correct diagnostic/redaction/error behavior; T25/T26 fixture invariant separately FAIL |
| `npm run test:unit -- --maxWorkers=2 --minWorkers=1` | A | 28 files, 360 tests pass; 0 fail | Full frontend suite, bounded workers; no frontend source changes |
| `npm --prefix server test` (equivalent `npm test` from server), final | A / DB checks unavailable | 649 tests: 624 pass, 0 fail, 25 skip | Includes claims/Campus-copy/design-system gates; skipped DB tests are UNVERIFIED |
| `npm run build` | Build | PASS | Existing large-chunk warning retained; no unrelated bundle repair |
| `npm run audit:static` | Static | PASS | Existing audit output generated; not a security or pipeline certification |
| `npm run audit:flow-flags` with explicitly dark test-process flags | Configuration | PASS | Safe configuration consistency only; no real flags loaded or changed |
| `node scripts\check-experience-baseline.mjs` with that test environment | Diagnostic | Expected exit 1; DB UNVERIFIED | No DB connection attempted; worker/build/content approvals stay unknown |
| `node scripts\run-experience-baseline-tests.mjs database`, final | B | 3 tests pass, 0 fail, 0 skip | New UTF-8 PostgreSQL cluster, all 39 actual migrations, real HTTP/store/report path; external model stub only |
| `node scripts\run-experience-baseline-tests.mjs browser`, initial | A UI fixtures + isolated account API | 92 browser tests pass across 4 projects; wrapper exit 1 during cleanup | Test assertions passed; Windows EBUSY cleanup required a bounded-retry fix; not reported as a fully successful command |
| Same browser command, cleanup-fix rerun | A UI fixtures + isolated account API | 91 pass + 1 flaky, 0 final failures; runner exit 0 | Firefox materials at 360 had an initial `page.goto` load timeout in sign-in setup; unchanged retry passed; cleanup completed |
| `node scripts\run-experience-baseline-tests.mjs browser-smoke` after audit-data-root support | A test harness | 8 pass, 0 fail; runner exit 0 | Both audit servers use independent stores beneath the runner cleanup root; that root is removed; not a replacement for the 92-test baseline |
| P0 script/server-test editor diagnostics | Static | No errors | Four new JS/MJS files checked |
| Ledger source reconciliation | Documentation | 52 CH + 60 T unique rows; 13 ADR; 13 HA-C; zero reported source/phase/path mismatches | Traceability, not product acceptance |
| Calibration Python suite / full unrelated browser suite | Not run | NOT RUN | No Python/scientific/router/shell changes; scoped browser baseline used |
| Live-model staging / real-user research / production support lookup | C / human | NOT AUTHORIZED / NOT RUN | Budget, consent, operator and reviewer gates remain open |

The normal server suite's 25 skips include the dedicated P0 DB test, which
requires the self-owned-database runner marker, plus existing DB-dependent tests.
The separate 3-test P0 database invocation ran with no skips. It does not verify
every previously skipped DB suite, deletion, distributed leases or active-run rollback.

## Measured product invariants and limits

| Requirement | Fresh observation | Status |
| --- | --- | --- |
| T01/T02/T03/T04 | Returning login/alias/deep-link/dark/recovery frontend checks remain green | FIXTURE_TESTED; registration commercial choices remain later work |
| T05/T47 | A report saved by the real isolated scorer is discoverable in owned completed history; second owner gets 404 for session/report | PARTIAL INTEGRATION_VERIFIED; not an old customer report or complete audience matrix |
| T06 / CH-41 | Separate source-only conflict/unclaimed fixtures classify correctly; no owner is transferred | INTEGRATION_VERIFIED DIAGNOSTIC, not an approved claiming workflow |
| T10/T12/T13/T16 | Fixed viewport/panes/composer and deadline receipt tested at seven widths, compact viewport and four browser projects | FIXTURE_TESTED; no formal administration change |
| T14/T19/T20 | Existing requested marketing form appears consistently; server clock already started and exposes existing 35-minute window | BASELINED; separate pre-clock intro remains OPEN |
| T25 | Three real accepted messages are stored in PostgreSQL history and have receipts before finish | PARTIAL; no live-model failure/crash recovery proof |
| T25/T26 | Injecting one receipt-write failure after the current service's engine effect then retrying the same event yields 2 engine effects and 1 receipt | FAIL, Layer A diagnostic reproduction; not a process-crash/multi-instance test |
| T27 | Dialogue-only real HTTP/scorer completion yields 0 judged strict evidence units | FAIL, Layer B; no evidence or completed report was preseeded |
| T32 | Normal PG completion removes session history used by V3 source-quote verification | FAIL for that source dependency; separate telemetry retention is not equivalent to builder source access |
| T36 | V3 report GET appends a stored version in the isolated run | DIAGNOSTIC SIDE EFFECT; not a safe read-only support probe |
| T31 | Probe/schema/read/cleanup failures produce explicit nonzero/error states; existing UI scoring-retry failure remains visible | Diagnostic/UI verified; durable processing-state repair remains OPEN |
| T59 | With telemetry enabled only inside the isolated DB test, the real dev-run timeline row is marked synthetic | PARTIAL INTEGRATION_VERIFIED; full conversion/research exclusion manifest not supplied |
| CH-41 | An attempted write on the same diagnostic connection is rejected with SQLSTATE 25006; record count unchanged | INTEGRATION_VERIFIED read-only enforcement |
| T49/T50/T60 | Existing locking fixtures pass; legacy evaluation jobs remain process-local; flag-only fallback can strand V3 runs | OPEN; no durable worker/restart/rollback claim |

## Visual inspection

Manually inspected generated fixture screenshots:

- Desktop conversation at 1440: centered conversation-only surface, fixed context
  header and reachable composer; no reserved empty half-screen.
- Material pane at 390: narrow tabbed layout, independently scrollable material
  and one docked composer retaining the synthetic draft.
- WebKit scoring-error at 390: visible failed retry, support reference and recovery
  actions; no invented report or learner capability state.

Paths: `audit-results/ui/flow-player/chromium-conversation-1440.png`,
`chromium-materials-390.png`, and
`audit-results/ui/flow-recovery/webkit-scoring-390.png`.
These contain labelled synthetic UI fixtures, not governed results. No new UI
design was delivered and no human accessibility conformance claim is made.

## Failed development attempts retained

1. Windows ESM dependency loading initially failed because an absolute Windows
   path was passed to `import`; fixed with `pathToFileURL`.
2. First embedded cluster used Windows default WIN1252, causing migration 0003
   to reject an existing Unicode SQL comment. The new test launcher explicitly
   initializes UTF-8; historical migration files were unchanged.
3. The embedded package's exit hook could mask the runner verdict. The launcher
   now keeps a local exit status and explicitly exits with it after cleanup.
4. A test looked for ownership at the wrong output nesting; corrected to
   `snapshot.database.ownership`, without changing diagnostic schema/runtime.
5. The timeline assertion initially ran with telemetry deliberately disabled.
   The isolated test now explicitly enables existing telemetry and waits for its
   asynchronous write; this is a test-process flag, not production activation.
6. The first complete browser run passed all 92 tests but temporary-directory
   deletion hit Windows EBUSY. Cleanup is now bounded/retried and failures are
   explicit; final browser rerun is recorded separately above.
7. The final browser run retained one initial Firefox navigation timeout before
   reaching the fixture. The existing single automatic retry passed unchanged.
   This is disclosed as flaky, not counted as 92 clean first-attempt passes.

Final syntax checks (`node --check`) pass for all four new JS/MJS files.
`git diff --check` passes. Test ports 4173/4174 are free after the runner exits;
specifically created P0 temporary PostgreSQL directories are removed.
The first browser invocations used the existing audit harness's separately
allocated global temporary stores; their exact ownership paths were not captured,
so unrelated temporary stores were not guessed/deleted. The new optional audit
data root keeps subsequent stores inside the runner-owned cleanup boundary.

## Evidence storage

Long command output is under TEMP, named `prism-p0-target-server.log`,
`prism-p0-diagnostic-unit.log`, `prism-p0-frontend.log`, `prism-p0-build.log`,
`prism-p0-server-final.log`, `prism-p0-static.log`, `prism-p0-database.log`,
`prism-p0-browser.log`, `prism-p0-browser-final.log` and `prism-p0-browser-smoke.log`.
These ephemeral files are not committed or customer evidence.

`audit-results/p0/lineage.json` contains only safe synthetic aggregate metadata
and explicit PASS/PARTIAL/FAIL observations. Browser JSON/screenshots are ignored
audit artifacts. Temporary PostgreSQL/data directories belong to the isolated
runner and must be shut down/removed after checks; never delete an existing
application or shared database directory.
