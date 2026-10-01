// C8.01 on a throwaway Postgres (TEST_DATABASE_URL): 0035 schema, published
// mission versions immutable, practice evidence append-only and marked as
// practice, attempt/plan CHECKs fail closed, the intervention FK on 0034's
// program link, and down → up.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) process.env.DATABASE_URL = TEST_DB

const pool = skip ? null : await import('../db/pool.js')
const { migrateUp, migrateDown } = skip ? {} : await import('../db/migrate.js')

async function tableExists(name) {
  const { rows } = await pool.query('SELECT to_regclass($1) AS t', [name])
  return rows[0].t !== null
}
async function latest() {
  const { rows } = await pool.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1')
  return rows[0]?.name
}
const TABLES = ['mission_definitions', 'mission_versions', 'interventions', 'intervention_memberships', 'mission_attempts', 'practice_evidence_units', 'development_plans', 'development_plan_items']

test('0035: governed missions immutable, practice ledger append-only, CHECKs fail closed, down reverses', { skip }, async (t) => {
  t.after(async () => { await pool.closePool() })
  await migrateUp()
  for (const name of TABLES) assert.ok(await tableExists(name), `${name} exists`)

  const mid = `MIS-DB-${randomUUID().slice(0, 6).toUpperCase()}`
  await pool.query("INSERT INTO mission_definitions (id, target_capability_id, status) VALUES ($1, 'CAP-L1-REASONING', 'ACTIVE')", [mid])
  await pool.query("INSERT INTO mission_versions (mission_id, version, status, schema_version, content, content_hash, published_at) VALUES ($1, 1, 'PUBLISHED', 's', '{}', 'h', now())", [mid])
  await assert.rejects(pool.query("UPDATE mission_versions SET content = '{\"x\":1}' WHERE mission_id = $1", [mid]), /immutable/)
  await assert.rejects(pool.query('DELETE FROM mission_versions WHERE mission_id = $1', [mid]), /cannot be deleted/)
  await pool.query("UPDATE mission_versions SET status = 'RETIRED' WHERE mission_id = $1", [mid])
  await assert.rejects(pool.query("UPDATE mission_versions SET status = 'PUBLISHED' WHERE mission_id = $1", [mid]), /republished/)
  await pool.query("INSERT INTO mission_versions (mission_id, version, status, schema_version, content, content_hash) VALUES ($1, 2, 'DRAFT', 's', '{}', 'h2')", [mid])
  await pool.query("UPDATE mission_versions SET content = '{\"draft\":true}' WHERE mission_id = $1 AND version = 2", [mid])

  const reject = (sql, params) => assert.rejects(pool.query(sql, params), /check constraint|violates|null value/i)
  await reject("INSERT INTO mission_versions (mission_id, version, status, schema_version, content, content_hash) VALUES ($1, 3, 'PUBLISHED', 's', '{}', 'h3')", [mid])
  await reject("INSERT INTO mission_definitions (id, target_capability_id, status) VALUES ('bad id', 'CAP-X', 'ACTIVE')", [])
  await reject("INSERT INTO mission_attempts (user_id, mission_id, mission_version, status, work, version, hints_used, idempotency_key) VALUES ('u', $1, 1, 'EVALUATED', '{}', 1, 0, 'k')", [mid])
  await reject("INSERT INTO mission_attempts (user_id, mission_id, mission_version, status, work, version, hints_used, idempotency_key) VALUES ('u', $1, 1, 'DONE', '{}', 1, 0, 'k')", [mid])

  const { rows: [att] } = await pool.query("INSERT INTO mission_attempts (user_id, mission_id, mission_version, status, work, version, hints_used, idempotency_key) VALUES ('u-db', $1, 1, 'IN_PROGRESS', '{}', 1, 0, 'k-db') RETURNING id", [mid])
  await reject("INSERT INTO practice_evidence_units (attempt_id, user_id, mission_id, mission_version, capability_id, behavior_id, criterion_id, source_type, check_type, provenance) VALUES ($1, 'u-db', $2, 1, 'CAP-L1-REASONING', 'B', 'C', 'FORMAL', 'DETERMINISTIC', '{}')", [att.id, mid])
  await pool.query("INSERT INTO practice_evidence_units (attempt_id, user_id, mission_id, mission_version, capability_id, behavior_id, criterion_id, source_type, check_type, provenance) VALUES ($1, 'u-db', $2, 1, 'CAP-L1-REASONING', 'B', 'C', 'MISSION_PRACTICE', 'DETERMINISTIC', '{}')", [att.id, mid])
  await assert.rejects(pool.query("UPDATE practice_evidence_units SET behavior_id = 'X' WHERE attempt_id = $1", [att.id]))
  await pool.query('DELETE FROM practice_evidence_units WHERE attempt_id = $1', [att.id]) // erasure stays possible
  await reject("INSERT INTO development_plan_items (plan_id, capability_id, position) VALUES ($1, 'CAP-L1-REASONING', 4)", [randomUUID()])

  // Formal evidence is untouched by the practice ledger: no shared view exists.
  const { rows: views } = await pool.query("SELECT table_name FROM information_schema.views WHERE view_definition ILIKE '%practice_evidence_units%' AND view_definition ILIKE '%behavioral_evidence_units%'")
  assert.equal(views.length, 0)

  // 0034's program ↔ intervention link now points at real interventions.
  await assert.rejects(pool.query('INSERT INTO campus_program_interventions (program_id, intervention_id) VALUES ($1, $2)', [randomUUID(), randomUUID()]), /foreign key/)

  await pool.query('DELETE FROM mission_attempts WHERE id = $1', [att.id])
  while ((await latest()) >= '0035') await migrateDown()
  for (const name of TABLES) assert.equal(await tableExists(name), false, `${name} dropped`)
  await migrateUp()
  assert.ok(await tableExists('practice_evidence_units'))
})
