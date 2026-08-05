# PG_MIGRATION_RUNBOOK v1 — JSON/EFS store → PostgreSQL system of record

Charter §20 (MASTER-2026-08-04). Status: **tooling + rehearsal complete;
production cutover NOT executed — human-gated (HA-023)**.

The agent-executable parts (migration tooling, reconciliation evidence,
CI rehearsal, this runbook) shipped in Phase 4. Every step below marked
**[HUMAN]** requires an operator with production access and must be recorded
in the human-action register with evidence.

---

## 1. What moves

Production today: the JSON store on EFS is the transactional system of record
(`assessments.json` + `users.json` under `DATA_DIR`), single-writer
(EKS deployment `prism`, `replicas: 1`, strategy `Recreate`). PostgreSQL (RDS
PG 17) already holds the telemetry and admin planes (migrations 0001–0019) and
has byte-compatible v1 store twins (`storePg.js`, `dbPg.js`) selected by
`PRISM_PG_STORE=true` + `DATABASE_URL`.

| JSON bucket | PG table |
| --- | --- |
| users.json `users[]` | `v1_users` |
| `payments` | `v1_payments` |
| `sessions` | `v1_sessions` |
| `reports` | `v1_reports` |
| `events` | `v1_events` (append-only) |
| `items` | `v1_items` (append-only) |
| `calibrations` | `v1_calibrations` |
| `consents` | `v1_consents` |
| `disputes` | `v1_disputes` |
| `verifications` | `v1_verifications` |
| `deviceLinks` | `v1_device_links` |
| `accommodations` | `v1_accommodations` |

Invites, admin accounts, telemetry, audit logs, retention machinery are
already PG-native — no migration needed; audit history is preserved because
nothing rewrites those tables.

## 2. Tooling

- `server/db/storeMigration.js` — copy (timestamp-preserving, idempotent
  upserts; append-only buckets copied only into empty per-session ranges) +
  read-path reconciliation (per-bucket counts, mismatch lists, SHA-256 over
  canonical record sets).
- `server/db/migrateStore.js` — CLI. Dry-run by default; `--enforce` copies
  and exits non-zero unless reconciliation is clean.
- `npm run migrate:store [-- --enforce]` — always via
  `runWithRuntimeSecrets.js` so `DATABASE_URL` comes from Secrets Manager.
- CI rehearsal: `server/test/storeMigration.db.test.js` seeds a JSON store,
  migrates, reconciles to zero mismatches, verifies erasure/report/entitlement/
  dispute round-trips through the PG store, and proves idempotency. Runs in CI
  (TEST_DATABASE_URL); skips locally.

## 3. Cutover procedure (all steps [HUMAN], strictly serial)

Rehearse first: run steps 3–5 against a dev environment/copy. Do not invent a
new environment; the CI rehearsal plus a dev-namespace run is the rehearsal.

1. **[HUMAN] Announce freeze.** No deploys, no admin mutations during the window.
2. **[HUMAN] Back up.** RDS manual snapshot of the prod instance AND an EFS
   backup (AWS Backup on-demand job) of the data directory. Record snapshot
   IDs in the register. **No cutover without both IDs recorded.**
3. **[HUMAN] Stop the writer.** `kubectl scale deployment/prism --replicas=0 -n prism`
   (via the SSM bastion port-forward). The JSON store is now quiescent.
4. **[HUMAN] Final sync.** In a one-off pod/job with the prod EFS mount and
   runtime secret: `npm run migrate:store` (dry-run; review counts), then
   `npm run migrate:store -- --enforce`. Keep both JSON report lines as
   evidence. Abort (go to §5) on any mismatch.
5. **[HUMAN] Flip.** Set `PRISM_PG_STORE=true` in the runtime secret
   (Secrets Manager — never a ConfigMap). This is a feature-flag flip:
   under the ONE LAW it is an operator action, never the agent's.
6. **[HUMAN] Restart.** `kubectl scale deployment/prism --replicas=1 -n prism`;
   confirm boot log line `v1_store_backend {"backend":"postgres"}`.
7. **[HUMAN] Verify (checklist §4).** If anything fails → rollback (§5).
8. **[HUMAN] Record.** Reconciliation reports, snapshot IDs, verification
   results → register (HA-023) + PROGRAM_STATE.

The JSON files are NOT deleted at cutover. They stay read-only on EFS as the
rollback target until the deprecation decision (post-verification, separate
human decision).

## 4. Post-cutover verification checklist

- [ ] New account registration + login (v1_users via PG).
- [ ] Invite redemption → entitlement visible (`v1_payments`).
- [ ] Assessment start/resume; session state persists across pod restart.
- [ ] Completed assessment report renders; credential verify page loads
      (evidence bundle hash unchanged for a pre-cutover session).
- [ ] Dispute submission + admin review packet.
- [ ] Erasure: erase a test session; confirm gone from every v1 table.
- [ ] Accommodations request/decide round-trip.
- [ ] Audit rows still appended (`audit_log`), retention dry-run endpoint OK.
- [ ] No writes to the JSON files (mtime unchanged since freeze).

## 5. Rollback (reversible by design)

1. `kubectl scale deployment/prism --replicas=0 -n prism`.
2. Set `PRISM_PG_STORE=false` (or remove) in the runtime secret.
3. `kubectl scale deployment/prism --replicas=1 -n prism`; confirm boot log
   `backend: json`. The JSON store was quiescent and untouched during the
   window, so no data reconstruction is needed.
4. Any rows written to PG during the failed window are ignored by the JSON
   backend; re-running `--enforce` later re-upserts and reconciles them.
5. Record the rollback + cause in the register before any retry.

## 6. Only after PG is authoritative: replicas + RollingUpdate

The single-writer constraint dies with the JSON store. **Only after** the
cutover is verified and PROGRAM_STATE records PG as the authoritative
transactional store, apply this diff to `infra/aws/prism-eks.yml`
(do NOT apply before — two pods sharing the JSON store corrupt it):

```yaml
 spec:
-  replicas: 1
-  strategy:
-    type: Recreate
+  replicas: 2
+  strategy:
+    type: RollingUpdate
+    rollingUpdate:
+      maxUnavailable: 0
+      maxSurge: 1
```

A guard test (`server/test/platform.test.js`) pins the manifest to
`replicas: 1` + `Recreate`; update that test in the same commit as the
manifest change, citing the PROGRAM_STATE entry that records PG authority.

## 7. Constraints (charter)

- CloudFormation stack `studai-prism-prod` owns EFS + RDS ingress that EKS
  depends on — never delete or modify it as part of this migration.
- Deploys strictly serial; never `deploy-aws.yml` (guarded ECS double-writer).
- Secrets only in Secrets Manager; the flip is a secret update, not a
  manifest/ConfigMap change.
