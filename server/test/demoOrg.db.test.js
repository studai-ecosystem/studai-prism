// PROD-READY Phase 8 on a throwaway PostgreSQL (TEST_DATABASE_URL):
//   * server/db/seedDemoOrg.js writes ONE synthetic college whose every name,
//     address and quote is obviously synthetic; it is idempotent;
//   * migration 0061: organizations.is_demo is immutable; triggers keep demo
//     accounts out of real organizations and real accounts out of demo ones
//     (memberships, cohorts, rosters); demo_session_ids lists demo sessions;
//   * a real organization's analytics are identical before and after the demo
//     seed and never mention a demo account or session;
//   * demo analytics are honest: PROVISIONAL and INSUFFICIENT_EVIDENCE as the
//     rules compute them, never SUFFICIENT (rules uncalibrated);
//   * the rating queue refuses demo sessions (calibration side: pytest);
//   * the campus workspace and /me carry the demo marker; the pilot report of
//     the demo organization is labelled synthetic;
//   * 0062 guardian consents: PostgreSQL repository, erasure with the
//     account, the unverified-request retention purge; down/up is clean.
// Requires TEST_DATABASE_URL (skips otherwise); run serially.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB
  process.env.PRISM_PG_STORE = 'true'
  process.env.PRISM_CAMPUS_ENABLED = 'true'
  process.env.PRISM_CAMPUS_ANALYTICS = 'true'
}

const { migrateUp, migrateDown } = skip ? {} : await import('../db/migrate.js')
const { query, getPool, getSessionLockPool } = skip ? {} : await import('../db/pool.js')
const { createPgCampusRepos } = skip ? {} : await import('../domain/campusStore/index.js')
const { createCampusContext, EMPTY_LEGACY_SOURCES } = skip ? {} : await import('../domain/campusStore/context.js')
const store = skip ? {} : await import('../lib/store.js')
const evidenceGraph = skip ? {} : (await import('../lib/evidenceGraph.js')).default
const { seedCampusScale, SCALE_SCENARIOS } = skip ? {} : await import('../test-support/campusScaleSeed.mjs')
const { seedDemoOrganization, DEMO_ORG_NAME, DEMO_EMAIL_DOMAIN, DEMO_EXCERPT } = skip ? {} : await import('../db/seedDemoOrg.js')
const { normalizeEvidenceUnit } = skip ? {} : await import('../domain/evidence/evidenceUnit.js')
const { buildPilotReport, renderPilotReportMarkdown, DEMO_REPORT_NOTICE } = skip ? {} : await import('../domain/pilotReport/service.js')
const { createGuardianConsentRepo } = skip ? {} : await import('../domain/guardian/repository.js')
const { hashGuardianToken } = skip ? {} : await import('../domain/guardian/service.js')
const { USER_STATEMENTS } = skip ? {} : await import('../domain/privacy/erasureCascade.js')
const { purgeUnverifiedGuardianConsents } = skip ? {} : await import('../domain/privacy/guardianConsentRetention.js')

const pgUsers = {
  inDatabase: true,
  findById: async (id) => { const r = await query('SELECT id, name, email FROM v1_users WHERE id = $1', [id]); return r.rows[0] || null },
  findByEmail: async (email) => { const r = await query('SELECT id, name, email FROM v1_users WHERE email = $1', [String(email).toLowerCase()]); return r.rows[0] || null },
  findManyByIds: async (ids) => new Map((await query('SELECT id, name, email FROM v1_users WHERE id = ANY($1::text[])', [ids])).rows.map((u) => [u.id, u])),
  findManyByEmails: async (emails) => new Map((await query('SELECT id, name, email FROM v1_users WHERE email = ANY($1::text[])', [emails])).rows.map((u) => [u.email, u])),
}
const adminState = async (id) => {
  const { rows } = await query('SELECT invalid, review_state FROM admin_session_states WHERE session_id = $1', [String(id)])
  return rows[0] ? { invalid: rows[0].invalid, reviewState: rows[0].review_state } : null
}
function context(repos, scenarios) {
  return createCampusContext({
    repos, scenarioSource: async () => scenarios, users: pgUsers,
    legacy: { ...EMPTY_LEGACY_SOURCES, getSession: (id) => store.getSession(id), getReport: (id) => store.getReport(id), adminState },
    evidence: { units: (id) => evidenceGraph.getEvidenceUnits(id) },
    legacyStoreInDatabase: true,
  })
}
const plain = (v) => JSON.parse(JSON.stringify(v))
const rejectsIsolation = (p) => assert.rejects(p, (err) => /PRISM_DEMO_ISOLATION/.test(String(err.message)))

