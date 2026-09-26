// C4.01/C4.02 on a throwaway Postgres (TEST_DATABASE_URL): 0030/0031 schema,
// CHECK constraints, reversible down, and the personal-assignment derivation
// through the real Postgres repositories (idempotent, one row per source).
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) process.env.DATABASE_URL = TEST_DB

const pool = skip ? null : await import('../db/pool.js')
const { migrateUp, migrateDown } = skip ? {} : await import('../db/migrate.js')
const { createPgCampusRepos } = skip ? {} : await import('../domain/campusStore/index.js')
const { createCampusContext, EMPTY_LEGACY_SOURCES } = skip ? {} : await import('../domain/campusStore/context.js')

async function tableExists(name) {
  const { rows } = await pool.query('SELECT to_regclass($1) AS t', [name])
  return rows[0].t !== null
}
async function columns(table) {
  const { rows } = await pool.query('SELECT column_name FROM information_schema.columns WHERE table_name = $1', [table])
  return rows.map((r) => r.column_name)
}
async function latest() {
  const { rows } = await pool.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1')
  return rows[0]?.name
}

test('0030/0031: schema, CHECKs fail closed, down reverses, personal derivation is idempotent on Postgres', { skip }, async (t) => {
  t.after(async () => { await pool.closePool() })
  await migrateUp()

  for (const name of ['assessment_forms', 'assessment_assignments', 'assessment_assignment_targets', 'assessment_assignment_students', 'user_preferences', 'product_events']) {
    assert.ok(await tableExists(name), `${name} exists`)
  }
  assert.ok((await columns('assessment_definitions')).includes('measures'))
  assert.equal((await columns('product_events')).includes('user_id'), false, 'product events hold no user id')

  // 0032: client events and artifact versions never change once written.
  const sid = `db-sess-${randomUUID()}`
  await pool.query("INSERT INTO assessment_client_events (session_id, client_event_id, kind, response_json) VALUES ($1, 'e1', 'MESSAGE', '{}')", [sid])
  await assert.rejects(pool.query("UPDATE assessment_client_events SET response_json = '{\"x\":1}' WHERE session_id = $1", [sid]))
  await assert.rejects(pool.query("INSERT INTO assessment_client_events (session_id, client_event_id, kind, response_json) VALUES ($1, 'e2', 'GUESS', '{}')", [sid]))
  await pool.query("INSERT INTO assessment_artifact_versions (session_id, artifact_id, version, content_json, saved_by) VALUES ($1, 'A', 1, '{}', 'CANDIDATE')", [sid])
  await assert.rejects(pool.query("UPDATE assessment_artifact_versions SET version = 2 WHERE session_id = $1", [sid]))
  // Erasure can still remove them (candidate words may be inside).
  await pool.query('DELETE FROM assessment_client_events WHERE session_id = $1', [sid])
  await pool.query('DELETE FROM assessment_artifact_versions WHERE session_id = $1', [sid])

  const reject = (sql, params) => assert.rejects(pool.query(sql, params), /check constraint|violates|null value/i)
  await reject("INSERT INTO assessment_forms (id, definition_id, version, scenario_id, capability_ids, status) VALUES ($1, 'prism-sim-gbo-l1', '1', 's', '{}', 'FROZEN')", [randomUUID()])
  await reject("INSERT INTO assessment_assignments (id, definition_id, form_policy, sponsor_type, integrity_policy, accommodations_policy, reminder_policy, created_by, status) VALUES ($1, 'prism-sim-gbo-l1', 'SERVER_SELECTED', 'PERSONAL', 'STANDARD', '{}', '{}', 'SYSTEM', 'ACTIVE')", [randomUUID()])
  await reject("INSERT INTO product_events (event, workspace_type, props, occurred_at) VALUES ('briefing_opened', 'SOMEONE', '{}', now())", [])
  await reject("INSERT INTO assessment_assignments (id, definition_id, form_policy, sponsor_type, integrity_policy, accommodations_policy, reminder_policy, created_by) VALUES ($1, 'prism-sim-gbo-l1', 'SERVER_SELECTED', 'PERSONAL', 'STANDARD', '{}', '{}', 'SYSTEM')", [randomUUID()])

  // Personal derivation through the Postgres repositories.
  const repos = createPgCampusRepos({ query: pool.query, getPool: pool.getPool })
  const userId = `db-student-${randomUUID().slice(0, 8)}`
  const legacy = {
    ...EMPTY_LEGACY_SOURCES,
    listEntitlements: async (uid) => (uid === userId ? [{ sessionId: `sess-${userId}`, mode: 'paid', userId, consumed: false, createdAt: new Date().toISOString() }] : []),
  }
  const campus = createCampusContext({
    repos,
    legacy,
    scenarioSource: async () => ({ generalScenarios: [{ id: 'db-general-a' }], bankScenarios: {} }),
  })
  const user = { id: userId, email: 'db-student@test.local', name: 'Synthetic' }
  const ws = { id: 'personal', type: 'PERSONAL', organizationId: null }
  const first = await campus.assignments.listForWorkspace(user, ws)
  const second = await campus.assignments.listForWorkspace(user, ws)
  assert.equal(first.active.length, 1)
  assert.deepEqual(second, first)
  const { rows } = await pool.query('SELECT a.created_by, a.personal_key, s.status FROM assessment_assignments a JOIN assessment_assignment_students s ON s.assignment_id = a.id WHERE s.user_id = $1', [userId])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].created_by, 'SYSTEM')
  assert.equal(rows[0].personal_key.includes(userId), false, 'no raw user id in the assignment row')
  assert.equal(rows[0].status, 'ASSIGNED')
  await pool.query('DELETE FROM assessment_assignments WHERE id = $1', [first.active[0].id])

  // Down to 0029 removes 0030/0031 cleanly; up restores them.
  while ((await latest()) >= '0030') await migrateDown()
  for (const name of ['assessment_forms', 'assessment_assignments', 'user_preferences', 'product_events']) {
    assert.equal(await tableExists(name), false, `${name} dropped`)
  }
  assert.equal((await columns('assessment_definitions')).includes('measures'), false)
  await migrateUp()
  assert.ok(await tableExists('assessment_assignment_students'))
})
