# P0 diagnostic recovery and operator handoff

## P9 independent go/no-go gates - 2026-10-03

Overall verdict: **NO-GO**. These six gates are independent and remain **OPEN**
until the named human owner signs the evidence. An engineering test result does
not sign a content, measurement, security/privacy, product-finance or operations
gate. `server/domain/release/goNoGo.js` enforces the same default.

| Gate | Owner / evidence needed | Status |
| --- | --- | --- |
| Engineering | Engineering lead; final deterministic, disposable-PostgreSQL, browser, load and recovery records with failures dispositioned | OPEN |
| Content | Content owner with measurement lead; approved pilot form, rubric and enough reviewed missions for the offer | OPEN |
| Measurement | Qualified measurement lead; intended-use/construct/task/timing/accessibility/confounds review, rater plan, preregistered thresholds | OPEN |
| Security / privacy | Security/privacy owner; research consent/data class/retention/rater access and live-run manifest review | OPEN |
| Product-finance | Product/finance owner; spend limit, incentives, price, refund/reissue and contribution decision | OPEN |
| Operations | Operations lead; staging target, credentials, live-model authorization, alert routing and active-run rollback rehearsal | OPEN |

Actual participant interviews, observed sessions, payments, refunds, live-model
runs and manual accessibility sessions: **NOT RUN**. Their result stores are
empty; the prepared templates and protocols are not outcome evidence.

Local engineering evidence is complete for this code-safe checkpoint: build,
516 unit tests, 858 passing server tests (26 skipped), 21 disposable-database
tests, 64 calibration tests, critical browser 217 passes, and full browser 805
passes with 81 intentional skips. This evidence is available for the
Engineering owner to review but does not self-sign that gate. Layer C remains
fail-closed; rollback, alert routing and live target authorization remain
Operations decisions.

## P8 activation gates - 2026-10-03

The free experience, intent onboarding, offer configuration, idempotent grants and checkout
states are implemented and verified locally in provider TEST mode. Nothing here authorises a
live price, a live charge, an invoice or a contract change.

| Action | Owner / evidence needed | Status |
| --- | --- | --- |
| Approve the sprint price (₹499 is a test hypothesis) and set `PRISM_OFFER_PRICE_APPROVED=true` | Finance / owner; recorded approval | BLOCKED (PROPOSED) |
| Configure tax treatment text `PRISM_TAX_TREATMENT` | Finance; checkout shows "Tax: as configured by finance — not yet approved" until set | BLOCKED |
| Approve recovery / review / refund policy (`offer-policy.v0.1-proposed`) | Finance + support; `releaseForTechnicalFailure` issues no refund until then | BLOCKED (PROPOSED) |
| Review and approve at least four missions and the universal form (CONTENT_REVIEW.md) — the bundle cannot be sold while `CONTENT_NOT_REVIEWED` / `FORM_NOT_REVIEWED` blockers stand | Content + measurement reviewers | BLOCKED (1 of 4 reviewed; form DRAFT) |
| Define the professional preparation pack allowance before any sale | Owner | BLOCKED (UNAVAILABLE_PENDING_OWNER_QUOTA; INR 999 only after demand evidence) |
| Live Razorpay keys + `RAZORPAY_WEBHOOK_SECRET`, one authorised live transaction test, then disable `PRISM_DUMMY_PAYMENTS` | Operator with finance authorisation; redacted evidence | BLOCKED (test mode only) |
| Research-permission use: a reviewed research manifest before any read of `research_permission` | Research + privacy (HA-C005/008) | BLOCKED (recorded, unused) |
| Soft budget `PRISM_SOFT_BUDGET_USD` value and alert routing | Operations | OPTIONAL (unconfigured = no limit; never interrupts a paid run) |
| Migration 0053 on production (after 0052) | Operator; backup, reversible via `.down.sql` | Additive, tested on disposable PG (53 applied) |

Rollback: unset `PRISM_OFFER_PRICE_APPROVED` (bundle returns to unpurchasable; existing grants
and entitlements untouched); `0053_intent_display_and_research.down.sql` drops the three
preference columns; the engagement keys in `reminder_policy` are ignored by older readers.
Existing ₹499 entitlement rows and Campus contract rows are byte-identical before and after
this phase (T57 snapshot test).

## P7 activation gates - 2026-10-03

