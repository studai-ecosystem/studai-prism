# Programme handoff - P0 to P10 (code-safe)

## P9 post-P8 integrated validation checkpoint - 2026-10-03

Verdict remains **NO-GO**. The source hypotheses (80% comprehension, 40%
voluntary relevant-practice activation, 25% seven-day voluntary return, at
least 30 genuine non-refunded purchases, a user-articulated advantage over a
strong matched-effort generic-AI comparator, and positive contribution under
measured use/recovery costs) are **INITIAL HYPOTHESES, NOT BENCHMARKS**. No
participant, payment, refund, transfer or live-model outcome has been entered.

Engineering, Content, Measurement, Security / privacy, Product-finance and
Operations are separate gates and are all **OPEN** pending human sign-off.
Machine validation is recorded in
`docs/experience/programme-validation-results.json`; BLOCKED and UNVERIFIED
entries are not converted to PASS by a green build or fixture.

Code-safe P9 closure is complete. Final evidence: build PASS; unit 516 passed;
server 858 passed / 26 skipped; static audit PASS (1,623 files, 113 review
leads); critical browser 217 passed / 3 recovered retries; real isolated
database 21 passed; calibration 64 passed; full four-project browser run 805
passed / 81 intentional skips / 6 recovered retries. T01-T60: **56 PASS / 3
BLOCKED / 1 UNVERIFIED**. All 18 new P9 screenshots were inspected. The
initial critical run found and fixed a non-self-contained database command and
a stale payment CTA test; no product entitlement or purchase behaviour changed.

Local load evidence met every planning target on the recorded host:
history 62.15/82.14 ms p50/p95, report 44.53/57.59 ms, durable acknowledgement
5/13 ms, controlled-provider reply 23.09/33.06 ms, publication 190/197 ms, and
controlled 150 ms client-delay history 177.98/185.55 ms. This is a
controlled-adapter observation, not an SLA or Layer C result.

Kill/redesign logic is fixed before results: misunderstood reports require
explanation/UX work; understood but unused practice requires a
relevance/effort investigation; same-script improvement without fresh-task
transfer requires learning-method revision; no willingness to pay requires
buyer/offer/distribution work. More dashboards do not compensate.

**Local implementation of P0-P10 is complete and verified at Layers A and B. Release verdict: NO-GO**
(`domain/release/goNoGo.js`) until the human gates listed in IMPLEMENTATION_STATE close. No deployment,
flag flip, push, live-model spend, production migration, pricing activation or participant contact occurred.

## Commits on `ui/prism-brand-transformation`
| Phase | Commit | Summary |
| --- | --- | --- |
| P0 | `ff6002c` | diagnostic baseline, read-only tooling, 112-ID ledger |
| P1 | `9d68738` | identity/history, durable actions (0040), erasure cascade, reconciliation |
| P2-P5 | `2079629` | evidence slice, jobs/publication (0041), practice origin (0042), timing/begin (0043), universal form + Director + ledger (0044), review requests (0045), Your Prism report |
| P6-P7 | `b9a97e4` | ten draft missions, meaning evaluator, replay/challenge, allowance (0046), private preparation + self-report (0047) |
| P8 | `c2a38dd` | product grants (0048), webhook idempotency, free first experience (0049), intent onboarding, offer/checkout config, Campus content gate |
| P9-P10 | this commit | metrics/events/alerts, fault suite, load/live harnesses, release config, rollback, migration rehearsal, retirement inventory, runbooks |

## Final verification (this checkout)
Server 808 tests: 783 pass / 0 fail / 25 DB-gated skips. Frontend 35 files, 474 pass. Build, static audit,
flag check PASS. Isolated PostgreSQL (embedded, 49 migrations) 6/6 incl. real scorer, erasure cascade,
durable actions. Browser (isolated, 4 projects): full `browser-all` 803 passed / 0 failed / 3 flaky-on-retry / 18 skipped.
Migration rehearsal: up 49 → down to 0040 → up, schema identical. Layer C: BLOCKED (no authorization).

## Invariants preserved
No fourth player (V3 `AssessmentPlayerPage` canonical; legacy readers/adapters retained); Report V3 evolved
in place with immutable versions; one history projection (no second store); practice/preparation/self-report
isolated from formal evidence; legacy scoring/stimulus/35-minute timing byte-identical for legacy runs;
sufficiency floors unchanged; all new content DRAFT behind `PRISM_DRAFT_CONTENT`; prices unchanged.

## Next human actions
See IMPLEMENTATION_STATE "What remains" and ROLLOUT "P10 release configuration and go/no-go";
SUPPORT_RUNBOOK and MANUAL_JOURNEYS for operators; RESEARCH_PROTOCOLS / VALIDATION_PLAN for the
measurement lead and product owner.

---

## Current P1 handoff checkpoint - 2026-10-02