let world = null
async function setup() {
  if (world) return world
  await migrateUp()
  const repos = createPgCampusRepos({ query, getPool, getLockPool: getSessionLockPool })
  const realCampus = context(repos, SCALE_SCENARIOS)
  const real = await seedCampusScale({ query, repos, catalog: realCampus.catalog, students: 24, assignments: 2, cohorts: 2, departments: 1, completion: [0.9, 0.6], seed: 81, tag: `p08${randomUUID().slice(0, 6)}` })
  const realActor = await realCampus.workspaceService.actorFor(real.owner)
  const before = plain(await realCampus.analytics.capabilities(realActor, real.org.id))
  const beforeSuff = plain(await realCampus.analytics.sufficiency(realActor, real.org.id))
  // The demo seed attaches its sessions to the synthetic scale scenario here
  // (the real scenario bank is not loaded in this test).
  const demoCampus = context(repos, SCALE_SCENARIOS)
  // A per-run tag keeps the seed's unique slug and addresses distinct on a
  // database reused between runs (the CLI seeds without one).
  const tag = randomUUID().slice(0, 6)
  const demo = await seedDemoOrganization({ query, repos, catalog: demoCampus.catalog, normalizeEvidenceUnit, students: 30, scenarioId: SCALE_SCENARIOS.generalScenarios[0].id, tag })
  world = { repos, realCampus, demoCampus, real, realActor, before, beforeSuff, demo, tag }
  return world
}

test('0061/0062: down/up is clean', { skip }, async () => {
  await migrateUp()
  // Roll back to just before 0061 (later migrations, e.g. 0063, go first; P94).
  const latest = async () => (await query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1')).rows[0].name
  while ((await latest()) >= '0061') await migrateDown()
  assert.equal((await query(`SELECT to_regclass('public.demo_accounts') AS t`)).rows[0].t, null)
  assert.equal((await query(`SELECT to_regclass('public.guardian_consents') AS t`)).rows[0].t, null)
  assert.equal((await query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'is_demo'`)).rows.length, 0)
  await migrateUp()
  assert.ok((await query(`SELECT to_regclass('public.demo_session_ids') AS t`)).rows[0].t)
})

test('seed: one synthetic college, obviously synthetic data, idempotent', { skip }, async () => {
  const { demo, repos, demoCampus, tag } = await setup()
  assert.equal(demo.created, true)
  const org = await repos.organizations.getOrganization(demo.organizationId)
  assert.equal(org.name, DEMO_ORG_NAME)
  assert.equal(org.isDemo, true)
  const users = (await query('SELECT u.name, u.email FROM v1_users u JOIN demo_accounts d ON d.user_id = u.id WHERE d.organization_id = $1', [demo.organizationId])).rows
  assert.equal(users.length, 32)
  for (const u of users) {
    assert.match(u.name, /^Demo (Student \d{3}|Admin \(synthetic\)|Placement Officer \(synthetic\))$/)
    assert.ok(u.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`), 'reserved .invalid domain: no real mailbox')
  }
  const quotes = (await query('SELECT DISTINCT candidate_action_json->>\'dialogue_excerpt\' AS q FROM behavioral_evidence_units WHERE session_id IN (SELECT session_id FROM demo_session_ids)')).rows.map((r) => r.q)
  assert.deepEqual(quotes, [DEMO_EXCERPT])
  for (const c of await repos.campusAdmin.listCohorts(demo.organizationId)) assert.match(c.name, /\(synthetic\)$/)
  assert.ok(demo.counts.sessions > 0 && demo.counts.evidenceUnits > 0 && demo.counts.reports > 0)
  const again = await seedDemoOrganization({ query, repos, catalog: demoCampus.catalog, normalizeEvidenceUnit, students: 30, tag })
  assert.deepEqual(again, { created: false, organizationId: demo.organizationId })
})

