// C3.01–C3.04 — campus foundation migrations 0026–0029 on a throwaway
// Postgres: up → down → up, append-only triggers, CHECK constraints.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) process.env.DATABASE_URL = TEST_DB

const { migrateUp, migrateDown } = skip ? {} : await import('../db/migrate.js')
const { query, closePool } = skip ? {} : await import('../db/pool.js')

const TABLES = ['organizations', 'campuses', 'academic_departments', 'academic_programs', 'academic_batches', 'cohorts', 'cohort_members',
  'organization_memberships', 'workspaces', 'organization_invites', 'entitlements', 'entitlement_consumptions',
  'consent_records', 'share_grants', 'share_grant_resources', 'data_access_audit_events', 'assessment_session_scopes']

async function present() {
  const { rows } = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)", [TABLES])
  return new Set(rows.map((r) => r.table_name))
}
async function latest() {
  const { rows } = await query('SELECT name FROM schema_migrations ORDER BY applied_at DESC, name DESC LIMIT 1')
  return rows[0]?.name
}
const rejects = (sql, params, re = /check constraint|violates|append-only|null value/i) => assert.rejects(query(sql, params), re)

test('0026–0029: up → down → up; ledgers append-only; scope and grant invariants enforced', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()
  for (const tbl of TABLES) assert.ok((await present()).has(tbl), `${tbl} exists`)

  // Walk back to 0025 — every campus foundation table is gone.
  while ((await latest()) >= '0026') await migrateDown()
  assert.equal((await present()).size, 0)
  await migrateUp()
  assert.equal((await present()).size, TABLES.length)

  const org = randomUUID()
  await query("INSERT INTO organizations (id, name, slug, organization_type, status) VALUES ($1, 'Synthetic University', $2, 'UNIVERSITY', 'ACTIVE')", [org, `syn-${org.slice(0, 8)}`])
  await rejects("INSERT INTO organizations (name, slug, organization_type, status) VALUES ('X', $1, 'CASINO', 'ACTIVE')", [`x-${org}`])
  await rejects("INSERT INTO organization_memberships (organization_id, user_id, role, status) VALUES ($1, 'u', 'SUPREME_LEADER', 'ACTIVE')", [org])
  await rejects("INSERT INTO workspaces (type, owner_user_id, name, status) VALUES ('CAMPUS_STUDENT', 'u', 'No org', 'ACTIVE')", [])

  // Sponsorship must be org-scoped; personal sources must be user-scoped; no over-consumption.
  await rejects("INSERT INTO entitlements (source_type, product_code, quantity, valid_from, status) VALUES ('INSTITUTION_SPONSORSHIP', 'P', 1, now(), 'ACTIVE')", [])
  await rejects("INSERT INTO entitlements (organization_id, source_type, product_code, quantity, valid_from, status) VALUES ($1, 'PERSONAL_PURCHASE', 'P', 1, now(), 'ACTIVE')", [org])
  const { rows: [ent] } = await query("INSERT INTO entitlements (organization_id, source_type, product_code, quantity, valid_from, status) VALUES ($1, 'INSTITUTION_SPONSORSHIP', 'P', 1, now(), 'ACTIVE') RETURNING id", [org])
  await rejects('UPDATE entitlements SET consumed_quantity = 2 WHERE id = $1', [ent.id])

  const { rows: [c] } = await query("INSERT INTO entitlement_consumptions (entitlement_id, user_id, organization_id, event, idempotency_key) VALUES ($1, 'u', $2, 'RESERVED', $3) RETURNING id", [ent.id, org, `k-${ent.id}`])
  await rejects("UPDATE entitlement_consumptions SET event = 'CONSUMED' WHERE id = $1", [c.id])
  await rejects('DELETE FROM entitlement_consumptions WHERE id = $1', [c.id])
  await rejects("INSERT INTO entitlement_consumptions (entitlement_id, user_id, event, idempotency_key) VALUES ($1, 'u', 'RESERVED', $2)", [ent.id, `k-${ent.id}`], /duplicate key|unique/i)

  const { rows: [a] } = await query("INSERT INTO data_access_audit_events (actor_user_id, organization_id, subject_user_id, resource_type, action) VALUES ('admin', $1, 'u', 'ASSESSMENT_SESSION', 'READ') RETURNING id", [org])
  await rejects("UPDATE data_access_audit_events SET action = 'NONE' WHERE id = $1", [a.id])
  await rejects('DELETE FROM data_access_audit_events WHERE id = $1', [a.id])

  // Personal sessions are owner-only; institution sessions name their sponsor.
  await rejects("INSERT INTO assessment_session_scopes (session_id, owner_user_id, sponsor_type, sponsor_organization_id, workspace_id, visibility_policy, created_by) VALUES ($1, 'u', 'PERSONAL', $2, 'personal', 'OWNER_ONLY', 'u')", [`s-${org}`, org])
  await rejects("INSERT INTO assessment_session_scopes (session_id, owner_user_id, sponsor_type, workspace_id, visibility_policy, created_by) VALUES ($1, 'u', 'PERSONAL', 'personal', 'OWNER_AND_SPONSOR', 'u')", [`s2-${org}`])
  await rejects("INSERT INTO assessment_session_scopes (session_id, owner_user_id, sponsor_type, workspace_id, visibility_policy, created_by) VALUES ($1, 'u', 'INSTITUTION', 'ws', 'OWNER_AND_SPONSOR', 'u')", [`s3-${org}`])
  await rejects("INSERT INTO share_grants (owner_user_id, recipient_type, expires_at) VALUES ('u', 'ORGANIZATION', now() + interval '1 day')", [])
  await rejects("INSERT INTO share_grants (owner_user_id, recipient_type, recipient_organization_id, expires_at) VALUES ('u', 'ORGANIZATION', $1, now() - interval '1 day')", [org])

  // Down refuses while the append-only ledger holds rows referencing entitlements (RESTRICT), never silently dropping history.
  await assert.rejects(query('DELETE FROM entitlements WHERE id = $1', [ent.id]))

  // Leave a clean database for the next suite.
  while ((await latest()) >= '0026') await migrateDown()
  await migrateUp()
})
