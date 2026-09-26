// C7.01 on a throwaway Postgres (TEST_DATABASE_URL): 0034 schema, CHECKs fail
// closed, the organization audit trail is append-only, down reverses cleanly,
// and a CSV import commits once through the real Postgres repositories.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) process.env.DATABASE_URL = TEST_DB

const pool = skip ? null : await import('../db/pool.js')
const { migrateUp, migrateDown } = skip ? {} : await import('../db/migrate.js')
const { createPgCampusRepos } = skip ? {} : await import('../domain/campusStore/index.js')
const { createCampusContext } = skip ? {} : await import('../domain/campusStore/context.js')

async function tableExists(name) {
  const { rows } = await pool.query('SELECT to_regclass($1) AS t', [name])
  return rows[0].t !== null
}
async function latest() {
  const { rows } = await pool.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1')
  return rows[0]?.name
}
const TABLES = ['campus_programs', 'campus_program_cohorts', 'campus_program_assignments', 'campus_program_interventions', 'student_import_jobs', 'student_import_rows', 'org_onboarding_progress', 'notifications', 'organization_audit_events']

test('0034: schema, CHECKs fail closed, org audit append-only, import commits once, down reverses', { skip }, async (t) => {
  t.after(async () => { await pool.closePool() })
  await migrateUp()
  for (const name of TABLES) assert.ok(await tableExists(name), `${name} exists`)

  const repos = createPgCampusRepos({ query: pool.query, getPool: pool.getPool })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic PG Admin Org', slug: `pg-admin-${randomUUID().slice(0, 8)}`, organizationType: 'UNIVERSITY', status: 'ACTIVE' })

  const reject = (sql, params) => assert.rejects(pool.query(sql, params), /check constraint|violates|null value/i)
  await reject("INSERT INTO campus_programs (organization_id, name, status, reporting_policy, sponsorship_scope, created_by) VALUES ($1, 'P', 'LIVE', '{}', '{}', 'o')", [org.id])
  await reject("INSERT INTO campus_programs (organization_id, name, reporting_policy, sponsorship_scope, created_by) VALUES ($1, 'P', '{}', '{}', 'o')", [org.id])
  await reject("INSERT INTO campus_programs (organization_id, name, status, starts_on, ends_on, reporting_policy, sponsorship_scope, created_by) VALUES ($1, 'P', 'DRAFT', '2027-01-01', '2026-01-01', '{}', '{}', 'o')", [org.id])
  await reject("INSERT INTO student_import_jobs (organization_id, uploaded_by, status, totals) VALUES ($1, 'o', 'COMMITTED', '{}')", [org.id])
  await reject("INSERT INTO notifications (user_id, kind, payload) VALUES ('u', 'SPAM', '{}')", [])

  await repos.campusAdmin.appendOrgAudit({ organizationId: org.id, actorUserId: 'owner', action: 'cohort.created', targetType: 'COHORT', targetId: 'c1', details: {} })
  await assert.rejects(pool.query("UPDATE organization_audit_events SET action = 'x' WHERE organization_id = $1", [org.id]))
  await assert.rejects(pool.query('DELETE FROM organization_audit_events WHERE organization_id = $1', [org.id]))

  // One CSV import through the service on Postgres: preview, commit, replay.
  const cohort = await repos.organizations.createCohort({ organizationId: org.id, name: 'PG Cohort' })
  const owner = { id: `pg-owner-${randomUUID().slice(0, 8)}`, email: 'pg-owner@test.local', name: 'Owner' }
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: owner.id, role: 'ORG_OWNER', status: 'ACTIVE' })
  process.env.PRISM_CAMPUS_ENABLED = 'true'
  const campus = createCampusContext({ repos, scenarioSource: async () => ({ generalScenarios: [{ id: 'pg-general' }], bankScenarios: {} }) })
  const actor = await campus.workspaceService.actorFor(owner)
  const req = { user: owner, requestId: 'req-pg' }
  const decision = campus.scopeFor(actor, org.id, 'students.manage')
  const { job } = await campus.admin.previewImport(req, actor, org.id, decision, { csv: 'email,cohort\npg1@test.local,PG Cohort\nbad,PG Cohort\n' })
  assert.deepEqual(job.totals, { rows: 2, invite: 1, alreadyMember: 0, errors: 1 })
  const first = await campus.admin.commitImport(req, actor, org.id, decision, job.id, 'pg-key')
  assert.equal(first.job.status, 'COMMITTED')
  const again = await campus.admin.commitImport(req, actor, org.id, decision, job.id, 'pg-key')
  assert.equal(again.replayed, true)
  const { rows: invites } = await pool.query('SELECT email, cohort_id FROM organization_invites WHERE organization_id = $1', [org.id])
  assert.deepEqual(invites.map((r) => [r.email, r.cohort_id]), [['pg1@test.local', cohort.id]])
  const log = await repos.campusAdmin.listOrgAudit(org.id)
  assert.ok(log.some((e) => e.action === 'import.committed'))
  delete process.env.PRISM_CAMPUS_ENABLED

  // Down to 0033 drops every 0034 table; up restores them.
  while ((await latest()) >= '0034') await migrateDown()
  for (const name of TABLES) assert.equal(await tableExists(name), false, `${name} dropped`)
  await migrateUp()
  assert.ok(await tableExists('organization_audit_events'))
})