Private preparation is implemented and verified locally (DRAFT prompts, flag default OFF).
These are the actions that remain before `PRISM_PREPARATION_V1` may be switched on anywhere.

| Action | Owner / evidence needed | Status |
| --- | --- | --- |
| Review `server/prompts/preparation_participant.v2.md`, `preparation_action_card.v2.md`, `preparation_assist.v1.md` (CONTENT_REVIEW.md, Appendix B) | Content + measurement review; recorded approval | BLOCKED (DRAFT) |
| Privacy/retention review of preparation copy, minimal-retention approach for intent/turn/card/check-in text, and the "redaction is help, not a guarantee" wording | Privacy/counsel | BLOCKED |
| Live-model (Layer C) check of participant pushback, sample sentences and card wording on staging | Engineering with staging authorization; redacted transcripts | NOT RUN |
| Migration 0052 on production (after 0047) | Operator; backup, reversible via `.down.sql` | Additive, tested on disposable PG (52 applied) |
| Operator flip of `PRISM_PREPARATION_V1` (HA-C001) after the above | Operator | BLOCKED by the rows above |
| Formal form-pair comparison approval (T46) | Measurement owner; equating evidence | BLOCKED — fixture approval only; Growth stays "not comparable" |

Rollback: unset `PRISM_PREPARATION_V1` (routes → NOT_FOUND, nav item → "Not yet available",
`/app/prepare` → in-shell unavailable state); `0052_preparation_hardening.down.sql` drops the
added columns and restores the three-actor check. Historical preparation rows are never read
by reports, analytics or Campus.

## P1 protected integration gates - 2026-10-02

The foundation is implemented locally and verified on disposable PostgreSQL;
the remaining items are production/approval actions, not missing code.

| Action | Owner / evidence needed | Status |
| --- | --- | --- |
| Production ownership reconciliation run (`scripts/reconcile-ownership.mjs --apply`) | Operator + security; dry-run report reviewed, backup taken, CONFLICTING/UNCLAIMED samples inspected | Script ready; execution operator-gated |
| Support decision workflow for CONFLICTING/UNCLAIMED | Support + security; approved evidence protocol | Read-only categories + audited apply path exist; UI workflow deferred to P8 admin |
| Migration 0040 on production | Operator; applied after backup, reversible via `.down.sql` | Additive, tested on disposable PG |
| Legacy `/evaluate` job registry cutover to `assessment_jobs` | Engineering; restart/lease tests on PG | Job repo + fencing tested; wiring is P2 |
| Retention basis for `assessment_candidate_actions` payloads and backup expiry | Privacy/counsel | Open policy question |
| Recovery reissue/refund/credit effects | Paul/finance/support | Proposed only |

Prepared: 2026-10-02. **PROCEDURE PREPARED; execution approvals pending.**
Complete learner journey: **NO-GO**. Active-run-safe rollback: **NOT PROVEN**.

## Scope and source authority

This is the approved P0.5 diagnostic-only record: authorized lookup preparation,
read-only lineage/reconciliation and recovery decision evidence. It is not a release
instruction, an approved retry/re-analysis/reissue policy or an executed recovery.
No customer runs, production database, deployment or effective runtime flags were
queried. No credits, refunds, ownership writes, re-scoring, migrations, retention
changes, runtime fixes or flag changes are authorized or performed here.

Sources: [P0 execution prompt](../../../.github/prompts/plan.prompt.md), P0.2-P0.5,
and [master plan](../../../.github/prompts/document.md), sections 10, 15-18, 25,
27, 33-35. The historical source snapshot is not today's deployment.
Local source inspection used observed HEAD `f40bd1c` and preserved existing dirty
persistence/routing/lock work. The local diagnostic-only phase commit is recorded
in [the P0 handoff](./FINAL_REPORT.md); it does not authorize rollout.

Cross-references:
[current repair readiness](../ui/FLOW_REPAIR_READINESS.md),
[repair map](../ui/FLOW_REPAIR_MAP.md),
[Campus rollout plan](../campus/ROLLOUT_PLAN.md),
[Campus human actions](../campus/CAMPUS_HUMAN_ACTIONS.md),
[wider human-action register](../remediation/HUMAN_ACTION_REGISTER.md) and
[content/research intake](./CONTENT_REVIEW.md).
Historical test outcomes and prepared human work packets in those records are not
fresh tests, human approvals or proof that the actual pipeline now works.

