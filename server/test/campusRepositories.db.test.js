// C3.05 — the same campus repository contract against Postgres (throwaway DB).
import test from 'node:test'
import { runCampusRepoContract } from '../test-support/campusRepoContract.js'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) process.env.DATABASE_URL = TEST_DB

const pool = skip ? null : await import('../db/pool.js')
const { migrateUp } = skip ? {} : await import('../db/migrate.js')
const { createPgCampusRepos } = skip ? {} : await import('../domain/campusStore/index.js')

let ready = null
async function repos() {
  if (!ready) ready = migrateUp().then(() => createPgCampusRepos({ query: pool.query, getPool: pool.getPool }))
  return ready
}

if (skip) {
  test('postgres campus repository contract', { skip: 'TEST_DATABASE_URL not set' }, () => {})
} else {
  runCampusRepoContract(test, 'postgres', repos)
  test.after(async () => { await pool.closePool() })
}
