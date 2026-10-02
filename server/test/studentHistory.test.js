// P1.2 — the authorized history projection (GET /api/v1/me/history) over the
// real /api/v1 router with memory repositories and synthetic legacy sources.
// Proves: owner + workspace scoping, labelled source types, honest statuses
// (processing vs technical failure vs under review vs legacy), stored dates
// only (unknown stays null), practice kept apart from formal, pagination.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'
import { HistoryPageSchema } from '../domain/student/history.js'
import { ApiError } from '../domain/http/errors.js'

process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_DEVELOPMENT_V2 = 'true'

const NOW = new Date('2026-10-01T10:00:00Z')
const day = 86400000
const hour = 3600000
const iso = (ms) => new Date(NOW.getTime() + ms).toISOString()

const USERS = {
  student: { id: 'student-s', email: 'student@test.local', name: 'Synthetic Student' },
  other: { id: 'student-o', email: 'other@test.local', name: 'Other Student' },
}

const SCENARIOS = {
  generalScenarios: [{ id: 'syn-general-a' }],
  bankScenarios: {
    'syn-bank-l1': {
      title: 'Synthetic Bank Simulation', version: '1.0.0', blueprintId: 'SYN-JF-L1',
      briefing: { objective: 'Synthetic objective.' },
      interactiveArtifacts: [],
      probingTree: { turns: [{ targetCapability: 'CAP-L1-COMMUNICATION' }] },
    },
  },
}

