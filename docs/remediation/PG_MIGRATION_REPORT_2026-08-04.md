# PostgreSQL migration report — charter §20 (Phase 4)

Date: 2026-08-04. Programme: MASTER-2026-08-04. Status: **PREPARED — tooling,
rehearsal and runbook complete; production cutover NOT executed (HA-023)**.

## A. What was audited

- JSON/EFS store (`assessments.json`: 11 buckets; `users.json`: users) is the
  production transactional system of record; PostgreSQL (RDS PG 17,
  migrations 0001–0019) already carries telemetry/admin/audit/retention
  planes and full v1 store twins (`storePg.js`, `dbPg.js`).
- Contract parity verified in code: every store/user-db export is implemented
  by both backends with identical signatures and record shapes
  (`server/test/platform.test.js` export-parity check;
  `server/test/storePg.db.test.js` round-trip contract).

## B. What was built (this phase)

- `server/db/storeMigration.js` — timestamp-preserving idempotent copy of all
  12 JSON buckets into `v1_*` tables + read-path reconciliation producing
  per-bucket row counts, mismatch lists and SHA-256 hashes over canonical
  record sets (the charter's reconciliation evidence).
- `server/db/migrateStore.js` + `npm run migrate:store` — dry-run by default,
  `--enforce` copies then fails non-zero on any reconciliation mismatch.
  Runs only through the runtime-secrets wrapper; never touches
  `PRISM_PG_STORE`.
- CI rehearsal `server/test/storeMigration.db.test.js` (DB-gated): seeds a
  JSON store through the real storeJson/dbJson APIs, migrates, reconciles to
  zero mismatches, verifies post-migration erasure, reports, entitlements and
  disputes through the PG backend, and proves re-run idempotency.
- [PG_MIGRATION_RUNBOOK_v1.md](../PG_MIGRATION_RUNBOOK_v1.md) — backup
  (RDS snapshot + EFS backup), freeze, final sync, human flag flip,
  verification checklist, rollback; plus the post-cutover
  ≥2 replicas / RollingUpdate manifest diff (explicitly NOT applied while the
  JSON store is authoritative).

## C. What was NOT done (honest boundary)

- No production data was migrated. The cutover (backup, freeze, `--enforce`
  run against prod EFS, `PRISM_PG_STORE` flip, verification) is human-gated:
  register item HA-023. Under the ONE LAW the agent flips no flags.
- `infra/aws/prism-eks.yml` remains `replicas: 1` + `Recreate` (single-writer
  JSON store still authoritative); a guard test pins this.
- Reconciliation evidence for PRODUCTION data will exist only when HA-023
  executes; the evidence FORMAT is fixed by the tooling and rehearsed in CI.

## D. Verification evidence available now

- CI rehearsal test output (counts, `ok: true`, zero mismatches) in the CI
  run for the Phase 4 commit.
- Full suite green (Node + Python + build) on the Phase 4 commit.