test('0061 isolation: is_demo immutable; demo and real accounts never mix', { skip }, async () => {
  const { demo, real, repos } = await setup()
  await assert.rejects(query('UPDATE organizations SET is_demo = false WHERE id = $1', [demo.organizationId]), /never changes/)
  await assert.rejects(query('UPDATE organizations SET is_demo = true WHERE id = $1', [real.org.id]), /never changes/)
  const demoStudent = demo.studentIds[0]
  await rejectsIsolation(repos.memberships.upsertMembership({ organizationId: real.org.id, userId: demoStudent, role: 'STUDENT', status: 'ACTIVE' }))
  await rejectsIsolation(repos.memberships.upsertMembership({ organizationId: demo.organizationId, userId: real.studentIds[0], role: 'STUDENT', status: 'ACTIVE' }))
  await rejectsIsolation(query('INSERT INTO cohort_members (cohort_id, user_id, status, added_by) VALUES ($1, $2, $3, $4)', [real.cohorts[0].id, demoStudent, 'ACTIVE', 'x']))
  await rejectsIsolation(query('INSERT INTO cohort_members (cohort_id, user_id, status, added_by) VALUES ($1, $2, $3, $4)', [demo.cohorts[0].id, real.studentIds[1], 'ACTIVE', 'x']))
  await rejectsIsolation(query(`INSERT INTO assessment_assignment_students (assignment_id, user_id, status) VALUES ($1, $2, 'ASSIGNED')`, [real.assignmentIds[0], demoStudent]))
  await rejectsIsolation(query(`INSERT INTO assessment_assignment_students (assignment_id, user_id, status) VALUES ($1, $2, 'ASSIGNED')`, [demo.assignmentIds[0], real.studentIds[2]]))
  await rejectsIsolation(query('INSERT INTO demo_accounts (user_id, organization_id) VALUES ($1, $2)', [`syn-x-${randomUUID()}`, real.org.id]))
  const demoSessions = new Set((await query('SELECT session_id FROM demo_session_ids')).rows.map((r) => r.session_id))
  assert.equal(demoSessions.size, demo.counts.sessions)
  for (const s of real.sessions) assert.ok(!demoSessions.has(s.sessionId), 'real sessions are never demo sessions')
})

test('analytics: a real organization is unchanged by the demo seed and never sees demo data', { skip }, async () => {
  const { realCampus, realActor, real, before, beforeSuff, demo } = await setup()
  const after = plain(await realCampus.analytics.capabilities(realActor, real.org.id))
  assert.deepEqual(after, before)
  assert.deepEqual(plain(await realCampus.analytics.sufficiency(realActor, real.org.id)), beforeSuff)
  const completion = await realCampus.analytics.completion(realActor, real.org.id)
  const text = JSON.stringify([after, completion])
  for (const id of [...demo.studentIds, ...demo.sessions.map((s) => s.sessionId), demo.organizationId]) assert.ok(!text.includes(id))
})

test('demo analytics and reports are honest: PROVISIONAL / INSUFFICIENT, never SUFFICIENT', { skip }, async () => {
  const { demoCampus, demo } = await setup()
  const owner = await demoCampus.workspaceService.actorFor(demo.owner)
  const suff = await demoCampus.analytics.sufficiency(owner, demo.organizationId)
  assert.equal(suff.suppressed, false)
  const totals = { SUFFICIENT: 0, PROVISIONAL: 0, INSUFFICIENT_EVIDENCE: 0 }
  for (const c of suff.capabilities.filter((x) => !x.suppressed)) for (const k of Object.keys(totals)) totals[k] += c.statuses[k]
  assert.equal(totals.SUFFICIENT, 0, 'no fabricated sufficiency')
  assert.ok(totals.PROVISIONAL > 0)
  assert.ok(totals.INSUFFICIENT_EVIDENCE > 0)
  const comparison = await demoCampus.analytics.comparison(owner, demo.organizationId, { groupBy: 'cohort' })
  assert.ok(comparison.groups.some((g) => g.suppressed), 'the small demo cohort shows small-group suppression')
  const report = await buildPilotReport({ campus: demoCampus, organizationId: demo.organizationId, term: 'Demo term', adminState })
  const md = renderPilotReportMarkdown(report)
  assert.ok(md.includes(DEMO_REPORT_NOTICE))
  for (const id of demo.studentIds) assert.ok(!md.includes(id))
  assert.ok(!md.includes('Demo Student'))
})

test('workspaces and /me carry the demo marker only for demo accounts', { skip }, async () => {
  const { demoCampus, demo, real } = await setup()
  const demoWs = await demoCampus.workspaceService.listWorkspaces({ id: demo.studentIds[0], email: 'x', name: 'x' })
  assert.ok(demoWs.some((w) => w.isDemo === true))
  const realWs = await demoCampus.workspaceService.listWorkspaces({ id: real.studentIds[0], email: 'x', name: 'x' })
  assert.ok(realWs.every((w) => w.isDemo !== true))
  assert.equal(await demoCampus.repos.demo.isDemoAccount(demo.studentIds[0]), true)
  assert.equal(await demoCampus.repos.demo.isDemoOrganization(real.org.id), false)
})

test('the rating queue refuses demo sessions (never rating or calibration data)', { skip }, async () => {
  const { demoCampus, demo } = await setup()
  const sid = demo.sessions[0].sessionId
  await assert.rejects(demoCampus.validation.enqueueSession(sid, { enqueuedBy: 'syn-admin' }), /synthetic demo session/)
  assert.equal((await query('SELECT count(*)::int AS n FROM evidence_rating_items WHERE enqueued_by = $1', ['syn-admin'])).rows[0].n, 0)
})