async function world() {
  const repos = createMemoryCampusRepos({ clock: () => NOW })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic University', slug: 'syn-u', organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: USERS.student.id, role: 'STUDENT', status: 'ACTIVE' })

  const legacyState = {
    sessions: {
      // Completed personal session with a report (formal, V3-capable).
      'sess-done': { sessionId: 'sess-done', userId: USERS.student.id, scenarioId: 'syn-general-a', startedAt: NOW.getTime() - 9 * day, completedAt: NOW.getTime() - 9 * day + hour, history: [] },
      // In progress (no completion, no report).
      'sess-live': { sessionId: 'sess-live', userId: USERS.student.id, scenarioId: 'syn-bank-l1', startedAt: NOW.getTime() - day, history: [] },
      // Finished minutes ago, report not yet written → processing.
      'sess-proc': { sessionId: 'sess-proc', userId: USERS.student.id, scenarioId: 'syn-general-a', startedAt: NOW.getTime() - 2 * hour, completedAt: NOW.getTime() - 10 * 60000, history: [] },
      // Finished days ago, still no report → technical failure, recoverable.
      'sess-fail': { sessionId: 'sess-fail', userId: USERS.student.id, scenarioId: 'syn-general-a', startedAt: NOW.getTime() - 5 * day, completedAt: NOW.getTime() - 5 * day + hour, history: [] },
      // Held by admin review.
      'sess-held': { sessionId: 'sess-held', userId: USERS.student.id, scenarioId: 'syn-general-a', startedAt: NOW.getTime() - 3 * day, history: [] },
      // Sponsored completed session (visible only in the campus workspace).
      'sess-sponsored': { sessionId: 'sess-sponsored', userId: USERS.student.id, scenarioId: 'syn-general-a', startedAt: NOW.getTime() - 2 * day, history: [] },
      // Someone else's session with the student's id nowhere.
      'sess-other': { sessionId: 'sess-other', userId: USERS.other.id, scenarioId: 'syn-general-a', startedAt: NOW.getTime() - day, history: [] },
    },
    reports: {
      'sess-done': { sessionId: 'sess-done', userId: USERS.student.id, issuedAt: iso(-9 * day + 2 * hour) },
      'sess-held': { sessionId: 'sess-held', userId: USERS.student.id, issuedAt: iso(-3 * day) },
      'sess-sponsored': { sessionId: 'sess-sponsored', userId: USERS.student.id, issuedAt: iso(-2 * day) },
      // Legacy report with no session row and no stored date.
      'legacy-only': { sessionId: 'legacy-only', userId: USERS.student.id, scenarioId: 'syn-general-a' },
    },
    admin: { 'sess-held': { invalid: false, reviewState: 'held' } },
  }
  await repos.scopes.createSessionScope({ sessionId: 'sess-sponsored', ownerUserId: USERS.student.id, sponsorType: 'INSTITUTION', sponsorOrganizationId: org.id, workspaceId: 'ws', visibilityPolicy: 'OWNER_AND_SPONSOR', createdBy: USERS.student.id })
  const snapshot = JSON.stringify(legacyState)

  const legacy = {
    listEntitlements: async () => [],
    listSessionIds: async (userId) => [...new Set([
      ...Object.values(legacyState.sessions).filter((s) => s.userId === userId).map((s) => s.sessionId),
      ...Object.values(legacyState.reports).filter((r) => r.userId === userId).map((r) => r.sessionId),
    ])],
    getSession: async (id) => (legacyState.sessions[id] ? structuredClone(legacyState.sessions[id]) : null),
    getReport: async (id) => (legacyState.reports[id] ? { ...legacyState.reports[id] } : null),
    adminState: async (id) => legacyState.admin[id] || null,
    paths: EMPTY_LEGACY_SOURCES.paths,
  }
  const campus = createCampusContext({
    repos, campusStoreAvailable: () => true, clock: () => NOW, legacy, audit: () => {},
    scenarioSource: async () => SCENARIOS, evidence: { units: async () => [] },
  })
  const requireUser = (req, _res, next) => {
    const user = USERS[req.get('x-test-user')]
    if (!user) return next(new ApiError('UNAUTHENTICATED', 'Sign in to continue.'))
    req.user = user
    return next()
  }
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createV1Router({ requireUser, campus }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const call = async (who, path, headers = {}) => {
    const r = await fetch(`${base}${path}`, { headers: { ...(who ? { 'x-test-user': who } : {}), ...headers } })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  const campusWs = (await campus.workspaceService.listWorkspaces(USERS.student)).find((w) => w.type === 'CAMPUS_STUDENT')
  return { repos, org, campus, call, legacyState, snapshot, campusWs, close: () => server.close() }
}

const byId = (items) => Object.fromEntries(items.map((i) => [i.id, i]))

test('P1.2: personal history projects owned formal sessions, legacy reports and practice with honest statuses', async () => {
  const w = await world()
  try {
    const personal = { id: 'personal', type: 'PERSONAL', organizationId: null }
    const started = await w.campus.development.startAttempt(USERS.student, personal, 'MIS-MKT-EXP-01', { idempotencyKey: 'h-1' })
    const res = await w.call('student', '/me/history')
    assert.equal(res.status, 200)
    assert.ok(HistoryPageSchema.safeParse(res.body.data).success, 'response matches the history contract')
    const { items, nextCursor } = res.body.data
    assert.equal(nextCursor, null)
    const m = byId(items)
    assert.deepEqual(Object.keys(m).sort(), [
      'FORMAL_SESSION:sess-done', 'FORMAL_SESSION:sess-fail', 'FORMAL_SESSION:sess-held', 'FORMAL_SESSION:sess-live', 'FORMAL_SESSION:sess-proc',
      'LEGACY_REPORT:legacy-only', `PRACTICE_ATTEMPT:${started.attempt.id}`,
    ].sort(), 'no sponsored or foreign records in the personal workspace')
    assert.ok(items.every((i) => i.scope === 'PERSONAL'))

    const done = m['FORMAL_SESSION:sess-done']
    assert.equal(done.status, 'COMPLETED')
    assert.equal(done.mode, 'FORMAL')
    assert.equal(done.permittedAction.kind, 'VIEW_REPORT')
    assert.equal(done.issuedAt, iso(-9 * day + 2 * hour), 'stored issue date, not the clock')
    assert.equal(done.completedAt, done.issuedAt)
    assert.equal(done.reportFormat, 'LEGACY_V2', 'report V3 flag is off in this process → legacy format')
    assert.equal(done.permittedAction.to, '/score?session=sess-done')

    const live = m['FORMAL_SESSION:sess-live']
    assert.equal(live.status, 'ACTIVE')
    assert.equal(live.title, 'Synthetic Bank Simulation')
    assert.deepEqual(live.permittedAction, { kind: 'RESUME', to: '/workspace/sess-live' })
    assert.equal(live.recoveryState, 'RESUMABLE')
    assert.equal(live.completedAt, null)

    const proc = m['FORMAL_SESSION:sess-proc']
    assert.equal(proc.status, 'PROCESSING')
    assert.equal(proc.recoveryState, 'AWAITING_REPORT')
    assert.equal(proc.permittedAction.kind, 'NONE')
    assert.equal(proc.reportFormat, null)

    const fail = m['FORMAL_SESSION:sess-fail']
    assert.equal(fail.status, 'TECHNICAL_FAILED')
    assert.equal(fail.recoveryState, 'RECOVERABLE')
    assert.deepEqual(fail.permittedAction, { kind: 'RECOVER', to: '/assessment?session=sess-fail' })
    assert.equal(fail.completedAt, new Date(w.legacyState.sessions['sess-fail'].completedAt).toISOString())

    const held = m['FORMAL_SESSION:sess-held']
    assert.equal(held.status, 'UNDER_REVIEW')
    assert.equal(held.permittedAction.kind, 'NONE', 'a held report is not reachable from history')
    assert.equal(held.recoveryState, 'HELD')

    const legacyOnly = m['LEGACY_REPORT:legacy-only']
    assert.equal(legacyOnly.sourceType, 'LEGACY_REPORT')
    assert.equal(legacyOnly.status, 'LEGACY')
    assert.equal(legacyOnly.reportFormat, 'LEGACY_V2')
    assert.equal(legacyOnly.completedAt, null, 'unknown date stays unknown')
    assert.equal(legacyOnly.issuedAt, null)
    assert.equal(legacyOnly.startedAt, null)
    assert.equal(legacyOnly.permittedAction.kind, 'VIEW_REPORT')

    const practice = m[`PRACTICE_ATTEMPT:${started.attempt.id}`]
    assert.equal(practice.mode, 'PRACTICE')
    assert.equal(practice.status, 'ACTIVE')
    assert.equal(practice.title, 'Design a clean A/B test for a new ad message')
    assert.deepEqual(practice.permittedAction, { kind: 'RESUME', to: '/app/development/missions/MIS-MKT-EXP-01' })
    assert.equal(practice.reportFormat, null)
    assert.ok(items.filter((i) => i.mode === 'FORMAL').every((i) => i.sourceType !== 'PRACTICE_ATTEMPT'), 'practice never becomes formal')

    // Newest first by stored date; undated records last.
    const keys = items.map((i) => i.completedAt || i.issuedAt || i.startedAt || '')
    assert.deepEqual([...keys].sort((a, b) => b.localeCompare(a)), keys)
    assert.equal(items[items.length - 1].id, 'LEGACY_REPORT:legacy-only')

    assert.equal(w.snapshot, JSON.stringify(w.legacyState), 'legacy store untouched (read-only)')
    assert.ok(!JSON.stringify(items.filter((i) => i.mode === 'FORMAL')).includes(NOW.toISOString()), 'the clock never appears as a formal date')
  } finally { w.close() }
})

test('P1.2: the campus workspace sees only its sponsored records and the history is paginated', async () => {
  const w = await world()
  try {
    const res = await w.call('student', '/me/history', { 'X-Prism-Workspace': w.campusWs.id })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.data.items.map((i) => i.id), ['FORMAL_SESSION:sess-sponsored'])
    const s = res.body.data.items[0]
    assert.equal(s.scope, 'SPONSORED')
    assert.equal(s.sponsorOrganizationId, w.org.id)
    assert.equal(s.status, 'COMPLETED')
    assert.equal(s.permittedAction.kind, 'VIEW_REPORT')

    const first = await w.call('student', '/me/history?limit=3')
    assert.equal(first.status, 200)
    assert.equal(first.body.data.items.length, 3)
    assert.ok(first.body.data.nextCursor)
    const second = await w.call('student', `/me/history?limit=3&cursor=${encodeURIComponent(first.body.data.nextCursor)}`)
    assert.equal(second.status, 200)
    assert.equal(second.body.data.items.length, 3)
    assert.equal(second.body.data.nextCursor, null)
    const ids = new Set([...first.body.data.items, ...second.body.data.items].map((i) => i.id))
    assert.equal(ids.size, 6, 'pages do not overlap')

    const bad = await w.call('student', '/me/history?cursor=%20bad%20')
    assert.equal(bad.status, 422)
    assert.equal(bad.body.error.code, 'VALIDATION_FAILED')
    const anon = await w.call(null, '/me/history')
    assert.equal(anon.status, 401)
    const other = await w.call('other', '/me/history')
    assert.equal(other.status, 200)
    assert.deepEqual(other.body.data.items.map((i) => i.id), ['FORMAL_SESSION:sess-other'])
  } finally { w.close() }
})
