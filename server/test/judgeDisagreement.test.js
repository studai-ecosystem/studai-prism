// T33 judge disagreement: a rated evaluator unit that carries an ambiguity or
// contrary-evidence marker earns exactly ONE bounded second sample (N=2, cost
// bounded). Two samples two or more anchor levels apart, or one rated and one
// not, become HUMAN_REVIEW_REQUIRED with reason JUDGE_DISAGREEMENT and the
// learner's verified words; never an averaged, confident level. When
// PRISM_V3_RATING_QUEUE is on, the run's units are queued for blinded human
// rating by the existing validation service. Deterministic provider fault:
// PRISM_AUDIT_AI_FAULT=disagree (auditConverse).
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'
import { CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION } from '../domain/sharing/copyVersions.js'
import { draftBankScenarios, buildRunPin, UNIVERSAL_SNAPSHOT } from '../domain/assessments/draftSegments.js'
import { EVIDENCE_PROMPT, EVIDENCE_EVALUATOR } from '../domain/assessments/frozenMethod.js'
import { CORE_TEAMREADY_A, CORE_TEAMREADY_A_FORM_ID } from '../domain/assessments/universalForm.js'
import { createSliceEvaluator, reconcileSamples, hasAmbiguityMarker, MAX_JUDGE_SAMPLES, JUDGE_DISAGREEMENT } from '../domain/evidence/sliceEvaluator.js'
import { ratingItemFrom } from '../domain/validation/ratingQueue.js'
import evidenceGraph from '../lib/evidenceGraph.js'

process.env.NODE_ENV = 'test'
process.env.PRISM_AUDIT_AI = 'true'
process.env.PRISM_AUDIT_AI_FAULT = 'disagree'
process.env.PRISM_DRAFT_CONTENT = 'true'
process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_ASSESSMENT_WORKSPACE_V3 = 'true'
process.env.PRISM_STUDENT_REPORT_V3 = 'true'
process.env.PRISM_V3_RATING_QUEUE = 'true'
const { createCompletion } = await import('../services/ai/completionService.js')

const NOW = new Date('2026-10-03T10:00:00Z')
const day = 86400000
const iso = (ms) => new Date(NOW.getTime() + ms).toISOString()
const USER = { id: 'student-disagree', email: 'disagree@test.local', name: 'Synthetic Student' }
const CONSENT = { scopes: ['data_processing', 'ai_disclosure', 'ai_scoring_oversight', 'proctoring', 'face_analysis', 'own_work'], consentVersion: 'synthetic-consent.v1' }
const ANSWER = 'Is 24 the confirmed number or only the sign-ups? Either way I would check the room first.'

const rated = (level, extra = {}) => ({ opportunityId: 'O', capabilityId: 'C', behaviourId: 'B', outcome: 'RATED', reason: null, level, action: { actionId: 'a1' }, excerpt: 'own words', contraryEvidence: '', ambiguity: '', ...extra })

test('reconcileSamples: ≥2 levels apart or rated-vs-abstain → JUDGE_DISAGREEMENT review with the verified excerpt; close samples keep the first level', () => {
  assert.equal(MAX_JUDGE_SAMPLES, 2, 'cost-bounded: never more than two samples')
  assert.equal(hasAmbiguityMarker(rated(2)), false)
  assert.equal(hasAmbiguityMarker(rated(2, { ambiguity: 'maybe' })), false, 'a token word is not a marker')
  assert.equal(hasAmbiguityMarker(rated(2, { contraryEvidence: 'The second sentence contradicts the first plan.' })), true)
  const far = reconcileSamples(rated(2, { ambiguity: 'Could be a plan or a question about the plan.' }), rated(4))
  assert.equal(far.outcome, 'REVIEW')
  assert.equal(far.reason, JUDGE_DISAGREEMENT)
  assert.equal(far.level, null, 'never an average (3) presented as a confident level')
  assert.equal(far.excerpt, 'own words')
  assert.deepEqual(far.judgeSamples.map((s) => s.level), [2, 4])
  const near = reconcileSamples(rated(2, { ambiguity: 'Could be a plan or a question about the plan.' }), rated(3))
  assert.equal(near.outcome, 'RATED')
  assert.equal(near.level, 2, 'the first sample stands; the second is recorded, not blended')
  assert.deepEqual(near.judgeSamples.map((s) => s.level), [2, 3])
  const mixed = reconcileSamples(rated(2, { ambiguity: 'Could be a plan or a question about the plan.' }), { ...rated(null), outcome: 'ABSTAIN', reason: 'TOO_SPARSE', excerpt: null })
  assert.equal(mixed.reason, JUDGE_DISAGREEMENT)
  assert.equal(mixed.excerpt, 'own words')
})

