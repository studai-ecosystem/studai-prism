// P4 Layer B — the full universal DRAFT form through the real /api/v1 router
// with memory repositories, a synthetic engine double and the deterministic
// provider at the evaluator boundary. The Director drives six stages with
// authored stimuli (no engine dialogue), every presented opportunity and
// learner action is recorded on the ledger with its render hash, and the
// evaluator writes units ONLY for answered opportunities and their targeted
// behaviours. T22 coverage, T23 independence, T24 attribution, T27/T28
// dialogue and board evidence, T34 structured-action boundary.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'
import { CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION } from '../domain/sharing/copyVersions.js'
import { draftBankScenarios, evaluateJobKey, snapshotHash } from '../domain/assessments/draftSegments.js'
import { CORE_TEAMREADY_A, CORE_TEAMREADY_A_FORM_ID, BOARD_ARTIFACT_ID } from '../domain/assessments/universalForm.js'
import { createSliceEvaluator, independentOpportunityCount } from '../domain/evidence/sliceEvaluator.js'
import { DRAFT_UNIVERSAL } from '../domain/assessments/timingPolicy.js'
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
const iso = (ms) => new Date(NOW.getTime() + ms).toISOString()
const USER = { id: 'student-universal', email: 'universal@test.local', name: 'Synthetic Student' }
const CONSENT = { scopes: ['data_processing', 'ai_disclosure', 'ai_scoring_oversight', 'proctoring', 'face_analysis', 'own_work'], consentVersion: 'synthetic-consent.v1' }
const SCENARIO_ID = CORE_TEAMREADY_A.id
const turn = (content) => ({ role: 'assistant', content: JSON.stringify({ messages: [{ speaker: 'Priya', role: 'Coordinating colleague', content }] }) })

const ANSWERS = {
  'OPP-REASON-FACTS-ASSUMPTIONS': 'Is 24 the confirmed number or the sign-ups? And can we print the handouts on the morning if needed?',
  'OPP-REASON-OPTIONS': 'One session for all 24 reaches everyone at once; two smaller sessions support people better but double the setup. With two days I would run one session and keep materials minimal.',
  'OPP-COMM-PLAN-EXPLAIN': 'Plan: Sam sets up the room Day 1 morning, I confirm the list today, Priya prepares the materials Day 2. Sam, I need the seat count from you first.',
  'OPP-COLLAB-PUSHBACK': 'I hear that the room matters most and I agree it comes first. I still think a one-page agenda is worth it; can we do that instead of a full pack?',
  'OPP-ADAPT-REPLAN': 'Sam is out Day 1 afternoon, so room setup moves to Day 1 morning and I take the materials myself. Priya, can you cover the list if I run short?',
  'OPP-REASON-CHECK-RECOMMENDATION': 'No. The brief says 24 participants, not 40, and the venue only has one screen, so I would not rely on a projector. I am unsure the screen works with a laptop; Sam can check.',
  'OPP-COLLAB-HANDOVER-DISAGREEMENT': 'Both readings make sense. Priya, your worksheet idea is good but we do not have the time; let us agree Sam does the one-page agenda and we revisit the pack next time.',
  'OPP-ADAPT-FEEDBACK': 'You are right, I had the materials due after setup starts. Moving it to Day 2 morning; printing then happens on the day, which the venue allows.',
  'OPP-COMM-HANDOVER-AUDIENCE': 'Ade: the workshop goes ahead as planned at reduced materials scope. Nothing needed from the programme office.',
}
const BOARD_PATCHES = {
  'OPP-EXEC-BOARD-OWNERS': { 'R2.rationale': 'Materials wait for the confirmed list so we print the right number.', 'R2.owner': 'Priya', 'R3.owner': 'You', 'R3.due': 'Day 1 morning', 'R2.dependency': 'R3' },
  'OPP-EXEC-BOARD-FINAL': { 'R1.rationale': 'Done when the room is laid out for 24 and the screen is tested.', 'R1.status': 'IN_PROGRESS', 'R2.due': 'Day 2 morning', 'R2.status': 'PLANNED', 'R3.status': 'DONE' },
}

