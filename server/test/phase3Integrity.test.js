// PROD-READY Phase 3 (S6 family) without a database: the memory store's
// transaction (fault injection leaves no partial state), the PostgreSQL
// savepoint nesting, the persisted session form id (a bank version bump
// never remaps an old session), the rating limit and the production
// fail-closed erasure pseudonym key. The real-database proofs are in
// multiInstance.db.test.js.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext } from '../domain/campusStore/context.js'
import { withTransaction, transactionDeps } from '../domain/campusStore/pgUtil.js'
import { buildCatalog, formForSession, recordedFormId } from '../domain/assessments/catalog.js'
import { createSessionEntryLoader } from '../domain/growth/entries.js'
import { createValidationRepoMemory } from '../domain/validation/repository.js'
import { createMemoryDb } from '../domain/campusStore/memoryDb.js'
import { createSessionIoRepoMemory } from '../domain/assessments/sessionIoRepository.js'
import { createAssessmentSessionService } from '../domain/assessments/sessionService.js'
import { erasureKeyStatus, assertErasureConfigured, warnIfErasureKeyMissing, MIN_PSEUDONYM_KEY_LENGTH } from '../lib/erasureKey.js'
import { pseudonymFor } from '../lib/campusErasure.js'
import { createCandidateErasureHandler } from '../domain/privacy/candidateErasureRoute.js'
import { createLegacyErasureGuard } from '../lib/legacyOwnerLock.js'
import { pinJsonFiles, unpinJsonFiles, pinnedJson, assertNotPinned } from '../lib/jsonStoreSnapshot.js'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]))
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  const restore = () => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } }
  try {
    const out = fn()
    if (out && typeof out.then === 'function') return out.finally(restore)
    restore()
    return out
  } catch (err) {
    restore()
    throw err
  }
}

function mockRes() {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

// ── memory transactions ────────────────────────────────────────────────────
async function campusFixture() {
  process.env.PRISM_CAMPUS_ENABLED = 'true'
  const repos = createMemoryCampusRepos()
  let token = null
  const campus = createCampusContext({ repos, tokenFactory: () => { token = `p3-token-${randomUUID()}`; return token }, scenarioSource: async () => ({ generalScenarios: [], bankScenarios: {} }) })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic P3 Org', slug: `p3-${randomUUID().slice(0, 6)}`, organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  const cohort = await repos.organizations.createCohort({ organizationId: org.id, name: 'P3 Cohort' })
  const owner = { id: `p3-owner-${randomUUID().slice(0, 6)}`, email: 'owner@test.local' }
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: owner.id, role: 'ORG_OWNER', status: 'ACTIVE' })
  const actor = await campus.workspaceService.actorFor(owner)
  const invite = async (email) => {
    await campus.invites.createInvites({ actor, orgId: org.id, role: 'STUDENT', emails: [email], cohortId: cohort.id })
    return token
  }
  return { repos, campus, org, cohort, owner, actor, invite }
}
const footprint = (repos, userId) => ({
  consents: repos.db.consents.filter((c) => c.userId === userId).length,
  memberships: [...repos.db.memberships.values()].filter((m) => m.userId === userId).length,
  workspaces: [...repos.db.workspaces.values()].filter((w) => w.ownerUserId === userId).length,
  cohortMembers: [...repos.db.cohortMembers.values()].filter((m) => m.userId === userId).length,
})

