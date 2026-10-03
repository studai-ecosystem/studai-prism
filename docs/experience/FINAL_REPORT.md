# P10 final handover - controlled rollout and compatibility

## 1. Decision and allowed state

**Allowed state: `CODE_IMPLEMENTED_WITH_VERIFICATION_BLOCKERS`. Release verdict:
`NO_GO`.** This work did not deploy, activate a release stage, flip production
flags, access a production database, call a live model or payment provider, or
claim manual, human, accessibility, content, privacy, security, commercial,
operations, measurement or Layer C approval.

The machine-readable authority is `docs/experience/P10_HANDOVER.json`.

## 2. Candidate scope and provenance

- Branch: `ui/prism-brand-transformation`.
- P10 baseline commit: `d9186b8`.
- Release configuration: `p10.release.v2`.
- Database head: `0053_intent_display_and_research`; 53 up migrations.
- P9 evidence is preserved, not re-labelled: build PASS; unit 516; server 858
  pass / 26 skip; static PASS; critical browser 217; database 21; calibration
  64; full browser 805 pass / 81 intentional skips / 6 recovered retries /
  zero final failures.
- The P9 validation ledger remains 56 PASS / 3 BLOCKED / 1 UNVERIFIED.

## 3. Canonical architecture and compatibility boundaries

New draft/universal allocation has one canonical player path. A readiness gate
runs before reservation or consumption and requires compatible player, durable
writer/worker, evaluator, publication, approved content and worker reachability.
Every new run pins release configuration, engine, method, form, rubric and
snapshot hash. Existing pinned runs use a compatible handler or fail closed;
they never fall back to the legacy player.

Report V3 remains the single new publication boundary. History remains a
workspace-scoped projection. The CH ledger and tests assert there is no hidden
alternative score path or fourth player. Legacy owned-report readers, version
adapters, frozen forms, entitlements, sponsor mappings and exports remain.

## 4. Versioned content, methods and approval state

| Asset | Version | State |
|---|---|---|
| Universal scenario/form | `draft-core-teamready-a:0.1.0-draft` | DRAFT; not approved |
| Assessment method | `v3-slice-0.1` | Code-verified Layer A/B; Layer C not run |
| Assessment rubric | `draft-teamready-rubric.v0.1` | DRAFT; not approved |
| Handover rubric | `draft-handover-rubric.v0.1` | DRAFT; not approved |
| Development mission library | library v1; M09 v2 | DRAFT; not approved |
| Preparation prompts/assistance | versioned in preparation service | DRAFT; privacy/content approval open |

Formal assessment surfaces expose no rubric, hints or coaching. Reviewed
practice may coach and is labelled practice. No price, tax, scientific,
readiness or validation claim is approved by this report.

## 5. Migration and data rehearsal

`node scripts/rehearse-migrations.mjs` used disposable embedded PostgreSQL only.
It applied all 53 migrations, confirmed a no-op second up, rolled down
0040-0053 one at a time, proved an interrupted 0040 transaction left the
migration ledger unchanged, then resumed through 0053. Legacy tables remained.
No backfill, production backup, production restore or production migration ran.

`scripts/reconcile-release-candidate.mjs` is a read-only aggregate candidate
check (`BEGIN READ ONLY`); it emits table presence/counts and migration head,
not rows, learner data, report content, tokens or identifiers. Backup/restore
templates and the expand/contract sequence are in
`docs/experience/P10_MIGRATION_RUNBOOK.md`.

## 6. Environment matrix and activation order

The only stages are `LOCAL_CI`, `STAGING`, `INTERNAL_CANARY`,
`EXTERNAL_PILOT`, and `WIDER_RELEASE`; `LOCAL` and `WIDER` are input aliases
only. Required order:

1. Personal Home/history.
2. Player, evidence and Report V3 together.
3. Reviewed practice.
4. Private preparation.
5. Approved paid packages.
6. Campus after privacy/retention/erasure approval.
7. Growth independently, after form comparability.

Publication unavailability blocks new allocation. The diagnostic exposes only
effective booleans, readiness states, build/schema compatibility and stable
blocker IDs. It does not expose secret values, probe payloads, learner data or
administrative controls. No stage was activated.

