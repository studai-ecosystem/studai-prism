// C9.01 on a throwaway Postgres (TEST_DATABASE_URL): 0036 schema, the
// equivalence registry fails closed (a decision needs who/when/evidence; an
// APPROVED decision needs a second approval), the decision history and
// growth snapshots cannot be edited, cycles CHECK their window, and down → up.
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
const TABLES = ['assessment_form_equivalence', 'assessment_form_equivalence_decisions', 'reassessment_cycles', 'capability_growth_snapshots']

test('0036: equivalence fails closed, decision history + snapshots immutable, cycle CHECKs, down reverses', { skip }, async (t) => {
  t.after(async () => { await pool.closePool() })
  await migrateUp()
  for (const name of TABLES) assert.ok(await tableExists(name), `${name} exists`)

  const def = `syn-g-${randomUUID().slice(0, 6)}`
  await pool.query("INSERT INTO assessment_definitions (assessment_definition_id, job_family, title, status) VALUES ($1, 'GENERAL', 'Synthetic', 'active')", [def])
  const [fa, fb] = [`${def}:a:1`, `${def}:b:1`]
  for (const [id, sc] of [[fa, 'a'], [fb, 'b']]) {
    await pool.query("INSERT INTO assessment_forms (id, definition_id, version, scenario_id, capability_ids, status, frozen_at) VALUES ($1, $2, '1', $3, ARRAY['CAP-L1-REASONING'], 'FROZEN', now())", [id, def, sc])
  }
  const reject = (sql, params) => assert.rejects(pool.query(sql, params), /check constraint|violates|null value/i)
  await reject("INSERT INTO assessment_form_equivalence (form_a_id, form_b_id, status) VALUES ($2, $1, 'PENDING')", [fa, fb]) // not canonical
  await reject("INSERT INTO assessment_form_equivalence (form_a_id, form_b_id, status) VALUES ($1, $2, 'APPROVED')", [fa, fb]) // no who/when/evidence
  await reject("INSERT INTO assessment_form_equivalence (form_a_id, form_b_id, status, decided_by, decided_at) VALUES ($1, $2, 'APPROVED', 'adm', now())", [fa, fb]) // no evidence
  await reject("INSERT INTO assessment_form_equivalence (form_a_id, form_b_id, status, decided_by) VALUES ($1, $2, 'PENDING', 'adm')", [fa, fb]) // pending with a decider
  await reject("INSERT INTO assessment_form_equivalence (form_a_id, form_b_id, status) VALUES ($1, 'no-such-form', 'PENDING')", [fa])
  await pool.query("INSERT INTO assessment_form_equivalence (form_a_id, form_b_id, status) VALUES ($1, $2, 'PENDING')", [fa, fb])

  await reject("INSERT INTO assessment_form_equivalence_decisions (form_a_id, form_b_id, status, evidence_ref, reason, decided_by) VALUES ($1, $2, 'APPROVED', 'run-1', 'Reviewed equating run', 'adm')", [fa, fb]) // no approval
  await reject("INSERT INTO assessment_form_equivalence_decisions (form_a_id, form_b_id, status, evidence_ref, reason, decided_by) VALUES ($1, $2, 'REJECTED', 'run-1', 'short', 'adm')", [fa, fb])
  const { rows: [d] } = await pool.query("INSERT INTO assessment_form_equivalence_decisions (form_a_id, form_b_id, status, evidence_ref, reason, decided_by, approval_id) VALUES ($1, $2, 'APPROVED', 'run-1', 'Reviewed equating run', 'adm', 'appr-1') RETURNING id", [fa, fb])
  await assert.rejects(pool.query("UPDATE assessment_form_equivalence_decisions SET reason = 'changed afterwards' WHERE id = $1", [d.id]))
  await assert.rejects(pool.query('DELETE FROM assessment_form_equivalence_decisions WHERE id = $1', [d.id]))

  const { rows: [s] } = await pool.query(
    "INSERT INTO capability_growth_snapshots (user_id, capability_id, baseline_session_id, reassessment_session_id, form_a_id, form_b_id, from_band, to_band, direction, rules_version) VALUES ('u-db', 'CAP-L1-REASONING', 's1', 's2', $1, $2, 'EARLY', 'DEVELOPING', 'HIGHER', 'r1') RETURNING id",
    [fa, fb],
  )
  await reject("INSERT INTO capability_growth_snapshots (user_id, capability_id, baseline_session_id, reassessment_session_id, form_a_id, form_b_id, from_band, to_band, direction, rules_version) VALUES ('u-db', 'CAP-L1-REASONING', 's3', 's4', $1, $2, 'EARLY', 'DEVELOPING', 'UP', 'r1')", [fa, fb])
  await reject("INSERT INTO capability_growth_snapshots (user_id, capability_id, baseline_session_id, reassessment_session_id, form_a_id, form_b_id, from_band, to_band, direction, rules_version) VALUES ('u-db', 'CAP-L1-REASONING', 's5', 's5', $1, $2, 'EARLY', 'DEVELOPING', 'SAME', 'r1')", [fa, fb])
  await assert.rejects(pool.query("UPDATE capability_growth_snapshots SET direction = 'LOWER' WHERE id = $1", [s.id]), /immutable/)
  await pool.query('DELETE FROM capability_growth_snapshots WHERE id = $1', [s.id]) // erasure stays possible

  const { rows: [org] } = await pool.query("INSERT INTO organizations (name, slug, organization_type, status) VALUES ('Synthetic Growth DB Org', $1, 'COLLEGE', 'ACTIVE') RETURNING id", [`syn-gdb-${randomUUID().slice(0, 8)}`])
  const assignment = async () => {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO assessment_assignments (id, definition_id, form_policy, sponsor_type, organization_id, window_start, window_end, integrity_policy, accommodations_policy, reminder_policy, created_by, status)
       VALUES ($1, $2, 'SERVER_SELECTED', 'INSTITUTION', $3, now(), now() + interval '1 day', 'STANDARD', '{}', '{}', 'owner', 'ACTIVE')`,
      [id, def, org.id],
    )
    return id
  }
  const [a1, a2] = [await assignment(), await assignment()]
  await reject("INSERT INTO reassessment_cycles (organization_id, name, baseline_assignment_id, reassessment_assignment_id, window_start, window_end, status, created_by) VALUES ($1, 'x', $2, $3, now(), now() - interval '1 day', 'SCHEDULED', 'o')", [org.id, a1, a2])
  await reject("INSERT INTO reassessment_cycles (organization_id, name, baseline_assignment_id, reassessment_assignment_id, window_start, window_end, status, created_by) VALUES ($1, 'x', $2, $2, now(), now() + interval '1 day', 'SCHEDULED', 'o')", [org.id, a1])
  await reject("INSERT INTO reassessment_cycles (organization_id, name, baseline_assignment_id, reassessment_assignment_id, window_start, window_end, status, created_by) VALUES ($1, 'x', $2, $3, now(), now() + interval '1 day', 'OPEN', 'o')", [org.id, a1, a2])
  await pool.query("INSERT INTO reassessment_cycles (organization_id, name, baseline_assignment_id, reassessment_assignment_id, window_start, window_end, status, created_by) VALUES ($1, 'x', $2, $3, now(), now() + interval '1 day', 'SCHEDULED', 'o')", [org.id, a1, a2])

  while ((await latest()) >= '0036') await migrateDown()
  for (const name of TABLES) assert.equal(await tableExists(name), false, `${name} dropped`)
  await migrateUp()
  assert.ok(await tableExists('capability_growth_snapshots'))
})
