// P9.3 fault-injection suite (T25, T26, T29, T31, T32, T47–T51 and the
// deletion/erasure path) through the real /api/v1 router with memory
// repositories. Faults are injected only at the provider adapter boundary,
// at the durable receipt write, at the job lease and through the clock.
// Nothing here seeds a finished evidence or report record: every report is
// produced by the real finish → leased job → strict evaluator → publication
// path. Learner text is synthetic.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'
import { CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION } from '../domain/sharing/copyVersions.js'
import { DRAFT_CORE_TEAMREADY_A_HANDOVER, DRAFT_SEGMENT_ID, draftBankScenarios, evaluateJobKey, DRAFT_EVALUATE_JOB_KIND } from '../domain/assessments/draftSegments.js'
import { createSliceEvaluator } from '../domain/evidence/sliceEvaluator.js'
import evidenceGraph from '../lib/evidenceGraph.js'

process.env.NODE_ENV = 'test'
process.env.PRISM_AUDIT_AI = 'true'
process.env.PRISM_DRAFT_CONTENT = 'true'
process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_ASSESSMENT_WORKSPACE_V3 = 'true'
process.env.PRISM_STUDENT_REPORT_V3 = 'true'
const { createCompletion } = await import('../services/ai/completionService.js')

const NOW = new Date('2026-10-02T10:00:00Z')
const day = 86400000
const USER = { id: 'student-fault', email: 'fault@test.local', name: 'Synthetic Student' }
const OTHER = { id: 'student-other', email: 'other@test.local', name: 'Synthetic Other' }
const CONSENT = { scopes: ['data_processing', 'ai_disclosure', 'ai_scoring_oversight', 'proctoring', 'face_analysis', 'own_work'], consentVersion: 'synthetic-consent.v1' }
const FORM_ID = `${DRAFT_SEGMENT_ID}:${DRAFT_CORE_TEAMREADY_A_HANDOVER.version}`
const turn = (content) => ({ role: 'assistant', content: JSON.stringify({ messages: [{ speaker: 'Nia', role: 'Co-organiser', content }] }) })
const MSG_CLARIFY = 'Before we hand over, who is actually free to take the invitation list and the handouts this week?'
const MSG_HANDOVER = 'Handover: Nia confirms the room Monday and sends the invitation list Tuesday; I will finalise the handouts and send the file Wednesday for printing Thursday.'
const BOARD_PATCH = { 'row-1-owner': 'Nia — she can take one extra task this week', 'row-2-owner': 'Me (coordinator)' }

function fakeEngine(state, clock) {
  const calls = { start: 0, message: 0, artifact: 0, evaluate: 0 }
  const owner = (sid) => state.payments.find((p) => p.sessionId === sid)?.userId || null
  return {
    calls,
    async recordConsent({ sessionId, scopes }) { state.consents[sessionId] = scopes },
    async start({ sessionId, scenarioId }) {
      calls.start += 1
      const bank = draftBankScenarios()[scenarioId]
      state.sessions[sessionId] = {
        sessionId, userId: owner(sessionId), scenarioId, startedAt: clock().getTime() - 60000, exchangeCount: 0,
        history: [{ role: 'user', content: 'opening instruction (system text)' }, turn('Dev is away from tomorrow. Where do we stand?')],
        artifacts: (bank?.interactiveArtifacts || []).map((a) => structuredClone(a)),
      }
      return { messages: [] }
    },
    async message({ sessionId, text }) {
      calls.message += 1
      const s = state.sessions[sessionId]
      s.history.push({ role: 'user', content: `[Candidate]: ${text}` }, turn(`AI participant reply ${s.exchangeCount + 1}`))
      s.exchangeCount += 1
      return { messages: [{ speaker: 'Nia', role: 'Co-organiser', content: `AI participant reply ${s.exchangeCount}` }] }
    },
    async saveArtifact({ sessionId, artifactId, updates }) {
      calls.artifact += 1
      const a = state.sessions[sessionId].artifacts.find((x) => x.artifactId === artifactId)
      a.data = { ...a.data, ...updates }
      return { artifact: structuredClone(a) }
    },
    async evaluate() { calls.evaluate += 1; throw new Error('legacy scoring must never run for a draft run') },
    async evaluateStatus() { return 'IDLE' },
  }
}