## Operator preconditions: do not access a real run yet

The following is an operator checklist for a **separately authorized** investigation.
This P0 work does not provide that authority or credentials.

1. Assign a named operations/support operator and engineering contact; obtain
   approved case purpose, environment, minimum data scope and security/privacy
   access basis. Do not treat an agent, sponsor or UI guard as support authority.
2. Record operator-supplied deployment/build provenance, effective allowlisted
   flag booleans, store kind and schema compatibility. Keep code migration head
   separate from applied database head. All real-environment values here are
   **UNKNOWN / NOT SUPPLIED**, not false, off or zero.
3. Have engineering approve the narrow projection/query and its imports. Use a
   read-only database role and transaction; no application boot, route/service
   initialization, seeding, settlement, report construction or model access.
   Read-only SQL may still invoke side-effecting functions, so allowlist the query.
4. Prove write rejection on a demonstrably disposable test store before approving
   the diagnostic path. Never test a write against real data to prove read-only
   access, and never assume an existing local store is disposable.
5. Use the authenticated subject and authoritative owner/scope links. A support
   reference can locate a candidate record in a restricted channel, but it grants
   no access. Do not enumerate unrestricted runs or paste raw IDs into tickets.
6. Select a narrowly scoped comparison run only if separately authorized. “Affected”
   and “working” are hypotheses until lineage evidence establishes the difference.
7. Stop on unavailable access, ambiguous ownership, held/invalidated restrictions,
   query failure or unexpected writes. Record **BLOCKED / UNKNOWN** with a reason;
   do not emit an empty successful report.

Store any real investigation's restricted lookup mapping in the approved operator
system, not this repository. Shared diagnostic output contains schema-validated
counts, reason codes, status/version metadata and redacted case-local references
only. No names, emails, unrestricted user/session IDs, raw responses, excerpts,
model prompts, credentials, tokens or credential-bearing URLs in output, telemetry
or this document. Safe metadata does not authorize reading payload contents.

## Authorized owned-run lookup and history triage

Inspect the server's actual ownership chain, not what a URL or screen appears to
allow. Relevant references:
[global legacy guards](../../server/app.js),
[V3 reports router](../../server/routes/v1/reports.js),
[session service](../../server/domain/assessments/sessionService.js),
[scoped directory](../../server/domain/student/sessionDirectory.js) and
[report service](../../server/domain/reports/v3/service.js).

| Check | Required read-only evidence | Stop / interpretation |
| --- | --- | --- |
| Authenticated identity | Existing authoritative account link and approved operator purpose | UUID possession, display name or matching email text alone is not ownership. Do not transfer or merge accounts. |
| Candidate records | Existence of session, original report and scope row, checked separately | Missing from a directory is not proof of missing records or deletion. |
| Owner consistency | Compare all available session/report/scope owner links against the authenticated subject | Current directory/report code prefers session owner then report owner; this precedence is not conflict resolution. Conflicting proof stays CONFLICTING. |
| Workspace and sponsorship | Personal versus institution scope and authoritative sponsor organization/assignment link | Sponsor access is bounded; it cannot expose personal preparation, other organizations or silently mix history. |
| Integrity/access restriction | Held/invalidated state and permitted purpose/audience | No report release, share or evidence promotion merely to investigate a withheld report. |
| Reader selection | Stored version/type and actual learner route, with safe route template rather than raw URL | Do not translate a legacy percentage into a V3 capability or rewrite the issued result. |
| Directory/filter exclusion | Owner/scoped ID enumeration versus underlying narrowly authorized existence checks | Record exclusion reason; an empty list is not automatic proof of erasure. |

Code facts, not live conclusions:
`sessionDirectory.listSessions()` first obtains legacy IDs for the user and filters
by workspace. An absent scope row is treated as PERSONAL in this directory; that
default is not proof that disputed historical sponsorship is resolved. Active
session authorization requires `session.userId` to match; report ownership can fall
back to the original report. Diagnose a mismatch without widening access.
`server\app.js` applies legacy report/session guards before mounting the assessment
router; absence of an inline guard alone does not make an endpoint public.

## Read-only session-to-report lineage checklist

Answer all nine questions separately for each authorized case; all case values in
this preparation are **NOT COLLECTED**. Counts of rows or a pre-seeded report cannot
prove that accepted work traversed the real pipeline.

