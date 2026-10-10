// PROD-READY Phase 2 (SECURITY_REVIEW S8, charter law 7): personal-data
// ratchet. Parses every committed migration and FAILS when a column whose
// name or type suggests personal data (user ids, emails, names, phones, free
// text, quotes, JSON payloads, session links, ...) is not registered in
// server/domain/privacy/personalDataRegistry.js — so a future migration
// cannot add personal data the erasure cascade does not know about.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseMigrationColumns, MIGRATIONS_DIR } from '../domain/privacy/migrationSchema.js'
import {
  PERSONAL_DATA_REGISTRY, ACTIONS, isPersonalDataCandidate, registryEntry, registeredColumns,
} from '../domain/privacy/personalDataRegistry.js'
import { CASCADE_COVERAGE, TELEMETRY_SWEEP, USER_STATEMENTS } from '../domain/privacy/erasureCascade.js'
import { TELEMETRY_CASCADE } from '../lib/privacyPlanner.js'

const columns = parseMigrationColumns()
const byKey = new Map(columns.map((c) => [`${c.table}.${c.column}`, c]))

test('ratchet: every personal-data-looking column in migrations 0001+ is registered with an erasure action', () => {
  const missing = columns.filter(isPersonalDataCandidate).filter((c) => !registryEntry(c.table, c.column))
    .map((c) => `${c.table}.${c.column} (${c.type}, ${c.migration})`)
  assert.deepEqual(missing, [], `Register these columns in server/domain/privacy/personalDataRegistry.js (DELETE / PSEUDONYMISE / DETACH / RETAIN with a reason) and cover them in the erasure cascade:\n${missing.join('\n')}`)
})

test('ratchet sees every table and the known personal columns (parser sanity)', () => {
  const tables = new Set(columns.map((c) => c.table))
  // Every CREATE TABLE in the forward migrations is parsed.
  const created = new Set()
  for (const f of readdirSync(MIGRATIONS_DIR).filter((n) => /^\d{4}_.+\.sql$/.test(n) && !n.endsWith('.down.sql'))) {
    for (const m of readFileSync(join(MIGRATIONS_DIR, f), 'utf8').matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/gi)) created.add(m[1].toLowerCase())
  }
  assert.deepEqual([...created].filter((t) => !tables.has(t)), [], 'every created table is parsed')
  for (const t of ['v1_users', 'organization_memberships', 'student_import_rows', 'evidence_unit_ratings', 'v1_payment_redemptions', 'privacy_erasure_runs']) assert.ok(tables.has(t), t)
  for (const k of ['v1_users.email', 'mission_attempts.work', 'practice_evidence_units.excerpt', 'student_import_rows.raw', 'organization_audit_events.actor_user_id', 'user_preferences.display_name', 'preparation_turns.text']) {
    assert.ok(byKey.has(k), k)
    assert.ok(isPersonalDataCandidate(byKey.get(k)), `${k} is caught by the heuristic`)
  }
})

