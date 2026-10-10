// PROD-READY Phase 6 (no database): paged campus admin lists keep their
// response shapes (new fields are additive) and walk every row exactly once;
// cursor and limit are validated; the user directory is read once per list
// (batched), never once per row; the directory order is deterministic; the
// decision cache serves only current rows, computes everything else, and is
// a pass-through while PRISM_ANALYTICS_DECISION_CACHE is off; and analytics
// asks for every student's decision in one batch.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext } from '../domain/campusStore/context.js'
import { ApiError } from '../domain/http/errors.js'
import { createDecisionCache, decisionFingerprint, serializeEntry, deserializeEntry } from '../domain/analytics/decisionCache.js'
import { offsetFromCursor, adminListWindow, nextOffsetCursor, ADMIN_LIST_MAX_LIMIT } from '../domain/http/pagination.js'
import { FLAG_CATALOGUE } from '../lib/flagRegistry.js'

// Enabled inside this test process only (K2).
process.env.PRISM_CAMPUS_ENABLED = 'true'

const SCENARIOS = { generalScenarios: [{ id: 'syn-p6-a' }], bankScenarios: {} }
const STUDENTS = 23

async function world() {
  const now = new Date('2026-10-10T09:00:00Z')
  const repos = createMemoryCampusRepos({ clock: () => now })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic Paging University', slug: 'syn-p6', organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  const cohort = await repos.organizations.createCohort({ organizationId: org.id, name: 'Synthetic Cohort' })
  const owner = { id: 'owner-p6', email: 'owner-p6@test.local', name: 'Synthetic Owner' }
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: owner.id, role: 'ORG_OWNER', status: 'ACTIVE' })
  const people = new Map([[owner.id, owner]])
  // Names differ only in case, and two have no name (sorted by email).
  for (let i = 0; i < STUDENTS; i += 1) {
    const id = `student-p6-${String(i).padStart(2, '0')}`
    const name = i < 2 ? null : `${i % 2 ? 'synthetic' : 'Synthetic'} Student ${String(i).padStart(2, '0')}`
    people.set(id, { id, email: `${id}@test.local`, name })
    await repos.memberships.upsertMembership({ organizationId: org.id, userId: id, role: 'STUDENT', status: 'ACTIVE' })
    await repos.organizations.addCohortMember({ cohortId: cohort.id, userId: id })
  }
  for (let i = 0; i < 3; i += 1) {
    const id = `staff-p6-${i}`
    people.set(id, { id, email: `${id}@test.local`, name: `Synthetic Staff ${i}` })
    await repos.memberships.upsertMembership({ organizationId: org.id, userId: id, role: 'FACULTY_MENTOR', status: 'ACTIVE' })
  }
  const lookups = { one: 0, many: 0 }
  const users = {
    findById: async (id) => { lookups.one += 1; return people.get(id) || null },
    findByEmail: async (email) => [...people.values()].find((p) => p.email === email) || null,
    findManyByIds: async (ids) => { lookups.many += 1; return new Map(ids.filter((id) => people.has(id)).map((id) => [id, people.get(id)])) },
  }
  const campus = createCampusContext({ repos, clock: () => now, users, scenarioSource: async () => SCENARIOS, audit: () => {} })
  const requireUser = (req, _res, next) => (req.get('x-test-user') === owner.id ? ((req.user = owner), next()) : next(new ApiError('UNAUTHENTICATED', 'Sign in to continue.')))
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createV1Router({ requireUser, campus }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/v1/organizations/${org.id}`
  const get = async (path) => {
    const r = await fetch(`${base}${path}`, { headers: { 'x-test-user': owner.id } })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  const post = async (path, body) => {
    const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'x-test-user': owner.id, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  return { repos, org, cohort, owner, campus, lookups, get, post, close: () => server.close() }
}

test('pagination helpers: opaque offset cursors, bounded limits, malformed cursors refused', () => {
  assert.equal(offsetFromCursor(null), 0)
  assert.equal(offsetFromCursor(nextOffsetCursor(0, 50, 120)), 50)
  assert.equal(nextOffsetCursor(100, 50, 120), null)
  assert.deepEqual(adminListWindow({}), { offset: 0, limit: 50 })
  assert.equal(adminListWindow({ limit: 5000 }).limit, ADMIN_LIST_MAX_LIMIT)
  for (const bad of ['%%%', Buffer.from('{"o":-1}').toString('base64url'), Buffer.from('{"o":"x"}').toString('base64url'), Buffer.from('[]').toString('base64url')]) {
    assert.throws(() => offsetFromCursor(bad), (e) => e.code === 'VALIDATION_FAILED', bad)
  }
})

test('assignment roster, cohort members and team list are paged; totals cover the whole list; bad params are 422', async () => {
  const w = await world()
  try {
    const cat = await w.get('/assessment-catalog')
    const launched = await w.post('/assignments', { definitionId: cat.body.data.items[0].id, cohortIds: [w.cohort.id], windowStart: '2026-10-01T08:00:00.000Z', windowEnd: '2026-10-30T18:00:00.000Z' })
    assert.equal(launched.status, 201)
    const id = launched.body.data.id
    for (const [i, sid] of ['s-a', 's-b', 's-c'].entries()) {
      await w.repos.assessments.updateStudent({ assignmentId: id, userId: `student-p6-0${i}`, patch: { status: 'COMPLETED', sessionId: sid, startedAt: '2026-10-02T09:00:00Z', completedAt: '2026-10-02T10:00:00Z' } })
    }
    // Default page: 50 rows max; the shape keeps assignment + students.
    const whole = await w.get(`/assignments/${id}`)
    assert.equal(whole.status, 200)
    assert.equal(whole.body.data.students.length, STUDENTS)
    assert.equal(whole.body.data.total, STUDENTS)
    assert.equal(whole.body.data.nextCursor, null)
    assert.deepEqual(whole.body.data.statusCounts, { ASSIGNED: STUDENTS - 3, COMPLETED: 3 })
    assert.ok(whole.body.data.assignment.counts.total === STUDENTS)
    // Walk pages of 5: every student once, counts identical on every page.
    const seen = []
    let cursor = null
    do {
      const r = await w.get(`/assignments/${id}?limit=5${cursor ? `&cursor=${cursor}` : ''}`)
      assert.equal(r.status, 200)
      assert.ok(r.body.data.students.length <= 5)
      assert.deepEqual(r.body.data.statusCounts, whole.body.data.statusCounts)
      seen.push(...r.body.data.students.map((s) => s.userId))
      cursor = r.body.data.nextCursor
    } while (cursor)
    assert.equal(seen.length, STUDENTS)
    assert.equal(new Set(seen).size, STUDENTS)
    for (const q of ['?limit=0', '?limit=101', '?limit=x', '?cursor=%25%25', '?cursor=abc&extra=1']) {
      assert.equal((await w.get(`/assignments/${id}${q}`)).status, 422, q)
    }

    const cohort = await w.get(`/cohorts/${w.cohort.id}?limit=10`)
    assert.equal(cohort.status, 200)
    assert.equal(cohort.body.data.members.length, 10)
    assert.equal(cohort.body.data.membersTotal, STUDENTS)
    assert.equal(cohort.body.data.cohort.memberCount, STUDENTS)
    assert.ok(cohort.body.data.nextCursor)
    const second = await w.get(`/cohorts/${w.cohort.id}?limit=10&cursor=${cohort.body.data.nextCursor}`)
    assert.equal(second.body.data.members.length, 10)
    assert.ok(!second.body.data.members.some((m) => cohort.body.data.members.some((x) => x.id === m.id)))
    assert.equal(second.body.data.pendingInvitesTotal, 0)

    const team = await w.get('/members?limit=2')
    assert.equal(team.status, 200)
    assert.equal(team.body.data.members.length, 2)
    assert.equal(team.body.data.total, 4)
    const rest = await w.get(`/members?limit=2&cursor=${team.body.data.nextCursor}`)
    assert.equal(rest.body.data.members.length, 2)
    assert.equal(rest.body.data.nextCursor, null)
    assert.ok(rest.body.data.viewer && Array.isArray(rest.body.data.pendingInvites), 'the response shape is unchanged')
  } finally { w.close() }
})

test('the user directory is read once per list, never once per row; the directory order is deterministic', async () => {
  const w = await world()
  try {
    w.lookups.one = 0
    w.lookups.many = 0
    const page = await w.get('/students?pageSize=100')
    assert.equal(page.status, 200)
    assert.equal(page.body.data.total, STUDENTS)
    assert.equal(w.lookups.one, 0, 'no per-row lookup')
    assert.equal(w.lookups.many, 1, 'one batched lookup')
    const names = page.body.data.items.map((r) => r.name || r.email)
    const lower = names.map((x) => x.toLowerCase())
    assert.deepEqual(lower, [...lower].sort(), 'ordered by name (or email), case-insensitively')
    // Pages never overlap and add up to the whole directory.
    const ids = []
    for (let p = 1; p <= 3; p += 1) ids.push(...(await w.get(`/students?pageSize=10&page=${p}`)).body.data.items.map((r) => r.userId))
    assert.deepEqual(ids, page.body.data.items.map((r) => r.userId))
    w.lookups.many = 0
    const cohort = await w.get(`/cohorts/${w.cohort.id}`)
    assert.equal(cohort.status, 200)
    assert.equal(w.lookups.many, 1)
    assert.equal(w.lookups.one, 0)
  } finally { w.close() }
})

test('flag PRISM_ANALYTICS_DECISION_CACHE is registered OFF; the memory store always computes', async () => {
  const f = FLAG_CATALOGUE.find((x) => x.key === 'PRISM_ANALYTICS_DECISION_CACHE')
  assert.ok(f)
  assert.notEqual(process.env.PRISM_ANALYTICS_DECISION_CACHE, 'true')
  const w = await world()
  try {
    assert.equal(w.repos.decisionCache, undefined, 'no cache repository on the memory store')
    let calls = 0
    const prev = process.env.PRISM_ANALYTICS_DECISION_CACHE
    process.env.PRISM_ANALYTICS_DECISION_CACHE = 'true'
    try {
      const cache = createDecisionCache({ entryFor: async () => { calls += 1; return null }, catalog: w.campus.catalog, repo: () => w.repos.decisionCache || null, enabled: () => true })
      await cache.entriesFor([{ sessionId: 'x' }, { sessionId: 'y' }])
      assert.equal(calls, 2)
    } finally { if (prev == null) delete process.env.PRISM_ANALYTICS_DECISION_CACHE; else process.env.PRISM_ANALYTICS_DECISION_CACHE = prev }
  } finally { w.close() }
})

test('decision cache: hits are served, misses computed and written with the version read first; off = pass-through', async () => {
  const cat = { definitions: [{ id: 'def-1', title: 'Synthetic', measures: ['CAP-A'] }], forms: [{ id: 'form-1', definitionId: 'def-1' }] }
  const entry = (sid) => ({ session: { sessionId: sid, completedAt: '2026-10-02T10:00:00.000Z' }, definition: cat.definitions[0], form: cat.forms[0], decisions: { 'CAP-A': { status: 'PROVISIONAL', level: { band: 'DEVELOPING', label: 'Developing', rubricMedian: 3 }, unitIds: ['e1'], consideredUnitIds: ['e1'], rulesVersion: 'r1', reasons: [] } }, reportCorrectionPending: false })
  const rows = new Map([['hit', { hit: true, version: 4, entry: serializeEntry(entry('hit')) }], ['stale', { hit: false, version: 9, entry: { stale: true } }]])
  const written = []
  const computed = []
  let enabled = false
  const cache = createDecisionCache({
    entryFor: async (sid) => { computed.push(sid); return sid === 'held' ? null : entry(sid) },
    catalog: { getCatalog: async () => cat },
    repo: () => ({ read: async (ids) => new Map(ids.map((id) => [id, rows.get(id) || { hit: false, version: 0, entry: null }])), write: async (r) => { written.push(...r); return r.length } }),
    enabled: () => enabled,
  })
  // Off: everything computed, nothing written.
  const off = await cache.entriesFor([{ sessionId: 'hit' }, { sessionId: 'stale' }])
  assert.deepEqual(computed, ['hit', 'stale'])
  assert.equal(written.length, 0)
  computed.length = 0
  enabled = true
  const on = await cache.entriesFor([{ sessionId: 'hit' }, { sessionId: 'stale' }, { sessionId: 'held' }])
  assert.deepEqual(computed, ['stale', 'held'], 'only stale and missing rows are computed')
  assert.deepEqual(on.get('hit'), entry('hit'), 'a hit equals the computed entry')
  assert.deepEqual(on.get('hit'), off.get('hit'))
  assert.equal(on.get('held'), null)
  assert.deepEqual(written.map((r) => [r.sessionId, r.inputsVersion, r.entry === null]), [['stale', 9, false], ['held', 0, true]], 'written against the version read before computing')
  assert.deepEqual(deserializeEntry(JSON.parse(JSON.stringify(serializeEntry(entry('z')))), cat), entry('z'), 'stored form round-trips')
  assert.notEqual(decisionFingerprint(cat), decisionFingerprint(cat, { salt: 'x' }), 'a changed constant changes the fingerprint')
  assert.notEqual(decisionFingerprint(cat), decisionFingerprint({ ...cat, definitions: [{ ...cat.definitions[0], measures: ['CAP-B'] }] }), 'a changed catalog changes the fingerprint')
  assert.equal(decisionFingerprint(cat), decisionFingerprint(cat))
})

test('analytics asks for every counted student\'s decision in one batch', async () => {
  const w = await world()
  try {
    const cat = await w.get('/assessment-catalog')
    const launched = await w.post('/assignments', { definitionId: cat.body.data.items[0].id, cohortIds: [w.cohort.id], windowStart: '2026-10-01T08:00:00.000Z', windowEnd: '2026-10-30T18:00:00.000Z' })
    for (let i = 0; i < STUDENTS; i += 1) {
      await w.repos.assessments.updateStudent({ assignmentId: launched.body.data.id, userId: `student-p6-${String(i).padStart(2, '0')}`, patch: { status: 'COMPLETED', sessionId: `sess-p6-${i}`, startedAt: '2026-10-02T09:00:00Z', completedAt: '2026-10-02T10:00:00Z' } })
    }
    const batches = []
    const { createAnalyticsService } = await import('../domain/analytics/service.js')
    const svc = createAnalyticsService({ repos: w.repos, entriesFor: async (refs) => { batches.push(refs.length); return new Map(refs.map((r) => [r.sessionId, null])) } })
    const actor = await w.campus.workspaceService.actorFor(w.owner)
    const out = await svc.capabilities(actor, w.org.id, {})
    assert.deepEqual(batches, [STUDENTS])
    assert.equal(out.suppressed, true, 'every session unavailable → under review, nothing counted')
  } finally { w.close() }
})

test('import rows: every row by default (an import is bounded); cursor/limit page them', async () => {
  const w = await world()
  try {
    const csv = ['email,cohort', ...Array.from({ length: 30 }, (_, i) => `new.p6.${i}@test.local,Synthetic Cohort`)].join('\n')
    const preview = await w.post('/imports/students', { csv })
    assert.equal(preview.status, 201)
    const id = preview.body.data.job.id
    const all = await w.get(`/imports/${id}`)
    assert.equal(all.body.data.rows.length, 30)
    assert.equal(all.body.data.rowsTotal, 30)
    assert.equal(all.body.data.nextCursor, null)
    const first = await w.get(`/imports/${id}?limit=12`)
    assert.equal(first.body.data.rows.length, 12)
    const second = await w.get(`/imports/${id}?limit=12&cursor=${first.body.data.nextCursor}`)
    assert.deepEqual(second.body.data.rows.map((r) => r.rowNumber), all.body.data.rows.slice(12, 24).map((r) => r.rowNumber))
    assert.equal((await w.get(`/imports/${id}?limit=2001`)).status, 422)
  } finally { w.close() }
})
