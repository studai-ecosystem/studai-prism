// PROD-READY Phase 6 on a throwaway PostgreSQL (TEST_DATABASE_URL):
//   * the student directory filtered, sorted and paged in SQL returns exactly
//     the pages of the in-process path, for every scope and filter;
//   * paged rosters, cohort members and team lists keep their totals;
//   * 0060 materialised decisions: the triggers bump the version counter for
//     every input, cached == computed after each invalidating event (new
//     evidence, report re-issue, V3 report version, admin hold, constants
//     change, membership change, erasure), small-group suppression still
//     applies, a write racing the computation is never served, the flag-off
//     path writes nothing, erasure removes the rows, and down/up is clean.
// Synthetic data only (test-support/campusScaleSeed.mjs). Requires
// TEST_DATABASE_URL (skips otherwise); run serially with the other DB suites.
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
  process.env.PRISM_GROWTH_ENABLED = 'true'
}

const { migrateUp, migrateDown } = skip ? {} : await import('../db/migrate.js')
const { closePool, query, getPool, getSessionLockPool } = skip ? {} : await import('../db/pool.js')
const { createPgCampusRepos } = skip ? {} : await import('../domain/campusStore/index.js')
const { createCampusContext, EMPTY_LEGACY_SOURCES } = skip ? {} : await import('../domain/campusStore/context.js')
const store = skip ? {} : await import('../lib/store.js')
const evidenceGraph = skip ? {} : (await import('../lib/evidenceGraph.js')).default
const { seedCampusScale, SCALE_SCENARIOS } = skip ? {} : await import('../test-support/campusScaleSeed.mjs')
const { createErasureCascade } = skip ? {} : await import('../domain/privacy/erasureCascade.js')
const { createDecisionCacheRepoPg } = skip ? {} : await import('../domain/analytics/decisionCache.js')
const { PRIMARY_CAPABILITY_IDS } = skip ? {} : await import('../domain/assessments/catalog.js')
const { FLAG_CATALOGUE } = skip ? {} : await import('../lib/flagRegistry.js')

const n = async (sql, params = []) => Number((await query(sql, params)).rows[0].n)
const FLAG = 'PRISM_ANALYTICS_DECISION_CACHE'
async function withFlag(value, fn) {
  const before = process.env[FLAG]
  if (value == null) delete process.env[FLAG]
  else process.env[FLAG] = value
  try { return await fn() } finally { if (before == null) delete process.env[FLAG]; else process.env[FLAG] = before }
}
// JSON normalisation: what an API response carries.
const plain = (v) => JSON.parse(JSON.stringify(v))

// Accounts in v1_users (the PostgreSQL user store), batched like defaultContext.
const pgUsers = (inDatabase) => ({
  inDatabase,
  findById: async (id) => { const r = await query('SELECT id, name, email FROM v1_users WHERE id = $1', [id]); return r.rows[0] ? { id: r.rows[0].id, name: r.rows[0].name || null, email: r.rows[0].email || null } : null },
  findByEmail: async (email) => { const r = await query('SELECT id, name, email FROM v1_users WHERE email = $1', [String(email).toLowerCase()]); return r.rows[0] ? { id: r.rows[0].id, name: r.rows[0].name || null, email: r.rows[0].email || null } : null },
  findManyByIds: async (ids) => new Map((await query('SELECT id, name, email FROM v1_users WHERE id = ANY($1::text[])', [ids])).rows.map((u) => [u.id, { id: u.id, name: u.name || null, email: u.email || null }])),
  findManyByEmails: async (emails) => new Map((await query('SELECT id, name, email FROM v1_users WHERE email = ANY($1::text[])', [emails])).rows.map((u) => [u.email, { id: u.id, name: u.name || null, email: u.email || null }])),
})

// Entry computations (each one reads the session's report first).
let loads = 0
function context({ repos, inDatabase = true, salt = () => '' }) {
  return createCampusContext({
    repos,
    scenarioSource: async () => SCALE_SCENARIOS,
    users: pgUsers(inDatabase),
    legacy: {
      ...EMPTY_LEGACY_SOURCES,
      getSession: (id) => store.getSession(id),
      getReport: (id) => { loads += 1; return store.getReport(id) },
      adminState: async (id) => {
        const { rows } = await query('SELECT invalid, review_state FROM admin_session_states WHERE session_id = $1', [String(id)])
        return rows[0] ? { invalid: rows[0].invalid, reviewState: rows[0].review_state } : null
      },
    },
    evidence: { units: (id) => evidenceGraph.getEvidenceUnits(id) },
    legacyStoreInDatabase: true,
    decisionFingerprintSalt: salt,
  })
}