test('evaluator: a flagged unit costs exactly two provider calls; the stored unit is HUMAN_REVIEW_REQUIRED with no level and the learner\'s words', async () => {
  const calls = []
  const recorded = []
  const ev = createSliceEvaluator({
    complete: async (params, options) => { calls.push(options.task); return createCompletion(params, options) },
    recordUnit: async (unit, tx) => { recorded.push(unit); return evidenceGraph.recordEvidenceUnit(unit, tx) },
  })
  const sessionId = `disagree-${Math.random().toString(36).slice(2, 8)}`
  const pin = buildRunPin({ formId: CORE_TEAMREADY_A_FORM_ID, scenarioId: CORE_TEAMREADY_A.id })
  const actions = [{
    actionId: 'act-1', kind: 'MESSAGE', actorKind: 'CANDIDATE', state: 'APPLIED', sequence: 1, payloadHash: 'h', payload: { text: ANSWER },
    result: {
      evaluationContext: {
        schemaVersion: 'assessment-action-context.v1',
        situation: { scenarioId: CORE_TEAMREADY_A.id, scenarioVersion: CORE_TEAMREADY_A.version, applicableFacts: CORE_TEAMREADY_A.publicFacts, appliedWorldChangeIds: [] },
        stimulus: { opportunityId: 'OPP-REASON-FACTS-ASSUMPTIONS', presentedAt: NOW.toISOString(), renderHash: 'synthetic', messages: [{ speaker: 'Priya', content: 'What do you want to check?' }] },
        informationAccess: { revealedFactIds: [] },
        learnerAction: { actionId: 'act-1', kind: 'MESSAGE', sequence: 1 },
        workState: { before: { rows: CORE_TEAMREADY_A.board.rows }, after: { rows: CORE_TEAMREADY_A.board.rows } },
        method: { behaviourIds: ['QUESTION_ASSUMPTION'], rubricRef: CORE_TEAMREADY_A.rubric.ref, promptVersion: EVIDENCE_PROMPT, evaluatorVersion: EVIDENCE_EVALUATOR, methodVersion: pin.methodVersion },
      },
    },
  }]
  const opportunities = [{ opportunityId: 'OPP-REASON-FACTS-ASSUMPTIONS', state: 'EVALUATION_PENDING', actionIds: ['act-1'] }]
  const { units } = await ev.evaluateRun({ sessionId, actions, snapshot: UNIVERSAL_SNAPSHOT, pin, formId: CORE_TEAMREADY_A_FORM_ID, opportunities, apply: false })
  assert.deepEqual(recorded, [], 'compute-only evaluation never reaches the writer')
  assert.deepEqual(await evidenceGraph.getEvidenceUnits(sessionId), [], 'proposed units are not accepted evidence')
  assert.equal(calls.length, 2, 'one behaviour targeted, one marker → exactly one extra sample')
  assert.equal(units.length, 1)
  const u = units[0]
  assert.equal(u.evidence_status, 'HUMAN_REVIEW_REQUIRED')
  assert.equal(u.rubric_level, null)
  assert.equal(u.human_review_status, 'REQUIRED')
  assert.equal(u.provenance_json.reason, JUDGE_DISAGREEMENT)
  assert.deepEqual(u.provenance_json.judgeSamples.map((s) => s.level), [2, 4])
  assert.equal(u.provenance_json.judgeSampleCount, 2)
  assert.ok(ANSWER.includes(u.candidate_action_json.dialogue_excerpt), 'the excerpt is the learner\'s verified words')
  assert.equal(u.observable_behavior, null, 'no AI description is kept on a disputed unit')
  // The disputed unit is ratable by humans (candidate words present).
  const item = ratingItemFrom(u, { candidateName: USER.name, salt: 's', enqueuedBy: 'system:judge_disagreement' })
  assert.ok(item.item, JSON.stringify(item))
  assert.equal(item.item.aiLevel, null, 'raters never see an AI level for a disputed unit')
})