| # | P0 question | Minimum projected evidence / limitation |
| --- | --- | --- |
| 1 | Does the run exist with proven owner/scope? | Session/report/scope presence and consistency, restricted access verdict, sponsor/assignment relation and integrity state. |
| 2 | Which engine/form/method was selected? | Persisted engine/scenario/form/rubric/method/version provenance where present. Missing pinning is UNKNOWN, not a version inferred from the current UI. |
| 3 | Are candidate responses and work changes durable? | Retained-source presence/count, accepted-action receipts and artifact version metadata; distinguish candidate/template/AI attribution and acknowledged versus unsubmitted drafts. Do not print content. |
| 4 | Which opportunities were actually presented/acknowledged? | Existing actual presentation/receipt evidence, if available. A blueprint or intended stage is not a delivered opportunity; absent ledger is a gap, not an invented opportunity. |
| 5 | Did interpretation jobs complete? | Existing job/attempt/error metadata and observability. Legacy process-local Maps do not establish durable cross-restart completion or absence of a job. |
| 6 | Were strict evidence units written? | Validated eligible unit counts/source-kind/provenance and normalizer rejection reason metadata where retained. Legacy scores and fluent dialogue cannot substitute for judged capability units. |
| 7 | What sufficiency decisions and reasons exist? | Retained decisions/rules versions/reason codes and claim withholding state, if recorded. Do not invoke an evaluator/builder to create new decisions for this read. |
| 8 | Is there an original report, stored V3 version, both or neither? | Inspect existing original report and version/hash metadata separately without calling the build-on-read service. Presence is not proof of verified quotes or successful intended-use publication. |
| 9 | What reader does the learner reach? | Current route/flag selection and intended stored-version compatibility; compare Personal/sponsored context. Runtime selection remains unverified until an authorized operator establishes it. |

Technical failure indicators include lost/unaccounted-for acknowledged work, source
verification failure, interpretation outage, missing eligible writer or incompatible
reader. A genuinely insufficient-evidence outcome requires intact lineage and a
governed reason, not just an empty report. A technically blocked investigation is
not a finding about the learner's capability. An expected-but-absent receipt is
not proof that the engine did nothing.

Current traced limitation: `sendMessage()` invokes the engine before
`putClientEvent()`; artifact saving invokes the engine before appending its durable
version/receipt. Diagnose the effect-before-receipt crash window. Do not assume a
new idempotency key, a lock or a “Try again” button makes replay safe.

## Read-path side effects and retention conflict

**HTTP GET, “Check again”, “dry-run” and admin pages are not automatically
read-only support probes.** Candidate-facing recovery controls can exist while
operator diagnostic execution is still blocked.

| Code path | Observed behaviour | P0 diagnostic constraint |
| --- | --- | --- |
| `GET /api/v1/assessment-sessions/:sessionId/report` -> `reports.forOwner()` -> `build()` -> `persist()` | Constructs V3 using current eligible inputs; appends `student_report_versions` and audit events for a new content hash. Other audience readers also use build. | Inspect existing version metadata directly through a reviewed read-only projection; do not poll this endpoint as a strictly read-only investigation. |
| `GET /api/v1/assessment-sessions/:sessionId` -> `sessionService.get()` | With an existing report, calls `settle()`: entitlement consumption and sponsored assignment completion/notification can occur. | Do not use it to claim zero-write status checks or entitlement reconciliation. |
| Admin-router middleware | `ensureSeeded()` can call `seedRbac()` on an enabled/database-backed request path; additional admin modules have seed hooks. | Do not boot the app or use the console to establish a supposedly inert probe. |
| `server\db\migrateStore.js`, without `--enforce` | Calls `migrateUp()` before the advertised data-copy dry run/reconciliation. | Never use `migrate:store` as a read-only diagnostic or run it in this P0 task. |
| `server\lib\storePg.js:saveReport()` | Upserts original report data and marks completion while removing `history` from session data. | Do not call save/re-evaluate to investigate; original historical outputs must not be overwritten. |
| `server\domain\reports\v3\service.js:build()` and `reports\claims.js` | Uses `candidateTurnsFrom(session.history)` for candidate quote verification. | Source removal and V3 verification are a retention/evidence dependency conflict; report presence does not prove citation verifiability. |