test('0062 guardian consents: repository, erasure with the account, unverified-request retention', { skip }, async () => {
  await migrateUp()
  const repo = createGuardianConsentRepo()
  assert.equal(repo.kind, 'pg')
  const uid = `syn-g-${randomUUID()}`
  // Requests made 32 days ago (the purge's dry-run receipt check uses the clock of the database).
  const now = new Date(Date.now() - 32 * 864e5)
  const a = await repo.create({ userId: uid, guardianEmail: 'guardian@test.local', copyVersion: 'guardian-consent-u18-v0-draft', tokenHash: hashGuardianToken(`${uid}-a`), expiresAt: new Date(now.getTime() + 14 * 864e5), now })
  await assert.rejects(repo.create({ userId: uid, guardianEmail: 'g2@test.local', copyVersion: 'v', tokenHash: hashGuardianToken(`${uid}-b`), expiresAt: now, now }), (e) => e.code === 'CONFLICT', 'one open request per learner')
  assert.equal((await repo.transition(a.id, { from: ['PENDING'], to: 'DECLINED', at: now })).status, 'DECLINED')
  assert.equal(await repo.transition(a.id, { from: ['PENDING'], to: 'VERIFIED', at: now }), null, 'a decided request cannot change by a racing decision')
  const b = await repo.create({ userId: uid, guardianEmail: 'guardian@test.local', copyVersion: 'v', tokenHash: hashGuardianToken(`${uid}-c`), expiresAt: new Date(now.getTime() + 864e5), now })
  await repo.transition(b.id, { from: ['PENDING'], to: 'VERIFIED', at: now })
  // Retention: the DECLINED one is due 30 days after its decision; VERIFIED never.
  const later = new Date()
  const dry = await purgeUnverifiedGuardianConsents({ dryRun: true, now: later, effectiveRetentionDays: async () => null, holdCovering: async () => null })
  assert.ok(dry.ok && dry.matched >= 1 && dry.deleted === 0)
  const real = await purgeUnverifiedGuardianConsents({ dryRun: false, now: later, effectiveRetentionDays: async () => null, holdCovering: async () => null })
  assert.ok(real.deleted >= 1)
  const left = (await query('SELECT status FROM guardian_consents WHERE user_id = $1', [uid])).rows.map((r) => r.status)
  assert.deepEqual(left, ['VERIFIED'])
  // Account erasure (the cascade's account statement) removes the rest.
  const [, stmt] = USER_STATEMENTS.find(([t]) => t === 'guardian_consents')
  await stmt((sql, params) => query(sql, params), { uid })
  assert.equal((await query('SELECT count(*)::int AS n FROM guardian_consents WHERE user_id = $1', [uid])).rows[0].n, 0)
})

// Synthetic rows are removed again: later suites roll migrations far back
// (0025 requires every evidence unit to carry a blueprint id).
test('teardown', { skip }, async () => {
  if (!world) return
  const demoSids = (await query('SELECT session_id FROM demo_session_ids')).rows.map((r) => r.session_id)
  const realSids = (await query('SELECT session_id FROM v1_sessions WHERE session_id LIKE $1', [`syn-sess-${world.real.tag}-%`])).rows.map((r) => r.session_id)
  const sids = [...demoSids, ...realSids]
  for (const sql of [
    'DELETE FROM behavioral_evidence_units WHERE session_id = ANY($1::text[])',
    'DELETE FROM evidence_rating_items WHERE enqueued_by = \'syn-admin\' AND $1::text[] IS NOT NULL',
    'DELETE FROM v1_reports WHERE session_id = ANY($1::text[])',
    'DELETE FROM v1_sessions WHERE session_id = ANY($1::text[])',
    'DELETE FROM session_decision_cache WHERE session_id = ANY($1::text[])',
    'DELETE FROM session_decision_inputs WHERE session_id = ANY($1::text[])',
  ]) await query(sql, [sids])
  const demoUsers = (await query('SELECT user_id FROM demo_accounts WHERE organization_id = $1', [world.demo.organizationId])).rows.map((r) => r.user_id)
  await query('DELETE FROM v1_users WHERE id = ANY($1::text[]) OR id LIKE $2', [demoUsers, `%-${world.real.tag}`])
  for (const id of [world.demo.organizationId, world.real.org.id]) await query('DELETE FROM organizations WHERE id = $1', [id]).catch(() => null)
  assert.equal(Number((await query('SELECT count(*)::int AS n FROM behavioral_evidence_units WHERE session_id = ANY($1::text[])', [sids])).rows[0].n), 0)
})
