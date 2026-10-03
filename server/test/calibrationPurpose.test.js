// T21 calibration versus context: the legacy pre-assessment difficulty
// calibration and the formal session contract are separate purposes with
// separate wording and payload fields. The calibration response says
// purpose CALIBRATION with the "not part of your assessment context" label;
// every session contract says purpose FORMAL and carries no tier; a
// Director-driven universal (draft) run refuses a calibration payload.
import '../test-support/isolatedDataDir.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import express from 'express'

delete process.env.DATABASE_URL
process.env.NODE_ENV = 'test'
process.env.PRISM_DRAFT_CONTENT = 'true'

const { createSession, getCalibration } = await import('../lib/store.js')
const { default: assessmentRouter, CALIBRATION_PURPOSE, CALIBRATION_LABEL, CALIBRATION_PROMPT, SCENARIOS } = await import('../routes/assessment.js')
const { buildSessionContract } = await import('../domain/assessments/sessionContract.js')
const { CORE_TEAMREADY_A } = await import('../domain/assessments/universalForm.js')
const { draftBankScenarios } = await import('../domain/assessments/draftSegments.js')

async function withApp(fn) {
  const app = express()
  app.use(express.json())
  app.use('/api/assessment', assessmentRouter)
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  try { return await fn(`http://127.0.0.1:${server.address().port}`) } finally { server.close() }
}
const post = (base, path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))

test('calibration payload: purpose CALIBRATION, distinct label, prompt; stored with its purpose', async () => {
  assert.equal(CALIBRATION_PURPOSE, 'CALIBRATION')
  assert.equal(CALIBRATION_LABEL, 'Difficulty calibration (not part of your assessment context)')
  await withApp(async (base) => {
    const sessionId = randomUUID()
    await createSession(sessionId, { scenarioId: SCENARIOS[0].id, history: [] })
    const r = await post(base, '/api/assessment/calibrate', { sessionId, answer: 'I once had to choose between two suppliers with incomplete data. I compared what each could guarantee and picked the one with the clearer fallback; in hindsight I would have asked for a trial first.' })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.purpose, 'CALIBRATION')
    assert.equal(r.body.label, CALIBRATION_LABEL)
    assert.equal(r.body.prompt, CALIBRATION_PROMPT)
    assert.ok(['foundational', 'intermediate', 'advanced'].includes(r.body.tier))
    assert.equal((await getCalibration(sessionId))?.purpose, 'CALIBRATION')
    assert.equal((await post(base, '/api/assessment/calibrate', {})).status, 400)
  })
})

test('a universal (draft) run has no calibration step: 409 CALIBRATION_NOT_APPLICABLE, nothing stored', async () => {
  await withApp(async (base) => {
    const sessionId = randomUUID()
    await createSession(sessionId, { scenarioId: CORE_TEAMREADY_A.id, history: [] })
    const r = await post(base, '/api/assessment/calibrate', { sessionId, answer: 'A long enough calibration answer that would otherwise produce a tier for a legacy run.' })
    assert.equal(r.status, 409, JSON.stringify(r.body))
    assert.equal(r.body.code, 'CALIBRATION_NOT_APPLICABLE')
    assert.equal(r.body.purpose, 'CALIBRATION')
    assert.equal(await getCalibration(sessionId), null)
  })
})

test('session contract: purpose FORMAL, no tier or calibration field, wording differs from the calibration label', () => {
  const scenarios = { generalScenarios: [], bankScenarios: draftBankScenarios() }
  const catalog = { definitions: [{ id: CORE_TEAMREADY_A.id, title: CORE_TEAMREADY_A.title, measures: [] }], forms: [{ id: 'f', definitionId: CORE_TEAMREADY_A.id, scenarioId: CORE_TEAMREADY_A.id }] }
  const contract = buildSessionContract({
    session: { sessionId: 's1', scenarioId: CORE_TEAMREADY_A.id, history: [], artifacts: [], startedAt: Date.now() }, hasReport: false, engineStatus: 'IDLE', scope: 'PERSONAL',
    catalog, scenarios, limitMs: 25 * 60000, now: new Date(),
  })
  assert.equal(contract.purpose, 'FORMAL')
  const text = JSON.stringify(contract)
  assert.ok(!/"tier"|calibrat|theta/i.test(text), 'no difficulty-calibration payload in the formal contract')
  assert.ok(!text.includes(CALIBRATION_LABEL))
  assert.notEqual(contract.purpose, CALIBRATION_PURPOSE)
})