The PostgreSQL history purge is an observed code dependency, not proof that a
particular production session's source has been erased. Check retained source
presence under approved access; do not reconstruct candidate text from report
summaries, model memory or invented quotations. Artifact versions alone do not
restore removed dialogue provenance. Retention extension, backup extraction,
erasure reversal or new source storage requires privacy/legal and measurement
approval plus reviewed engineering; none is proposed as an automatic P0 fix.

Uncommitted PostgreSQL advisory-lock implementation/wiring is present in
`server\domain\assessments\sessionLocks.js` and `sessionService.js`. Do not describe
all locking as memory-only. Its existence is **not** distributed-operation proof:
legacy `evaluationJobs`/`evaluationFailures` in `server\routes\assessment.js` still
use process-local Maps, and engine/receipt crash safety remains unproven. No lock,
restart, worker or persistence tests were run for this record.

## Read-only reconciliation categories

This is a proposed classification contract, not an implemented owner-claiming
algorithm or a performed backfill. No counts have been collected.

| Category | Required basis | Next authorized decision, never an automatic write |
| --- | --- | --- |
| MATCHED | All relevant available authoritative owner/scope proofs agree for an eligible record; lineage gaps recorded separately | Continue scoped read-only triage. It does not mean the report/pipeline is correct. |
| CONFLICTING | Inconsistent authoritative owner, sponsor or account-link evidence | Quarantine decision for designated identity/security owner; no precedence-based owner selection. |
| UNCLAIMED | Record located, but no sufficient authoritative link to the subject | Seek reviewed proof under the account-recovery procedure; no email/name/UUID claim. |
| DELETED | Explicit authoritative deletion/erasure evidence consistent with the record scope | Respect deletion/holds policy; no automatic resurrection or source reconstruction. Absence alone never qualifies. |
| EXCLUDED | Record outside approved purpose, workspace, authorization or reviewed eligibility boundary | Record safe reason; do not expose payload or count it as a recovered owned run. |

Define the eligible population, precedence for excluded/deleted/conflict cases and
reason-code vocabulary with the identity/security reviewer before any real report.
Use one primary category per eligible record and separate lineage issue codes;
nonexclusive fault tags must not be added into category totals. Keep restricted
lookups separate from aggregate output. Query/access failure is explicit with a
nonzero diagnostic status, not `0 matched` success.

## Recovery decision register: every mutation pending approval

| Proposed action | Status in P0 | Role owner / prerequisite | Required evidence before a later decision |
| --- | --- | --- | --- |
| Authorized read-only lookup | Procedure PREPARED; real case access NOT AUTHORIZED here | Named support operator + security/privacy reviewer | Approved purpose/scope, proven owner, reviewed zero-write projection and controlled output channel. |
| Retry an existing failed operation | PENDING policy/case approval; NOT EXECUTED | Engineering lead + named operator; measurement lead if scoring is involved | Retained eligible source, previous effect/receipt/job status, compatible pinned versions, cutoff/integrity eligibility, idempotency and cost/billing impact. An already approved retry would need its actual policy reference; none is supplied. |
| Reviewed re-analysis | PENDING, distinct from a retry; NOT EXECUTED | Measurement lead + privacy reviewer + engineering lead | Source provenance/consent basis, explicit intended-use/method decision, discrepancy/technical-failure basis, reviewer authorization and versioned result linkage preserving the original. Never silently re-score historical results. |
| No-charge reissue after technical failure | PENDING commercial/recovery approval; NOT EXECUTED | Paul/product-commercial + named operator; engineering and assessment administration | Confirmed technical incident and owner/scope, entitlement/seat/payment reconciliation, source/draft handling, approved new-run timing/content and policy covering duplicate charges/credits. No promise or grant is made here. |
| Ownership reconciliation write/claim | Deferred P1; NOT AUTHORIZED | Identity/security owner + engineering lead | Resolved non-conflicting authoritative proof, audited scope decision, independently reviewed write path and reversible case plan. |
| Retained-source/erasure repair | BLOCKED privacy/evidence gate | Privacy/legal + measurement lead + engineering | Approved retention/source model, deletion/hold rules, lawful access and full derived-data/worker erasure tests. |

The intended paid technical-failure experience is preserved work, an honest
processing/support reference and an approved remedy rather than a forced second
purchase. It is not an advertised refund/credit entitlement or a guarantee that
unsaved work can be recovered. “Pending” does not imply active human review or
automatic eventual publication.

## Support case checklist and closure