let world = null
async function setup() {
  if (world) return world
  await migrateUp()
  const repos = createPgCampusRepos({ query, getPool, getLockPool: getSessionLockPool })
  let salt = ''
  const campus = context({ repos, salt: () => salt })
  const seed = await seedCampusScale({ query, repos, catalog: campus.catalog, students: 40, assignments: 3, cohorts: 3, departments: 2, completion: [0.9, 0.7, 0.2], seed: 61 })
  await repos.analytics.saveSettings({ organizationId: seed.org.id, minAggregateGroupSize: 5, updatedBy: seed.owner.id })
  const actor = await campus.workspaceService.actorFor(seed.owner)
  world = { repos, campus, seed, actor, setSalt: (v) => { salt = v } }
  return world
}

test('flag PRISM_ANALYTICS_DECISION_CACHE is registered OFF and server-only', { skip }, () => {
  const f = FLAG_CATALOGUE.find((x) => x.key === FLAG)
  assert.ok(f, 'registered')
  assert.equal(f.risk, 'medium')
  assert.match(f.dataGate, /0060/)
  assert.notEqual(process.env[FLAG], 'true', 'off in the test environment unless a test turns it on')
})

test('0060: every decision input bumps the session version counter; down/up is clean', { skip }, async () => {
  await migrateUp()
  const sid = `syn-trig-${randomUUID().slice(0, 8)}`
  const version = async () => Number((await query('SELECT COALESCE(max(version), 0) AS v FROM session_decision_inputs WHERE session_id = $1', [sid])).rows[0].v)
  let last = 0
  const bumped = async (label) => { const v = await version(); assert.ok(v > last, `${label} bumps the counter (${last} → ${v})`); last = v }
  await store.createSession(sid, { scenarioId: 'syn-scale-a', userId: 'syn-trig-user' })
  await bumped('session insert')
  await store.updateSession(sid, { status: 'active' })
  assert.equal(await version(), last, 'an engine turn that changes nothing an entry reads does not bump')
  await store.updateSession(sid, { completedAt: Date.now() })
  await bumped('completion')
  await store.saveReport(sid, { scenarioId: 'syn-scale-a' })
  await bumped('report issued')
  await evidenceGraph.recordEvidenceUnit({ session_id: sid, capability_id: PRIMARY_CAPABILITY_IDS[0], source_type: 'DIALOGUE_TURN', source_turn: 1, candidate_action: { dialogue_excerpt: 'Synthetic.' }, provenance: { synthetic: true }, rubric_level: 3, judge_agreement: { agreement: 0.9 } })
  await bumped('evidence unit')
  await query("INSERT INTO admin_session_states (session_id, review_state) VALUES ($1, 'held')", [sid])
  await bumped('admin hold')
  await query("UPDATE admin_session_states SET review_state = 'released' WHERE session_id = $1", [sid])
  await bumped('admin release')
  await query("INSERT INTO student_report_versions (session_id, version, content_hash, builder_version, report_json) VALUES ($1, 1, 'syn-hash', 'syn', '{}'::jsonb)", [sid])
  await bumped('V3 report version')
  await query('INSERT INTO assessment_erasure_markers (session_id) VALUES ($1)', [sid])
  await bumped('erasure marker')
  // The cache table refuses a malformed fingerprint (CHECK).
  await assert.rejects(query("INSERT INTO session_decision_cache (session_id, fingerprint, inputs_version) VALUES ($1, 'x', 0)", [sid]), /check constraint/)

  const latest = async () => (await query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1')).rows[0].name
  const exists = async (name) => (await query('SELECT to_regclass($1) AS t', [name])).rows[0].t !== null
  while ((await latest()) >= '0060') await migrateDown()
  assert.equal(await exists('session_decision_cache'), false)
  assert.equal(await exists('session_decision_inputs'), false)
  assert.equal(await n("SELECT count(*) AS n FROM pg_trigger WHERE tgname LIKE 'session_decision_inputs_%'"), 0, 'every trigger dropped')
  await store.saveReport(sid, { scenarioId: 'syn-scale-a' }) // writes still work without 0060
  await migrateUp()
  assert.ok(await exists('session_decision_cache'))
})

test('student directory: the SQL path returns exactly the in-process pages for every scope and filter', { skip }, async () => {
  const w = await setup()
  const { seed, repos, actor } = w
  const sqlCampus = context({ repos, inDatabase: true })
  const jsCampus = context({ repos, inDatabase: false })
  // A pending invite and a student without a cohort, so both row kinds and the empty-cohort case are covered.
  await repos.memberships.createInvite?.({ organizationId: seed.org.id, email: 'syn.invitee@example.test', role: 'STUDENT', cohortId: seed.cohorts[0].id, tokenHash: `syn-${randomUUID()}`, invitedBy: seed.owner.id, expiresAt: new Date(Date.now() + 86_400_000).toISOString() })
  await query("INSERT INTO organization_memberships (organization_id, user_id, role, status) VALUES ($1, $2, 'STUDENT', 'ACTIVE')", [seed.org.id, `syn-nocohort-${seed.tag}`])
  const full = sqlCampus.scopeFor(actor, seed.org.id, 'students.read')
  const scopes = [
    ['ALL', full],
    ['ASSIGNED', { allowed: true, scope: 'ASSIGNED', cohortIds: [seed.cohorts[1].id] }],
    ['DEPARTMENT', { allowed: true, scope: 'DEPARTMENT', departmentId: seed.departments[0].id }],
    ['NONE', { allowed: true, scope: 'NONE' }],
  ]
  const filters = [
    {}, { q: 'student 0001' }, { q: 'SYN.STUDENT.0003' }, { q: 'invitee' }, { cohortId: seed.cohorts[0].id }, { status: 'INVITED' }, { status: 'SUSPENDED' },
    { assignmentStatus: 'COMPLETED' }, { assignmentStatus: 'NONE' }, { cohortId: seed.cohorts[2].id, assignmentStatus: 'ASSIGNED' },
  ]
  let compared = 0
  for (const [label, decision] of scopes) {
    for (const f of filters) {
      for (const page of [1, 2, 9]) {
        const opts = { ...f, page, pageSize: 7 }
        const [a, b] = await Promise.all([sqlCampus.admin.listStudents(actor, seed.org.id, decision, opts), jsCampus.admin.listStudents(actor, seed.org.id, decision, opts)])
        assert.deepEqual(plain(a), plain(b), `${label} ${JSON.stringify(opts)}`)
        compared += 1
      }
    }
    const allA = await sqlCampus.admin.listStudents(actor, seed.org.id, decision, { all: true })
    const allB = await jsCampus.admin.listStudents(actor, seed.org.id, decision, { all: true })
    assert.deepEqual(plain(allA), plain(allB), `${label} export`)
  }
  // Overview counts in SQL equal the in-process reference for every scope.
  for (const [label, decision] of scopes) {
    const viaSql = await repos.campusAdmin.overviewCounts(seed.org.id, { scopeMode: label === 'ALL' ? 'FULL' : label, scopeCohortIds: decision.cohortIds || [], departmentId: decision.departmentId ?? null, now: new Date().toISOString() })
    const ref = await sqlCampus.admin.overviewInProcess(seed.org.id, decision)
    assert.deepEqual(viaSql, { enrolled: ref.enrolled, invited: ref.invited, cohorts: ref.cohorts, assigned: ref.completion.assigned, completed: ref.completion.completed }, `overview ${label}`)
  }
  const overview = await sqlCampus.admin.overview(actor, seed.org.id)
  const reference = await sqlCampus.admin.overviewInProcess(seed.org.id, full)
  assert.deepEqual(plain(overview), plain(reference), 'the whole overview response is unchanged')
  // Student detail reads only that student, with the same answer.
  const someone = seed.studentIds[5]
  const req = { user: seed.owner, requestId: 'syn-detail' }
  const detail = await sqlCampus.admin.getStudent(req, actor, seed.org.id, full, someone)
  assert.equal(detail.student.userId, someone)
  assert.ok(detail.cohorts.length >= 1)
  await assert.rejects(sqlCampus.admin.getStudent(req, actor, seed.org.id, { allowed: true, scope: 'ASSIGNED', cohortIds: [] }, someone), (e) => e.code === 'NOT_FOUND')

  const page1 = await sqlCampus.admin.listStudents(actor, seed.org.id, full, { pageSize: 100 })
  assert.equal(page1.total, 40 + 1 + 1, 'every student, the no-cohort student and the pending invite')
  assert.ok(page1.items.some((r) => r.kind === 'INVITE'))
  assert.ok(compared >= 120)
})

test('paged roster, cohort members and team list keep whole totals; cursors walk every row once', { skip }, async () => {
  const w = await setup()
  const { seed, campus, actor } = w
  const decision = campus.scopeFor(actor, seed.org.id, 'assignments.read')
  const seen = new Set()
  let cursor = null
  let first = null
  do {
    const page = await campus.admin.assignmentCompletion(actor, seed.org.id, decision, seed.assignmentIds[0], { cursor, limit: 15 })
    first ||= page
    for (const s of page.students) { assert.ok(!seen.has(s.userId), 'no row twice'); seen.add(s.userId) }
    cursor = page.nextCursor
  } while (cursor)
  assert.equal(seen.size, 40)
  assert.equal(first.total, 40)
  assert.equal(Object.values(first.statusCounts).reduce((a, b) => a + b, 0), 40, 'counts cover the whole roster, not the page')
  assert.equal(first.statusCounts.COMPLETED, first.assignment.counts.COMPLETED)
  await assert.rejects(campus.admin.assignmentCompletion(actor, seed.org.id, decision, seed.assignmentIds[0], { cursor: 'not-a-cursor' }), /cursor/)

  const cohort = await campus.admin.getCohort(actor, seed.org.id, campus.scopeFor(actor, seed.org.id, 'cohorts.read'), seed.cohorts[0].id, { limit: 5 })
  assert.equal(cohort.members.length, 5)
  assert.ok(cohort.membersTotal >= 13)
  assert.equal(cohort.cohort.memberCount, cohort.membersTotal)
  assert.ok(cohort.nextCursor)
  assert.ok(cohort.members.every((m) => m.email && m.email.endsWith('@example.test')), 'cards come from the batched directory')
  const team = await campus.admin.listMembers(actor, seed.org.id, { limit: 1 })
  assert.equal(team.members.length, 1)
  assert.equal(team.total, 1)
  assert.equal(team.nextCursor, null)

  const list = await campus.admin.listAssignments(actor, seed.org.id, campus.scopeFor(actor, seed.org.id, 'assignments.read'))
  assert.equal(list.length, 3)
  assert.ok(list.every((a) => a.counts.total === 40 && a.cohortIds.length === 3))
})

test('materialised decisions: cached == computed after every invalidating event; erasure removes the rows', { skip }, async () => {
  const w = await setup()
  const { seed, campus, actor, repos } = w
  const org = seed.org.id
  const views = async () => plain({
    capabilities: await campus.analytics.capabilities(actor, org, {}),
    sufficiency: await campus.analytics.sufficiency(actor, org, {}),
    comparison: await campus.analytics.comparison(actor, org, { groupBy: 'cohort' }),
    byDepartment: await campus.analytics.comparison(actor, org, { groupBy: 'department' }),
  })
  const computed = () => withFlag(null, views)
  const cached = () => withFlag('true', views)
  const rows = () => n('SELECT count(*) AS n FROM session_decision_cache WHERE session_id = ANY($1::text[])', [seed.sessions.map((s) => s.sessionId)])
  async function check(label, { expectReads = null } = {}) {
    const want = await computed()
    loads = 0
    const first = await cached()
    const readsFirst = loads
    loads = 0
    const second = await cached()
    assert.deepEqual(first, want, `${label}: first cached read equals the computed view`)
    assert.deepEqual(second, want, `${label}: second cached read equals the computed view`)
    assert.equal(loads, 0, `${label}: the second read is served from the cache`)
    if (expectReads != null) assert.equal(readsFirst, expectReads, `${label}: only invalidated sessions were recomputed`)
    return want
  }

  // The SQL-side analytics reads (latest session per student, roster status
  // counts, active student ids) give the views of the in-process reference.
  const { createAnalyticsService } = await import('../domain/analytics/service.js')
  const hide = new Set(['latestCompletedSessions', 'countRosterStatuses', 'listActiveStudentIds'])
  const reference = createAnalyticsService({
    repos: new Proxy(repos, { get: (t, k) => (k === 'campusAdmin' ? new Proxy(t.campusAdmin, { get: (ca, m) => (hide.has(m) ? undefined : ca[m]) }) : t[k]) }),
    entriesFor: campus.decisions.entriesFor,
  })
  for (const f of [{}, { cohortId: seed.cohorts[0].id }, { from: '2026-09-01', to: '2026-09-10' }]) {
    assert.deepEqual(plain(await withFlag(null, () => campus.analytics.capabilities(actor, org, f))), plain(await withFlag(null, () => reference.capabilities(actor, org, f))), `capabilities ${JSON.stringify(f)}`)
    assert.deepEqual(plain(await campus.analytics.completion(actor, org, f)), plain(await reference.completion(actor, org, f)), `completion ${JSON.stringify(f)}`)
  }

  // Flag off: nothing is written.
  await computed()
  assert.equal(await rows(), 0, 'flag off writes no cache rows')

  const base = await check('cold cache')
  assert.equal(base.capabilities.suppressed, false)
  assert.ok(base.capabilities.assessed >= 30)
  assert.ok(await rows() >= 30)

  // The latest completed session of a student (what analytics counts).
  const latestOf = async (userId) => (await query(
    "SELECT session_id FROM assessment_assignment_students WHERE user_id = $1 AND status = 'COMPLETED' ORDER BY completed_at DESC LIMIT 1", [userId],
  )).rows[0].session_id
  const target = seed.studentIds.find((_, i) => i % 3 === 0)
  const sid = await latestOf(target)

  // 1. New evidence: a SUFFICIENT-agreement unit moves the capability.
  for (let t = 50; t < 54; t += 1) {
    await evidenceGraph.recordEvidenceUnit({ session_id: sid, capability_id: PRIMARY_CAPABILITY_IDS[0], source_type: 'DIALOGUE_TURN', source_turn: t, behavior_anchor_id: 'syn-anchor-new', candidate_action: { dialogue_excerpt: 'Synthetic later words.' }, provenance: { synthetic: true }, rubric_level: 5, judge_agreement: { agreement: 0.95, samples: 3 } })
  }
  await check('new evidence', { expectReads: 1 })

  // 2. Report re-issued (correction) and a V3 report version published.
  await store.saveReport(sid, { scenarioId: 'syn-scale-a', corrected: true })
  await check('report re-issued', { expectReads: 1 })
  await repos.reportVersions.append({ sessionId: sid, version: 1, contentHash: `syn-${randomUUID()}`, builderVersion: 'syn', report: { synthetic: true }, issuedAt: new Date().toISOString(), reason: 'INITIAL' })
  await check('report version published', { expectReads: 1 })

  // 3. Admin hold: the session leaves the counts (under review).
  const held = await latestOf(seed.studentIds[1])
  await query("INSERT INTO admin_session_states (session_id, review_state) VALUES ($1, 'held')", [held])
  const afterHold = await check('admin hold', { expectReads: 1 })
  assert.equal(afterHold.capabilities.underReview, base.capabilities.underReview + 1)
  await query("UPDATE admin_session_states SET review_state = 'released' WHERE session_id = $1", [held])
  await check('admin release', { expectReads: 1 })

  // 4. A sufficiency constant changes (new fingerprint): everything is recomputed.
  w.setSalt('threshold-change')
  const assessed = base.capabilities.assessed + base.capabilities.underReview
  await check('constants change', { expectReads: assessed })
  w.setSalt('')
  await check('constants restored', { expectReads: assessed })

  // 5. Membership change: the population differs, decisions are reused.
  const leaver = seed.studentIds[4]
  const m = (await query("SELECT id FROM organization_memberships WHERE organization_id = $1 AND user_id = $2 AND role = 'STUDENT'", [org, leaver])).rows[0]
  await repos.campusAdmin.setMembershipStatus(m.id, 'REMOVED')
  await check('membership removed', { expectReads: 0 })

  // 6. Small-group suppression still applies to cached views.
  await repos.analytics.saveSettings({ organizationId: org, minAggregateGroupSize: 1000, updatedBy: seed.owner.id })
  const tiny = await check('minimum group size raised', { expectReads: 0 })
  assert.equal(tiny.capabilities.suppressed, true)
  assert.deepEqual(tiny.capabilities.capabilities, [])
  assert.ok(tiny.comparison.groups.every((g) => g.suppressed))
  await repos.analytics.saveSettings({ organizationId: org, minAggregateGroupSize: 5, updatedBy: seed.owner.id })

  // 7. Account erasure: the person's cached decisions and counters are gone.
  const erased = seed.sessions.map((x) => x.userId).find((u) => ![target, leaver, seed.studentIds[1]].includes(u) && seed.studentIds.indexOf(u) > 7)
  const theirs = seed.sessions.filter((s) => s.userId === erased).map((s) => s.sessionId)
  assert.ok(theirs.length > 0)
  assert.ok(await n('SELECT count(*) AS n FROM session_decision_cache WHERE session_id = ANY($1::text[])', [theirs]) > 0)
  const cascade = createErasureCascade({ actorHasher: (id) => `hash-${id}` })
  const receipt = await cascade.run({ userId: erased, initiatedBy: 'SELF_SERVICE' })
  assert.equal(receipt.status, 'COMPLETED')
  assert.equal(await n('SELECT count(*) AS n FROM session_decision_cache WHERE session_id = ANY($1::text[])', [theirs]), 0, 'cache rows deleted')
  assert.equal(await n('SELECT count(*) AS n FROM session_decision_inputs WHERE session_id = ANY($1::text[])', [theirs]), 0, 'version counters deleted (after the session data, so no trigger re-created them)')
  await check('after erasure')

  // 8. Growth outcomes over a reassessment cycle: cached == computed.
  const admin = campus.admin
  const req = { user: seed.owner, requestId: 'syn-p6' }
  const cycle = await campus.growth.createCycle(req, actor, org, { name: 'Synthetic cycle', baselineAssignmentId: seed.assignmentIds[0], windowStart: new Date(Date.now() - 3_600_000).toISOString(), windowEnd: new Date(Date.now() + 86_400_000).toISOString() }, { admin })
  const done = seed.sessions.filter((s) => s.assignmentId === seed.assignmentIds[0]).slice(0, 12)
  for (const s of done) {
    const reSid = `${s.sessionId}-re`
    await store.createSession(reSid, { scenarioId: 'syn-scale-a', userId: s.userId })
    await store.saveReport(reSid, { scenarioId: 'syn-scale-a' })
    for (let t = 1; t <= 4; t += 1) await evidenceGraph.recordEvidenceUnit({ session_id: reSid, capability_id: PRIMARY_CAPABILITY_IDS[0], source_type: 'DIALOGUE_TURN', source_turn: t, behavior_anchor_id: `syn-re-${t % 2}`, candidate_action: { dialogue_excerpt: 'Synthetic.' }, provenance: { synthetic: true }, rubric_level: 4, judge_agreement: { agreement: 0.9 } })
    await repos.assessments.updateStudent({ assignmentId: cycle.reassessment.assignmentId, userId: s.userId, patch: { status: 'COMPLETED', sessionId: reSid, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() } })
  }
  const outcomes = async () => plain(await campus.growth.outcomes(actor, org, { admin, minGroupSize: 5 }))
  const wantOutcomes = await withFlag(null, outcomes)
  const gotOutcomes = await withFlag('true', outcomes)
  const again = await withFlag('true', outcomes)
  assert.deepEqual(gotOutcomes, wantOutcomes, 'growth outcomes: cached == computed')
  assert.deepEqual(again, wantOutcomes)
  assert.equal(wantOutcomes.items[0].counts.completedBoth, done.filter((s) => s.userId !== erased).length)
  await evidenceGraph.recordEvidenceUnit({ session_id: `${done[0].sessionId}-re`, capability_id: PRIMARY_CAPABILITY_IDS[1], source_type: 'DIALOGUE_TURN', source_turn: 9, candidate_action: { dialogue_excerpt: 'Synthetic.' }, provenance: { synthetic: true }, rubric_level: 2, judge_agreement: { agreement: 0.9 } })
  assert.deepEqual(await withFlag('true', outcomes), await withFlag(null, outcomes), 'growth outcomes after new evidence')
})

test('a write racing the computation is never served; a read failure falls back to computing', { skip }, async () => {
  await migrateUp()
  const repo = createDecisionCacheRepoPg({ query })
  const sid = `syn-race-${randomUUID().slice(0, 8)}`
  await store.createSession(sid, { scenarioId: 'syn-scale-a', userId: 'syn-race-user' })
  const fp = 'f'.repeat(40)
  const before = (await repo.read([sid], fp)).get(sid)
  assert.equal(before.hit, false)
  // The session changes after the version was read but before the computed row is written.
  await store.saveReport(sid, { scenarioId: 'syn-scale-a' })
  await repo.write([{ sessionId: sid, fingerprint: fp, inputsVersion: before.version, entry: { stale: true } }])
  assert.equal((await repo.read([sid], fp)).get(sid).hit, false, 'the stale row is refused or never served')
  // Written against the current version it is served, and only with the same fingerprint.
  const now = (await repo.read([sid], fp)).get(sid)
  await repo.write([{ sessionId: sid, fingerprint: fp, inputsVersion: now.version, entry: { fresh: true } }])
  assert.deepEqual((await repo.read([sid], fp)).get(sid), { hit: true, version: now.version, entry: { fresh: true } })
  assert.equal((await repo.read([sid], 'e'.repeat(40))).get(sid).hit, false, 'another fingerprint never hits')

  const { createDecisionCache } = await import('../domain/analytics/decisionCache.js')
  let computedCalls = 0
  const cache = createDecisionCache({
    entryFor: async () => { computedCalls += 1; return null },
    catalog: { getCatalog: async () => ({ definitions: [], forms: [] }) },
    repo: () => ({ read: async () => { throw Object.assign(new Error('boom'), { code: 'XX000' }) }, write: async () => 0 }),
    enabled: () => true,
  })
  const out = await cache.entriesFor([{ sessionId: 'a' }, { sessionId: 'b' }, { sessionId: 'a' }])
  assert.deepEqual([...out.keys()], ['a', 'b'])
  assert.equal(computedCalls, 2, 'computed once per distinct session')
})

// Synthetic rows are removed again: later suites roll migrations far back
// (0025 requires every evidence unit to carry a blueprint id).
test('teardown', { skip }, async () => {
  const prefixes = ['syn-trig-%', 'syn-race-%', ...(world ? [`syn-sess-${world.seed.tag}-%`] : [])]
  const sids = (await query('SELECT session_id FROM v1_sessions WHERE session_id LIKE ANY($1::text[])', [prefixes])).rows.map((r) => r.session_id)
  for (const sql of [
    'DELETE FROM behavioral_evidence_units WHERE session_id = ANY($1::text[])',
    'DELETE FROM student_report_versions WHERE session_id = ANY($1::text[])',
    'DELETE FROM admin_session_states WHERE session_id = ANY($1::text[])',
    'DELETE FROM assessment_erasure_markers WHERE session_id = ANY($1::text[])',
    'DELETE FROM v1_reports WHERE session_id = ANY($1::text[])',
    'DELETE FROM v1_sessions WHERE session_id = ANY($1::text[])',
    'DELETE FROM session_decision_cache WHERE session_id = ANY($1::text[])',
    'DELETE FROM session_decision_inputs WHERE session_id = ANY($1::text[])',
  ]) await query(sql, [sids])
  if (world) {
    await query('DELETE FROM v1_users WHERE id LIKE $1', [`%-${world.seed.tag}`])
    await query('DELETE FROM organizations WHERE id = $1', [world.seed.org.id]).catch(() => null)
  }
  assert.equal(await n("SELECT count(*) AS n FROM behavioral_evidence_units WHERE session_id LIKE 'syn-%'"), 0)
  await closePool()
})
