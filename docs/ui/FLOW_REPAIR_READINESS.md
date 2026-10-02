# Student flow repair - release readiness

Date: 2026-10-02. **NO-GO for the complete V3 student journey.**

Latest recovery/entry checkpoint: existing pending/held report states now have
read-only rechecks/support/reference controls; failed scoring retries surface
their errors; workspace-specific recovery and stale-control suppression are
tested. Profile records the existing adult declaration via the existing
authenticated endpoint, with unchanged consent text/eligibility and strict
receipt validation. Account resume uses scoped assignment data instead of
hardcoded legacy briefing. No new backend report/job states, age/authorization
rules or retention behavior were introduced.

Latest independent UI repair: the V3 active frame/panes/composer, server-clock
receipt stability and repeated no-evidence card copy are now repaired and tested.
The existing server start/duration and protected backend policies are unchanged.
The release checker now matches the existing Workspace Evidence Fail Closed
prerequisite and existing production PostgreSQL requirement. See the latest
[repair checkpoint](./FLOW_REPAIR_MAP.md); these changes do not close the backend
work packets or approve production activation.

Approved-plan follow-up: V3-only new journey with unchanged historical issued
reports is confirmed. Mandatory domain-owner work packets are prepared, but no
reviewed ownership, formal evaluator, administration, access or erasure/source-
retention implementations or approval references have been supplied. The plan
is not a substitute for those gates. No runtime implementation from those packets
was performed. Targeted existing-contract rechecks: server 77/0 and current
player/report frontend 30/0; no full persistence/production readiness claim.

This checkpoint repairs application entry and discoverability of already-owned
assessments. It does not assert that formal assessment, strict judged evidence,
capability reporting, ownership reconciliation, privacy erasure or multi-instance
operation are repaired. See the [implementation map](./FLOW_REPAIR_MAP.md).

## Implemented scope

- Existing returning-user sign-in goes to `/app`, never universally to checkout.
  Explicit same-origin `next` takes priority over stale invitation storage.
  Registration without an explicit destination retains the existing checkout
  flow; entitlement-aware registration has not been added.
- `/dashboard` authenticates, then redirects to `/app/home`.
- `/profile` authenticates, then redirects to `/app/settings#profile`.
- Protected entry preserves query and fragment across login.
- A dark personal shell has an honest unavailable state with launcher/support
  actions instead of a public-homepage bounce. It does not bypass server flags.
- Home displays recent completed assessments from the existing scoped API,
  sorted newest-first, with server-provided report links. Legacy report links
  stay legacy. Empty, loading, offline, authorization and failure states remain
  explicit.
- Completed assessment cards show completion date, scope and report availability
  or review state. The API still lacks a full durable report-job status contract.
- A read-only flag configuration checker reports inconsistent combinations.

No database migration, ownership backfill or data writes were introduced.
No report, framework, scenario, evaluator, timer limit, sufficiency rule,
entitlement, authorization or retention policy was changed.

The countdown display now stores its monotonic network receipt with the server
snapshot, so local transcript-cache updates and device wall-clock changes cannot
rebase it. Zero-padding and display rounding do not change the server deadline.
The server's current 35-minute limit remains unresolved; a display-only clamp to
30 minutes was deliberately not introduced.

The active V3 frame now uses fixed dynamic-viewport height on mobile and desktop,
independent keyboard-scrollable conversation/materials, no empty workspace, and
one docked composer outside the pane switching region. Report cards no longer
repeat the NO_EVIDENCE explanation alongside a server-provided absence summary.

## Files changed in this repair

