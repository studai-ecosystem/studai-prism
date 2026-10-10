// PROD-READY Phase 2 (S8) CLI — retention purge of student_import_rows.raw.
//
// Usage (through the secrets wrapper so DATABASE_URL comes from the runtime
// secrets, never argv/shell history):
//   npm run retention:import-rows               → DRY-RUN: counts + receipt only
//   npm run retention:import-rows -- --enforce  → clears raw cells of rows whose
//       import was committed/cancelled more than N days ago (N: registry
//       entity student_import_rows_raw, default IMPORT_ROW_RAW_RETENTION_DAYS,
//       PROVISIONAL pending HA-003). Refused without a dry-run receipt in the
//       last 24 hours or under an entity legal hold.
// Scheduled only by the Phase 5 job runner (job retention.import_rows), and only
// while PRISM_RETENTION_ENFORCEMENT is on.
import { fileURLToPath } from 'url'
import { isDbConfigured, closePool } from './pool.js'
import { purgeImportRowRaw } from '../domain/privacy/importRowRetention.js'

async function main() {
  if (!isDbConfigured()) {
    console.error(JSON.stringify({ level: 'error', msg: 'import_row_purge_no_database', code: 'DATABASE_URL_MISSING' }))
    process.exit(1)
  }
  const enforce = process.argv.includes('--enforce')
  const result = await purgeImportRowRaw({ dryRun: !enforce })
  console.log(JSON.stringify({ level: result.ok ? 'info' : 'error', msg: 'import_row_purge_report', ...result }))
  await closePool()
  if (!result.ok) process.exit(1)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(JSON.stringify({ level: 'error', msg: 'import_row_purge_crashed', error: String(error?.code || error?.message || error) }))
    process.exit(1)
  })
}