// ── end to end: universal run → finish → disputed unit → rating queue ────────
function fakeEngine(state) {
  const owner = (sid) => state.payments.find((p) => p.sessionId === sid)?.userId || null
  return {
    async recordConsent({ sessionId, scopes }) { state.consents[sessionId] = scopes },
    async start({ sessionId, scenarioId }) {
      state.sessions[sessionId] = { sessionId, userId: owner(sessionId), scenarioId, startedAt: NOW.getTime() - 60000, exchangeCount: 0, history: [], artifacts: (draftBankScenarios()[scenarioId]?.interactiveArtifacts || []).map((a) => structuredClone(a)) }
      return { messages: [] }
    },
    async message() { throw new Error('no engine dialogue for a universal run') },
    async saveArtifact() { throw new Error('no engine artifacts for a universal run') },
    async evaluate() { throw new Error('legacy scoring must never run for a draft run') },
    async evaluateStatus() { return 'IDLE' },
  }
}

async function world() {
  const repos = createMemoryCampusRepos({ clock: () => NOW })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic University', slug: `syn-d-${Math.random().toString(36).slice(2, 8)}`, organizationType: 'UNIVERSITY', status: 'ACTIVE' })
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
    createSession: async (sid, rec) => { state.sessions[sid] = { sessionId: sid, ...structuredClone(rec), startedAt: NOW.getTime() - 60000, completedAt: null } },
    updateSession: async (sid, patch) => { Object.assign(state.sessions[sid], structuredClone(patch)); return structuredClone(state.sessions[sid]) },
  }
  const audits = []
  const users = { findById: async (id) => (id === USER.id ? USER : null) }
  const campus = createCampusContext({
    repos, clock: () => NOW, legacy, engine: fakeEngine(state), users,
    sliceEvaluator: createSliceEvaluator({ complete: (p, o) => createCompletion(p, o), recordUnit: (unit, tx) => evidenceGraph.recordEvidenceUnit(unit, tx) }),
    scenarioSource: async () => ({ generalScenarios: [], bankScenarios: draftBankScenarios() }),
    evidence: { units: (sid) => evidenceGraph.getEvidenceUnits(sid) },
    audit: (type, sid, payload) => audits.push({ type, sid, payload }),
  })
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createV1Router({ requireUser: (req, _res, next) => { req.user = USER; next() }, campus }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const campusWs = (await campus.workspaceService.listWorkspaces(USER)).find((w) => w.type === 'CAMPUS_STUDENT')
  const call = async (method, path, body, headers = {}) => {
    const r = await fetch(`${base}${path}`, { method, headers: { 'X-Prism-Workspace': campusWs.id, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  await campus.catalog.ensureSeeded()
  const assignment = await repos.assessments.createAssignment({
    id: crypto.randomUUID(), definitionId: CORE_TEAMREADY_A.id, formPolicy: 'FIXED_FORM', formId: CORE_TEAMREADY_A_FORM_ID, sponsorType: 'INSTITUTION', organizationId: org.id,
    windowStart: iso(-day), windowEnd: iso(7 * day), integrityPolicy: 'STANDARD', accommodationsPolicy: {}, reminderPolicy: {},
    createdBy: 'owner', status: 'ACTIVE', targets: [{ targetType: 'USER', targetId: USER.id }],
  })
  await repos.assessments.addStudent({ assignmentId: assignment.id, userId: USER.id, status: 'ASSIGNED' })
  await repos.entitlements.createEntitlement({ organizationId: org.id, sourceType: 'INSTITUTION_SPONSORSHIP', productCode: 'PRISM_CAMPUS_ASSESSMENT', quantity: 5, validFrom: iso(-day), validUntil: iso(30 * day), status: 'ACTIVE' })
  await call('POST', `/assessment-assignments/${assignment.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true })
  return { repos, campus, audits, call, assignment, close: () => server.close() }
}

test('T33 end to end: one answered opportunity → disputed unit → HUMAN_REVIEW_REQUIRED, audited, queued for blinded human rating (flag on); the report claims nothing', async () => {
  const w = await world()
  try {
    const started = await w.call('POST', `/assessment-assignments/${w.assignment.id}/start`, { consent: CONSENT }, { 'Idempotency-Key': 'k-disagree' })
    assert.equal(started.status, 201, JSON.stringify(started.body))
    const sid = started.body.data.sessionId
    assert.equal((await w.call('GET', `/assessment-sessions/${sid}`)).body.data.purpose, 'FORMAL', 'T21: a universal run is a FORMAL context')
    assert.equal((await w.call('POST', `/assessment-sessions/${sid}/begin`, {}, { 'Idempotency-Key': `begin-${sid}` })).status, 200)
    const sent = await w.call('POST', `/assessment-sessions/${sid}/messages`, { clientEventId: 'evt-disagree-0001', text: ANSWER })
    assert.equal(sent.status, 201, JSON.stringify(sent.body))
    const fin = await w.call('POST', `/assessment-sessions/${sid}/finish`, { early: true })
    assert.equal(fin.status, 200, JSON.stringify(fin.body))
    const units = await evidenceGraph.getEvidenceUnits(sid)
    assert.equal(units.length, 1, 'one behaviour targeted by the answered opportunity')
    assert.equal(units[0].evidence_status, 'HUMAN_REVIEW_REQUIRED')
    assert.equal(units[0].provenance_json.reason, JUDGE_DISAGREEMENT)
    assert.ok(w.audits.some((a) => a.type === 'assessment.judge_disagreement' && a.payload.units === 1))
    // The existing rating queue received identity-free items, attributed to the system trigger.
    const items = await w.repos.validation.listItems()
    assert.equal(items.length, 1)
    assert.equal(items[0].enqueuedBy, 'system:judge_disagreement')
    assert.equal(items[0].aiLevel, null)
    assert.ok(!JSON.stringify(items).includes(sid), 'the queue never holds a raw session id')
    // Coverage diagnostics after finish: counts only, no capability hint.
    const after = (await w.call('GET', `/assessment-sessions/${sid}`)).body.data
    assert.equal(after.status, 'COMPLETED')
    assert.equal(after.coverage.planned, 11)
    assert.equal(after.coverage.presented, 2)
    assert.equal(after.coverage.answered, 1)
    assert.equal(after.coverage.notes[0], 'Review coverage: 2 of 11 planned moments were presented.')
    assert.ok(!/capabilit|level|score/i.test(after.coverage.notes.join(' ')))
    // The report withholds the disputed unit: nothing described, no quote claimed.
    const report = await w.call('GET', `/assessment-sessions/${sid}/report`)
    assert.equal(report.status, 200, JSON.stringify(report.body))
    assert.equal(report.body.data.report.summary.describedCount, 0)
    assert.deepEqual(report.body.data.report.moments, [])
    assert.equal(report.body.data.report.coverage.planned, 11)
    assert.match(report.body.data.report.coverage.notes[0], /^Review coverage: 2 of 11 planned moments were presented\.$/)
  } finally { w.close() }
})
