// P5 — Your Prism report: Moments that mattered come only from verified
// units of this session with the learner's verbatim words (T32); a plain
// statement is bounded to this assessment or absent; plain family labels sit
// beside precise names; the owner can list immutable versions and ask for a
// review without any version being rewritten (T36, CH-29); a summary
// disclosure never carries a quote.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'
import { buildStudentReportV3, MAX_MOMENTS } from '../domain/reports/v3/build.js'
import { assertReportSafe, forbiddenPaths } from '../domain/reports/v3/schema.js'
import { PRIMARY_CAPABILITY_IDS, CAPABILITY_DISPLAY_LABELS, capabilityInfo } from '../domain/assessments/catalog.js'
import { captureMethod, methodHash } from '../domain/assessments/frozenMethod.js'
import { ApiError } from '../domain/http/errors.js'

process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_STUDENT_REPORT_V3 = 'true'

const [CAP_A, CAP_B, CAP_C] = PRIMARY_CAPABILITY_IDS
const SID = 'sess-moments-0001'
const now = new Date('2026-10-03T10:00:00Z')
const LINES = ['First I would check which customers raised the issue.', 'Then I would compare the numbers before deciding.', 'I would agree next steps with the team lead.', 'Two tasks still have no owner, so I will assign them now.']
const history = (lines) => [{ role: 'user', content: 'opening instruction' }, ...lines.map((l) => ({ role: 'user', content: `[Candidate]: ${l}` }))]

function unit(id, capabilityId, turn, { rubric = 2, excerpt = null, status = 'PROVISIONAL', opportunityId = null, behaviour = null } = {}) {
  const anchors = structuredClone(capabilityInfo(capabilityId).anchors)
  return {
    evidence_id: id, session_id: SID, capability_id: capabilityId, evidence_status: status, rubric_level: rubric,
    source_turn: turn, source_artifact_id: null, behavior_anchor_id: `anchor-${turn}`,
    candidate_action_json: { dialogue_excerpt: excerpt },
    provenance_json: {
      judge: 'synthetic', rubric_version: 'rubric.v1', ...(opportunityId ? { opportunityId } : {}),
      resolvedRubric: { ref: 'rubric.v1', anchors, anchorsHash: methodHash(anchors) },
    },
    judge_agreement_json: { agreement: 0.9 }, observable_behavior: behaviour || `Synthetic observed behaviour ${id}.`, legacy_row: false,
  }
}

// CAP_A is described (three units, two with verbatim quotes, one with an
// invented one); CAP_B has a single verified unit (bounded observation);
// CAP_C has a single unit whose quote is not verbatim (never a moment).
const UNITS = [
  unit('m-a1', CAP_A, 1, { excerpt: 'check which customers raised the issue', opportunityId: 'OPP-1', behaviour: 'Checked where the complaints came from before acting.' }),
  unit('m-a2', CAP_A, 2, { excerpt: 'compare the numbers before deciding', behaviour: 'Compared the figures before choosing an option.' }),
  unit('m-a3', CAP_A, 3, { excerpt: 'an invented sentence the candidate never said' }),
  unit('m-b1', CAP_B, 4, { excerpt: 'Two tasks still have no owner', opportunityId: 'OPP-4', behaviour: 'Named the two tasks without an owner.' }),
  unit('m-c1', CAP_C, 2, { excerpt: 'a paraphrase that is not verbatim' }),
]
const OPPORTUNITIES = [
  { sessionId: SID, opportunityId: 'OPP-1', state: 'EVALUATED', stimulus: { messages: [{ speaker: 'Priya', role: 'Coordinating colleague', actorKind: 'AI_PARTICIPANT', content: 'Before we plan, what do you want to check or ask?' }] } },
  { sessionId: SID, opportunityId: 'OPP-4', state: 'EVALUATED', stimulus: { messages: [{ speaker: 'Update', role: null, actorKind: 'SYSTEM', content: 'What changed: a facilitator dropped out.' }, { speaker: 'Sam', role: 'Operations colleague', actorKind: 'AI_PARTICIPANT', content: 'Two of those have no owner on the board. Who does what?' }] } },
  { sessionId: 'sess-other-0001', opportunityId: 'OPP-1', state: 'EVALUATED', stimulus: { messages: [{ speaker: 'Nope', actorKind: 'AI_PARTICIPANT', content: 'Another session\'s prompt.' }] } },
]
const DEFINITION = { id: 'prism-workplace-core', title: 'Prism Workplace Simulation', measures: [CAP_A, CAP_B, CAP_C] }

function build(overrides = {}) {
  return assertReportSafe(buildStudentReportV3({
    sessionId: SID, definition: DEFINITION, units: UNITS, turns: LINES, opportunities: OPPORTUNITIES,
    header: { scenarioTitle: 'Synthetic Scenario', completedAt: now.toISOString(), scope: 'PERSONAL' }, ...overrides,
  }))
}