**P1 IN_PROGRESS / BLOCKED, not COMPLETE.** This later checkpoint follows P0
`ff6002c`; the P0-only report below remains its historical phase-close record.

Implemented: safe account-default/explicit-intent navigation, approved next-path
validation and visible invalid-link recovery; legacy guarded destination
preservation; account/workspace request cancellation and stale-response guards;
known browser-draft cleanup and scoped page-state resets preserving same-owner
refresh and workspace-switcher focus/confirmation; honest issued legacy-report
presentation/read errors.

Verified so far: frontend 427 passed; server 624 passed/0 failed/25 skips;
real self-owned PostgreSQL/HTTP 4 passed, including the issued V2 reader and
unchanged original stored blob; build/static PASS. Full browser results are
pending in [TEST_RESULTS](./TEST_RESULTS.md).

Not delivered: reviewed historical-ownership/support-write integration, access
policy changes, durable pre-model acceptance/jobs/fencing/versioned lifecycle,
source-retention/erasure/stale-worker implementation, or billing/recovery changes.
Exact missing owners/contracts are in [ROLLOUT](./ROLLOUT.md). The phase prompt
does not supply those pending implementation/review references. No P2 progression
or completed-P1 commit is claimed. Protected runtime/production behavior stays
unchanged; independent UI and reader verification cannot close the foundation.

Current changes are persistent working-tree files; overlapping pre-existing
entry/router work is preserved and not swept into a phase-close commit.

Scope: approved P0 baseline/recovery preparation only. **No P1 execution.**
**P0 code-safe diagnostic baseline: COMPLETE.** Exact verification and preserved
failures are in [TEST_RESULTS](./TEST_RESULTS.md).
The full learner release remains **NO-GO**.
No scientific, privacy, commercial, content or production gate was approved.

## Delivered

- Repository-grounded [route/flag/ownership/lineage baseline](./BASELINE.md), preserving
  recent repairs and the complete pre-existing dirty snapshot.
- Operator-local [read-only diagnostic](../../scripts/check-experience-baseline.mjs):
  one bounded read-only transaction, allowlisted schema-checked aggregate output,
  no application DB fallback, migration/seeding/settlement/report-builder side effects,
  candidate payloads or identifier arguments.
- [Isolated runner](../../scripts/run-experience-baseline-tests.mjs) for real PostgreSQL
  and scoped four-browser checks, with temporary clusters/data, UTF-8 initialization,
  explicit child-process flag isolation and preserved failure exit status.
- [Diagnostic contracts/fault-window fixture](../../server/test/experienceBaseline.test.js)
  and [real HTTP/database baseline](../../server/test/experienceBaseline.db.test.js).
  The completed report and evidence were not preseeded.
- [112-ID requirement/phase/role mapping](./IMPLEMENTATION_STATE.md),
  [13 architecture/approval decisions](./DECISIONS.md),
  [screen inventory, 11 draft-review intakes and research protocols](./CONTENT_REVIEW.md),
  and [authorized support/recovery procedure](./ROLLOUT.md).

No new learner page, player, report architecture, practice store, formal scenario,
rubric, package/price or migration was introduced.

## Verified root causes and bounded observations

1. **Formal dialogue-to-strict-evidence gap:** a real synthetic PG/HTTP/legacy-scorer
   run completed and saved its original report, but generated zero judged strict
   dialogue evidence. Rendering V3 did not establish a publishable capability result.
2. **Source verification dependency:** PG completion removes session history used
   by V3 claim/quote construction. Separate optional telemetry retention is not the
   builder's source contract; this is not a claim that all customer data was lost.
3. **Receipt crash window:** with a Layer A injected receipt-write failure after
   the engine effect, retrying one event produced two effects and one receipt.
   Pending advisory locks do not by themselves close this window.
4. **Non-read-only GET paths:** report construction can append a version; session
   completion reads can settle state; admin initialization can seed RBAC. A store
   migration dry run also applies schema migrations. The diagnostic avoids them.
5. **Clock/introduction remain governed work:** the current start occurs before a
   separate introductory acknowledgement and uses the existing 35-minute window.
   P0 neither changes the administration nor clamps the displayed deadline.
6. **UI repairs are not stale defects:** returning-entry, no-material layout,
   fixed frame/panes/composer, countdown receipt and visible recovery states were
   rechecked, not reimplemented. Browser history/report/player examples remain
   explicitly fixture-labelled.

The isolated run also proved that accepted messages and receipts were stored,
the completed owned run appeared in history, a second owner was denied, real
dev-run telemetry was marked synthetic, and read-only diagnostic writes were
rejected. Those bounded observations do not close the full audience, failure,
research-exclusion, multi-instance or historical-customer matrices.

## Verification