- [Auth](../../src/pages/Auth.jsx) and [auth regression tests](../../src/pages/publicSite.test.jsx)
- [AppRouter](../../src/app/AppRouter.jsx) and [routing tests](../../src/app/AppRouter.test.jsx)
- [AuthGuard](../../src/app/guards/AuthGuard.jsx) and [guard tests](../../src/app/guards/guards.test.jsx)
- [HomePage](../../src/features/home/pages/HomePage.jsx)
- [AssessmentAssignmentCard](../../src/features/assessments/components/AssessmentAssignmentCard.jsx)
- [Student page tests](../../src/features/student/studentPages.test.jsx)
- [ErrorState](../../src/components/states/ErrorState.jsx)
- [Flag checker](../../scripts/check-student-flow-flags.mjs), [checker tests](../../server/test/studentFlowFlags.test.js) and [package scripts](../../package.json)
- [Browser entry tests](../../tests/e2e/flow-entry.spec.js) and [shell regression](../../tests/e2e/campus-shell.spec.js)
- [Implementation map](./FLOW_REPAIR_MAP.md), this readiness document and [UI state](./UI_PROGRAM_STATE.md)
- [AssessmentShell](../../src/layouts/AssessmentShell.jsx), [V3 player](../../src/features/assessments/pages/AssessmentPlayerPage.jsx), [player tests](../../src/features/assessments/player.test.jsx) and [session API](../../src/features/assessments/api/assessmentSessionApi.js)
- [AssessmentHeader](../../src/features/assessments/components/AssessmentHeader.jsx), [ConversationPane](../../src/features/assessments/components/ConversationPane.jsx), [ResponseComposer](../../src/features/assessments/components/ResponseComposer.jsx) and [ArtifactPane](../../src/features/assessments/components/ArtifactPane.jsx)
- [Assessment clock hook](../../src/features/assessments/hooks/useAssessmentClock.js) and [clock tests](../../src/features/assessments/hooks/useAssessmentClock.test.jsx)
- [ReportCapabilityCard](../../src/features/reports/components/ReportCapabilityCard.jsx), [report UI tests](../../src/features/reports/reports.test.jsx) and [active-player browser tests](../../tests/e2e/flow-player-layout.spec.js)
- [StudentReportPage](../../src/features/reports/pages/StudentReportPage.jsx), [SettingsPage](../../src/features/settings/pages/SettingsPage.jsx), [account API](../../src/api/account.js), [me schema](../../src/api/me.js) and [Settings tests](../../src/phaseK.test.jsx)
- [Player copy](../../src/lib/copy/player.js), [report copy](../../src/lib/copy/report.js) and [recovery browser tests](../../tests/e2e/flow-recovery.spec.js)

Unrelated worktree files were left unchanged. Build/audit/browser output is
git-ignored and is not production data or a committed fixture.

## Verified root causes and open dependencies

| Area | Runtime evidence | Outstanding repair |
| --- | --- | --- |
| Shell entry | Personal nested routes gated before authentication; dark shell previously redirected to `/` | Recovery UI repaired; actual activation still requires release gates |
| History | Home did not display the completed list; scoped directory filters ownership using session/report IDs | UI repaired; proven-owner reconciliation with conflict detection still required |
| Candidate clock | Campus context passes a 35-minute limit; session contract derives deadline from it | Separate governed candidate duration from operational grace, with administration approval and timer tests |
| Scenario introduction | System-check start already starts the session; V3 briefing is inline | Pre-clock server start contract and accessible explicit confirmation remain unimplemented |
| Evidence | Assessment route has one strict artifact writer without a judged rubric level; no dialogue writer found in that route | Governed capability-space evaluation and durable provenance/error states; no legacy-score conversion |
| Report | V3 builds from strict units, not legacy scores | End-to-end evidence sufficiency, failure distinction, canonical routing and historical issued-report checks |
| Concurrency | Session lock queues and evaluation job registries are process-local Maps | Distributed serialization, durable job recovery and restart tests |
| Support | Critical accommodation, dispute and identity operations remain on legacy paths | Equivalent authorized V3 workflows and tested rollback/reissue |
| Security/privacy | Existing audit map documents legacy report and erasure gaps | Fresh security review and authorized implementation; not resolved by frontend guards |

The dedicated security-review tool failed before producing findings. There is
no successful new security audit to cite. The historical map's report-access and
erasure findings must not be marked fixed or downgraded.

## Flag dependencies

