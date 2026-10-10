// PROD-READY Phase 3 CLI — record the assessment form of older sessions.
//
// Usage (through the secrets wrapper so DATABASE_URL comes from the runtime
// secrets, never argv/shell history):
//   npm run sessions:pin-forms               → DRY-RUN: counts per form only
//   npm run sessions:pin-forms -- --enforce  → writes assessment_form_id where
//       it is NULL (evidence units first, then today's catalog); never changes
//       a recorded value. Run after the PostgreSQL cutover (HA-023) and before
//       any scenario-bank version bump.
import { fileURLToPath } from 'url'
import { isDbConfigured, closePool } from './pool.js'
import { pinSessionForms } from '../domain/assessments/sessionFormPins.js'
import { defaultScenarioSource } from '../domain/campusStore/defaultContext.js'

async function main() {
  if (!isDbConfigured()) {
    console.error(JSON.stringify({ level: 'error', msg: 'session_form_pin_no_database', code: 'DATABASE_URL_MISSING' }))
    process.exit(1)
  }
  const enforce = process.argv.includes('--enforce')
  const report = await pinSessionForms({ dryRun: !enforce, scenarioSource: defaultScenarioSource })
  console.log(JSON.stringify({ level: 'info', msg: 'session_form_pin_report', ...report }))
  await closePool()
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(JSON.stringify({ level: 'error', msg: 'session_form_pin_crashed', error: String(error?.code || error?.message || error) }))
    process.exit(1)
  })
}