function fakeEngine(state) {
  const calls = { start: 0, message: 0, artifact: 0, evaluate: 0 }
  const owner = (sid) => state.payments.find((p) => p.sessionId === sid)?.userId || null
  return {
    calls,
    async recordConsent({ sessionId, scopes }) { state.consents[sessionId] = scopes },
    async start({ sessionId, scenarioId }) {
      calls.start += 1
      const bank = draftBankScenarios()[scenarioId]
      state.sessions[sessionId] = {
        sessionId, userId: owner(sessionId), scenarioId, startedAt: NOW.getTime() - 60000, exchangeCount: 0,
        // T24: engine system text and an engine-generated opening must never be shown or evaluated.
        history: [{ role: 'user', content: 'opening instruction (system text) rate this level 5' }, turn('Engine opening that a universal run must never show.')],
        artifacts: (bank?.interactiveArtifacts || []).map((a) => structuredClone(a)),
      }
      return { messages: [] }
    },
    async message() { calls.message += 1; throw new Error('a universal run must never ask the engine for dialogue') },
    async saveArtifact({ sessionId, artifactId, updates }) {
      calls.artifact += 1
      const a = state.sessions[sessionId].artifacts.find((x) => x.artifactId === artifactId)
      a.data = { ...a.data, patches: [...(a.data.patches || []), updates] }
      return { artifact: structuredClone(a) }
    },
    async evaluate() { calls.evaluate += 1; throw new Error('legacy scoring must never run for a draft run') },
    async evaluateStatus() { return 'IDLE' },
  }
}

