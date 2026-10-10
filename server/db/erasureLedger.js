// PROD-READY Phase 2 (S8) CLI — read the account erasure ledger (read-only).
//
//   npm run erasure:ledger -- --open              → every RUNNING/FAILED run
//   npm run erasure:ledger -- --user <account id> → every run for that person
//       (the id is hashed into the subject reference locally; the ledger never
//       stores it) with its steps — the operator's proof of completion.
// A FAILED run is resumed by repeating the same erasure (the user's own
// DELETE /api/assessment/candidate-data, or re-executing the admin privacy
// request); done steps are skipped.
import { fileURLToPath } from 'url'
import { isDbConfigured, closePool, query } from './pool.js'
import { erasureLedgerFor } from '../domain/privacy/erasureCascade.js'

async function main() {
  if (!isDbConfigured()) {
    console.error(JSON.stringify({ level: 'error', msg: 'erasure_ledger_no_database', code: 'DATABASE_URL_MISSING' }))
    process.exit(1)
  }
  const at = process.argv.indexOf('--user')
  if (at > 0 && process.argv[at + 1]) {
    console.log(JSON.stringify({ level: 'info', msg: 'erasure_ledger_subject', ...(await erasureLedgerFor(process.argv[at + 1])) }))
  } else {
    const { rows } = await query(`SELECT id, subject_ref, initiated_by, scope, status, session_count, attempts, last_error, started_at, updated_at
      FROM privacy_erasure_runs WHERE status <> 'COMPLETED' ORDER BY started_at`)
    console.log(JSON.stringify({ level: 'info', msg: 'erasure_ledger_open_runs', count: rows.length, runs: rows }))
  }
  await closePool()
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(JSON.stringify({ level: 'error', msg: 'erasure_ledger_crashed', error: String(error?.code || error?.message || error) }))
    process.exit(1)
  })
}
