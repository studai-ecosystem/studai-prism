// P5.4 / P5.6 / P5.7 — capability detail bound to a snapshot, read-time
// recommendations outside the hashed version, and reviewed correction as a
// NEW version (CH-26, CH-29, T36, T39). Real /api/v1 handlers and the admin
// review router over memory repositories; the external model boundary is
// absent (units are synthetic stored rows). Nothing here seeds a report: every
// version is published by the service from the evidence units.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createReportReviewsAdminRouter } from '../routes/admin/reportReviews.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'
import { PRIMARY_CAPABILITY_IDS } from '../domain/assessments/catalog.js'
import { behaviourGaps, resolveRecommendations } from '../domain/development/recommendations.js'
import { ApiError } from '../domain/http/errors.js'

process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_STUDENT_REPORT_V3 = 'true'
process.env.PRISM_DEVELOPMENT_V2 = 'true'

const [CAP_A, CAP_B, CAP_C] = PRIMARY_CAPABILITY_IDS // REASONING, COMMUNICATION, COLLABORATION
const SID = 'sess-p5-review-0001'
const SID_STRONG = 'sess-p5-strong-0001'
const now = new Date('2026-10-03T10:00:00Z')
const LINES = ['First I would check which customers raised the issue.', 'Then I would compare the numbers before deciding.', 'I would agree next steps with the team lead.', 'Two tasks still have no owner, so I will assign them now.']
const history = (lines) => [{ role: 'user', content: 'opening instruction' }, ...lines.map((l) => ({ role: 'user', content: `[Candidate]: ${l}` }))]

function unit(sid, id, capabilityId, turn, { rubric = 2, excerpt = null, status = 'PROVISIONAL', behaviourId = null, behaviour = null } = {}) {
  return {
    evidence_id: id, session_id: sid, capability_id: capabilityId, evidence_status: status, rubric_level: rubric,
    source_turn: turn, source_artifact_id: null, behavior_anchor_id: `anchor-${turn}`,
    candidate_action_json: { dialogue_excerpt: excerpt },
    provenance_json: { judge: 'synthetic', rubric_version: 'rubric.v1', ...(behaviourId ? { behaviourId } : {}) },
    judge_agreement_json: { agreement: 0.9 }, observable_behavior: behaviour || `Synthetic observed behaviour ${id}.`, legacy_row: false,
  }
}
// CAP_A described at EARLY (a development priority) with the QUESTION_ASSUMPTION
// behaviour; CAP_B a single bounded moment; CAP_C under human review.
const UNITS = [
  unit(SID, 'p5-a1', CAP_A, 1, { excerpt: 'check which customers raised the issue', behaviourId: 'QUESTION_ASSUMPTION', behaviour: 'Checked where the complaints came from before acting.' }),
  unit(SID, 'p5-a2', CAP_A, 2, { excerpt: 'compare the numbers before deciding', behaviourId: 'QUESTION_ASSUMPTION', behaviour: 'Compared the figures before choosing an option.' }),
  unit(SID, 'p5-a3', CAP_A, 3, { behaviourId: 'STATE_UNCERTAINTY' }),
  unit(SID, 'p5-b1', CAP_B, 4, { excerpt: 'Two tasks still have no owner', behaviourId: 'STATE_MAIN_POINT', behaviour: 'Named the two tasks without an owner.' }),
  unit(SID, 'p5-c1', CAP_C, 2, { status: 'HUMAN_REVIEW_REQUIRED' }),
  unit(SID, 'p5-c2', CAP_C, 3, { status: 'HUMAN_REVIEW_REQUIRED' }),
  unit(SID, 'p5-c3', CAP_C, 4, { status: 'HUMAN_REVIEW_REQUIRED' }),
]
const STRONG_UNITS = [1, 2, 3].map((t) => unit(SID_STRONG, `p5-s${t}`, CAP_A, t, { rubric: 5, excerpt: LINES[t - 1].slice(8, 30), behaviourId: 'QUESTION_ASSUMPTION', status: 'SUFFICIENT' }))