test('memory store: invite acceptance is one unit — a failing last write leaves nothing behind; the retry completes it', async (t) => {
  t.after(() => { delete process.env.PRISM_CAMPUS_ENABLED })
  const { repos, campus, invite } = await campusFixture()
  const student = { id: `p3-st-${randomUUID().slice(0, 6)}`, email: 'p3-student@test.local' }
  const token = await invite(student.email)
  const original = repos.memberships.updateInvite
  repos.memberships.updateInvite = async () => { throw new Error('synthetic acceptance failure') }
  await assert.rejects(campus.invites.acceptInvite({ token, user: student, acknowledged: true }), /synthetic acceptance failure/)
  assert.deepEqual(footprint(repos, student.id), { consents: 0, memberships: 0, workspaces: 0, cohortMembers: 0 })
  assert.equal([...repos.db.invites.values()][0].status, 'PENDING')
  repos.memberships.updateInvite = original
  const out = await campus.invites.acceptInvite({ token, user: student, acknowledged: true })
  assert.equal(out.alreadyAccepted, false)
  assert.deepEqual(footprint(repos, student.id), { consents: 1, memberships: 1, workspaces: 1, cohortMembers: 1 })
  const again = await campus.invites.acceptInvite({ token, user: student, acknowledged: true })
  assert.equal(again.alreadyAccepted, true)
  assert.equal(again.workspaceId, out.workspaceId)
})

test('memory store: a role change that fails on its notification keeps the old role and writes no audit row', async (t) => {
  t.after(() => { delete process.env.PRISM_CAMPUS_ENABLED })
  const { repos, campus, org, owner, actor } = await campusFixture()
  const staffId = `p3-staff-${randomUUID().slice(0, 6)}`
  const m = await repos.memberships.upsertMembership({ organizationId: org.id, userId: staffId, role: 'PLACEMENT_OFFICER', status: 'ACTIVE' })
  const auditBefore = (repos.db.orgAudit || []).length
  const original = repos.campusAdmin.createNotification
  repos.campusAdmin.createNotification = async () => { throw new Error('synthetic notification failure') }
  const req = { user: owner, requestId: 'p3-req' }
  await assert.rejects(campus.admin.changeRole(req, actor, org.id, m.id, 'PLACEMENT_DIRECTOR'), /synthetic notification failure/)
  const rows = [...repos.db.memberships.values()].filter((x) => x.userId === staffId).map((x) => [x.role, x.status])
  assert.deepEqual(rows, [['PLACEMENT_OFFICER', 'ACTIVE']])
  assert.equal((repos.db.orgAudit || []).length, auditBefore)
  repos.campusAdmin.createNotification = original
  const done = await campus.admin.changeRole(req, actor, org.id, m.id, 'PLACEMENT_DIRECTOR')
  assert.equal(done.role, 'PLACEMENT_DIRECTOR')
  assert.ok(repos.db.orgAudit.some((e) => e.action === 'role.changed'))
})

test('memory store: transactions run one at a time and a nested call joins the open one', async () => {
  const repos = createMemoryCampusRepos()
  const order = []
  await Promise.all([
    repos.transaction(async (tx) => { order.push('a1'); await new Promise((r) => setTimeout(r, 20)); await tx.transaction(async () => order.push('a-nested')); order.push('a2') }),
    repos.transaction(async () => { order.push('b') }),
  ])
  assert.deepEqual(order, ['a1', 'a-nested', 'a2', 'b'])
})

// ── PostgreSQL savepoint nesting (fake client) ─────────────────────────────
test('pg transaction deps: nested repository transactions become savepoints; a failed statement rolls back only itself', async () => {
  const log = []
  const client = { query: async (sql) => { log.push(sql); if (sql === 'BOOM') throw Object.assign(new Error('boom'), { code: '23505' }); return { rows: [], rowCount: 0 } } }
  const deps = transactionDeps(client)
  await deps.query('SELECT 1')
  await assert.rejects(deps.query('BOOM'))
  await withTransaction(deps.getPool, async (c) => { await c.query('INSERT x') })
  await assert.rejects(withTransaction(deps.getPool, async () => { throw new Error('inner') }))
  assert.deepEqual(log, [
    'SAVEPOINT prism_q_1', 'SELECT 1', 'RELEASE SAVEPOINT prism_q_1',
    'SAVEPOINT prism_q_2', 'BOOM', 'ROLLBACK TO SAVEPOINT prism_q_2',
    'SAVEPOINT prism_sp_3', 'INSERT x', 'RELEASE SAVEPOINT prism_sp_3',
    'SAVEPOINT prism_sp_4', 'ROLLBACK TO SAVEPOINT prism_sp_4',
  ])
  assert.ok(!log.includes('BEGIN') && !log.includes('COMMIT'), 'no nested BEGIN/COMMIT on the outer transaction')
})