test('ratchet fails for a new unregistered personal-data column (self-test on a synthetic migration set)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prism-ratchet-'))
  try {
    writeFileSync(join(dir, '0001_base.sql'), readFileSync(join(MIGRATIONS_DIR, '0035_development_v2.sql'), 'utf8'))
    writeFileSync(join(dir, '0002_new.sql'), [
      'CREATE TABLE IF NOT EXISTS mentor_notes (id UUID PRIMARY KEY, student_user_id TEXT NOT NULL, body TEXT, score INTEGER);',
      'ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS coach_comment TEXT, ADD COLUMN IF NOT EXISTS extra_json JSONB;',
      "DO $$ BEGIN PERFORM 1; END $$; -- dollar-quoted bodies are ignored",
    ].join('\n'))
    writeFileSync(join(dir, '0002_new.down.sql'), 'DROP TABLE mentor_notes;')
    const synthetic = parseMigrationColumns(dir)
    const missing = synthetic.filter(isPersonalDataCandidate).filter((c) => !registryEntry(c.table, c.column)).map((c) => `${c.table}.${c.column}`).sort()
    assert.deepEqual(missing, ['mentor_notes.body', 'mentor_notes.student_user_id', 'mission_attempts.coach_comment', 'mission_attempts.extra_json'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('registry entries are well formed: real columns, known actions, written RETAIN reasons', () => {
  for (const e of registeredColumns()) {
    assert.ok(byKey.has(`${e.table}.${e.column}`), `${e.table}.${e.column} is registered but no migration defines it`)
    assert.ok(ACTIONS.includes(e.action), `${e.table}.${e.column}: unknown action ${e.action}`)
    if (e.action === 'RETAIN') assert.ok(String(e.note || '').length >= 10, `${e.table}.${e.column}: RETAIN needs a written reason`)
  }
  for (const [table, t] of Object.entries(PERSONAL_DATA_REGISTRY)) assert.ok(['session', 'user', 'actor', 'none'].includes(t.via), table)
})

test('every DELETE / PSEUDONYMISE / DETACH entry is covered by the cascade; the cascade writes only to real tables', () => {
  const tables = new Set(columns.map((c) => c.table))
  const uncovered = registeredColumns().filter((e) => e.action !== 'RETAIN' && !CASCADE_COVERAGE.has(e.table)).map((e) => `${e.table}.${e.column}`)
  assert.deepEqual(uncovered, [])
  for (const t of CASCADE_COVERAGE) assert.ok(tables.has(t), `cascade touches unknown table ${t}`)
  // Account-keyed tables of the S8 risk row are all reached by the account step.
  const userTables = new Set(USER_STATEMENTS.map(([t]) => t))
  for (const t of ['organization_memberships', 'organization_invites', 'consent_records', 'entitlements', 'share_grants', 'assessment_assignment_students',
    'user_preferences', 'notifications', 'student_import_rows', 'organization_audit_events', 'mission_attempts', 'practice_evidence_units', 'development_plans',
    'intervention_memberships', 'entitlement_consumptions', 'data_access_audit_events', 'cohort_members', 'workspaces']) {
    assert.ok(userTables.has(t), `${t} is erased by the account step`)
  }
})

test('the S8 risk-row tables are all registered with a non-RETAIN action on their personal columns', () => {
  const s8 = {
    organization_memberships: 'user_id', organization_invites: 'email', consent_records: 'user_id', entitlements: 'user_id', share_grants: 'owner_user_id',
    assessment_assignment_students: 'user_id', user_preferences: 'user_id', assessment_client_events: 'response_json', assessment_artifact_versions: 'content_json',
    student_report_versions: 'report_json', notifications: 'user_id', student_import_rows: 'raw', organization_audit_events: 'actor_user_id',
    mission_attempts: 'work', practice_evidence_units: 'excerpt', development_plans: 'user_id', intervention_memberships: 'user_id',
    evidence_rating_items: 'excerpt', evidence_unit_ratings: 'rater_id',
  }
  for (const [table, column] of Object.entries(s8)) {
    const e = registryEntry(table, column)
    assert.ok(e, `${table}.${column}`)
    if (table !== 'evidence_unit_ratings') assert.notEqual(e.action, 'RETAIN', `${table}.${column} must be erased or pseudonymised`)
  }
  // Ratings hold no learner data; their item is detached instead (ON DELETE RESTRICT).
  assert.equal(registryEntry('evidence_rating_items', 'session_ref').action, 'DETACH')
})

test('the 0056 erasure guard whitelists only registered PSEUDONYMISE/DETACH columns', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '0056_erasure_cascade.sql'), 'utf8')
  const guards = [...sql.matchAll(/ON (\w+)\s+FOR EACH ROW EXECUTE FUNCTION prism_erasure_guard\('[^']*'((?:,\s*'\w+')*)\)/g)]
  assert.ok(guards.length >= 8)
  for (const [, table, args] of guards) {
    for (const [, col] of args.matchAll(/'(\w+)'/g)) {
      const e = registryEntry(table, col)
      assert.ok(e && ['PSEUDONYMISE', 'DETACH'].includes(e.action), `${table}.${col} is unlocked for erasure but not registered as PSEUDONYMISE/DETACH`)
    }
  }
})

test('the cascade\'s telemetry sweep stays in lockstep with the privacy planner and lib/telemetry.js', () => {
  assert.deepEqual([...TELEMETRY_SWEEP].map((x) => x.join('.')), TELEMETRY_CASCADE.map((x) => x.join('.')))
})
