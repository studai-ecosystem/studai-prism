import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

// Integration test for the Part C schema. Requires a throwaway Postgres:
//   set TEST_DATABASE_URL=postgres://user:pass@localhost:5432/prism_test
// Skips entirely when unset so the unit suite stays green without a DB.
const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB

// Point the pool at the test DB before importing it.
if (TEST_DB) process.env.DATABASE_URL = TEST_DB

const { migrateUp, migrateDown } = skip ? {} : await import('../db/migrate.js')
const { getPool, query, closePool } = skip ? {} : await import('../db/pool.js')
const { seedItems } = skip ? {} : await import('../db/seedItems.js')

test('migration up creates Part C tables, telemetry inserts, down drops them', { skip }, async (t) => {
  t.after(async () => { await closePool() })

  // Clean slate: roll back if a prior run left tables behind.
  try { await migrateDown() } catch { /* nothing applied yet */ }

  await migrateUp()

  // All 8 Part C tables exist.
  const expected = [
    'items', 'item_responses', 'judge_votes', 'behavioral_features',
    'ability_estimates', 'human_ratings', 'calibration_runs', 'audit_log',
  ]
  const { rows } = await query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name = ANY($1)`,
    [expected],
  )
  const present = new Set(rows.map((r) => r.table_name))
  for (const tbl of expected) assert.ok(present.has(tbl), `table ${tbl} should exist`)

  // Seeding is idempotent and produces rows.
  const first = await seedItems()
  assert.ok(first.total > 0)
  const second = await seedItems()
  assert.equal(second.inserted, 0, 're-seeding inserts nothing new')

  // An item_response links to a seeded probe item, and an audit_log row writes.
  const sessionId = randomUUID()
  const probe = await query("SELECT item_id FROM items WHERE kind='probe' LIMIT 1")
  const itemId = probe.rows[0].item_id
  await query(
    `INSERT INTO item_responses (response_id, session_id, item_id, exchange_no, candidate_text, latency_ms)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [randomUUID(), sessionId, itemId, 1, 'test answer', 1500],
  )
  await query('INSERT INTO audit_log (session_id, event_type, payload) VALUES ($1,$2,$3)', [
    sessionId, 'ai_turn', JSON.stringify({ exchange: 1 }),
  ])

  const ir = await query('SELECT count(*)::int AS n FROM item_responses WHERE session_id=$1', [sessionId])
  assert.equal(ir.rows[0].n, 1)
  const al = await query('SELECT count(*)::int AS n FROM audit_log WHERE session_id=$1', [sessionId])
  assert.equal(al.rows[0].n, 1)

  // Down removes the v2 tables.
  await migrateDown()
  const after = await query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name='items'`,
  )
  assert.equal(after.rows.length, 0, 'items table dropped after down')
})