// ── rating limit (memory) ──────────────────────────────────────────────────
test('rating queue memory store: a third rating is refused by the store itself', async () => {
  const db = createMemoryDb()
  const repo = createValidationRepoMemory(db)
  const { item } = await repo.upsertItem({ evidenceRef: 'e'.repeat(64), sessionRef: 's'.repeat(64), capabilityId: 'C', sourceType: 'DIALOGUE_TURN', excerpt: 'x', rubricVersion: 'r', enqueuedBy: 't' })
  await repo.appendRatingWithinLimit({ itemId: item.id, raterId: 'r1', level: 3, cannotRate: false, limit: 2 })
  await assert.rejects(repo.appendRatingWithinLimit({ itemId: item.id, raterId: 'r1', level: 2, cannotRate: false, limit: 2 }), (e) => e.code === 'CONFLICT')
  await repo.appendRatingWithinLimit({ itemId: item.id, raterId: 'r2', level: 4, cannotRate: false, limit: 2 })
  await assert.rejects(repo.appendRatingWithinLimit({ itemId: item.id, raterId: 'r3', level: 4, cannotRate: false, limit: 2 }), /already has its ratings/)
  assert.equal((await repo.listRatings()).length, 2)
})

// ── artifact version first (memory) ────────────────────────────────────────
test('artifact save: the version is reserved before the engine call and withdrawn when the engine fails', async () => {
  const db = createMemoryDb()
  const io = createSessionIoRepoMemory(db)
  const session = { userId: 'u1', exchangeCount: 0, artifacts: [{ artifactId: 'a1', type: 'doc', data: { seed: 1 } }] }
  const seen = []
  let fail = true
  const engine = {
    async saveArtifact({ updates }) {
      seen.push((await io.latestArtifactVersion('s1', 'a1'))?.version ?? 0)
      if (fail) throw new Error('synthetic engine failure')
      session.artifacts[0].data = { ...session.artifacts[0].data, ...updates }
      return { artifact: JSON.parse(JSON.stringify(session.artifacts[0])) }
    },
  }
  const svc = createAssessmentSessionService({ repos: { kind: 'memory', sessionIo: io }, legacy: { getSession: async () => JSON.parse(JSON.stringify(session)), getReport: async () => null }, engine })
  const args = { user: { id: 'u1' }, workspace: { type: 'PERSONAL' }, sessionId: 's1', artifactId: 'a1', ifMatch: 0, clientEventId: 'e1', updates: { owner: 'me' } }
  await assert.rejects(svc.saveArtifact(args), /synthetic engine failure/)
  assert.equal(await io.latestArtifactVersion('s1', 'a1'), null, 'the reserved version was withdrawn')
  fail = false
  const out = await svc.saveArtifact(args)
  assert.equal(out.version, 1)
  assert.deepEqual(seen, [1, 1], 'each engine call saw its version row already appended')
  assert.deepEqual((await io.latestArtifactVersion('s1', 'a1')).content.data, { seed: 1, owner: 'me' })
})

// ── persisted form id ──────────────────────────────────────────────────────
const bank = (version) => ({ generalScenarios: [], bankScenarios: { 'p3-bank': { title: 'Synthetic bank scenario', version, briefing: { objective: 'x' }, probingTree: { turns: [] } } } })

