// Charter §20 CLI — JSON store → PostgreSQL migration + reconciliation.
//
// Usage (always through the secrets wrapper so DATABASE_URL comes from
// Secrets Manager, never argv/shell history):
//   npm run migrate:store            → DRY-RUN: counts + reconciliation only
//   npm run migrate:store -- --enforce → copy, then reconcile; exits non-zero
//                                        unless reconciliation is clean
//
// This script NEVER touches PRISM_PG_STORE — the cutover flag flip is a
// human-gated step (docs/PG_MIGRATION_RUNBOOK_v1.md, HA-023).

import { fileURLToPath } from 'url'
import { isDbConfigured, closePool } from './pool.js'
import { migrateUp } from './migrate.js'
import { migrateJsonStoreToPg, reconcileStores } from './storeMigration.js'

async function main() {
  if (!isDbConfigured()) {
    console.error(JSON.stringify({ level: 'error', msg: 'store_migration_no_database', code: 'DATABASE_URL_MISSING' }))
    process.exit(1)
  }
  const enforce = process.argv.includes('--enforce')

  // Schema must be current before any copy.
  await migrateUp()

  const migration = await migrateJsonStoreToPg({ dryRun: !enforce })
  console.log(JSON.stringify({ level: 'info', msg: 'store_migration_report', ...migration }))

  const reconciliation = await reconcileStores()
  console.log(JSON.stringify({ level: 'info', msg: 'store_reconciliation_report', ...reconciliation }))

  await closePool()
  if (enforce && !reconciliation.ok) {
    console.error(JSON.stringify({ level: 'error', msg: 'store_reconciliation_failed', code: 'RECONCILIATION_MISMATCH' }))
    process.exit(1)
  }
}

// CLI gate: run only when invoked directly (or via runWithRuntimeSecrets,
// which rewrites argv so this file believes it is the entry point).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(JSON.stringify({ level: 'error', msg: 'store_migration_crashed', error: String(error?.code || error?.message || error) }))
    process.exit(1)
  })
}