## 7. Rollback, drain and recovery

`node scripts/rehearse-rollback.mjs` proves the local synthetic T60 order:
stop starts; inventory and drain pinned active runs; preserve owned readers and
share scope; disable serving flags only after drain; retain queued erasure
tombstones and worker fencing; use an approved auditable reissue/refund/review
disposition if continuation is impossible; communicate; separately review
schema; restart only after readiness is re-established. There is no schema
drop. Unit/DB evidence covers worker crash, late model result, idempotent
payment callback, scoped shares and erased-run writeback fencing.

## 8. Compatibility and retirement inventory

The generated route inventory has five dispositions: `ACTIVE_NEW`,
`HISTORICAL_READER`, `ADAPTER`, `RETIRE_AFTER_DRAIN`, and `DEFERRED`. No route
was deleted. Duplicate legacy creation surfaces are only retirement candidates:
usage telemetry, a named/approved drain window, route tests and operator
approval are required. Insecure readers are authorization problems, never
deletion shortcuts; ownership and sponsor/share scope checks remain enforced.

## 9. Monitoring and support

Reference-only alerts cover accepted-action loss, technical empty reports,
history/ownership conflict, repeated start, queues/leases, failed claims,
unauthorized cross-scope attempts, cost outliers and recovery-credit anomalies.
Operational, measurement and customer views are separate. Alerts carry request,
run, job or grant references and aggregate counts only; no learner content.

`docs/experience/SUPPORT_RUNBOOK.md` assigns role placeholders (not people),
daily checks and triage for absent history, failed evaluation, disputed
interpretation, inappropriate content, privacy/erasure and paid technical
failure. Support never asks for tokens or hidden URLs and never edits evidence
or scores.

## 10. Verification evidence

Layer A commands for this P10 candidate include targeted Node tests, full
Vitest, full server tests, build, static audit, the CH/T/final-handover
validators, compatibility inventory and rollback rehearsal. Layer B commands
include the 53-migration disposable rehearsal, isolated database runner and the
focused P10 browser runner. Exact current outcomes are appended to
`docs/experience/TEST_RESULTS.md`.

The integrated Layer B lineage is the real current P2 database chain and P3-P8
browser journeys. It is not Layer C. Live-model/real-provider Layer C:
**NOT RUN**. Manual accessibility, assistive-technology, real-device and human
comprehension work: **NOT RUN**. No screenshot is presented as human approval.

## 11. Blockers and owners

| Gate | State | Required owner/evidence |
|---|---|---|
| T46 form comparability | BLOCKED | Measurement owner; approved real-form comparability |
| T54 recovery/refund policy | BLOCKED | Product/commercial owner; approved policy |
| T56 manual accessibility | UNVERIFIED | Accessibility owner; manual AT/device record |
| T58 Layer C | BLOCKED | Measurement/operations owners; authorized credentials, spend and lineage |
| Content/prompts | OPEN | Content owner |
| Price/tax | OPEN | Product/commercial owner |
| Privacy/retention | OPEN | Privacy owner / DPO |
| Security | OPEN | Security owner |
| Operations | OPEN | Operations owner |

Six independent sign-offs remain OPEN: product, engineering, measurement,
content, privacy/security and operations. Code/test authors do not self-sign.

## 12. Safe preflight and complete handover

Before any activation, an authorized operator must: name owners; approve
content/prompt, measurement, privacy/retention, security, price/tax, recovery
and operations gates; run read-only reconciliation on the actual candidate;
take and verify an environment-owned backup; verify build/schema compatibility;
run the environment-relative manual sequence; review alerts/support readiness;
record all six independent sign-offs; and obtain an explicit GO.

If any release prohibition is present or unverified - acknowledged work loss,
cross-user exposure, fabricated evidence, repeated technical zero result, no
approved recovery policy, or unavailable advertised practice - go/no-go remains
NO_GO. Follow `docs/experience/ROLLOUT.md`,
`docs/experience/P10_MIGRATION_RUNBOOK.md`,
`docs/experience/MANUAL_JOURNEYS.md` and
`docs/experience/SUPPORT_RUNBOOK.md`. This handover is complete for code-safe
work only; deployment and activation remain outside its authority.
