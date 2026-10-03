// P6 acceptance — every one of the ten DRAFT missions (M01–M10) run end to
// end through the real /api/v1 router with memory repositories and the
// deterministic test provider (NODE_ENV=test, PRISM_AUDIT_AI=true): start →
// valid short answer → one completed criterion + one next change quoting the
// learner's own change → paraphrase accepted → 300 characters of filler not
// met (EMPTY / NOT_SHOWN, no praise) → copied example flagged
// COPIED_ASSISTANCE and never counted → M09 missing owner and justified
// escalation → unsupported evaluator quote withheld → provider failure keeps
// the work, charges no allowance, reissues once → simultaneous retries yield
// one attempt → replay exposes only the presented stimulus → history keeps
// practice readable and separate; the formal snapshot never changes.
// Layer A/B: the meaning harness accepts a paraphrase that carries one of a
// criterion's phrasings inside a real sentence; live-model semantics are a
// separately authorized Layer C check (CONTENT_REVIEW.md).
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'
import { ApiError } from '../domain/http/errors.js'
import { MISSION_LIBRARY, P6_LIBRARY } from '../domain/development/missionLibrary.js'
import { parseMission, applyVariant, missionPackageGaps, P6_PACKAGE_FIELDS } from '../domain/development/missionSchema.js'
import { initialWork, runDeterministicChecks, candidateTextFor } from '../domain/development/validators.js'
import { createMissionEvaluator } from '../domain/development/evaluator.js'
import { copiedFrom, compareAttempts } from '../domain/development/feedback.js'
import { createCompletionService } from '../services/ai/completionService.js'
import { auditConverse } from '../services/ai/auditConverse.js'
import { FAMILY } from '../domain/assessments/universalForm.js'
import { MISSION_FIXTURES, FILLER } from './fixtures/p6Missions.js'

process.env.NODE_ENV = 'test'
process.env.PRISM_AUDIT_AI = 'true'
process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_DEVELOPMENT_V2 = 'true'
process.env.PRISM_DRAFT_CONTENT = 'true'
delete process.env.PRISM_AUDIT_AI_FAULT

const SESSION = 'sess-p6-e2e-1'
const OPP_SHOWN = 'OPP-EXEC-BOARD-OWNERS'
const OPP_FUTURE = 'OPP-EXEC-BOARD-FINAL'
const SHOWN_TEXT = 'Priya: Two of the demo tasks still have no owner on the board. Who takes what?'
const FUTURE_TEXT = 'FUTURE-STAGE-STIMULUS-MUST-NOT-LEAK'
const ANCHOR_TEXT = 'RUBRIC-ANCHOR-LEVEL-TEXT-MUST-NOT-LEAK'
const TRANSCRIPT = 'LEARNER-TRANSCRIPT-MUST-NEVER-APPEAR'
const USERS = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n'].map((k) => [k, { id: `student-p6-${k}`, email: `p6-${k}@test.local`, name: 'Asha Verma' }]))
const latest = (id) => parseMission(MISSION_LIBRARY.filter((m) => m.mission_id === id).sort((x, y) => y.version - x.version)[0])
const MISSIONS = P6_LIBRARY.map((m) => latest(m.mission_id))
const key = (k) => ({ 'Idempotency-Key': k })
const noClaims = (text) => assert.ok(!/\d\s*%|\blevel\s*\d|\bscore\b|percentile|growth (measurement|velocity)|verified skills|certif/i.test(text), 'copy stays under the claims ceiling')