- [ ] Approved operator, environment/purpose and restricted case reference recorded.
- [ ] Account/owner/workspace/sponsor proofs reconciled; access not widened.
- [ ] Nine lineage questions each answered or explicitly UNKNOWN/BLOCKED.
- [ ] Retained-source presence and original report/version protections recorded.
- [ ] Technical failure, genuine insufficiency, integrity restriction and reader
      mismatch kept distinct; no unsupported learner interpretation.
- [ ] Decision owner and actual policy/approval references recorded for any later
      retry, re-analysis or no-charge reissue; otherwise remain pending.
- [ ] Communication states only established facts, relevant workspace, support
      reference and next approved step; no new purchase, invented completion date,
      restored-source promise or unapproved refund guarantee.
- [ ] Redaction/output check completed; no payload/contact/token data copied here.
- [ ] Closure links the approved disposition and preserved historical versions;
      if blocked, records responsible role, missing evidence and next review.

This is an **unexecuted checklist**. No checked boxes, case findings, success
counts or customer communication are implied.

## Rollback caution and later release gates

**Active-run-safe rollback is NOT PROVEN.** `src\app\routing.jsx` can send a
flag-off V3 route to `/workspace/:sessionId` or `/report/:sessionId/v2`, while
server Campus/V3 legacy-path guards may refuse access. `?legacy=1` is not a
server-authorized escape. Neither a consistent all-dark configuration nor one
flag-check success establishes safe continuation for an active V3 run.

A later approved rollback requires an operator-owned rehearsal: stop new
allocations before removing a serving path; inventory active runs with approved
metadata; preserve pinned compatible engine/assets or drain them; verify refresh,
resume, accepted-work preservation, deadline/accommodation policy and report
access for Personal and sponsored runs. If continuation is impossible, obtain
the reviewed recovery disposition and customer communication. Schema/data rollback
is separately reviewed; do not drop evidence/version tables or silently move an
in-progress run to an incompatible player. P0 executes none of these actions.

| Gate | Accountable roles (named assignees pending unless supplied) | Evidence needed / current boundary |
| --- | --- | --- |
| Environment/access and readiness | Named operator + engineering lead | Deployment/build, effective safe flags, applied schema, store/services and actual worker observability. Real environment UNKNOWN; access not performed. |
| Owned history and immutable issued results | Identity/security owner + engineering lead | Conflict-safe ownership rules, scoped-reader coverage and original-result preservation. P1 write path deferred. |
| Durable accepted actions, evidence and publication | Backend/AI engineer + engineering + measurement lead | Real HTTP/disposable-PG boundary tests, external-model boundary only stubbed, crash/retry/distributed proof and strict source/sufficiency lineage. Fixture reports do not close this gate. |
| Content/intended use | Assessment specialist + external measurement lead | Named reviews, approved version packages and interpretation evidence; HA-C002/C003/C009 and CONTENT_REVIEW remain open. |
| Administration/timing | Assessment administration + measurement/accessibility leads | Approved intro/start/cutoff/grace/accommodation policy including existing runs. Current 35-minute contract unchanged. |
| Privacy, erasure and security | Designated security lead + counsel/DPO | Resolve source-retention conflict; erasure/worker non-resurrection, audience/legacy-route review and independent security evidence; HA-C005/C008/C010/C012 remain human-gated. |
| Accessibility and comprehension | Accessibility lead + UX/research lead | Manual assistive-technology evidence and consented comprehension observations; HA-C013. Proposed protocol is not a conducted study. |
| Recovery/commercial decision | Paul/product-commercial + named support operator | Approved incident/remedy/entitlement policy, capacity and disposition evidence; no credits/refunds/reissues approved here. |
| Activation/deployment/rollback | Named operator + product/governance owners | All prerequisite approvals, staged synthetic full journey, monitoring/restore evidence and active-run-safe rollback rehearsal; HA-C001/C007. NO-GO / NOT PROVEN. |

HA-C004 growth equivalence, HA-C006 institution commercial configuration and
HA-C011 live integrations also retain their existing human gates; they are not
required to invent extra P0 scope or silently activate unrelated features.
Carry forward **HA-C001-HA-C013** without closing or weakening any of them.
An assigned role is not a named engagement, approval receipt or permission to deploy.

## Completion and validation boundary