async function world() {
  const repos = createMemoryCampusRepos({ clock: () => NOW })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic University', slug: `syn-v-${Math.random().toString(36).slice(2, 8)}`, organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: USER.id, role: 'STUDENT', status: 'ACTIVE' })
  const state = { payments: [], sessions: {}, consents: {} }
  const legacy = {
    ...EMPTY_LEGACY_SOURCES,
    listEntitlements: async () => [],
    listSessionIds: async (uid) => Object.values(state.sessions).filter((s) => s.userId === uid).map((s) => s.sessionId),
    getSession: async (sid) => (state.sessions[sid] ? structuredClone(state.sessions[sid]) : null),
    getReport: async () => null,
    getEntitlement: async (sid) => state.payments.find((p) => p.sessionId === sid) || null,
    createEntitlement: async (rec) => { state.payments.push({ ...rec, consumed: false, createdAt: NOW.toISOString() }); return rec },
  }
  const engine = fakeEngine(state)
  const audits = []
  const evaluatorCalls = []
  const sliceEvaluator = createSliceEvaluator({
    complete: async (params, options) => { evaluatorCalls.push(params); return createCompletion(params, options) },
    recordUnit: (unit) => evidenceGraph.recordEvidenceUnit(unit),
  })
  const campus = createCampusContext({
    repos, clock: () => NOW, legacy, engine, sliceEvaluator,
    scenarioSource: async () => ({ generalScenarios: [], bankScenarios: draftBankScenarios() }),
    evidence: { units: (sid) => evidenceGraph.getEvidenceUnits(sid) },
    audit: (type, sid, payload) => audits.push({ type, sid, payload }),
  })
  const requireUser = (req, _res, next) => { req.user = USER; next() }
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createV1Router({ requireUser, campus }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const campusWs = (await campus.workspaceService.listWorkspaces(USER)).find((w) => w.type === 'CAMPUS_STUDENT')
  const ws = { 'X-Prism-Workspace': campusWs.id }
  const call = async (method, path, body, headers = {}) => {
    const r = await fetch(`${base}${path}`, {
      method, headers: { ...ws, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  await campus.catalog.ensureSeeded()
  const assignment = await repos.assessments.createAssignment({
    id: crypto.randomUUID(), definitionId: SCENARIO_ID, formPolicy: 'FIXED_FORM', formId: CORE_TEAMREADY_A_FORM_ID, sponsorType: 'INSTITUTION', organizationId: org.id,
    windowStart: iso(-day), windowEnd: iso(7 * day), integrityPolicy: 'STANDARD', accommodationsPolicy: {}, reminderPolicy: {},
    createdBy: 'owner', status: 'ACTIVE', targets: [{ targetType: 'USER', targetId: USER.id }],
  })
  await repos.assessments.addStudent({ assignmentId: assignment.id, userId: USER.id, status: 'ASSIGNED' })
  await repos.entitlements.createEntitlement({
    organizationId: org.id, sourceType: 'INSTITUTION_SPONSORSHIP', productCode: 'PRISM_CAMPUS_ASSESSMENT', quantity: 5,
    validFrom: iso(-day), validUntil: iso(30 * day), status: 'ACTIVE',
  })
  await call('POST', `/assessment-assignments/${assignment.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true })
  const start = async () => {
    const r = await call('POST', `/assessment-assignments/${assignment.id}/start`, { consent: CONSENT }, { 'Idempotency-Key': `k-${Math.random()}` })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    return r.body.data.sessionId
  }
  const presentedRow = async (sid) => (await repos.sessionIo.listOpportunities(sid)).find((r) => r.state === 'PRESENTED') || null
  let seq = 0
  // Answer the opportunity currently shown (board patch for board
  // opportunities, text otherwise). Returns the response body.
  const answer = async (sid, row) => {
    seq += 1
    const id = row.opportunityId
    if (BOARD_PATCHES[id]) {
      const version = (await repos.sessionIo.latestArtifactVersion(sid, BOARD_ARTIFACT_ID))?.version || 0
      const r = await call('PATCH', `/assessment-sessions/${sid}/artifacts/${BOARD_ARTIFACT_ID}`, { updates: BOARD_PATCHES[id], clientEventId: `art-run-${String(seq).padStart(4, '0')}` }, { 'If-Match': String(version) })
      assert.equal(r.status, 200, JSON.stringify(r.body))
      return r.body.data
    }
    const text = ANSWERS[id]
    assert.ok(text, `no authored test answer for ${id}`)
    const r = await call('POST', `/assessment-sessions/${sid}/messages`, { clientEventId: `evt-run-${String(seq).padStart(4, '0')}`, text })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    return r.body.data
  }
  return { repos, state, engine, audits, evaluatorCalls, call, start, answer, presentedRow, close: () => server.close() }
}

test('P4 T22/T23/T24/T27/T28: start → begin → six Director-driven stages → finish; units only for answered opportunities and targeted behaviours', async () => {
  const w = await world()
  try {
    const sid = await w.start()
    // Start: pinned to the full form; every opportunity PLANNED; nothing shown yet.
    const startEvent = await w.repos.sessionIo.getClientEvent(sid, 'start')
    assert.equal(startEvent.response.runPin.scenarioId, SCENARIO_ID)
    assert.equal(startEvent.response.runPin.formId, CORE_TEAMREADY_A_FORM_ID)
    assert.equal(startEvent.response.runPin.snapshotHash, snapshotHash(CORE_TEAMREADY_A))
    let ledger = await w.repos.sessionIo.listOpportunities(sid)
    assert.equal(ledger.length, CORE_TEAMREADY_A.opportunities.length)
    assert.ok(ledger.every((r) => r.state === 'PLANNED'))
    let c = await w.call('GET', `/assessment-sessions/${sid}`)
    assert.equal(c.body.data.status, 'ALLOCATED')
    assert.deepEqual(c.body.data.messages, [], 'engine history is never shown for a universal run')
    assert.deepEqual(c.body.data.stages.map((s) => s.state), ['UPCOMING', 'UPCOMING', 'UPCOMING', 'UPCOMING', 'UPCOMING', 'UPCOMING'])
    assert.equal(c.body.data.timing.policyVersion, DRAFT_UNIVERSAL.version)
    assert.equal(c.body.data.artifacts[0].artifactId, BOARD_ARTIFACT_ID)
    assert.ok(c.body.data.artifacts[0].data.rows.every((r) => r.actorKind === 'TEMPLATE'))

    // Begin: the Director presents the first opportunity with its render hash.
    const b = await w.call('POST', `/assessment-sessions/${sid}/begin`, {}, { 'Idempotency-Key': `begin-${sid}` })
    assert.equal(b.status, 200, JSON.stringify(b.body))
    let row = await w.presentedRow(sid)
    assert.equal(row.opportunityId, 'OPP-REASON-FACTS-ASSUMPTIONS')
    assert.equal(row.renderHash.length, 64)
    assert.equal(row.presentedAt, NOW.toISOString())
    assert.match(row.stimulus.messages[0].content, /24 participants/)
    c = await w.call('GET', `/assessment-sessions/${sid}`)
    assert.equal(c.body.data.status, 'IN_PROGRESS')
    assert.equal(c.body.data.messages.length, 1)
    assert.equal(c.body.data.messages[0].speaker, 'Priya')
    assert.equal(c.body.data.messages[0].actorKind, 'AI_PARTICIPANT')
    assert.equal(c.body.data.stages[0].state, 'CURRENT')
    for (const s of c.body.data.stages) assert.deepEqual(Object.keys(s).sort(), ['id', 'label', 'state'])

    // First answer includes a fact question → authored boundary answer, fact revealed, next stimulus presented.
    const first = await w.answer(sid, row)
    assert.equal(first.replayed, false)
    const factAnswer = first.messages.find((m) => m.factAnswer)
    assert.equal(factAnswer.factAnswer, 'AUTHORED')
    assert.match(factAnswer.content, /printed on the morning/)
    assert.equal(first.exchanges, 1)
    const act1 = await w.repos.sessionIo.getAction(sid, 'evt-run-0001')
    assert.equal(act1.result.revealedFactId, 'CF-PRINTING')
    ledger = await w.repos.sessionIo.listOpportunities(sid)
    assert.equal(ledger.find((r) => r.opportunityId === 'OPP-REASON-FACTS-ASSUMPTIONS').state, 'ACTION_RECEIVED')
    assert.deepEqual(ledger.find((r) => r.opportunityId === 'OPP-REASON-FACTS-ASSUMPTIONS').actionIds, [act1.actionId])

    // Drive the remaining stages, stopping with the LAST required opportunity presented but unanswered.
    const presentedOrder = ['OPP-REASON-FACTS-ASSUMPTIONS']
    let sawWorldChange = null
    for (let i = 0; i < 30; i += 1) {
      row = await w.presentedRow(sid)
      if (!row) break
      presentedOrder.push(row.opportunityId)
      if (row.stimulus.worldChangeId) sawWorldChange = { id: row.opportunityId, messages: row.stimulus.messages }
      if (row.opportunityId === 'OPP-COMM-HANDOVER-AUDIENCE') break
      const out = await w.answer(sid, row)
      assert.equal(out.replayed, false)
    }
    assert.equal(presentedOrder.at(-1), 'OPP-COMM-HANDOVER-AUDIENCE')
    assert.equal(new Set(presentedOrder).size, presentedOrder.length, 'no opportunity presented twice')
    assert.equal(presentedOrder.length, 11, 'all required opportunities, no optional padding')
    assert.ok(presentedOrder.indexOf('OPP-COMM-PLAN-EXPLAIN') > presentedOrder.indexOf('OPP-EXEC-BOARD-OWNERS'))
    // Stage 3 world change: facts updated, board kept, learner told what changed.
    assert.equal(sawWorldChange.id, 'OPP-ADAPT-REPLAN')
    assert.equal(sawWorldChange.messages[0].actorKind, 'SYSTEM')
    assert.match(sawWorldChange.messages[0].content, /What changed: Sam is unavailable/)
    assert.match(sawWorldChange.messages[0].content, /board is unchanged/)
    const boardAfterChange = await w.repos.sessionIo.latestArtifactVersion(sid, BOARD_ARTIFACT_ID)
    assert.deepEqual(boardAfterChange.content.data.patches[0], BOARD_PATCHES['OPP-EXEC-BOARD-OWNERS'], 'the learner\'s earlier board work survives the scene change')
    assert.equal(w.engine.calls.message, 0, 'no engine dialogue for a universal run')
    assert.equal(w.engine.calls.artifact, 2)

    c = await w.call('GET', `/assessment-sessions/${sid}`)
    assert.equal(c.body.data.stages.at(-1).state, 'CURRENT')
    assert.equal(c.body.data.stages[0].state, 'DONE')
    assert.equal(c.body.data.progress.exchanges, 8, 'eight text answers and two board patches')
    const shown = c.body.data.messages
    assert.ok(shown.some((m) => m.aiGenerated && /AI-generated recommendation/.test(m.content)), 'the AI recommendation is labelled as such')
    assert.ok(!shown.some((m) => /Engine opening|rate this level/.test(m.content)), 'T24: engine text is never shown')
    assert.equal(shown.filter((m) => m.isUser).length, 8)
    // T34: a structured board action outside the schema is rejected without completing fields.
    const bad = await w.call('PATCH', `/assessment-sessions/${sid}/artifacts/${BOARD_ARTIFACT_ID}`, { updates: { 'R2.task': 'Order catering', 'R2.owner': 'The CEO' }, clientEventId: 'art-bad-0001' }, { 'If-Match': '2' })
    assert.equal(bad.status, 422, JSON.stringify(bad.body))
    assert.equal(bad.body.error.code, 'VALIDATION_FAILED')
    assert.equal((await w.repos.sessionIo.getAction(sid, 'art-bad-0001')).state, 'FAILED')

    // Finish with the last opportunity unanswered.
    const fin = await w.call('POST', `/assessment-sessions/${sid}/finish`, { early: true })
    assert.equal(fin.status, 200, JSON.stringify(fin.body))
    assert.equal(fin.body.data.state, 'COMPLETE')
    assert.equal(w.engine.calls.evaluate, 0)
    assert.equal((await w.repos.sessionIo.getJob(evaluateJobKey(sid))).state, 'DONE')

    ledger = await w.repos.sessionIo.listOpportunities(sid)
    const stateOf = (id) => ledger.find((r) => r.opportunityId === id).state
    assert.equal(stateOf('OPP-COMM-HANDOVER-AUDIENCE'), 'PRESENTED', 'unanswered stays presented, never failed')
    assert.equal(stateOf('OPP-COMM-CLARIFY-BRIEF'), 'PLANNED', 'never-presented optional stays planned')
    const answered = presentedOrder.slice(0, -1)
    for (const id of answered) assert.equal(stateOf(id), 'EVALUATED', id)

    const units = await evidenceGraph.getEvidenceUnits(sid)
    const defs = new Map(CORE_TEAMREADY_A.opportunities.map((o) => [o.id, o]))
    const expectedUnits = answered.reduce((n, id) => n + defs.get(id).behaviourIds.length, 0)
    assert.equal(units.length, expectedUnits, 'one unit per (answered opportunity, targeted behaviour)')
    const actions = await w.repos.sessionIo.listActions(sid)
    const byId = new Map(actions.map((a) => [a.actionId, a]))
    for (const u of units) {
      const p = u.provenance_json
      assert.ok(answered.includes(p.opportunityId), `${p.opportunityId} was answered`)
      assert.ok(defs.get(p.opportunityId).behaviourIds.includes(p.behaviourId), 'only targeted behaviours are evaluated')
      assert.equal(p.opportunityGroup, defs.get(p.opportunityId).groupId)
      assert.equal(u.assessment_form_id, CORE_TEAMREADY_A_FORM_ID)
      assert.equal(p.snapshotHash, startEvent.response.runPin.snapshotHash)
      assert.equal(p.rubricRef, 'draft-teamready-rubric.v0.1')
      if (p.actionId) {
        const a = byId.get(p.actionId)
        assert.equal(a.actorKind, 'CANDIDATE', 'T24: only candidate actions are evidence sources')
        assert.equal(a.state, 'APPLIED')
        assert.ok(ledger.find((r) => r.opportunityId === p.opportunityId).actionIds.includes(a.actionId), 'the unit links an action attached to its opportunity')
      }
      assert.notEqual(u.evidence_status, 'SUFFICIENT')
    }
    assert.ok(!units.some((u) => u.provenance_json.opportunityId === 'OPP-COMM-HANDOVER-AUDIENCE'), 'unanswered opportunity → no unit')
    assert.ok(!units.some((u) => u.provenance_json.opportunityId === 'OPP-COMM-CLARIFY-BRIEF'), 'unpresented opportunity → no unit')
    // T27/T28: dialogue and board evidence are both present and linked.
    assert.ok(units.some((u) => u.source_type === 'DIALOGUE_TURN' && u.rubric_level === 2))
    const board = units.filter((u) => u.provenance_json.opportunityId === 'OPP-EXEC-BOARD-OWNERS')
    assert.equal(board.length, 2)
    assert.ok(board.every((u) => u.source_type === 'WORK_ARTIFACT' && u.source_artifact_id === BOARD_ARTIFACT_ID))
    // T23: units > independent opportunities; the board change and its explanation count once.
    const independent = independentOpportunityCount(units)
    assert.equal(independent, new Set(answered.map((id) => defs.get(id).groupId)).size)
    assert.equal(independent, 9)
    assert.ok(units.length > independent)
    assert.equal(w.evaluatorCalls.length, units.filter((u) => u.provenance_json.reason !== 'NOT_ADDRESSED').length)

    c = await w.call('GET', `/assessment-sessions/${sid}`)
    assert.equal(c.body.data.status, 'COMPLETED')
    assert.equal((await w.call('POST', `/assessment-sessions/${sid}/messages`, { clientEventId: 'evt-late-0001', text: 'Too late now, surely?' })).status, 409)
    assert.ok(w.audits.some((a) => a.type === 'assessment.director_decision' && a.sid === sid && a.payload.policy === '1_REQUIRED'))
    const decisions = w.audits.filter((a) => a.type === 'assessment.director_decision' && a.sid === sid)
    assert.equal(decisions.length, 11, 'one recorded decision per presentation')
    assert.ok(decisions.every((a) => a.payload.renderHash && a.payload.formVersion === CORE_TEAMREADY_A.version && !('content' in a.payload)))
    assert.ok(!JSON.stringify(w.audits).includes(ANSWERS['OPP-REASON-OPTIONS']), 'no transcript text in audit output')
  } finally { w.close() }
})

test('P4 T29/T31: finishing with no answers writes no unit and no deficit; a replayed message returns the stored response', async () => {
  const w = await world()
  try {
    const sid = await w.start()
    await w.call('POST', `/assessment-sessions/${sid}/begin`, {}, { 'Idempotency-Key': `begin-${sid}` })
    const fin = await w.call('POST', `/assessment-sessions/${sid}/finish`, { early: true })
    assert.equal(fin.status, 200, JSON.stringify(fin.body))
    assert.equal(fin.body.data.state, 'COMPLETE')
    assert.deepEqual(await evidenceGraph.getEvidenceUnits(sid), [], 'nothing answered → nothing manufactured')
    assert.equal(w.evaluatorCalls.length, 0)
    const ledger = await w.repos.sessionIo.listOpportunities(sid)
    assert.equal(ledger.filter((r) => r.state === 'PRESENTED').length, 1)
    assert.equal(ledger.filter((r) => r.state === 'PLANNED').length, ledger.length - 1)
  } finally { w.close() }
})

test('P4: a very short answer earns one authored clarification in the same group; its answer never inflates the independent count', async () => {
  const w = await world()
  try {
    const sid = await w.start()
    await w.call('POST', `/assessment-sessions/${sid}/begin`, {}, { 'Idempotency-Key': `begin-${sid}` })
    const r1 = await w.call('POST', `/assessment-sessions/${sid}/messages`, { clientEventId: 'evt-short-001', text: 'ok sure' })
    assert.equal(r1.status, 201)
    const row = await w.presentedRow(sid)
    assert.equal(row.opportunityId, 'OPP-REASON-FACTS-ASSUMPTIONS:CLARIFY')
    assert.equal(row.groupId, 'G-UNDERSTAND-FACTS')
    assert.match(r1.body.data.messages.at(-1).content, /same thing/)
    const r2 = await w.call('POST', `/assessment-sessions/${sid}/messages`, { clientEventId: 'evt-long-0001', text: 'I want to confirm whether 24 is the confirmed number, because the room plan depends on it.' })
    assert.equal(r2.status, 201)
    // The same client event id replays the stored response, never a second acceptance.
    const again = await w.call('POST', `/assessment-sessions/${sid}/messages`, { clientEventId: 'evt-long-0001', text: 'I want to confirm whether 24 is the confirmed number, because the room plan depends on it.' })
    assert.equal(again.status, 200)
    assert.equal(again.body.data.replayed, true)
    const nextRow = await w.presentedRow(sid)
    assert.equal(nextRow.opportunityId, 'OPP-REASON-OPTIONS', 'required events follow the authored order inside a stage')
    const fin = await w.call('POST', `/assessment-sessions/${sid}/finish`, { early: true })
    assert.equal(fin.body.data.state, 'COMPLETE')
    const units = await evidenceGraph.getEvidenceUnits(sid)
    assert.equal(units.length, 2, 'the opportunity and its clarification each yield a unit for the one targeted behaviour')
    assert.equal(independentOpportunityCount(units), 1, 'T23: a clarification of the same opportunity is not a second independent observation')
    assert.ok(units.every((u) => u.provenance_json.behaviourId === 'QUESTION_ASSUMPTION'))
  } finally { w.close() }
})