See [exact commands/counts and failed development attempts](./TEST_RESULTS.md).
At the current checkpoint: build/static/config checks pass; frontend 360 pass;
server 624 pass, 0 fail, 25 DB-related skips; isolated P0 DB 3 pass; diagnostic
unit selector 9 pass. The initial 92 browser assertions passed but runner cleanup
failed. After the bounded Windows cleanup fix, the final runner exited 0 with
91 passed plus 1 flaky navigation that passed the unchanged automatic retry.
Runner-owned temporary clusters/data are removed and test ports are free.
An optional test-only audit data root was added after the full browser baseline
so each audit server's independent store is also within that cleanup boundary;
its narrow four-project smoke check passed all 8 cases with runner exit 0 and
the owned data-root cleanup verified.

Diagnostic tests remain green while the measured product invariants above remain
explicit FAIL/OPEN. Nothing was weakened, `.only`-selected or skipped to suppress
a reproduced product failure. The normal DB skip is reported and the separate
self-owned P0 DB invocation ran without skips.

Screenshots were actually inspected at desktop and narrow widths for conversation,
materials, dark portal, withheld report and failed scoring retry. Automated checks
also cover the repository's seven widths and keyboard/axe assertions. This is not
a manual assistive-technology audit or production UI approval.

## Exact P0 file set

```text
scripts/check-experience-baseline.mjs
scripts/run-experience-baseline-tests.mjs
scripts/start-audit-server.mjs
server/test/experienceBaseline.test.js
server/test/experienceBaseline.db.test.js
docs/experience/BASELINE.md
docs/experience/IMPLEMENTATION_STATE.md
docs/experience/DECISIONS.md
docs/experience/TEST_RESULTS.md
docs/experience/CONTENT_REVIEW.md
docs/experience/ROLLOUT.md
docs/experience/FINAL_REPORT.md
docs/ui/UI_PROGRAM_STATE.md
docs/ui/FLOW_REPAIR_MAP.md
docs/ui/FLOW_REPAIR_READINESS.md
```

The final three files receive only related checkpoint cross-references. Existing
A-M completion markers and previous repair evidence remain unchanged.
Dependency manifests/locks, runtime sources and pre-existing work are excluded
from the local P0 phase commit. Audit output is ignored, synthetic and not committed.
Verification includes the preserved dirty checkout, including its already-installed
embedded-postgres dependency and entry/locking fixtures. This is not a clean-checkout
release assertion; those pending changes need separate review/integration.

## Remaining gates and ordered handoff

| Next dependency | Owner/evidence needed | Status |
| --- | --- | --- |
| Actual deployed failure/success comparison | Named operator; approved case access; build/config/applied-schema provenance | NOT SUPPLIED |
| P1 proven-owner history and durable acceptance design | Engineering/security review; conflict handling, compatibility and idempotency proof | OPEN; next implementation phase |
| Save-before-evaluate and effect-before-receipt recovery | Engineering; PG crash/race/restart tests across actual engine effects | OPEN |
| Governed evaluator/opportunity source | Content + measurement; reviewed method, source/provenance and technical-failure contracts | OPEN; P2/P4 |
| Source retention, deletion and rebuilding basis | Privacy/counsel + operations + measurement; explicit reviewed source/retention contract | OPEN; no policy change here |
| Pre-clock start/timing/accommodations | Measurement/accessibility/product; version-pinned administration review | OPEN; P3 |
| Durable jobs/report publication/rollback | Engineering/operator; restart, lease, immutable-version and active-run rehearsal | OPEN |
| Recovery credit/refund/reissue | Paul/finance/support; approved auditable policy | PROPOSED ONLY |
| Universal/practice content | Named content/measurement reviewers; CORE-TEAMREADY-A and M01-M10 decisions | DRAFT INTAKE ONLY |
| Live models, research and manual accessibility | Approved budget/consent/protocol; independent reviewers and actual users/devices | NOT RUN |

The first next task is P1's reviewed identity/history/persistence foundation, not a
cosmetic redesign or production flag flip. The P0 failure evidence supplies its
priorities; it does not authorize protected implementation.

## Compatibility, rollback and unchanged behaviour

No application rollback is needed for P0's documentation/standalone diagnostics.
The application still has its previous active-run/flag-off constraints; safe
mid-assessment rollback is not proved. Do not use diagnostics to re-score,
reclaim ownership, reissue a report or modify retention.

Scoring, scientific gates, evidence generation, historical stimulus, timing,
entitlements/billing, backend authorization, privacy/retention and credential
cryptography are unchanged. Test-only flags and the existing external-model
fixture are confined to disposable processes/stores. No production change,
customer data access, live-model spending, participant contact, push, PR, merge
or deployment occurred.

Local phase commit: the explicit 15-file commit containing this handoff; its
identifier is reported in the execution response. No pre-existing dirty files
are included, and no push is authorized.