async function world() {
  let nowMs = NOW.getTime()
  const clock = () => new Date(nowMs)
  const tick = (ms) => { nowMs += ms }
  const repos = createMemoryCampusRepos({ clock })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic University', slug: `syn-f-${Math.random().toString(36).slice(2, 8)}`, organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: USER.id, role: 'STUDENT', status: 'ACTIVE' })
  const state = { payments: [], sessions: {}, consents: {} }
  const legacy = {
    ...EMPTY_LEGACY_SOURCES,
    listEntitlements: async () => [],
    listSessionIds: async (uid) => Object.values(state.sessions).filter((s) => s.userId === uid).map((s) => s.sessionId),
    getSession: async (sid) => (state.sessions[sid] ? structuredClone(state.sessions[sid]) : null),
    getReport: async () => null,
    getEntitlement: async (sid) => state.payments.find((p) => p.sessionId === sid) || null,
    createEntitlement: async (rec) => { state.payments.push({ ...rec, consumed: false, createdAt: clock().toISOString() }); return rec },
    // Draft runs are created through the legacy store, never the engine.
    createSession: async (sid, rec) => { state.sessions[sid] = { sessionId: sid, ...structuredClone(rec), startedAt: clock().getTime() - 60000, completedAt: null } },
    updateSession: async (sid, patch) => { Object.assign(state.sessions[sid], structuredClone(patch)); return structuredClone(state.sessions[sid]) },
  }
  const engine = fakeEngine(state, clock)
  const audits = []
  const fault = { mode: null, calls: 0 }
  const complete = async (params, options) => {
    fault.calls += 1
    if (fault.mode === 'throw') throw Object.assign(new Error('provider unavailable'), { code: 'PROVIDER_DOWN' })
    if (fault.mode === 'timeout') {
      await new Promise((r) => setTimeout(r, 5))
      throw Object.assign(new Error('provider timed out'), { code: 'ETIMEDOUT' })
    }
    if (fault.mode === 'malformed') return { choices: [{ message: { content: '{"units": [ not json' } }] }
    const out = await createCompletion(params, options)
    if (fault.mode === 'mismatch') {
      const data = JSON.parse(out.choices[0].message.content)
      data.units = data.units.map((u) => ({ ...u, excerpt: 'words the candidate never wrote', abstainReason: '' }))
      return { ...out, choices: [{ message: { content: JSON.stringify(data) } }] }
    }
    return out
  }
  const sliceEvaluator = createSliceEvaluator({ complete, recordUnit: async (unit) => evidenceGraph.recordEvidenceUnit(unit) })
  const campus = createCampusContext({
    repos, clock, legacy, engine, sliceEvaluator,
    scenarioSource: async () => ({ generalScenarios: [], bankScenarios: draftBankScenarios() }),
    evidence: { units: (sid) => evidenceGraph.getEvidenceUnits(sid) },
    audit: (type, sid, payload) => audits.push({ type, sid, payload }),
  })
  const requireUser = (req, _res, next) => { req.user = req.get('X-Test-User') === OTHER.id ? OTHER : USER; next() }
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createV1Router({ requireUser, campus }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const mine = await campus.workspaceService.listWorkspaces(USER)
  const campusWs = mine.find((w) => w.type === 'CAMPUS_STUDENT')
  const personalWs = mine.find((w) => w.type === 'PERSONAL')
  const otherPersonal = (await campus.workspaceService.listWorkspaces(OTHER)).find((w) => w.type === 'PERSONAL')
  const call = async (method, path, body, headers = {}, workspaceId = campusWs.id) => {
    const r = await fetch(`${base}${path}`, {
      method, headers: { ...(workspaceId ? { 'X-Prism-Workspace': workspaceId } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  await campus.catalog.ensureSeeded()
  const assignment = await repos.assessments.createAssignment({
    id: crypto.randomUUID(), definitionId: DRAFT_SEGMENT_ID, formPolicy: 'FIXED_FORM', formId: FORM_ID, sponsorType: 'INSTITUTION', organizationId: org.id,
    windowStart: new Date(nowMs - day).toISOString(), windowEnd: new Date(nowMs + 7 * day).toISOString(), integrityPolicy: 'STANDARD', accommodationsPolicy: {}, reminderPolicy: {},
    createdBy: 'owner', status: 'ACTIVE', targets: [{ targetType: 'USER', targetId: USER.id }],
  })
  await repos.assessments.addStudent({ assignmentId: assignment.id, userId: USER.id, status: 'ASSIGNED' })
  await repos.entitlements.createEntitlement({
    organizationId: org.id, sourceType: 'INSTITUTION_SPONSORSHIP', productCode: 'PRISM_CAMPUS_ASSESSMENT', quantity: 5,
    validFrom: new Date(nowMs - day).toISOString(), validUntil: new Date(nowMs + 30 * day).toISOString(), status: 'ACTIVE',
  })
  await call('POST', `/assessment-assignments/${assignment.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true })
  const start = async () => {
    const r = await call('POST', `/assessment-assignments/${assignment.id}/start`, { consent: CONSENT }, { 'Idempotency-Key': `k-${Math.random()}` })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    return r.body.data.sessionId
  }
  const begin = async (sid, key = `begin-${sid}`) => call('POST', `/assessment-sessions/${sid}/begin`, {}, { 'Idempotency-Key': key })
  const msg = (sid, id, text) => call('POST', `/assessment-sessions/${sid}/messages`, { clientEventId: id, text })
  const board = (sid, id, updates, ifMatch) => call('PATCH', `/assessment-sessions/${sid}/artifacts/HANDOVER-BOARD`, { updates, clientEventId: id }, { 'If-Match': String(ifMatch) })
  const finish = (sid) => call('POST', `/assessment-sessions/${sid}/finish`, { early: true })
  const act = async (sid) => {
    assert.equal((await begin(sid)).status, 200)
    assert.equal((await msg(sid, 'evt-0001', MSG_CLARIFY)).status, 201)
    const saved = await board(sid, 'art-0001', BOARD_PATCH, 0)
    assert.equal(saved.status, 200, JSON.stringify(saved.body))
    assert.equal((await msg(sid, 'evt-0002', MSG_HANDOVER)).status, 201)
  }
  return { repos, state, engine, audits, campus, call, start, begin, msg, board, finish, act, fault, tick, clock, personalWs, otherPersonal, close: () => server.close() }
}

const unitsOf = (sid) => evidenceGraph.getEvidenceUnits(sid)

test('T31 provider timeout and malformed output: technical FAILED job, saved work intact, no units, report 409, retry succeeds', async () => {
  const w = await world()
  try {
    const sid = await w.start()
    await w.act(sid)
    for (const mode of ['timeout', 'malformed']) {
      w.fault.mode = mode
      const fin = await w.finish(sid)
      assert.equal(fin.status, 503, mode)
      assert.equal(fin.body.error.code, 'UPSTREAM_UNAVAILABLE')
      assert.equal(fin.body.error.details.processing.resultState, 'TECHNICAL_FAILURE')
      const job = await w.repos.sessionIo.getJob(evaluateJobKey(sid))
      assert.equal(job.state, 'FAILED')
      assert.equal((await unitsOf(sid)).length, 0, 'no deficit from a technical fault')
      assert.ok((await w.repos.sessionIo.listActions(sid)).filter((a) => a.kind !== 'FINISH').every((a) => a.state === 'APPLIED'))
      assert.equal((await w.call('GET', `/assessment-sessions/${sid}/report`)).status, 409)
    }
    w.fault.mode = null
    const ok = await w.finish(sid)
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
    assert.equal((await w.repos.sessionIo.getJob(evaluateJobKey(sid))).attempts, 3)
    assert.equal((await unitsOf(sid)).length, 3)
  } finally { w.close() }
})

test('T25 save-acknowledgement loss: a failed receipt write leaves the accepted action recoverable; the client retry applies it exactly once', async () => {
  const w = await world()
  try {
    const sid = await w.start()
    assert.equal((await w.begin(sid)).status, 200)
    const io = w.repos.sessionIo
    const realPut = io.putClientEvent.bind(io)
    let failOnce = true
    io.putClientEvent = async (args) => { if (failOnce) { failOnce = false; throw new Error('SYNTHETIC_RECEIPT_WRITE_FAILURE') } return realPut(args) }
    const lost = await w.msg(sid, 'evt-ack-loss', MSG_CLARIFY)
    assert.equal(lost.status, 500, 'the acknowledgement never reached the client')
    const action = await io.getAction(sid, 'evt-ack-loss')
    assert.ok(action, 'the action was durably accepted before the engine ran')
    assert.equal(action.payload.text, MSG_CLARIFY, 'the payload is recoverable')
    assert.notEqual(action.state, 'APPLIED')
    assert.equal(await io.getClientEvent(sid, 'evt-ack-loss'), null, 'no receipt without an applied result')
    const retry = await w.msg(sid, 'evt-ack-loss', MSG_CLARIFY)
    assert.equal(retry.status, 201, JSON.stringify(retry.body))
    assert.equal((await io.getAction(sid, 'evt-ack-loss')).state, 'APPLIED')
    const replay = await w.msg(sid, 'evt-ack-loss', MSG_CLARIFY)
    assert.equal(replay.status, 200)
    assert.equal(replay.body.data.replayed, true)
    assert.equal((await io.listActions(sid)).filter((a) => a.clientEventId === 'evt-ack-loss').length, 1, 'one accepted action per client event id')
  } finally { w.close() }
})

test('T26 duplicate client key replays the same effect; a changed payload under the same key is a CONFLICT', async () => {
  const w = await world()
  try {
    const sid = await w.start()
    assert.equal((await w.begin(sid)).status, 200)
    const first = await w.msg(sid, 'evt-dup-0001', MSG_CLARIFY)
    assert.equal(first.status, 201)
    const before = w.engine.calls.message
    const dup = await w.msg(sid, 'evt-dup-0001', MSG_CLARIFY)
    assert.equal(dup.status, 200)
    assert.equal(dup.body.data.replayed, true)
    assert.deepEqual(dup.body.data.messages, first.body.data.messages)
    assert.equal(w.engine.calls.message, before, 'the engine is not asked again')
    const changed = await w.msg(sid, 'evt-dup-0001', 'A different answer under the same key')
    assert.equal(changed.status, 409)
    assert.equal(changed.body.error.code, 'CONFLICT')
    assert.equal((await w.repos.sessionIo.listActions(sid)).filter((a) => a.kind === 'MESSAGE').length, 1)
    assert.equal((await w.repos.sessionIo.getAction(sid, 'evt-dup-0001')).payload.text, MSG_CLARIFY, 'the accepted payload is never overwritten')
  } finally { w.close() }
})

test('T26 artifact version conflict: a stale If-Match is refused with the current version and never applied', async () => {
  const w = await world()
  try {
    const sid = await w.start()
    assert.equal((await w.begin(sid)).status, 200)
    const v1 = await w.board(sid, 'art-0001', { 'row-1-owner': 'Nia' }, 0)
    assert.equal(v1.status, 200, JSON.stringify(v1.body))
    const stale = await w.board(sid, 'art-0002', { 'row-1-owner': 'Someone else' }, 0)
    assert.equal(stale.status, 409)
    assert.equal(stale.body.error.code, 'CONFLICT')
    assert.equal(stale.body.error.details.version, 1)
    assert.equal((await w.repos.sessionIo.getAction(sid, 'art-0002')).state, 'FAILED')
    assert.equal(w.state.sessions[sid].artifacts.find((a) => a.artifactId === 'HANDOVER-BOARD').data['row-1-owner'], 'Nia')
    const fresh = await w.board(sid, 'art-0003', { 'row-2-owner': 'Me' }, 1)
    assert.equal(fresh.status, 200, JSON.stringify(fresh.body))
  } finally { w.close() }
})

test('T15/T50 start-send-finish race: concurrent begins share one start; a message racing finish is applied or refused, never a late overwrite', async () => {
  const w = await world()
  try {
    const sid = await w.start()
    const begins = await Promise.all([1, 2, 3].map((i) => w.begin(sid, `race-begin-${i}`)))
    assert.ok(begins.every((b) => b.status === 200))
    assert.equal(new Set(begins.map((b) => b.body.data.startedAt)).size, 1, 'one start time')
    assert.equal((await w.msg(sid, 'evt-race-0001', MSG_CLARIFY)).status, 201)
    const [late, fin] = await Promise.all([w.msg(sid, 'evt-late', MSG_HANDOVER), w.finish(sid)])
    assert.equal(fin.status, 200, JSON.stringify(fin.body))
    assert.ok([201, 409].includes(late.status), `late message ${late.status}`)
    const lateAction = await w.repos.sessionIo.getAction(sid, 'evt-late')
    assert.ok(['APPLIED', 'FAILED'].includes(lateAction.state), 'never left in limbo')
    const units = await unitsOf(sid)
    const job = await w.repos.sessionIo.getJob(evaluateJobKey(sid))
    assert.equal(job.state, 'DONE')
    const evaluatedIds = new Set(units.map((u) => u.provenance_json.actionId))
    if (lateAction.state === 'FAILED') assert.equal(evaluatedIds.has(lateAction.actionId), false, 'a refused action is never evidence')
    assert.equal((await w.msg(sid, 'evt-after', 'after the fact')).status, 409)
    assert.equal((await w.finish(sid)).body.data.state, 'COMPLETE')
    assert.equal((await unitsOf(sid)).length, units.length, 'a second finish does not re-evaluate')
  } finally { w.close() }
})

test('T49 worker crash mid-job: the expired lease is reclaimed with a higher fencing token; the dead worker\'s stale result is rejected', async () => {
  const w = await world()
  try {
    const sid = await w.start()
    await w.act(sid)
    const io = w.repos.sessionIo
    await io.enqueueJob({ taskKey: evaluateJobKey(sid), sessionId: sid, kind: DRAFT_EVALUATE_JOB_KIND })
    const crashed = await io.claimJob(DRAFT_EVALUATE_JOB_KIND, 1000)
    assert.equal(crashed.attempts, 1)
    const stuck = await w.finish(sid)
    assert.equal(stuck.status, 202, JSON.stringify(stuck.body))
    assert.equal(stuck.body.data.state, 'SCORING', 'a live lease is respected')
    w.tick(1500)
    const recovered = await w.finish(sid)
    assert.equal(recovered.status, 200, JSON.stringify(recovered.body))
    assert.equal(recovered.body.data.state, 'COMPLETE')
    const job = await io.getJob(evaluateJobKey(sid))
    assert.equal(job.state, 'DONE')
    assert.equal(job.attempts, 2)
    assert.ok(job.fencingToken > crashed.fencingToken)
    await assert.rejects(io.completeJob(crashed.jobId, crashed.fencingToken, 'DONE'), (e) => e.code === 'CONFLICT')
    await assert.rejects(io.failJob(crashed.jobId, crashed.fencingToken), (e) => e.code === 'CONFLICT')
    assert.equal((await unitsOf(sid)).length, 3, 'exactly one applied result')
    assert.ok((await unitsOf(sid)).every((u) => u.provenance_json.evaluatorAttempt === 2))
  } finally { w.close() }
})

test('T32 failed quote verification: units go to human review with no quotation; the owner can request a review', async () => {
  const w = await world()
  try {
    const sid = await w.start()
    await w.act(sid)
    w.fault.mode = 'mismatch'
    assert.equal((await w.finish(sid)).status, 200)
    const units = await unitsOf(sid)
    assert.equal(units.length, 3)
    for (const u of units) {
      assert.equal(u.evidence_status, 'HUMAN_REVIEW_REQUIRED')
      assert.equal(u.rubric_level, null)
      assert.equal(u.candidate_action_json.dialogue_excerpt, undefined)
      assert.equal(u.provenance_json.reason, 'QUOTE_MISMATCH')
    }
    const report = await w.call('GET', `/assessment-sessions/${sid}/report`)
    assert.equal(report.status, 200)
    assert.equal(JSON.stringify(report.body).includes('words the candidate never wrote'), false)
    const review = await w.call('POST', `/assessment-sessions/${sid}/report/review-request`, { reason: 'Please check the quoted moment; I do not recognise it from my session.' })
    assert.equal(review.status, 201, JSON.stringify(review.body))
  } finally { w.close() }
})

test('T51 publication race: concurrent first reads publish exactly one version', async () => {
  const w = await world()
  try {
    const sid = await w.start()
    await w.act(sid)
    assert.equal((await w.finish(sid)).status, 200)
    const reads = await Promise.all([1, 2, 3, 4].map(() => w.call('GET', `/assessment-sessions/${sid}/report`)))
    assert.ok(reads.every((r) => r.status === 200))
    assert.ok(reads.every((r) => r.body.data.version.number === 1))
    assert.equal(new Set(reads.map((r) => JSON.stringify(r.body.data.report))).size, 1)
    assert.equal((await w.repos.reportVersions.latest(sid)).version, 1)
    assert.equal(w.audits.filter((a) => a.type === 'report.v3.version_created' && a.sid === sid).length, 1)
    const versions = await w.call('GET', `/assessment-sessions/${sid}/report/versions`)
    assert.equal(versions.status, 200)
    assert.equal(versions.body.data.versions?.length ?? versions.body.data.length, 1)
  } finally { w.close() }
})

test('T47 invalid ownership: another user, or the owner in the wrong workspace, gets 404 for session, report and finish', async () => {
  const w = await world()
  try {
    const sid = await w.start()
    await w.act(sid)
    assert.equal((await w.finish(sid)).status, 200)
    assert.equal((await w.call('GET', `/assessment-sessions/${sid}/report`)).status, 200)
    const other = { 'X-Test-User': OTHER.id }
    for (const [method, path, body] of [['GET', `/assessment-sessions/${sid}`], ['GET', `/assessment-sessions/${sid}/report`], ['POST', `/assessment-sessions/${sid}/finish`, { early: true }], ['POST', `/assessment-sessions/${sid}/messages`, { clientEventId: 'evt-intruder-01', text: 'intruder' }]]) {
      const r = await w.call(method, path, body, other, w.otherPersonal.id)
      assert.equal(r.status, 404, `${method} ${path} as other → ${r.status}`)
      const cross = await w.call(method, path, body, {}, w.personalWs.id)
      assert.equal(cross.status, 404, `${method} ${path} in personal workspace → ${cross.status}`)
    }
    assert.equal((await w.repos.sessionIo.listActions(sid)).some((a) => a.clientEventId === 'evt-intruder-01'), false, 'no action accepted for a non-owner')
  } finally { w.close() }
})

test('T48 expired share: the link works until expiry, then 404 with the same message as an invalid token', async () => {
  const w = await world()
  try {
    const sid = await w.start()
    await w.act(sid)
    assert.equal((await w.finish(sid)).status, 200)
    const share = await w.call('POST', '/me/share-grants', { recipientType: 'LINK', sessionId: sid, disclosureLevel: 'SUMMARY', expiresInDays: 1 })
    assert.equal(share.status, 201, JSON.stringify(share.body))
    const token = share.body.data.token
    assert.ok(token)
    const live = await w.call('GET', `/shared/${token}`, null, {}, null)
    assert.equal(live.status, 200, JSON.stringify(live.body))
    w.tick(2 * day)
    const gone = await w.call('GET', `/shared/${token}`, null, {}, null)
    assert.equal(gone.status, 404)
    const bogus = await w.call('GET', `/shared/${'A'.repeat(40)}`, null, {}, null)
    assert.equal(bogus.status, 404)
    assert.equal(gone.body.error.message, bogus.body.error.message, 'expired and invalid are indistinguishable')
  } finally { w.close() }
})

test('erasure during an in-flight job: the reclaimed worker refuses, no units, no report, no resurrection on retry', async () => {
  const w = await world()
  try {
    const sid = await w.start()
    await w.act(sid)
    const io = w.repos.sessionIo
    await io.enqueueJob({ taskKey: evaluateJobKey(sid), sessionId: sid, kind: DRAFT_EVALUATE_JOB_KIND })
    await io.claimJob(DRAFT_EVALUATE_JOB_KIND, 1000)
    await io.markErased(sid)
    w.tick(1500)
    const after = await w.finish(sid)
    assert.notEqual(after.status, 200)
    assert.equal((await unitsOf(sid)).length, 0)
    assert.notEqual((await io.getJob(evaluateJobKey(sid))).state, 'DONE')
    assert.equal(await w.repos.reportVersions.latest(sid), null)
    assert.equal((await w.msg(sid, 'evt-after-erase', 'hello again')).status, 404)
    assert.equal((await w.board(sid, 'art-after-erase', { 'row-1-owner': 'x' }, 0)).status, 404)
    const retry = await w.finish(sid)
    assert.notEqual(retry.status, 200)
    assert.equal((await unitsOf(sid)).length, 0, 'nothing comes back')
    assert.equal(await w.repos.reportVersions.latest(sid), null)
  } finally { w.close() }
})

test('T29/T30 sparse early-ended run: an honest low-evidence report, never forced complete', async () => {
  const w = await world()
  try {
    const sid = await w.start()
    assert.equal((await w.begin(sid)).status, 200)
    assert.equal((await w.msg(sid, 'evt-sparse', 'ok')).status, 201)
    const fin = await w.finish(sid)
    assert.equal(fin.status, 200, JSON.stringify(fin.body))
    const units = await unitsOf(sid)
    assert.equal(units.length, 3)
    assert.ok(units.every((u) => u.evidence_status === 'INSUFFICIENT_EVIDENCE' && u.rubric_level === null))
    assert.ok(units.every((u) => ['TOO_SPARSE', 'NOT_ADDRESSED'].includes(u.provenance_json.reason)))
    const report = await w.call('GET', `/assessment-sessions/${sid}/report`)
    assert.equal(report.status, 200)
    const raw = JSON.stringify(report.body.data.report)
    for (const cap of report.body.data.report.summary.capabilities) assert.equal(cap.level, null, 'no band from no evidence')
    assert.equal(/SUFFICIENT"/.test(raw) && !/INSUFFICIENT/.test(raw), false)
    assert.equal(raw.includes('"ok"'), false, 'unrated text is not quoted')
    const finishAction = (await w.repos.sessionIo.listActions(sid)).find((a) => a.kind === 'FINISH')
    assert.equal(finishAction.payload.early, true, 'the early end is recorded, not hidden')
  } finally { w.close() }
})
