import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

// Prism Campus C2.01 — 0025 evidence fail-closed migration on a throwaway
// Postgres (TEST_DATABASE_URL). Skips when unset so the unit suite stays green.
const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) process.env.DATABASE_URL = TEST_DB

const { migrateUp, migrateDown } = skip ? {} : await import('../db/migrate.js')
const { query, closePool } = skip ? {} : await import('../db/pool.js')
const { default: evidenceGraph } = skip ? {} : await import('../lib/evidenceGraph.js')

async function columnInfo(name) {
  const { rows } = await query(
    `SELECT is_nullable, column_default FROM information_schema.columns
     WHERE table_name = 'behavioral_evidence_units' AND column_name = $1`,
    [name],
  )
  return rows[0] || null
}

async function latestMigration() {
  const { rows } = await query('SELECT name FROM schema_migrations ORDER BY applied_at DESC, name DESC LIMIT 1')
  return rows[0]?.name
}

test('0025: up → down → up, legacy rows flagged not rewritten, CHECKs fail closed', { skip }, async (t) => {
  t.after(async () => { await closePool() })

  let guard = 0
  while (guard++ < 80) { if (!(await migrateDown().catch(() => null))) break }
  await migrateUp()

  // Roll back to the 0024 schema and write a legacy row with its old defaults.
  while ((await latestMigration()) >= '0026') await migrateDown()
  assert.match(await latestMigration(), /^0025_/)
  await migrateDown()
  assert.equal(await columnInfo('evidence_status'), null, '0025 down removed the new columns')
  assert.match((await columnInfo('confidence_status')).column_default || '', /VERIFIED_CONSENSUS/, 'down restores 0024 exactly')

  const legacyId = `legacy-${randomUUID().slice(0, 12)}`
  const legacySession = randomUUID()
  await query(
    `INSERT INTO behavioral_evidence_units (evidence_id, session_id, blueprint_id, capability_id, source_turn, observable_behavior, rubric_level, rubric_label)
     VALUES ($1,$2,'BP-1','CAP-L1-REASONING',2,'old',3,'Competent')`,
    [legacyId, legacySession],
  )

  await migrateUp()
  for (const col of ['confidence_status', 'rubric_level', 'rubric_label', 'observable_behavior', 'judge_agreement', 'candidate_action', 'provenance', 'capability_layer', 'blueprint_id', 'source_turn']) {
    const info = await columnInfo(col)
    assert.equal(info.is_nullable, 'YES', `${col} is nullable`)
    if (['confidence_status', 'judge_agreement', 'candidate_action', 'provenance', 'capability_layer'].includes(col)) {
      assert.equal(info.column_default, null, `${col} has no default`)
    }
  }

  const legacy = (await query('SELECT * FROM behavioral_evidence_units WHERE evidence_id = $1', [legacyId])).rows[0]
  assert.equal(legacy.legacy_row, true)
  assert.equal(legacy.rubric_level, 3, 'legacy values are never rewritten')
  assert.equal(legacy.confidence_status, 'VERIFIED_CONSENSUS', 'legacy values are never rewritten')
  const [read] = await evidenceGraph.getEvidenceUnitsBySession(legacySession)
  assert.equal(read.evidence_status, 'PROVISIONAL', 'legacy rows read as at most provisional')

  // Strict writes through the ledger persist status + provenance.
  const session = randomUUID()
  const insufficient = await evidenceGraph.recordEvidenceUnit({ session_id: session, capability_id: 'CAP-L1-REASONING' })
  const judged = await evidenceGraph.recordEvidenceUnit({
    session_id: session, capability_id: 'CAP-L1-REASONING', source_turn: 1,
    candidate_action: { dialogue_excerpt: 'x' }, provenance: { source: 'JUDGE_PANEL' }, rubric_level: 3,
  })
  const stored = (await query('SELECT evidence_id, evidence_status, rubric_level, confidence_status, legacy_row FROM behavioral_evidence_units WHERE session_id = $1', [session])).rows
  const byId = Object.fromEntries(stored.map((r) => [r.evidence_id, r]))
  assert.equal(byId[insufficient.evidence_id].evidence_status, 'INSUFFICIENT_EVIDENCE')
  assert.equal(byId[insufficient.evidence_id].rubric_level, null)
  assert.notEqual(byId[insufficient.evidence_id].confidence_status, 'VERIFIED_CONSENSUS')
  assert.equal(byId[judged.evidence_id].evidence_status, 'PROVISIONAL')
  assert.equal(byId[judged.evidence_id].legacy_row, false)

  // CHECK constraints reject fabricated rows written around the ledger.
  const reject = (sql, params) => assert.rejects(query(sql, params), /check constraint|violates/i)
  await reject(
    `INSERT INTO behavioral_evidence_units (evidence_id, session_id, capability_id, rubric_level, evidence_status) VALUES ($1,$2,'C',3,'INSUFFICIENT_EVIDENCE')`,
    [randomUUID().slice(0, 30), session],
  )
  await reject(`INSERT INTO behavioral_evidence_units (evidence_id, session_id, capability_id) VALUES ($1,$2,'C')`, [randomUUID().slice(0, 30), session])
  await reject(
    `INSERT INTO behavioral_evidence_units (evidence_id, session_id, capability_id, rubric_level, evidence_status) VALUES ($1,$2,'C',3,'SUFFICIENT')`,
    [randomUUID().slice(0, 30), session],
  )
  await reject(
    `INSERT INTO behavioral_evidence_units (evidence_id, session_id, capability_id, evidence_status) VALUES ($1,$2,'C','VERIFIED')`, // campus-allow VERIFIED_CLAIM: asserting rejection
    [randomUUID().slice(0, 30), session],
  )

  // Rollback refuses to invent values for strict rows; once they are removed it reverses cleanly.
  while ((await latestMigration()) >= '0026') await migrateDown()
  await assert.rejects(migrateDown())
  await query('DELETE FROM behavioral_evidence_units WHERE session_id = $1', [session])
  await migrateDown()
  await migrateUp()
  assert.equal((await columnInfo('evidence_status')).is_nullable, 'YES')
  await query('DELETE FROM behavioral_evidence_units WHERE evidence_id = $1', [legacyId])
})