test('a simulated bank version bump does not remap an old session: the persisted form id wins', () => {
  const v1 = buildCatalog(bank('1.0.0'))
  const v2 = buildCatalog(bank('2.0.0'))
  const recorded = formForSession(v1, 'p3-bank').id
  assert.equal(recorded, 'p3-bank:1.0.0')
  // Old behaviour (no persisted id): today's catalog remaps the session.
  assert.equal(formForSession(v2, 'p3-bank').id, 'p3-bank:2.0.0')
  // Persisted id: the session keeps the form it was taken on.
  const kept = formForSession(v2, 'p3-bank', recorded)
  assert.equal(kept.id, 'p3-bank:1.0.0')
  assert.equal(kept.status, 'NOT_IN_CATALOG')
  assert.equal(kept.definitionId, 'p3-bank')
  // A persisted id still in the catalog resolves to the catalog form.
  assert.equal(formForSession(v1, 'p3-bank', recorded).status, 'FROZEN')
  // Today's catalog is used only when nothing was recorded.
  assert.equal(formForSession(v2, 'p3-bank', null).id, 'p3-bank:2.0.0')
})

test('recordedFormId: the session column first, then a single evidence form id, never a guess', () => {
  assert.equal(recordedFormId({ assessmentFormId: 'f:1' }, [{ assessment_form_id: 'f:2' }]), 'f:1')
  assert.equal(recordedFormId({}, [{ assessment_form_id: 'f:2' }, { assessment_form_id: 'f:2' }, { assessment_form_id: null }]), 'f:2')
  assert.equal(recordedFormId({}, [{ assessment_form_id: 'f:1' }, { assessment_form_id: 'f:2' }]), null)
  assert.equal(recordedFormId(null, []), null)
})

test('growth entries read the persisted form id after a bank bump', async () => {
  const catalog = { getCatalog: async () => buildCatalog(bank('2.0.0')) }
  const entryFor = createSessionEntryLoader({
    catalog,
    evidence: { units: async () => [] },
    legacy: { getSession: async () => ({ scenarioId: 'p3-bank', assessmentFormId: 'p3-bank:1.0.0' }), getReport: async () => ({ issuedAt: '2026-10-01T00:00:00.000Z' }) },
  })
  const entry = await entryFor('s-old')
  assert.equal(entry.form.id, 'p3-bank:1.0.0')
})

// ── erasure pseudonym key: production fails closed ─────────────────────────
const strongKey = 'k'.repeat(MIN_PSEUDONYM_KEY_LENGTH)

test('erasure key status: development default allowed; production needs a real key', () => {
  assert.equal(erasureKeyStatus({ NODE_ENV: 'test' }).ok, true)
  assert.deepEqual(erasureKeyStatus({ NODE_ENV: 'production' }), { ok: false, configured: false, reason: 'MISSING' })
  assert.equal(erasureKeyStatus({ NODE_ENV: 'production', PRISM_ERASURE_PSEUDONYM_KEY: 'prism-erasure-v1' }).reason, 'WEAK')
  assert.equal(erasureKeyStatus({ NODE_ENV: 'production', PRISM_ERASURE_PSEUDONYM_KEY: 'short' }).reason, 'WEAK')
  assert.equal(erasureKeyStatus({ NODE_ENV: 'production', PRISM_ERASURE_PSEUDONYM_KEY: strongKey }).ok, true)
  assert.throws(() => assertErasureConfigured({ NODE_ENV: 'production' }), (e) => e.code === 'ERASURE_NOT_CONFIGURED' && e.status === 503)
})

test('production without the key: pseudonyms cannot be computed (no silent public default)', () => withEnv({ NODE_ENV: 'production', PRISM_ERASURE_PSEUDONYM_KEY: undefined }, () => {
  assert.throws(() => pseudonymFor('user-1'), (e) => e.code === 'ERASURE_NOT_CONFIGURED')
}))

test('production with a real key: pseudonyms differ from the development default', () => {
  const dev = withEnv({ NODE_ENV: 'test', PRISM_ERASURE_PSEUDONYM_KEY: undefined }, () => pseudonymFor('user-1'))
  const prod = withEnv({ NODE_ENV: 'production', PRISM_ERASURE_PSEUDONYM_KEY: strongKey }, () => pseudonymFor('user-1'))
  assert.match(prod, /^erased:[0-9a-f]{24}$/)
  assert.notEqual(prod, dev)
})

