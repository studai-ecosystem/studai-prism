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

---

## Addendum 2026-10-10 — PROD-READY Phase 3 (rehearsal at realistic size, multi-replica prerequisites)

Appended by PROD-READY Phase 3 (branch `prod/p03-multi-instance`); the runbook above is unchanged as a record. Decisions P37, P38 and P41 in [PROD_READY_STATE.md](production/PROD_READY_STATE.md). **The cutover was NOT executed** (HA-023 stays with the operator, charter law 1).

### What changed since August

- **The cutover is now a precondition of the next release.** Since commit `63d320d` (2026-09-21, after the production image `2b84e13` of 2026-08-05) production refuses to start unless `PRISM_PG_STORE=true` (`server/lib/store.js`, `assertProductionSecrets`, DEF-07). An image built from this branch therefore boots in production only after steps 1–6 of §3; plan HA-023 into that release window rather than after it.
- **Migrations 0040–0057** now exist (0040–0054 from the CR work on the branch, 0055 payment redemptions, 0056 erasure cascade, 0057 integrity guards). `npm run migrate:store` applies them all before copying (`migrateUp()` first, unchanged). New PG-native tables need no copy: candidate actions and jobs, run timing, opportunity ledger, report publication/reviews, preparation, product grants, previews, content review, the erasure ledger (`privacy_erasure_runs` / `privacy_erasure_steps`).
- **Payment redemptions (0055)** are a JSON bucket (`paymentRedemptions`) copied into `v1_payment_redemptions` (PRIMARY KEY `payment_id`; paid entitlements older than the ledger are backfilled, earliest first). They are now also **reconciled** (new bucket `paymentRedemptions`, keyed on the JSON ledger; rows backfilled from older entitlements have no JSON twin by design).
- **Session form id (0057)**: `v1_sessions.assessment_form_id` (nullable). The copy moves a JSON `assessmentFormId` into the column and never replaces a recorded value. After step 7 (verification) run `npm run sessions:pin-forms` (dry run), then `npm run sessions:pin-forms -- --enforce`, to record the form of older sessions from today's catalog — before any scenario-bank version bump.
- **Reconciliation performance fix**: the reconciliation used to re-read and re-parse the whole JSON file for every record (quadratic). The migration CLI now pins both JSON files read-only for the reconciliation (one parse; same public read paths; any write to a pinned file is refused). Without this the full-size reconciliation projected to hours.
- **Erasure ledger and key**: erasure in production now needs `PRISM_ERASURE_PSEUDONYM_KEY` (≥ 32 characters, secret store) or answers `503 ERASURE_NOT_CONFIGURED`; post-cutover checklist item "Erasure: erase a test session" therefore needs the key set first.

### Rehearsal (2026-10-10, synthetic data only)

Store generated by the committed `scripts/generate-synthetic-store.mjs` (deterministic seed 20261010; `@synthetic.invalid` identities; written to a scratch directory, never committed): 5,000 users, 8,000 sessions and entitlements, 4,831 payment redemptions, 5,992 reports, 24,000 events, 29,960 items, 8,000 consents and calibrations, 3,980 verifications, 794 device links, 111 disputes, 80 accommodations — `assessments.json` 33.0 MB, `users.json` 2.3 MB. Target: a throwaway embedded PostgreSQL 17 on the engineering workstation (absolute times are indicative; RDS over the network will differ — rehearse once more against the dev namespace before the window).

| Run | Time | Result |
| --- | --- | --- |
| Medium store (500 users / 800 sessions), code as found | 132 s `--enforce` | clean, but quadratic reconciliation (finding above) |
| Medium store, after the fix | 19 s `--enforce` | clean |
| Full store, dry run | 37 s (incl. 57 migrations on an empty DB) | nothing written; every key reported as not yet matched |
| Full store, `--enforce` | 186 s total: copy 152.8 s, reconciliation 33.0 s | `ok: true`; all 12 buckets `matched = jsonCount`, `mismatched: []`, `jsonHash = pgHash` |
| Full store, `--enforce` again | 114 s total: copy 73.9 s (events/items skipped for all sessions), reconciliation 39.4 s | `ok: true`, 13 buckets incl. `paymentRedemptions` 4,831/4,831 |

Report format (unchanged apart from the new bucket): `store_migration_report` `{dryRun, startedAt, finishedAt, dataDir, buckets: {name: {jsonCount, copied[, skippedSessions]}}}` and `store_reconciliation_report` `{ok, at, buckets: {name: {jsonCount, matched, mismatched: [keys], jsonHash, pgHash}}}`. A dry run lists every key under `mismatched` (multi-MB line at this size; the keys are record ids, no profile fields). Keep both `--enforce` lines as evidence (step 4).