```text
PRISM_APP_SHELL_V3
  -> PRISM_ASSESSMENT_WORKSPACE_V3
  -> PRISM_STUDENT_REPORT_V3

PRISM_EVIDENCE_FAIL_CLOSED
  -> PRISM_ASSESSMENT_WORKSPACE_V3
  -> PRISM_STUDENT_REPORT_V3

DATABASE_URL + available migrated store
  -> PRISM_ASSESSMENT_WORKSPACE_V3
  -> PRISM_STUDENT_REPORT_V3

PRISM_PG_STORE=true (existing production persistence invariant)
  -> enabled production V3
```

Personal Prism does not require Campus, Campus analytics or growth flags.
`PRISM_CAMPUS_ANALYTICS` requires `PRISM_CAMPUS_ENABLED` only if analytics is enabled.
Development and growth remain separately governed; no equivalence gate is bypassed.

Run from the repository with the **intended service environment already injected**:

```powershell
npm run audit:flow-flags
```

The checker does not load a local `.env`, inspect secrets, connect to the store,
modify flags or validate scientific approval. A consistent all-dark configuration
passes. Passing means configuration consistency only, never release readiness.
The checker is a release command; automatic server-start enforcement was not added.

## Historical ownership reconciliation acceptance criteria

No backfill was executed. A future audited backfill must:

1. Inventory candidate sessions and issued reports without exposing their content.
2. Compare proven session owner, report owner, entitlement owner and payment owner.
   Treat conflicting evidence as unclaimed, not as permission to choose one.
3. Use account email only with documented verification and unique ownership proof,
   not name similarity, identifier possession or unverified email equality.
4. Record `UNCLAIMED` and support/admin decisions with a reason and audit trail.
5. Preserve personal/sponsored scope and issued report content/version/credential.
6. Dry-run, review conflicts, take a recoverable backup and apply transactionally
   with idempotent checkpoints. Never change ownership from a frontend request.
7. Prove that another student's history and full reports remain inaccessible.

## Safe deployment sequence

1. Keep production V3 rollout **blocked**. Do not enable flags to hide evidence,
   ownership or erasure defects.
2. Review the entry/history patch separately on `ui/prism-brand-transformation`.
   Leave unrelated deleted instructions, brand-pack files and `data/` untouched.
   No completed-phase commit was made because the requested phase dependencies
   remain incomplete.
3. Use a throwaway test database, not the production database. Run existing
   migrations through the repository's normal migration procedure on that
   test database, then record the applied versions. This patch adds none.
4. Run the existing gates from the repository:

   ```powershell
   npm run build
   npm run test:unit
   npm --prefix server test
   npm run audit:static
   npm run audit:flow-flags
   $env:CI = '1'
   # Inject PRISM_E2E_DATABASE_URL for a dedicated throwaway migrated database.
   # Confirm ports 4173 and 4174 are free; do not kill unrelated processes.
   npx playwright test
   ```

5. Resolve the open ownership, governed evaluator, timer, report authorization,
   erasure and support dependencies in order. Add the requested integration,
   concurrency/restart, privacy and assessment browser tests. A green existing
   suite alone does not prove the missing evidence writer exists.
6. Obtain human review of formal administration changes, capability labels,
   sufficiency thresholds, sharing/disclosure, retention and practice content.
   Growth still needs approved comparable forms and validation studies.
7. Validate the intended environment with `audit:flow-flags`, verify database
   availability/migrations and report ownership, and test the complete journey
   against the staged build using synthetic accounts and governed content.
8. Only after every P0 gate passes and rollout is approved, use the existing
   reviewed release pipeline for a limited cohort. Do not enable unrelated
   Campus analytics or growth flags to make Personal Prism usable.
9. Observe durable evaluation state, evidence capture failures, report access
   failures and missing history without logging answers, transcripts or tokens.
10. Before rollback, drain active sessions or use an explicitly tested resume/
    recovery plan. Current flags-off routing can strand V3 sessions on legacy
    endpoints; do not claim a safe mid-assessment rollback. Do not reissue
    entitlements or charge candidates without the audited support workflow.
    Do not horizontally scale process-local locks/jobs as if distributed safety
    were implemented.

No production deployment, remote operation or flag flip was performed.

## Manual URLs and expected outcomes

Use the deployment origin in front of each path. Session and assignment IDs must
come from the authenticated UI, not guessing or another student's URL.

