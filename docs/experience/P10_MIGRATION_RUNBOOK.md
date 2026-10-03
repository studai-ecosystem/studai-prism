# P10 migration rehearsal and candidate reconciliation

Status: code-safe templates and disposable rehearsal only. No command in this
document was run against production.

## Expand / contract sequence

1. Verify candidate build, release config v2 and expected migration head 0053.
2. Create an environment-owned backup and verify that it is readable.
3. Apply additive/expand migrations with starts disabled.
4. Run the read-only reconciliation and readiness diagnostic.
5. Start compatible workers; verify leases, fencing and publication.
6. Activate only the authorized stage/component bundle.
7. Drain pinned old handlers before any contract/removal migration.
8. Contract only after a separately approved compatibility window. P10 has no
   contract/drop operation.

## Disposable rehearsal

```powershell
npm run rehearse:migrations
```

The rehearsal creates and removes its own embedded PostgreSQL cluster. It
applies all 53 migrations, checks idempotency, rolls down 0040-0053, simulates
an interrupted transactional migration, resumes, and verifies the final head.
It performs no backfill.

## Read-only reconciliation

Set `PRISM_RECONCILE_DATABASE_URL` through the authorized secret mechanism; do
not put it in arguments, shell history or evidence:

```powershell
$env:PRISM_RECONCILE_DATABASE_URL = '<secret supplied by authorized operator>'
node scripts/reconcile-release-candidate.mjs
Remove-Item Env:PRISM_RECONCILE_DATABASE_URL
```

The command begins a read-only transaction and outputs aggregate counts/table
presence only. Ownership repair remains a separate, reviewed operation.

## Backup / restore templates (not executed)

Use environment-owned secret injection and a restricted output path:

```powershell
pg_dump --format=custom --no-owner --no-acl --file='<approved-backup-path>\prism-candidate.dump' '<authorized-connection>'
pg_restore --list '<approved-backup-path>\prism-candidate.dump'
createdb '<disposable-restore-target>'
pg_restore --exit-on-error --no-owner --no-acl --dbname='<disposable-restore-target>' '<approved-backup-path>\prism-candidate.dump'
```

Never paste credentials into evidence. Restore verification targets a new
disposable database, never the source. A failed backup, restore, reconciliation,
worker lease, form/model status, authorization/deep-link, report chain,
allowance/grant/share/erasure, support or approval check is a release blocker.

## Resume after interruption

Do not mark a migration applied manually. Confirm the migration transaction
rolled back, query the ledger read-only, repair the underlying cause, rerun the
normal migration command, then repeat reconciliation. Active runs remain on
their pinned handler. Schema rollback is not the application rollback path.