Window planning: budget roughly 5 minutes for the final sync at this size on the workstation, plus a re-run if anything was written after the dry run; scale with the real counts from the dry run.

### Prerequisites for more than one replica (§6 extended)

§6 still applies (PG authoritative first, then the manifest diff with its guard test). In addition, **all** of these must hold before `replicas > 1`:

1. **Advisory locks (PROD-READY Phase 3) — done in code.** V3 session operations are serialised across replicas by PostgreSQL advisory locks on the dedicated lock pool (`PG_SESSION_LOCK_POOL_MAX`, default 5 per replica: at most that many V3 operations hold a lock at once per replica; size it to the expected concurrent in-flight turns within the RDS connection budget). Artifact saves reserve their version row before the engine. Without a database the lock is in-process only.
2. **PostgreSQL cutover (HA-023)** — the JSON store is single-writer.
3. **Shared legacy session cache**: set `REDIS_URL` (or route a session's requests to one replica). The frozen engine prefers its in-process per-turn cache over the store, so with the default in-memory cache a turn served by another replica can run on a stale transcript. Advisory locks do not fix this.
4. **Proctor socket**: sticky sessions on the ALB (or a socket.io adapter) so the desktop and phone of one pairing land on the same replica.
5. **Accepted per-replica state** (document or move): HTTP rate limits (`express-rate-limit` memory store, so limits multiply by replica count), the legacy `/evaluate` status map and speech budget in the frozen router, replay/teamfit live state.
6. Then the §6 manifest change, updating `server/test/platform.test.js` in the same commit with the PROGRAM_STATE entry that records PG authority.

---

## Addendum 2026-10-10 — PROD-READY Phase 7 (cutover commands on the distroless image, release ordering)

Appended by PROD-READY Phase 7; everything above is unchanged as a record.
Decisions P71, P75, P77 in [PROD_READY_STATE.md](production/PROD_READY_STATE.md).
**The cutover was NOT executed** (HA-023 stays with the operator).

1. **§3 step 4 ("in a one-off pod/job … `npm run migrate:store`")** — the
   runtime image is distroless (no shell, no `npm`). Use the prepared Jobs in
   `infra/aws/eks/jobs/cutover/jobs.yaml` (production only; they mount the EFS
   claim `prism-data`): render `infra/aws/eks/overlays/production/jobs` with the
   release tag, then `kubectl create -f prism-jobs.yaml -l prism.studai.one/job=store-migration-dry-run`,
   review the counts, then `…=store-migration-enforce`. Both run
   `/nodejs/bin/node server/config/runWithRuntimeSecrets.js db/migrateStore.js [--enforce]`.
   Keep both log lines (`store_migration_report`, `store_reconciliation_report`)
   as evidence. Exact commands: DEPLOYMENT_RUNBOOK_v1.md addendum 2026-10-10 §D.
2. **The cutover and the release are one window.** The image that contains
   the copy tooling fixes (P38) is also the image that refuses to start
   without `PRISM_PG_STORE=true`. Order: freeze → backups (IDs recorded) →
   `kubectl scale deployment/prism -n prism --replicas=0` → Job
   `migrate-status` → Job `migrate-up` (0021–0060) → Job
   `store-migration-dry-run` → Job `store-migration-enforce` (`ok: true`) →
   secret changes incl. `PRISM_PG_STORE=true` (human) → apply the rendered
   production overlay (replicas 1) → §4 checklist + smoke battery → Jobs
   `sessions-pin-forms-dry-run` / `-enforce`. Full sequence:
   [GO_LIVE_CHECKLIST.md](production/GO_LIVE_CHECKLIST.md) section C.
3. **§5 Rollback** additionally needs `kubectl rollout undo` (not
   `kubectl set image`): the previous image has no `/api/ready`, which the new
   manifest uses for readiness. See DEPLOYMENT_RUNBOOK addendum §G.
4. **§6 replicas** — the guard test now pins `infra/aws/eks/base/deployment.yaml`
   (the old single-file manifest is a tombstone); the multi-replica checklist
   of the Phase 3 addendum still applies in full.
5. **Rehearse once against production-shaped data before the window**, on an
   isolated, access-controlled staging database restored from an RDS snapshot
   and deleted afterwards (it contains personal data — a privacy decision for
   the operator; synthetic data is the default). So far only empty and
   synthetic databases have run 0021–0060 and the copy.