This recovery/operator record is prepared for the parent diagnostic baseline and
handoff. No runtime, credits, flags, schema, scoring, evidence, authorization or
retention behaviour was changed. No fresh build, unit/server/database/browser
tests, live-model calls or production checks were run for this documentation-only
work. Pending human gates and existing full-journey NO-GO are preserved.

## P10 release configuration and go/no-go

Appended by P10 (code-safe work only; nothing deployed, no flag flipped).

**Release configuration v1** (`server/domain/release/config.js`): stages
`LOCAL`, `STAGING`, `INTERNAL_CANARY`, `EXTERNAL_PILOT`, `WIDER`, each with a
required flag set (growth is never required) and six readiness checks:
`COMPATIBLE_PLAYER`, `DURABLE_WRITER` (store surface + migrations >= 0040),
`EVALUATOR`, `PUBLICATION`, `APPROVED_CONTENT` (content state >= the stage
minimum: DRAFT locally/staging, APPROVED_FOR_PILOT for canary/pilot,
APPROVED_FOR_INTENDED_USE for wider), `WORKER_REACHABILITY`. Each check is
`READY | NOT_READY | UNVERIFIED`; UNVERIFIED is never collapsed into READY.
`sessionService.start` calls `assertAllocatable()` for NEW universal/draft runs
BEFORE any seat is reserved or credit consumed -> `RUN_NOT_ALLOCATABLE` (503,
state-only details). The legacy start path is unchanged. Diagnostic:
`node scripts/check-experience-baseline.mjs [--database] [--stage <stage>]`
now reports `release` (safe, no secrets); unprobed checks stay UNVERIFIED.

**Migration rehearsal** (`node scripts/rehearse-migrations.mjs`): on a new
throwaway embedded-postgres cluster, up all (head 0049_preview_attempts) ->
down 0049..0040 one by one -> up again; schema identical and idempotent; every
0040+ migration has a `.down.sql`; no pre-0040 table is dropped
(`server/test/migrationsReversible.test.js`). This is a schema rehearsal with
no data; backup/restore and production migration-resume evidence remain
operator-owned.

**Rollback safety** (`server/domain/release/rollback.js`): `rollbackPlan`
orders stop-new-allocations -> inventory -> drain/pin active runs -> preserve
readers/shares -> disable serving flags only when `canDisable()` -> reviewed
recovery disposition -> customer communication -> schema rollback as a separate
review. `canDisable(flag, activeRuns)` is false while active V3 runs exist. A
universal run pinned to a method this build does not carry fails with
`RUN_VERSION_UNSUPPORTED` and is never handed to the legacy engine; a model
result arriving after an erasure marker is never written; stale fencing tokens
cannot complete; payment webhooks stay idempotent after rollback
(`server/test/rollback.test.js`).

**Retirement inventory** (`node scripts/route-usage-inventory.mjs`, no
deletion): LEGACY_CREATION (`/assessment`, `/payment`, `/workspace/:sessionId`,
`/missions*`, `/explore`, `/api/assessment`, `/api/payment`), LEGACY_READER
(`/score`, `/report/:sessionId/v2`, `/report/:sessionId/employee`,
`/shared/:token` - keep), V3 (`/app/*`, `/api/v1`).
Drain-window criteria before any LEGACY_CREATION removal: no active V3 run
depends on the route (`canDisable` true for every serving flag); zero new
sessions through LEGACY_CREATION routes for an operator-agreed window (proposal
14 days) measured from route telemetry; route tests green on the deployment
candidate (`server/test/legacyReadersRetained.test.js`); every LEGACY_READER
still serves owned reports and approved shares; operator sign-off recorded here
(HA-C007 covers the deploy). Readers are never retirement candidates.

**Monitoring/support**: alert definitions in `server/domain/release/alerts.js`
(operational view only), triage paths in `docs/experience/SUPPORT_RUNBOOK.md`,
manual journey URLs with placeholders in `docs/experience/MANUAL_JOURNEYS.md`
(untested in production).

**Go/no-go** (`server/domain/release/goNoGo.js`): verdict from readiness plus
HA-C001-HA-C013 statuses; every human gate defaults to OPEN; any OPEN gate of
the stage, missing flag, NOT_READY or UNVERIFIED required check -> `NO_GO`.
Current verdict for every stage above LOCAL: **NO_GO** (all human gates OPEN,
real environment UNVERIFIED). Nothing in P10 closes or weakens HA-C001-HA-C013.