| URL | Expected check |
| --- | --- |
| `/login` | Returning account -> `/app` -> `/app/home` when shell enabled; launcher when dark |
| `/login?next=%2Fapp%2Fsettings%23profile` | Login preserves Profile fragment |
| `/dashboard` | Signed out -> login with `next=/dashboard`; signed in -> `/app/home` |
| `/profile` | Signed out -> login with `next=/profile`; signed in -> `/app/settings#profile` |
| `/app/home` | Current workspace; recent owned completed assessments and one-click server report links |
| `/app/assessments` | Active, Completed, Upcoming; dates, scope, report availability/review |
| `/app/settings#profile` | Enabled shell: personal details/account/workspaces/privacy/sharing/accessibility/security; dark shell: explicit recovery state |
| `/app/assessments/<assignmentId>/briefing` | Governed briefing and disclosure, not invented scenario families |
| `/app/assessments/<assignmentId>/system-check` | Consent/device checks; intro-before-clock requirement is still blocked |
| `/app/assessment/<sessionId>` | V3 session contract; 30-minute/intro/layout requirements still need repair |
| `/app/reports/<sessionId>` | Owned evidence-backed report; missing pipeline is a release blocker |
| `/score?session=<legacySessionId>` | Issued legacy report unchanged; private API authorization must be repaired before release |
| `/report/<sessionId>/v2` | Compatibility remains; no silent rewrite of issued results |
| `/app/sharing` and `/shared/<explicitShareToken>` | Approved disclosure scope, expiry, revocation; no raw session-ID sharing |
| `/app/development` and `/app/growth` | Separate practice evidence; growth only for approved comparable forms |

## Validation checkpoint

- Entry targeted tests: 48 passed after correcting test selectors.
- Frontend latest full suite: 360 passed, 0 failed. Initial
  simultaneous build/server/unit run had selector and load-related failures;
  no tests were skipped or weakened to obtain the passing rerun.
- Server latest suite: 631 total, 607 passed, 0 failed, 24 database-gated skips.
- Build: passed (existing chunk-size warning remains). Static audit: passed.
  Flag checker: passed all-dark configuration; eight checker unit tests passed in
  the server suite. Final targeted entry/history/state suite before the two
  additional report-availability tests: 99 passed, 0 failed.
- Latest scoped browser verification: 96 passed, 0 failed across Chromium, Firefox, WebKit and
  mobile Chromium. Entry/history presentation was checked at 1440, 1280, 1024,
  768, 430, 390 and 360 with no horizontal overflow. Axe found no serious or
  critical issues on the tested entry/history/player surfaces. Player checks now
  include independent scroll, no document overflow, a persistent composer on both
  mobile panes, keyboard/dialog focus and cache-update/reload clock stability.
  The initial Chromium run had two failures: an exact-label test selector and
  unavailable Home API without a test database. Fixed the selector and explicitly
  labelled Home/history API fixtures. The added session fixtures also prove
  active-player layout and client countdown behavior, not ownership reconciliation,
  live evidence, physical-device keyboard behavior or support persistence.
  Other unmocked DB-backed requests returned honest 503 states.
  Screenshots at 1440/390 were inspected under `audit-results/ui/flow-repair/`
  and `audit-results/ui/flow-player/`.
- Recovery and old-account UI contract checks pass at 390, with screenshots
  inspected under `audit-results/ui/flow-recovery/`. The existing authenticated
  declaration endpoint was exercised on a synthetic account; report/session
  failure and older-account display states use labelled UI fixtures.
  Pending-state rechecks never call scoring. No new backend failure/job state
  was invented from a report's missing evidence.
- One existing Campus overview test failed in the first latest frontend run,
  passed unchanged in isolation, and the entire 345-test suite passed with
  `--maxWorkers=2 --minWorkers=1`. No test was disabled or weakened.
- The subsequent recovery suite initially caught one stale wording assertion
  and a WebKit clock-render timing assumption. Updated the exact review wording
  assertion and awaited the clock render with the same measured threshold;
  final results are 360 frontend / 96 scoped browser passes, no failures.
- Full browser suite, database-gated suites and real returning-student
  end-to-end completion are not certified by these numbers.