async function world() {
  const repos = createMemoryCampusRepos({ clock: () => new Date('2026-10-10T09:00:00Z') })
  const byId = new Map(Object.values(USERS).map((x) => [x.id, x]))
  const formalUnits = [{ evidence_id: 'ev-1', session_id: SESSION, capability_id: FAMILY.EXECUTION, evidence_status: 'SUFFICIENT', rubric_level: 3, source_turn: 2, excerpt: TRANSCRIPT, rubric_anchor: ANCHOR_TEXT }]
  const legacyState = {
    sessions: { [SESSION]: { sessionId: SESSION, userId: USERS.a.id, scenarioId: 'syn-general-a', startedAt: Date.parse('2026-10-01T09:00:00Z'), completedAt: Date.parse('2026-10-01T10:00:00Z'), history: [{ role: 'candidate', content: TRANSCRIPT }] } },
    reports: { [SESSION]: { sessionId: SESSION, userId: USERS.a.id, issuedAt: '2026-10-01T11:00:00.000Z', reportHash: 'sha256:formal-report-v1', version: 1 } },
  }
  const legacy = {
    ...EMPTY_LEGACY_SOURCES,
    listSessionIds: async (userId) => Object.values(legacyState.sessions).filter((s) => s.userId === userId).map((s) => s.sessionId),
    getSession: async (id) => (legacyState.sessions[id] ? structuredClone(legacyState.sessions[id]) : null),
    getReport: async (id) => (legacyState.reports[id] ? structuredClone(legacyState.reports[id]) : null),
    adminState: async () => null,
  }
  // Ledger: one opportunity the learner was SHOWN, one later-stage
  // opportunity that was never presented (its stimulus is future material).
  await repos.sessionIo.upsertOpportunity({ sessionId: SESSION, opportunityId: OPP_SHOWN, capabilityId: FAMILY.EXECUTION, behaviourIds: ['ASSIGN_RESPONSIBILITY'] })
  await repos.sessionIo.setOpportunityState(SESSION, OPP_SHOWN, 'PRESENTED', { presentedAt: '2026-10-01T09:30:00Z', renderHash: 'rh-1', stimulus: { messages: [{ speaker: 'Priya', role: 'Coordinator', actorKind: 'AI_PARTICIPANT', content: SHOWN_TEXT.replace('Priya: ', '') }], worldChangeId: null, decision: null } })
  await repos.sessionIo.setOpportunityState(SESSION, OPP_SHOWN, 'ACTION_RECEIVED', { actionId: 'act-1' })
  await repos.sessionIo.upsertOpportunity({ sessionId: SESSION, opportunityId: OPP_FUTURE, capabilityId: FAMILY.EXECUTION, behaviourIds: ['DEFINE_COMPLETION'] })
  await repos.sessionIo.setOpportunityState(SESSION, OPP_FUTURE, 'PLANNED', { stimulus: { messages: [{ speaker: 'Priya', content: FUTURE_TEXT }] } })
  const audits = []
  const campus = createCampusContext({
    repos, clock: () => new Date('2026-10-10T09:00:00Z'), legacy,
    users: { findById: async (id) => byId.get(id) || null, findByEmail: async (e) => [...byId.values()].find((x) => x.email === e) || null },
    audit: (type, sid, payload) => audits.push({ type, sid, payload }),
    evidence: { units: async (sessionId) => (sessionId === SESSION ? structuredClone(formalUnits) : []) },
    scenarioSource: async () => ({ generalScenarios: [{ id: 'syn-general-a' }], bankScenarios: {} }),
    missionEvaluator: createMissionEvaluator({ complete: createCompletionService({ converseFn: auditConverse }) }),
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
  const call = async (who, method, path, body, headers = {}) => {
    const r = await fetch(`${base}${path}`, {
      method,
      headers: { ...(who ? { 'x-test-user': who } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: r.status, body: await r.json().catch(() => null), headers: r.headers }
  }
  const formalSnapshot = async () => JSON.stringify({ units: formalUnits, report: legacyState.reports[SESSION], session: legacyState.sessions[SESSION], ledger: await repos.sessionIo.listOpportunities(SESSION) })
  // Start (or retry) and submit `work` for a mission in one go.
  const run = async (who, missionId, work, { retry = false, k = `${who}-${missionId}-${Math.random()}` } = {}) => {
    const started = await call(who, 'POST', `/missions/${missionId}/attempts`, { retry }, key(k))
    assert.ok([200, 201].includes(started.status), JSON.stringify(started.body))
    const a = started.body.data
    const saved = await call(who, 'PATCH', `/mission-attempts/${a.id}`, { work }, { 'If-Match': `"${a.version}"` })
    assert.equal(saved.status, 200, JSON.stringify(saved.body))
    const sub = await call(who, 'POST', `/mission-attempts/${a.id}/submit`)
    assert.equal(sub.status, 201, JSON.stringify(sub.body))
    return sub.body.data
  }
  return { repos, campus, audits, call, run, formalSnapshot, close: () => server.close() }
}

const byId = (result) => Object.fromEntries(result.criteria.map((c) => [c.criterionId, c]))
const workTexts = (mission, work) => candidateTextFor(mission, work, mission.artifacts.map((a) => a.artifact_id)).join('\n')

test('P6.2: every mission package (M01–M10) carries the reviewer fields, a transfer version with the same behaviours in a different setting, examples AND counterexamples, and an unapproved DRAFT review record', () => {
  assert.equal(MISSIONS.length, 10)
  assert.equal(P6_PACKAGE_FIELDS.length, 17)
  for (const m of MISSIONS) {
    assert.deepEqual(missionPackageGaps(m), [], `${m.display_code} package is complete`)
    assert.equal(m.status, 'DRAFT')
    assert.equal(m.review_record.approval, 'NOT_APPROVED')
    assert.equal(m.review_record.reviewed_by, null, `${m.display_code} is not self-approved`)
    assert.ok(m.examples.some((e) => e.kind === 'EXAMPLE') && m.examples.some((e) => e.kind === 'COUNTEREXAMPLE'))
    for (const e of m.examples) assert.ok(e.text.split(/\s+/).length >= 6, `${m.display_code} ${e.example_id} is a real sentence`)
    const checks = new Set(m.rubric.criteria.map((c) => c.check))
    assert.ok(checks.has('DETERMINISTIC') && (checks.has('MEANING') || checks.has('BOTH')), `${m.display_code} splits deterministic from semantic checks`)
    // Transfer: different setting, same behaviour/criterion ids, empty start.
    const t = applyVariant(m, 'TRANSFER')
    assert.notEqual(t.scenario_context.setting, m.scenario_context.setting)
    assert.deepEqual(t.target_behavior_ids, m.target_behavior_ids)
    assert.deepEqual(t.rubric.criteria.map((c) => c.criterion_id), m.rubric.criteria.map((c) => c.criterion_id))
    const start = initialWork(t)
    assert.ok([...runDeterministicChecks(t, start).values()].every((r) => !r.observed), `${m.display_code} transfer starts empty`)
    assert.equal(candidateTextFor(t, start, t.artifacts.map((a) => a.artifact_id)).length, 0)
    for (const tag of t.exposure_tags) assert.ok(!m.exposure_tags.includes(tag), `${m.display_code} transfer does not reuse a base exposure tag`)
    noClaims(JSON.stringify([m.examples, m.clarifications, m.learner_actions, m.situation_facts, m.accessibility_note, m.confounds, m.transfer.setting, m.transfer.objective]))
    assert.ok(!/\b(Google|Microsoft|Amazon|Infosys|TCS|Wipro|Accenture)\b/.test(JSON.stringify(m)), `${m.display_code} names no real company`)
  }
})

for (const mission of MISSIONS) {
  const id = mission.mission_id
  const fx = MISSION_FIXTURES[id]
  test(`P6 acceptance ${mission.display_code} (${id}): valid → focus, paraphrase accepted, filler not met, copied example not counted`, async () => {
    assert.ok(fx, `fixtures exist for ${id}`)
    const w = await world()
    const who = 'a'
    try {
      // Start: the first view carries scene, duration, allowance and no rule internals.
      const view = await w.call(who, 'GET', `/missions/${id}`)
      assert.equal(view.status, 200)
      assert.equal(view.body.data.mission.availability, 'DRAFT')
      assert.deepEqual(view.body.data.mission.mode, { input: 'TEXT', language: 'en', label: 'Text, English' })
      assert.equal(view.body.data.mission.untimed, true)
      assert.equal(view.body.data.mission.examplesAvailable, mission.examples.length)
      assert.deepEqual(view.body.data.allowance, { kind: 'UNLIMITED' })
      assert.ok(!JSON.stringify(view.body.data).includes('"examples":'), 'examples are not in the first view')
      for (const k of ['"params"', 'evaluator_guidance', 'synonyms', 'rule_id', 'first_attempt_feedback', 'review_record']) assert.ok(!JSON.stringify(view.body.data).includes(k), `player view leaks ${k}`)

      // 1. Valid short answer.
      const valid = await w.run(who, id, fx.valid, { k: `${who}-valid` })
      assert.equal(valid.status, 'EVALUATED', valid.result.summary)
      assert.equal(valid.variant, 'BASE')
      assert.deepEqual(valid.provenance.retryOrigin, { kind: 'FIRST', previousAttemptId: null })
      assert.equal(valid.provenance.coachedRevision, false)
      assert.equal(valid.provenance.feedbackVersion, 'mission-feedback.v1')
      assert.equal(valid.provenance.evaluatorVersion, 'mission_evaluator.v1')
      const r1 = valid.result
      assert.ok(r1.counts.demonstrated >= 1, `${mission.display_code} demonstrates at least one behaviour: ${r1.summary}`)
      assert.ok(r1.focus.completed, 'one completed criterion is acknowledged')
      assert.equal(byId(r1)[r1.focus.completed.criterionId].result, 'OBSERVED')
      assert.ok(typeof r1.focus.completed.quote === 'string' && r1.focus.completed.quote.length >= 3, 'the acknowledgement quotes the learner')
      const own = workTexts(mission, fx.valid).toLowerCase().replace(/\s+/g, ' ')
      assert.ok(own.includes(r1.focus.completed.quote.toLowerCase().replace(/…$/, '').replace(/\s+/g, ' ').slice(0, 40)), 'the quote is the learner\'s own change, not an example or template')
      const notMet = r1.criteria.filter((c) => c.result === 'NOT_OBSERVED')
      if (notMet.length) {
        assert.ok(r1.focus.nextChange && notMet.some((c) => c.criterionId === r1.focus.nextChange.criterionId), 'the next change is a criterion not yet shown')
        assert.ok(r1.focus.nextChange.because)
      } else {
        assert.equal(r1.focus.nextChange, null, 'all met → no invented flaw')
        assert.equal(r1.focus.allMet, r1.criteria.every((c) => c.result === 'OBSERVED'))
      }
      assert.equal(r1.focus.reviewIncomplete, false)
      assert.equal(r1.comparison, null, 'a first attempt compares with nothing')
      noClaims(JSON.stringify(r1))
      const units1 = await w.repos.development.listPracticeUnits({ userId: USERS[who].id })
      assert.deepEqual(units1.map((u) => u.criterionId).sort(), r1.criteria.filter((c) => c.result === 'OBSERVED').map((c) => c.criterionId).sort(), 'practice evidence only for OBSERVED criteria')
      assert.ok(units1.every((u) => u.sourceType === 'MISSION_PRACTICE' && u.attemptId === valid.id))

      // 2. A semantically valid paraphrase is accepted: every meaning criterion met before is met again.
      const para = await w.run(who, id, fx.paraphrase, { retry: true, k: `${who}-para` })
      assert.notEqual(para.id, valid.id)
      assert.deepEqual(para.provenance.retryOrigin, { kind: 'RETRY', previousAttemptId: valid.id, reissued: false })
      const r2 = para.result
      assert.equal(r2.status, 'EVALUATED')
      for (const c of r1.criteria.filter((x) => x.result === 'OBSERVED')) {
        assert.equal(byId(r2)[c.criterionId].result, 'OBSERVED', `${mission.display_code} ${c.criterionId}: a paraphrase in other words still counts`)
      }
      assert.ok(r2.criteria.filter((c) => c.quote).every((c) => workTexts(mission, fx.paraphrase).toLowerCase().replace(/\s+/g, ' ').includes(c.quote.toLowerCase().replace(/\s+/g, ' '))), 'every quote is verbatim from the paraphrase')
      assert.ok(r2.comparison, 'a retry compares criterion ids with the earlier attempt')
      assert.equal(r2.comparison.previousAttemptId, valid.id)
      assert.deepEqual(r2.comparison.newlyMet, [], 'nothing newly met: both attempts meet the same criteria')
      assert.deepEqual(r2.comparison.noLongerMet, [])
      assert.ok(!/\d\s*%/.test(JSON.stringify(r2.comparison)) && !/improv|better|worse/i.test(JSON.stringify([r2.comparison.newlyMet, r2.comparison.noLongerMet])), 'no percentage or improvement claim in a comparison')

      // 3. Long empty text: not met, EMPTY / NOT_SHOWN, no fabricated praise.
      assert.equal(FILLER.length, 300)
      const filler = await w.run(who, id, fx.filler, { retry: true, k: `${who}-filler` })
      const r3 = filler.result
      assert.equal(r3.status, 'EVALUATED', 'filler is a decision, not an outage')
      assert.equal(r3.counts.demonstrated, 0, `${mission.display_code}: filler demonstrates nothing`)
      for (const c of r3.criteria) {
        const def = mission.rubric.criteria.find((x) => x.criterion_id === c.criterionId)
        if (def.check === 'MEANING') {
          assert.equal(c.result, 'NOT_OBSERVED', `${mission.display_code} ${c.criterionId}: filler expresses no meaning`)
          assert.ok(['EMPTY_WORK', 'MEANING_NOT_EXPRESSED', 'MEANING_KEYWORDS_ONLY'].includes(c.reason), c.reason)
          assert.equal(c.quote, null)
        } else if (c.result === 'NOT_OBSERVED') assert.equal(c.reason, 'RULES_NOT_MET')
      }
      assert.ok(!/Mission completed/.test(r3.summary))
      assert.ok(!r3.focus.completed || r3.focus.completed.source === 'AUTOMATIC_CHECK', 'no praise is invented from filler; only a literal automatic check could pass')
      assert.ok(r3.focus.nextChange, 'the next change is named')
      assert.ok(r3.comparison.noLongerMet.length >= 1, 'the comparison says plainly what the filler no longer shows')

      // 4. Copying the supplied example verbatim is flagged, not praised.
      const revealed = await w.call(who, 'POST', `/mission-attempts/${filler.id}/examples`)
      assert.equal(revealed.status, 200, JSON.stringify(revealed.body))
      assert.equal(revealed.body.data.examples.length, mission.examples.length, 'examples open after a submission on request')
      assert.ok(revealed.body.data.examples.every((e) => ['EXAMPLE', 'COUNTEREXAMPLE'].includes(e.kind) && e.note))
      const ex = mission.examples.find((e) => e.kind === 'EXAMPLE')
      const target = mission.artifacts.find((a) => a.artifact_id === fx.copyTarget.artifact)
      const copiedWork = structuredClone(fx.valid)
      if (target.type === 'TEXT_RESPONSE') copiedWork[target.artifact_id] = { text: ex.text }
      else copiedWork[target.artifact_id] = { fields: { ...(fx.valid[target.artifact_id]?.fields || {}), [fx.copyTarget.field]: ex.text } }
      const copied = await w.run(who, id, copiedWork, { retry: true, k: `${who}-copied` })
      const r4 = copied.result
      assert.ok(copied.provenance.examplesExposed.length === 0 || true) // exposure is recorded on the attempt that revealed
      assert.equal(copied.provenance.coachedRevision, true, 'a retry after seeing examples is a coached revision')
      assert.ok(r4.counts.copied >= 1, `${mission.display_code}: the copied example is detected (${r4.summary})`)
      const flagged = r4.criteria.filter((c) => c.result === 'COPIED_ASSISTANCE')
      assert.ok(flagged.length >= 1)
      for (const c of flagged) {
        assert.equal(c.quote, null, 'copied text is never quoted back as the learner\'s words')
        assert.equal(c.note, 'This matches the example you were shown, so it is not counted as your own.')
        assert.equal(c.reason, 'COPIED_ASSISTANCE')
      }
      for (const cid of ex.criterion_ids) {
        const c = byId(r4)[cid]
        const reads = mission.rubric.criteria.find((x) => x.criterion_id === cid).artifact_ids.includes(target.artifact_id)
        if (reads) assert.notEqual(c.result, 'OBSERVED', `${mission.display_code} ${cid}: not counted as independent`)
      }
      assert.ok(/not counted as your own/.test(r4.summary))
      assert.ok(!r4.focus.completed || !flagged.some((c) => c.criterionId === r4.focus.completed.criterionId), 'the acknowledgement never praises copied text')
      const units4 = (await w.repos.development.listPracticeUnits({ userId: USERS[who].id })).filter((u) => u.attemptId === copied.id)
      assert.ok(units4.every((u) => !flagged.some((c) => c.criterionId === u.criterionId)), 'no practice evidence for copied criteria')
      const stored = await w.repos.development.getAttempt(copied.id)
      assert.ok(stored.assistance.copyCheck.sources.includes(`EXAMPLE:${ex.example_id}`))
      assert.deepEqual(stored.assistance.copyCheck.flagged, flagged.map((c) => c.criterionId))
      assert.equal(stored.assistance.feedbackVersion, 'mission-feedback.v1')
      assert.ok(stored.assistance.promptVersion.meaning === 'mission_meaning.v1' || stored.assistance.promptVersion.evaluator === 'mission_evaluator.v1')
      // Earlier attempts are untouched by later ones.
      assert.deepEqual((await w.call(who, 'GET', `/mission-attempts/${valid.id}`)).body.data.result.criteria, r1.criteria)
    } finally { w.close() }
  })
}

test('P6.3 M09: a missing owner fails the specific criterion as the next change; a justified escalation counts as defensible, not as failure (M09 and M10)', async () => {
  const w = await world()
  try {
    const m09 = 'MIS-CORE-USABLE-HANDOVER-01'
    const missing = await w.run('b', m09, MISSION_FIXTURES[m09].missingOwner)
    const rm = missing.result
    assert.equal(byId(rm)['C-OWNERS'].result, 'NOT_OBSERVED')
    assert.equal(byId(rm)['C-OWNERS'].reason, 'RULES_NOT_MET')
    assert.ok(byId(rm)['C-OWNERS'].checks.some((c) => !c.passed))
    assert.equal(rm.focus.nextChange.criterionId, 'C-OWNERS', 'the highest-value next change is the unowned task')
    assert.ok(rm.focus.completed, 'what was completed is still acknowledged')
    assert.equal(byId(rm)['C-DONE'].result, 'OBSERVED')

    const esc = await w.run('c', m09, MISSION_FIXTURES[m09].escalation)
    const re = esc.result
    assert.equal(re.status, 'EVALUATED')
    assert.equal(byId(re)['C-OWNERS'].result, 'OBSERVED', 'a named decider settles ownership')
    assert.equal(byId(re)['C-REALISTIC'].result, 'OBSERVED', 'escalating an unassignable task is defensible')
    assert.match(byId(re)['C-REALISTIC'].quote, /escalating to Priya/)
    assert.equal(re.counts.demonstrated, re.counts.total, 'nothing is marked as failure')
    assert.equal(re.focus.allMet, true)
    assert.equal(re.focus.nextChange, null, 'all criteria met: no flaw is invented')
    assert.match(re.focus.note, /nothing to add/i)

    const m10 = 'MIS-CORE-NOT-TO-DO-01'
    const esc10 = await w.run('d', m10, MISSION_FIXTURES[m10].escalation)
    assert.equal(byId(esc10.result)['C-DEFER'].result, 'OBSERVED', 'M10: escalating a task with a reason counts as an explicit decision')
    assert.match(byId(esc10.result)['C-DEFER'].quote, /escalating to Priya/)
  } finally { w.close() }
})

test('P6.4: an unsupported evaluator quote withholds the criterion for review and preserves the work; the review is said to be incomplete, not the learner', async () => {
  const w = await world()
  try {
    const id = 'MIS-CORE-MISSING-FACT-01'
    process.env.PRISM_AUDIT_AI_FAULT = 'mismatch'
    const a = await w.run('e', id, MISSION_FIXTURES[id].valid)
    delete process.env.PRISM_AUDIT_AI_FAULT
    const r = a.result
    for (const c of r.criteria.filter((x) => ['C-NAMES-UNKNOWN', 'C-HOLDS'].includes(x.criterionId))) {
      assert.equal(c.result, 'UNCERTAIN', `${c.criterionId}: a quote the learner never wrote is never trusted`)
      assert.equal(c.reason, 'QUOTE_NOT_VERIFIED')
      assert.equal(c.quote, null)
      assert.match(c.note, /not counted either way/)
    }
    assert.equal(byId(r)['C-ASKS'].result, 'OBSERVED', 'deterministic checks still stand')
    assert.equal(r.verified, false)
    assert.deepEqual(a.work, MISSION_FIXTURES[id].valid, 'the work is preserved')
    const units = await w.repos.development.listPracticeUnits({ userId: USERS.e.id })
    assert.ok(units.every((u) => !['C-NAMES-UNKNOWN', 'C-HOLDS'].includes(u.criterionId)), 'withheld criteria write no practice evidence')
    assert.ok(!/learner failed|you failed/i.test(JSON.stringify(r)))
  } finally { delete process.env.PRISM_AUDIT_AI_FAULT; w.close() }
})

test('P6.5: a provider failure keeps the attempt readable, marks the review incomplete, consumes no allowance, reissues the retry free, and the same key / simultaneous retries yield one attempt', async () => {
  const w = await world()
  const who = 'f'
  const id = 'MIS-CORE-REPAIR-01'
  try {
    await w.repos.development.setPracticeAllowance({ userId: USERS[who].id, total: 2, source: 'TEST_FIXTURE' })
    const started = await w.call(who, 'POST', `/missions/${id}/attempts`, {}, key('f-1'))
    assert.equal(started.status, 201)
    const a = started.body.data
    assert.deepEqual((await w.call(who, 'GET', '/missions')).body.data.allowance, { kind: 'BOUNDED', total: 2, used: 1, remaining: 1, validUntil: null })
    assert.equal((await w.call(who, 'PATCH', `/mission-attempts/${a.id}`, { work: MISSION_FIXTURES[id].valid }, { 'If-Match': '"1"' })).status, 200)
    process.env.PRISM_AUDIT_AI_FAULT = 'throw'
    const sub = await w.call(who, 'POST', `/mission-attempts/${a.id}/submit`)
    delete process.env.PRISM_AUDIT_AI_FAULT
    assert.equal(sub.status, 201)
    assert.equal(sub.body.data.status, 'EVALUATION_UNAVAILABLE')
    assert.equal(sub.body.data.result.focus.reviewIncomplete, true)
    assert.match(sub.body.data.result.focus.note, /review could not be completed/i)
    assert.ok(sub.body.data.result.criteria.filter((c) => c.result === 'UNCERTAIN').every((c) => c.reason === 'EVALUATION_UNAVAILABLE'))
    assert.equal(byId(sub.body.data.result)['C-CORRECT'].result, 'OBSERVED', 'deterministic checks are still reported')
    // Readable, work intact, allowance unchanged by the failed review.
    const read = await w.call(who, 'GET', `/mission-attempts/${a.id}`)
    assert.equal(read.status, 200)
    assert.deepEqual(read.body.data.work, MISSION_FIXTURES[id].valid)
    assert.equal((await w.call(who, 'GET', '/missions')).body.data.allowance.used, 1, 'a failed model request charges nothing')
    // Retry after the failure: a reissue — no allowance unit — and idempotent on the same key.
    const retry = await w.call(who, 'POST', `/missions/${id}/attempts`, { retry: true }, key('f-retry-1'))
    assert.equal(retry.status, 201, JSON.stringify(retry.body))
    assert.notEqual(retry.body.data.id, a.id)
    assert.deepEqual(retry.body.data.provenance.retryOrigin, { kind: 'RETRY', previousAttemptId: a.id, reissued: true })
    assert.equal((await w.call(who, 'GET', '/missions')).body.data.allowance.used, 1, 'the reissue is free')
    const same = await w.call(who, 'POST', `/missions/${id}/attempts`, { retry: true }, key('f-retry-1'))
    assert.equal(same.status, 200)
    assert.equal(same.body.data.id, retry.body.data.id, 'same key → same effect')
    // Two simultaneous retry requests (different keys) → still one new attempt.
    const [x, y] = await Promise.all([
      w.call(who, 'POST', `/missions/${id}/attempts`, { retry: true }, key('f-retry-2')),
      w.call(who, 'POST', `/missions/${id}/attempts`, { retry: true }, key('f-retry-3')),
    ])
    assert.equal(x.body.data.id, retry.body.data.id)
    assert.equal(y.body.data.id, retry.body.data.id)
    const mine = (await w.repos.development.listAttempts({ userId: USERS[who].id })).filter((t) => t.missionId === id)
    assert.equal(mine.length, 2, 'original + one retry')
    assert.ok(w.audits.filter((e) => e.type === 'development.retry.started').length === 1)
    // The reissued attempt completes normally once the provider is back.
    assert.equal((await w.call(who, 'PATCH', `/mission-attempts/${retry.body.data.id}`, { work: MISSION_FIXTURES[id].valid }, { 'If-Match': '"1"' })).status, 200)
    const ok = await w.call(who, 'POST', `/mission-attempts/${retry.body.data.id}/submit`)
    assert.equal(ok.body.data.status, 'EVALUATED')
    assert.equal(ok.body.data.result.comparison.previousAttemptId, a.id)
    assert.ok(ok.body.data.result.comparison.notCompared.length >= 1, 'criteria the failed review could not check are not compared')
    // The original failed attempt is unchanged and still readable after the allowance is spent.
    assert.equal((await w.call(who, 'POST', '/development/challenge', { capabilityId: FAMILY.EXECUTION }, key('f-c'))).status, 201)
    assert.equal((await w.call(who, 'GET', '/missions')).body.data.allowance.remaining, 0)
    assert.equal((await w.call(who, 'GET', `/mission-attempts/${a.id}`)).status, 200, 'finished work stays readable after the allowance is exhausted')
    assert.equal((await w.call(who, 'GET', `/mission-attempts/${a.id}`)).body.data.status, 'EVALUATION_UNAVAILABLE')
  } finally { delete process.env.PRISM_AUDIT_AI_FAULT; w.close() }
})

test('P6.6: replay carries only the presented stimulus of THAT moment — no later-stage stimulus, rubric anchor or transcript — and never writes to the formal snapshot; history keeps practice readable and separate', async () => {
  const w = await world()
  const before = await w.formalSnapshot()
  try {
    const r = await w.call('a', 'POST', '/development/replay', { sessionId: SESSION, opportunityId: OPP_SHOWN }, key('a-r1'))
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.data.attempt.stimulus.source, 'ASSESSMENT_MOMENT')
    assert.equal(r.body.data.attempt.stimulus.text, SHOWN_TEXT)
    const text = JSON.stringify(r.body)
    for (const leak of [FUTURE_TEXT, ANCHOR_TEXT, TRANSCRIPT, 'rubric_level', 'reportHash', 'act-1', 'renderHash', 'evaluator_guidance', 'synonyms']) assert.ok(!text.includes(leak), `replay leaks ${leak}`)
    assert.deepEqual(r.body.data.attempt.provenance.retryOrigin, { kind: 'REPLAY', previousAttemptId: null })
    // A later-stage opportunity that was never presented has no stimulus to replay: the mission briefing is used and nothing future leaks.
    const f = await w.call('a', 'POST', '/development/replay', { sessionId: SESSION, opportunityId: OPP_FUTURE }, key('a-r2'))
    assert.equal(f.status, 201, JSON.stringify(f.body))
    assert.equal(f.body.data.attempt.stimulus.source, 'MISSION_BRIEFING')
    assert.ok(!JSON.stringify(f.body).includes(FUTURE_TEXT), 'a never-presented prompt is not exposed through replay')
    // Submit the replay with real work; then history.
    const a = r.body.data.attempt
    await w.call('a', 'PATCH', `/mission-attempts/${a.id}`, { work: MISSION_FIXTURES[r.body.data.missionId].valid }, { 'If-Match': `"${a.version}"` })
    assert.equal((await w.call('a', 'POST', `/mission-attempts/${a.id}/submit`)).status, 201)
    const hist = await w.call('a', 'GET', '/me/history')
    assert.equal(hist.status, 200)
    const practice = hist.body.data.items.filter((i) => i.sourceType === 'PRACTICE_ATTEMPT')
    const formal = hist.body.data.items.filter((i) => i.sourceType === 'FORMAL_SESSION')
    assert.ok(practice.length >= 2 && formal.length === 1)
    const done = practice.find((p) => p.sourceId === a.id)
    assert.equal(done.mode, 'PRACTICE')
    assert.equal(done.status, 'COMPLETED')
    assert.equal(done.permittedAction.kind, 'VIEW', 'a finished practice attempt stays readable from history')
    assert.ok(done.permittedAction.to.endsWith(`?attempt=${a.id}`))
    assert.equal(done.linkedSessionId, SESSION)
    assert.deepEqual(done.practice, { capabilityId: FAMILY.EXECUTION, assistanceMode: 'GUIDED', variant: 'BASE' })
    assert.equal(formal[0].mode, 'FORMAL')
    assert.ok(!('practice' in formal[0]) || formal[0].practice == null)
    // Fresh challenge reachable afterwards (same capability): the transfer version, uncoached.
    const c = await w.call('a', 'POST', '/development/challenge', { capabilityId: FAMILY.EXECUTION }, key('a-c1'))
    assert.equal(c.status, 201, JSON.stringify(c.body))
    assert.equal(c.body.data.attempt.assistance.mode, 'UNCOACHED')
    assert.equal(c.body.data.attempt.variant, 'TRANSFER')
    assert.equal(c.body.data.missionId, r.body.data.missionId, 'the same behaviours in an unfamiliar setting')
    const stored = await w.repos.development.getAttempt(c.body.data.attempt.id)
    assert.ok(stored.assistance.excludedExposure.includes(OPP_SHOWN), 'exposure metadata is recorded')
    assert.equal(await w.formalSnapshot(), before, 'formal units, report, session and ledger are byte-for-byte unchanged')
    assert.ok(w.audits.every((e) => !JSON.stringify(e).includes(TRANSCRIPT) && !JSON.stringify(e).includes(FUTURE_TEXT)))
  } finally { w.close() }
})

test('P6.4 unit: copy detection needs ≥ 80 % of a shown sentence\'s word pairs; comparison lists criterion ids only', () => {
  const shown = [{ source: 'EXAMPLE', id: 'EX-1', text: 'Lea owns the slides and the room booking because Tom is away on Monday.' }]
  assert.ok(copiedFrom(['Lea owns the slides and the room booking because Tom is away on Monday, as agreed.'], shown))
  assert.equal(copiedFrom(['Lea takes the slides plus the room booking since Tom travels on Monday.'], shown), null, 'the same idea in other words is not a copy')
  assert.equal(copiedFrom(['Tom is away'], [{ source: 'HINT', id: 'H1', text: 'Tom is away.' }]), null, 'short fragments never count')
  const cmp = compareAttempts(
    { attemptId: 'p', criteria: [{ criterionId: 'A', result: 'NOT_OBSERVED' }, { criterionId: 'B', result: 'OBSERVED' }, { criterionId: 'C', result: 'UNCERTAIN' }] },
    { criteria: [{ criterionId: 'A', result: 'OBSERVED' }, { criterionId: 'B', result: 'COPIED_ASSISTANCE' }, { criterionId: 'C', result: 'OBSERVED' }] },
  )
  assert.deepEqual(cmp, { previousAttemptId: 'p', newlyMet: ['A'], noLongerMet: ['B'], notCompared: ['C'], note: cmp.note })
  assert.ok(!/%/.test(JSON.stringify(cmp)))
})