test('self-service erasure answers 503 ERASURE_NOT_CONFIGURED in production without the key and touches nothing', async () => {
  const jwt = (await import('jsonwebtoken')).default
  await withEnv({ NODE_ENV: 'production', PRISM_ERASURE_PSEUDONYM_KEY: undefined, JWT_SECRET: 'p3-test-secret-never-production-0000' }, async () => {
    let ran = false
    const handler = createCandidateErasureHandler({ cascade: { run: async () => { ran = true; return {} } }, findUser: async () => null, auditLog: () => {} })
    const token = jwt.sign({ sub: 'user-1', email: 'u@test.local' }, process.env.JWT_SECRET)
    const res = mockRes()
    await handler({ headers: { authorization: `Bearer ${token}` } }, res)
    assert.equal(res.statusCode, 503)
    assert.equal(res.body.code, 'ERASURE_NOT_CONFIGURED')
    assert.equal(ran, false)
  })
})

test('legacy per-session erasure guard answers 503 before the router in production without the key', async () => {
  await withEnv({ NODE_ENV: 'production', PRISM_ERASURE_PSEUDONYM_KEY: undefined }, async () => {
    const guard = createLegacyErasureGuard({ authenticate: async () => ({ user: { id: 'owner-1' } }), lookup: async () => ({ owner: 'owner-1' }) })
    let passed = false
    const res = mockRes()
    await guard({ params: { sessionId: 's1' }, headers: {} }, res, () => { passed = true })
    assert.equal(passed, false)
    assert.equal(res.statusCode, 503)
    assert.equal(res.body.code, 'ERASURE_NOT_CONFIGURED')
  })
  await withEnv({ NODE_ENV: 'production', PRISM_ERASURE_PSEUDONYM_KEY: strongKey }, async () => {
    const guard = createLegacyErasureGuard({ authenticate: async () => ({ user: { id: 'owner-1' } }), lookup: async () => ({ owner: 'owner-1' }) })
    let passed = false
    await guard({ params: { sessionId: 's1' }, headers: {} }, mockRes(), () => { passed = true })
    assert.equal(passed, true)
  })
})

test('startup warns (does not refuse) when the production key is missing', () => {
  const lines = []
  const logger = { warn: (msg, meta) => lines.push([msg, meta]) }
  assert.equal(warnIfErasureKeyMissing(logger, { NODE_ENV: 'production' }), true)
  assert.equal(lines[0][0], 'erasure_pseudonym_key_missing')
  assert.equal(warnIfErasureKeyMissing(logger, { NODE_ENV: 'production', PRISM_ERASURE_PSEUDONYM_KEY: strongKey }), false)
  assert.equal(warnIfErasureKeyMissing(logger, { NODE_ENV: 'development' }), false)
})

// ── migration rehearsal finding: pinned JSON reads ─────────────────────────
test('JSON store pin: one parse serves every read while pinned; writes are refused; unpin restores', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prism-p3-pin-'))
  const file = join(dir, 'assessments.json')
  writeFileSync(file, JSON.stringify({ sessions: { s1: { sessionId: 's1' } } }))
  assert.equal(pinnedJson(file), undefined)
  await pinJsonFiles([file, join(dir, 'missing.json')])
  try {
    assert.deepEqual(pinnedJson(file).parsed.sessions.s1, { sessionId: 's1' })
    writeFileSync(file, JSON.stringify({ sessions: {} })) // a change on disk is not seen while pinned
    assert.ok(pinnedJson(file).parsed.sessions.s1)
    assert.equal(pinnedJson(join(dir, 'missing.json')).parsed, null)
    assert.throws(() => assertNotPinned(file), /pinned read-only/)
  } finally {
    unpinJsonFiles()
  }
  assert.equal(pinnedJson(file), undefined)
  assert.doesNotThrow(() => assertNotPinned(file))
})