const USERS = {
  student: { id: 'student-p5', email: 's@test.local', name: 'Synthetic Student' },
  strong: { id: 'student-p5-strong', email: 'st@test.local', name: 'Synthetic Strong' },
  other: { id: 'student-p5-other', email: 'o@test.local', name: 'Other' },
  newrun: { id: 'student-p5-newrun', email: 'n@test.local', name: 'Synthetic New Run' },
}
// A new-run completion (T35): a session finished by the evaluation worker,
// with NO legacy report row. Its units are the strong set under its own id.
const SID_NEWRUN = 'sess-p5-newrun-0001'
const NEWRUN_UNITS = STRONG_UNITS.map((u) => ({ ...u, session_id: SID_NEWRUN, evidence_id: `${u.evidence_id}-n` }))
const ADMINS = {
  reviewer: { id: 'admin-reviewer', permissions: new Set(['reports:review']) },
  reader: { id: 'admin-reader', permissions: new Set(['reports:read']) },
}

async function world() {
  const repos = createMemoryCampusRepos({ clock: () => now })
  const state = {
    sessions: {
      [SID]: { userId: USERS.student.id, scenarioId: 'syn-general-p5', history: history(LINES), startedAt: now.getTime() - 86400000 },
      [SID_STRONG]: { userId: USERS.strong.id, scenarioId: 'syn-general-p5', history: history(LINES), startedAt: now.getTime() - 86400000 },
      [SID_NEWRUN]: { userId: USERS.newrun.id, scenarioId: 'syn-general-p5', history: history(LINES), startedAt: now.getTime() - 86400000, completedAt: now.getTime() - 3600000 },
    },
    reports: {
      [SID]: { userId: USERS.student.id, issuedAt: now.toISOString(), candidateName: 'Synthetic Student' },
      [SID_STRONG]: { userId: USERS.strong.id, issuedAt: now.toISOString(), candidateName: 'Synthetic Strong' },
    },
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
    repos, clock: () => now, legacy, scenarioSource: async () => ({ generalScenarios: [{ id: 'syn-general-p5', title: 'Synthetic Scenario' }], bankScenarios: {} }),
    evidence: { units: async (sid) => (sid === SID ? UNITS : sid === SID_STRONG ? STRONG_UNITS : sid === SID_NEWRUN ? NEWRUN_UNITS : []) },
    audit: (type, sid, payload) => audits.push({ type, sid, payload }),
    sessionOwner: async (sid) => state.sessions[sid]?.userId || null,
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
  app.use('/api/admin/report-reviews', (req, _res, next) => { req.admin = ADMINS[req.get('x-test-admin')] || null; req.requestId = 'req-p5'; next() }, createReportReviewsAdminRouter({ campus, audit: async () => {} }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const call = async (who, method, path, body, headers = {}) => {
    const r = await fetch(`${base}${path}`, { method, headers: { ...(who ? { 'x-test-user': who } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  const admin = async (who, method, path, body) => {
    const r = await fetch(`${base}/api/admin/report-reviews${path}`, { method, headers: { ...(who ? { 'x-test-admin': who } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  return { repos, audits, campus, call, admin, close: () => server.close() }
}

const withDraft = async (fn) => {
  const prev = process.env.PRISM_DRAFT_CONTENT
  process.env.PRISM_DRAFT_CONTENT = 'true'
  try { return await fn() } finally { if (prev === undefined) delete process.env.PRISM_DRAFT_CONTENT; else process.env.PRISM_DRAFT_CONTENT = prev }
}

test('P5.6/T39: recommendations are projected at read time; a mission publication or allowance change never alters the stored version or its evidence-set hash', async () => {
  const w = await world()
  try {
    const first = await withDraft(() => w.call('student', 'GET', `/api/v1/assessment-sessions/${SID}/report`))
    assert.equal(first.status, 200, JSON.stringify(first.body))
    const stored = structuredClone(w.repos.db.reportVersions)
    assert.equal(stored.length, 1)
    assert.equal(first.body.data.version.number, 1)
    assert.equal(first.body.data.report.development.priorities[0].capabilityId, CAP_A)
    assert.equal(first.body.data.report.development.priorities[0].recommendedMission, null, 'the stored version never names a mission')
    assert.equal(/MIS-CORE|MIS-MKT|"mission":|"matchedBy":/.test(JSON.stringify(stored[0].report)), false, 'no recommendation inside the hashed version')
    const rec = first.body.data.recommendations.find((r) => r.capabilityId === CAP_A)
    assert.ok(rec, 'a recommendation sits beside the priority')
    assert.equal(rec.kind, 'PRACTICE')
    assert.deepEqual(rec.behaviourIds, ['QUESTION_ASSUMPTION', 'STATE_UNCERTAINTY'])
    assert.equal(rec.availability, 'AVAILABLE')
    assert.equal(rec.mission.id, 'MIS-CORE-MISSING-FACT-01', 'the mission whose form behaviours match the gap')
    assert.deepEqual(rec.mission.matchedBehaviourIds, ['QUESTION_ASSUMPTION', 'STATE_UNCERTAINTY'])
    assert.equal(rec.mission.label, 'Draft practice mission (test content)', 'DRAFT content is labelled as such (test flag only)')
    assert.equal(rec.mission.estimatedMinutes, 10)
    assert.equal(rec.consumesActivity, false)
    assert.equal(rec.mission.to, '/app/development/missions/MIS-CORE-MISSING-FACT-01')
    assert.equal(JSON.stringify(first.body).includes('MIS-MKT-EXP-01'), false, 'the legacy marketing mission is never filler')

    // A bounded allowance: same version, same hash, the allowance is stated.
    await w.repos.development.setPracticeAllowance({ userId: USERS.student.id, organizationId: null, kind: 'BOUNDED', total: 1, used: 1, source: 'synthetic' })
    const second = await withDraft(() => w.call('student', 'GET', `/api/v1/assessment-sessions/${SID}/report`))
    assert.equal(second.body.data.version.number, 1)
    assert.deepEqual(w.repos.db.reportVersions, stored, 'the version row is byte-for-byte unchanged')
    const rec2 = second.body.data.recommendations.find((r) => r.capabilityId === CAP_A)
    assert.equal(rec2.availability, 'ALLOWANCE_EXHAUSTED')
    assert.equal(rec2.consumesActivity, true)
    assert.equal(rec2.allowance.kind, 'BOUNDED')

    // Without the draft flag only PUBLISHED content qualifies; none matches,
    // so the answer is honest rather than the unrelated legacy mission.
    delete process.env.PRISM_DRAFT_CONTENT
    const third = await w.call('student', 'GET', `/api/v1/assessment-sessions/${SID}/report`)
    const rec3 = third.body.data.recommendations.find((r) => r.capabilityId === CAP_A)
    assert.equal(rec3.availability, 'NO_REVIEWED_PRACTICE')
    assert.equal(rec3.mission, null)
    assert.deepEqual(w.repos.db.reportVersions, stored)
    assert.equal(third.body.data.review.pending, false)
  } finally { w.close() }
})

test('P5.6: the resolver is pure — gaps from evidence behaviour ids, PUBLISHED or flagged DRAFT only, RETIRED never, capability fallback only without behaviour ids', () => {
  const report = { sessionId: SID, development: { priorities: [{ capabilityId: CAP_A, behaviorToImprove: 'Next.' }] }, summary: { capabilities: [{ id: CAP_B, level: { band: 'STRONG' } }] } }
  const gaps = behaviourGaps(report, [...UNITS, unit('sess-foreign', 'f1', CAP_A, 9, { behaviourId: 'FOREIGN' })])
  assert.deepEqual(gaps.map((g) => [g.kind, g.capabilityId]), [['PRACTICE', CAP_A], ['STRETCH', CAP_B]])
  assert.equal(gaps[0].behaviourIds.includes('FOREIGN'), false, 'another session\'s units never shape a gap')
  const missions = [
    { mission_id: 'M-RETIRED', status: 'RETIRED', title: 'r', form_behaviour_ids: ['QUESTION_ASSUMPTION'], target_capability_id: CAP_A, estimated_duration: { minutes: 5 } },
    { mission_id: 'M-DRAFT', status: 'DRAFT', title: 'd', form_behaviour_ids: ['QUESTION_ASSUMPTION', 'STATE_UNCERTAINTY'], target_capability_id: CAP_A, estimated_duration: { minutes: 10 } },
    { mission_id: 'M-PUB', status: 'PUBLISHED', title: 'p', form_behaviour_ids: ['STATE_UNCERTAINTY'], target_capability_id: CAP_A, estimated_duration: { minutes: 12 } },
    { mission_id: 'MIS-MKT-EXP-01', status: 'PUBLISHED', title: 'legacy', target_capability_id: 'CAP-MKT-EXPERIMENTATION', estimated_duration: { minutes: 20 } },
  ]
  const published = resolveRecommendations({ gaps, missions })
  assert.equal(published[0].mission.id, 'M-PUB', 'without the flag only PUBLISHED content qualifies')
  assert.equal(published[1].availability, 'NO_REVIEWED_PRACTICE', 'a stretch without matching content is honestly unavailable')
  const draft = resolveRecommendations({ gaps, missions, draftEnabled: true })
  assert.equal(draft[0].mission.id, 'M-DRAFT', 'more matched behaviours win when the flag admits drafts')
  assert.equal(draft[0].mission.label, 'Draft practice mission (test content)')
  const off = resolveRecommendations({ gaps, missions, practiceEnabled: false })
  assert.ok(off.every((r) => r.availability === 'PRACTICE_OFF' && r.mission === null))
  const noBehaviours = resolveRecommendations({ gaps: [{ kind: 'PRACTICE', capabilityId: CAP_A, behaviourIds: [], nextBehavior: null }], missions })
  assert.equal(noBehaviours[0].mission.id, 'M-PUB')
  assert.equal(noBehaviours[0].mission.matchedBy, 'CAPABILITY')
  const legacyOnly = resolveRecommendations({ gaps: [{ kind: 'PRACTICE', capabilityId: 'CAP-MKT-EXPERIMENTATION', behaviourIds: [], nextBehavior: null }], missions })
  assert.equal(legacyOnly[0].mission, null, 'a mission without form behaviours is never recommended')
})

test('P5.7/T36: a reviewer decides once; CORRECT publishes a NEW version without the withheld unit, the original stays byte-identical, downstream reads follow the new version', async () => {
  const w = await world()
  try {
    const v1 = await w.call('student', 'GET', `/api/v1/assessment-sessions/${SID}/report`)
    assert.equal(v1.status, 200)
    assert.ok(v1.body.data.report.moments.some((m) => m.id === 'p5-a1'))
    const originalRow = JSON.stringify(w.repos.db.reportVersions[0])

    const req = await w.call('student', 'POST', `/api/v1/assessment-sessions/${SID}/report/review-request`, { category: 'ATTRIBUTION', momentId: 'p5-a1', reason: 'The first moment quotes words that were part of the prompt, not mine.' })
    assert.equal(req.status, 201)
    const pending = await w.call('student', 'GET', `/api/v1/assessment-sessions/${SID}/report`)
    assert.equal(pending.body.data.review.pending, true, 'the owner sees that a review is pending')
    assert.equal(pending.body.data.version.number, 1, 'the snapshot is unchanged while OPEN')
    const asOther = await w.call('other', 'GET', `/api/v1/assessment-sessions/${SID}/report`)
    assert.equal(asOther.status, 404)

    // Reviewer queue: ids, category and the learner's reason — never report content.
    assert.equal((await w.admin('reader', 'GET', '/')).status, 403)
    assert.equal((await w.admin(null, 'GET', '/')).status, 401)
    const queue = await w.admin('reviewer', 'GET', '/')
    assert.equal(queue.status, 200)
    assert.equal(queue.body.items.length, 1)
    const item = queue.body.items[0]
    assert.equal(item.id, req.body.data.id)
    assert.equal(item.momentId, 'p5-a1')
    assert.equal(item.category, 'ATTRIBUTION')
    assert.equal(JSON.stringify(queue.body).includes('check which customers'), false, 'no quote in the queue')
    assert.equal(JSON.stringify(queue.body).includes(USERS.student.email), false)

    // Validation: a correction needs real units of THIS session.
    assert.equal((await w.admin('reviewer', 'POST', `/${item.id}/decide`, { decision: 'CORRECT', reason: 'Withholding something that is not here.' })).status, 400)
    const foreign = await w.admin('reviewer', 'POST', `/${item.id}/decide`, { decision: 'CORRECT', reason: 'Withholding a unit from another session.', correction: { withholdEvidenceIds: ['not-a-unit'] } })
    assert.equal(foreign.status, 400)
    assert.equal(w.repos.db.reportReviewDecisions.length, 0, 'a refused correction records nothing')
    assert.equal((await w.admin('reader', 'POST', `/${item.id}/decide`, { decision: 'UPHOLD', reason: 'Not permitted to decide this.' })).status, 403)

    const decided = await w.admin('reviewer', 'POST', `/${item.id}/decide`, { decision: 'CORRECT', reason: 'The excerpt matches the stimulus text; attribution is not safe.', correction: { withholdEvidenceIds: ['p5-a1'], note: 'Unit withheld; the learner\'s other moments stand.' } })
    assert.equal(decided.status, 200, JSON.stringify(decided.body))
    assert.deepEqual(decided.body.publishedVersion, { version: 2, priorVersion: 1, reason: 'REVIEW_CORRECTION' })
    assert.equal(decided.body.review.state, 'RESOLVED')
    assert.equal(w.repos.db.reportVersions.length, 2)
    assert.equal(JSON.stringify(w.repos.db.reportVersions[0]), originalRow, 'version 1 is byte-identical after the correction')
    const row2 = w.repos.db.reportVersions[1]
    assert.equal(row2.reason, 'REVIEW_CORRECTION')
    assert.equal(row2.priorVersion, 1)
    assert.deepEqual(row2.report.review, { withheldEvidenceIds: ['p5-a1'] })
    assert.equal(JSON.stringify(row2.report).includes('p5-a1'), true, 'only as the withheld id')
    assert.equal(row2.report.moments.some((m) => m.id === 'p5-a1'), false, 'the withheld unit is not a moment')
    assert.equal(row2.report.evidence.some((e) => e.id === 'p5-a1'), false)
    assert.equal(UNITS.find((u) => u.evidence_id === 'p5-a1').evidence_status, 'PROVISIONAL', 'the evidence unit itself is not mutated')
    assert.ok(w.audits.some((a) => a.type === 'report.v3.review_decided' && a.payload.publishedVersion === 2))

    // Already decided: nothing is decided twice, nothing is edited.
    const again = await w.admin('reviewer', 'POST', `/${item.id}/decide`, { decision: 'REJECT', reason: 'Trying to decide a resolved case again.' })
    assert.equal(again.status, 409)
    assert.equal(w.repos.db.reportReviewDecisions.length, 1)
    assert.throws(() => { w.repos.db.reportReviewDecisions[0].decision = 'REJECT' }, 'decision rows are frozen in memory as the trigger freezes them in Postgres')
    assert.equal((await w.admin('reviewer', 'GET', '/')).body.items.length, 0)

    // Owner reads version 2; the version history names the correction.
    const v2 = await w.call('student', 'GET', `/api/v1/assessment-sessions/${SID}/report`)
    assert.equal(v2.body.data.version.number, 2)
    assert.equal(v2.body.data.version.reason, 'REVIEW_CORRECTION')
    assert.equal(v2.body.data.version.priorVersion, 1)
    assert.equal(v2.body.data.review.pending, false)
    assert.equal(v2.body.data.report.moments.some((m) => m.id === 'p5-a1'), false)
    assert.equal(w.repos.db.reportVersions.length, 2, 'an ordinary read publishes nothing new')
    const versions = await w.call('student', 'GET', `/api/v1/assessment-sessions/${SID}/report/versions`)
    assert.deepEqual(versions.body.data.versions.map((v) => [v.version, v.reason, v.priorVersion]), [[1, null, null], [2, 'REVIEW_CORRECTION', 1]])
    assert.equal(versions.body.data.reviews[0].state, 'RESOLVED')

    // Downstream read models recompute without the withheld unit (CAP_A keeps
    // two admissible units, so it is no longer described) — from the new
    // version, never from the old one.
    const caps = await w.call('student', 'GET', '/api/v1/me/capabilities')
    const capA = caps.body.data.items.find((c) => c.id === CAP_A)
    assert.equal(capA.level, null, 'two remaining units are below the three-unit floor')
    assert.equal(capA.observedBehaviors.some((b) => b.evidenceId === 'p5-a1'), false)
    const plan = await w.call('student', 'GET', '/api/v1/me/development-plan')
    assert.equal(plan.body.data.priorities.some((p) => p.capabilityId === CAP_A), false)
    const detail = await w.call('student', 'GET', `/api/v1/me/capabilities/${CAP_A}`)
    assert.equal(detail.body.data.latestSnapshot.version, 2)
    assert.equal(detail.body.data.latestSnapshot.reason, 'REVIEW_CORRECTION')
    assert.equal(detail.body.data.moments.some((m) => m.id === 'p5-a1'), false)
  } finally { w.close() }
})

test('P5.4: capability detail is bound to the latest snapshot — described, bounded-only, under review, stretch, not measured; one state, nothing invented', async () => {
  const w = await world()
  try {
    const before = await w.call('student', 'GET', `/api/v1/me/capabilities/${CAP_A}`)
    assert.equal(before.status, 200, JSON.stringify(before.body))
    assert.equal(before.body.data.latestSnapshot.version, null, 'no version exists until the report is published; the pure builder is used')
    assert.equal(before.body.data.state, 'DESCRIBED')

    const report = await withDraft(() => w.call('student', 'GET', `/api/v1/assessment-sessions/${SID}/report`))
    assert.equal(report.status, 200)
    const a = (await withDraft(() => w.call('student', 'GET', `/api/v1/me/capabilities/${CAP_A}`))).body.data
    assert.equal(a.state, 'DESCRIBED')
    assert.equal(a.level.band, 'EARLY')
    assert.equal(a.status, 'PROVISIONAL')
    assert.deepEqual(Object.keys(a.latestSnapshot).sort(), ['assessmentTitle', 'completedAt', 'formId', 'issuedAt', 'methodVersion', 'priorVersion', 'reason', 'scope', 'sessionId', 'sufficiencyRulesVersion', 'version'])
    assert.equal(a.latestSnapshot.sessionId, SID)
    assert.equal(a.latestSnapshot.version, 1)
    assert.equal(a.latestSnapshot.completedAt, now.toISOString())
    assert.equal(a.latestSnapshot.methodVersion, 'student-report.v3.1')
    assert.ok(a.moments.length >= 1 && a.moments.every((m) => m.capability.id === CAP_A && LINES.some((l) => l.includes(m.quote))), 'moments are this capability\'s verified quotes')
    assert.equal(typeof a.nextBehavior, 'string')
    assert.equal(a.whyItMatters.length > 0, true)
    assert.equal(a.recommendation.kind, 'PRACTICE')
    assert.equal(a.recommendation.mission.id, 'MIS-CORE-MISSING-FACT-01')
    assert.equal(a.review.pending, false)
    assert.match(a.limitation, /observed in .* only/)
    assert.equal(/\d+%/.test(JSON.stringify(a)), false, 'no percentages anywhere')

    const b = (await w.call('student', 'GET', `/api/v1/me/capabilities/${CAP_B}`)).body.data
    assert.equal(b.state, 'BOUNDED_ONLY')
    assert.equal(b.level, null)
    assert.equal(b.boundedObservation.id, 'p5-b1')
    assert.equal(b.boundedObservation.quote, 'Two tasks still have no owner')
    assert.equal(b.nextBehavior, b.boundedObservation.nextBehavior)
    assert.match(b.limitation, /^One moment was observed/)
    assert.equal(b.recommendation.availability, 'NO_REVIEWED_PRACTICE', 'no published mission matches STATE_MAIN_POINT without the draft flag')
    assert.equal(b.recommendation.mission, null)

    const c = (await w.call('student', 'GET', `/api/v1/me/capabilities/${CAP_C}`)).body.data
    assert.equal(c.state, 'UNDER_REVIEW')
    assert.equal(c.status, 'HUMAN_REVIEW_REQUIRED')
    assert.equal(c.level, null)
    assert.deepEqual(c.moments, [])
    assert.equal(c.recommendation, null, 'no deficit is invented for a result under review')

    const d = (await w.call('student', 'GET', `/api/v1/me/capabilities/${PRIMARY_CAPABILITY_IDS[3]}`)).body.data
    assert.equal(d.state, 'INSUFFICIENT')
    assert.equal(d.level, null)
    assert.equal(d.recommendation, null)
    assert.equal(d.latestSnapshot.sessionId, SID, 'the snapshot that measured nothing for this is still named')

    const strong = (await w.call('strong', 'GET', `/api/v1/me/capabilities/${CAP_A}`)).body.data
    assert.equal(strong.state, 'STRETCH')
    assert.equal(strong.level.band, 'STRONG')
    assert.equal(strong.recommendation.kind, 'STRETCH')
    assert.equal(strong.recommendation.availability, 'NO_REVIEWED_PRACTICE')
    const none = (await w.call('other', 'GET', `/api/v1/me/capabilities/${CAP_A}`)).body.data
    assert.equal(none.state, 'NOT_MEASURED')
    assert.equal(none.latestSnapshot, null)
    assert.equal((await w.call('student', 'GET', '/api/v1/me/capabilities/CAP-NOT-REAL')).status, 404)
    assert.equal((await w.call('student', 'GET', '/api/v1/me/capabilities/bad%20id!')).status, 404)
  } finally { w.close() }
})

test('T35: a new-run completion (DONE evaluation job, no legacy report) is a formal session for capabilities, history and capability detail', async () => {
  const w = await world()
  try {
    // Before the worker finishes: processing, not a report, not a capability.
    await w.repos.sessionIo.enqueueJob({ taskKey: `evaluate:${SID_NEWRUN}`, sessionId: SID_NEWRUN, kind: 'EVALUATE_RUN' })
    const pending = await w.call('newrun', 'GET', '/api/v1/me/history')
    assert.equal(pending.body.data.items[0].status, 'PROCESSING')
    assert.equal((await w.call('newrun', 'GET', `/api/v1/me/capabilities/${CAP_A}`)).body.data.state, 'NOT_MEASURED')
    const job = await w.repos.sessionIo.claimJob('EVALUATE_RUN', 60000)
    await w.repos.sessionIo.completeJob(job.jobId, job.fencingToken, 'DONE')
    // The report service publishes version 1 from the evaluation run.
    const report = await w.call('newrun', 'GET', `/api/v1/assessment-sessions/${SID_NEWRUN}/report`)
    assert.equal(report.status, 200, JSON.stringify(report.body))
    assert.equal(report.body.data.version.reason, 'INITIAL')
    const done = (await w.repos.sessionIo.getJob(`evaluate:${SID_NEWRUN}`)).updatedAt
    assert.equal(report.body.data.report.header.completedAt, done, 'completion is the worker\'s stored time')
    // Directory-backed read models now see the run without any legacy record.
    const history = await w.call('newrun', 'GET', '/api/v1/me/history')
    assert.equal(history.body.data.items[0].status, 'COMPLETED')
    assert.equal(history.body.data.items[0].reportFormat, 'V3')
    assert.equal(history.body.data.items[0].issuedAt, now.toISOString(), 'issue time is the stored publication time')
    const caps = await w.call('newrun', 'GET', '/api/v1/me/capabilities')
    assert.equal(caps.body.data.assessedCount, 1)
    assert.equal(caps.body.data.items.find((c) => c.id === CAP_A).level.band, 'STRONG')
    const detail = (await w.call('newrun', 'GET', `/api/v1/me/capabilities/${CAP_A}`)).body.data
    assert.equal(detail.state, 'STRETCH')
    assert.equal(detail.latestSnapshot.sessionId, SID_NEWRUN)
    assert.equal(detail.latestSnapshot.version, 1)
    assert.equal(detail.latestSnapshot.completedAt, done)
    assert.equal(detail.latestSnapshot.issuedAt, now.toISOString())
  } finally { w.close() }
})