test('P5.5/T32: moments come only from verified units of this session, each with a verbatim quote and the stimulus it answered', () => {
  const report = build()
  assert.ok(report.moments.length >= 2 && report.moments.length <= MAX_MOMENTS, `${report.moments.length} moments`)
  for (const m of report.moments) {
    assert.ok(UNITS.some((u) => u.evidence_id === m.id), `${m.id} is a stored unit of this session`)
    assert.ok(LINES.some((l) => l.includes(m.quote)), `"${m.quote}" is the learner's verbatim words`)
    assert.ok(m.observedBehavior.length > 0 && m.context.length > 0)
  }
  const ids = report.moments.map((m) => m.id)
  assert.equal(ids.includes('m-a3'), false, 'an invented excerpt is never a moment')
  assert.equal(ids.includes('m-c1'), false, 'a paraphrase is never a moment')
  assert.equal(ids[0], 'm-a1', 'described capabilities come first')
  assert.equal(report.moments.find((m) => m.id === 'm-a1').basis, 'DESCRIBED')
  assert.equal(report.moments.find((m) => m.id === 'm-a1').context, 'Priya (Coordinating colleague): Before we plan, what do you want to check or ask?')
  const bounded = report.moments.find((m) => m.id === 'm-b1')
  assert.equal(bounded.basis, 'BOUNDED')
  assert.equal(bounded.context, 'Sam (Operations colleague): Two of those have no owner on the board. Who does what?', 'the system update line is not the context')
  assert.equal(bounded.source.opportunityId, 'OPP-4')
  const noOpp = report.moments.find((m) => m.id === 'm-a2')
  assert.equal(noOpp.context, 'Synthetic Scenario, exchange 2', 'without a ledger row the context is the scenario and exchange')
  assert.equal(JSON.stringify(report).includes('Another session'), false)
  assert.ok(report.moments.every((m) => m.nextBehavior === null || Object.values(capabilityInfo(m.capability.id).anchors).some((a) => a.criteria === m.nextBehavior)), 'next behaviours are rubric anchors, not invented text')
  assert.deepEqual(forbiddenPaths(report), [])
})

test('P5.2: the plain statement is bounded to this assessment and absent when nothing verified supports it; family labels sit beside precise names', () => {
  const report = build()
  assert.match(report.plainStatement, /^In this assessment you were observed doing this: Checked where the complaints came from before acting\./)
  assert.match(report.plainStatement, /One thing to practise next: /)
  for (const c of report.summary.capabilities) assert.equal(c.displayLabel, CAPABILITY_DISPLAY_LABELS[c.id])
  assert.deepEqual(report.displayLabels.map((d) => d.displayLabel), [CAP_A, CAP_B, CAP_C].map((id) => CAPABILITY_DISPLAY_LABELS[id]))
  assert.ok(report.displayLabels.every((d) => d.name && d.name !== d.displayLabel), 'the precise framework name is still exposed')

  const empty = assertReportSafe(buildStudentReportV3({ sessionId: SID, definition: DEFINITION, units: [], turns: LINES, header: {} }))
  assert.equal(empty.plainStatement, null)
  assert.deepEqual(empty.moments, [])
  const unverified = assertReportSafe(buildStudentReportV3({ sessionId: SID, definition: DEFINITION, units: UNITS, turns: [], header: {} }))
  assert.deepEqual(unverified.moments, [], 'no stored turns means no verified quote means no moment')
  assert.equal(unverified.plainStatement, null)
})

test('P5.8: a summary disclosure carries no moments and no quotes', () => {
  const report = build({ disclosure: 'SUMMARY' })
  assert.deepEqual(report.moments, [])
  assert.deepEqual(report.boundedObservations, [])
  assert.ok(report.claims.every((c) => c.quote === null))
  assert.equal(JSON.stringify(report).includes('check which customers'), false)
  assert.ok(report.summary.capabilities.every((c) => c.displayLabel), 'plain labels are fine to share')
})

async function world() {
  const repos = createMemoryCampusRepos({ clock: () => now })
  const USERS = { student: { id: 'student-m', email: 's@test.local', name: 'Synthetic Student' }, other: { id: 'student-o', email: 'o@test.local', name: 'Other' } }
  const state = {
    sessions: { [SID]: { userId: USERS.student.id, scenarioId: 'syn-general-m', history: history(LINES), startedAt: now.getTime() - 86400000 } },
    reports: { [SID]: { userId: USERS.student.id, issuedAt: now.toISOString(), candidateName: 'Synthetic Student' } },
  }
  const legacy = {
    ...EMPTY_LEGACY_SOURCES,
    listSessionIds: async (uid) => Object.entries(state.sessions).filter(([, s]) => s.userId === uid).map(([id]) => id),
    getSession: async (sid) => (state.sessions[sid] ? structuredClone({ sessionId: sid, ...state.sessions[sid] }) : null),
    getReport: async (sid) => (state.reports[sid] ? { sessionId: sid, ...state.reports[sid] } : null),
    adminState: async () => null,
  }
  const audits = []
  const campus = createCampusContext({
    repos, clock: () => now, legacy, scenarioSource: async () => ({ generalScenarios: [{ id: 'syn-general-m', title: 'Synthetic Scenario' }], bankScenarios: {} }),
    evidence: { units: async (sid) => (sid === SID ? UNITS : []) },
    audit: (type, sid, payload) => audits.push({ type, sid, payload }),
    sessionOwner: async (sid) => state.sessions[sid]?.userId || null,
  })
  const cat = await campus.catalog.getCatalog()
  const form = cat.forms.find((f) => f.scenarioId === state.sessions[SID].scenarioId)
  const definition = cat.definitions.find((d) => d.id === form.definitionId)
  const allocation = {
    id: state.sessions[SID].scenarioId, version: form.version, rubricRef: 'rubric.v1',
    opportunities: definition.measures.map((capabilityId) => ({ id: `synthetic-${capabilityId}`, capabilityId, behaviourId: capabilityId })),
    rubric: { ref: 'rubric.v1', source: 'SYNTHETIC_UNIT_ALLOCATION', anchorsByBehaviour: Object.fromEntries(definition.measures.map((id) => [id, structuredClone(capabilityInfo(id).anchors)])) },
  }
  const methodSnapshot = captureMethod(allocation, { formId: form.id, engineVersion: 'synthetic-report-fixture' })
  const content = { ...allocation }
  delete content.rubric
  const runPin = {
    scenarioId: allocation.id, snapshotVersion: allocation.version, rubricRef: allocation.rubricRef, formId: form.id,
    snapshotHash: methodHash(content), engineVersion: methodSnapshot.engineVersion, methodVersion: methodSnapshot.methodVersion,
    methodSnapshot, methodHash: methodHash(methodSnapshot),
  }
  // A declared synthetic allocation, not a reconstructed historical method.
  await repos.sessionIo.putClientEvent({ sessionId: SID, clientEventId: 'start', kind: 'START', response: { runPin } })
  await campus.reports.publish(SID, { reason: 'INITIAL' })
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
  const call = async (who, method, path, body) => {
    const r = await fetch(`${base}${path}`, { method, headers: { 'x-test-user': who, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  return { repos, audits, call, close: () => server.close() }
}

test('P5.1/P5.7/T36: the owner lists immutable versions and asks for a review; the request is a row, not a rewrite, and promises no outcome', async () => {
  const w = await world()
  try {
    assert.equal((await w.call('student', 'GET', `/assessment-sessions/${SID}/report/versions`)).body.data.versions.length, 1, 'listing only returns the setup publication')
    const report = await w.call('student', 'GET', `/assessment-sessions/${SID}/report`)
    assert.equal(report.status, 200)
    assert.ok(report.body.data.report.moments.length >= 2)
    const before = structuredClone(w.repos.db.reportVersions)

    const tooShort = await w.call('student', 'POST', `/assessment-sessions/${SID}/report/review-request`, { reason: 'short' })
    assert.equal(tooShort.status, 422)
    assert.equal(tooShort.body.error.code, 'VALIDATION_FAILED')
    const missing = await w.call('student', 'POST', `/assessment-sessions/${SID}/report/review-request`, { version: 9, reason: 'This version does not exist, so the request must fail.' })
    assert.equal(missing.status, 404)

    const created = await w.call('student', 'POST', `/assessment-sessions/${SID}/report/review-request`, {
      category: 'ATTRIBUTION', momentId: 'm-a2', reason: 'The second moment quotes words I believe were part of the prompt, not mine.',
    })
    assert.equal(created.status, 201)
    assert.equal(created.body.data.state, 'OPEN')
    assert.equal(created.body.data.version, 1)
    assert.equal(created.body.data.category, 'ATTRIBUTION')
    assert.equal('reason' in created.body.data, false, 'the free text is stored, not echoed')
    assert.equal('outcome' in created.body.data, false, 'no fabricated outcome')
    assert.deepEqual(w.repos.db.reportVersions, before, 'no version was rewritten')
    assert.equal(w.repos.db.reportReviewRequests.length, 1)
    assert.ok(w.audits.some((a) => a.type === 'report.v3.review_requested' && a.payload.version === 1))

    const versions = await w.call('student', 'GET', `/assessment-sessions/${SID}/report/versions`)
    assert.equal(versions.status, 200)
    assert.equal(versions.body.data.versions.length, 1)
    assert.equal(versions.body.data.versions[0].version, 1)
    assert.equal('report' in versions.body.data.versions[0], false, 'history lists facts, not bodies')
    assert.equal(versions.body.data.reviews.length, 1)
    assert.equal(versions.body.data.reviews[0].state, 'OPEN')

    const again = await w.call('student', 'GET', `/assessment-sessions/${SID}/report`)
    assert.equal(again.body.data.version.number, 1, 'the same content is still version 1 after a review request')
    assert.deepEqual(again.body.data.report.moments.map((m) => m.id), report.body.data.report.moments.map((m) => m.id), 'moment ids are stable for a published version')

    assert.equal((await w.call('other', 'GET', `/assessment-sessions/${SID}/report/versions`)).status, 404)
    assert.equal((await w.call('other', 'POST', `/assessment-sessions/${SID}/report/review-request`, { reason: 'Not my report, so this must be refused.' })).status, 404)
  } finally {
    w.close()
  }
})
