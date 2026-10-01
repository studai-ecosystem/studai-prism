// Prism Campus C2.16 — Journey D (spec §43) at API level: a session with
// incomplete evidence must yield a report with no fabricated numbers, levels,
// quotes, strengths or role matches, and every unknown input fails explicitly.

import '../test-support/isolatedDataDir.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import express from 'express'

delete process.env.DATABASE_URL

const { PRE_APPROVED_SCENARIOS } = await import('../lib/scenarioBank.js')
const { createSession } = await import('../lib/store.js')
const { default: evidenceGraph } = await import('../lib/evidenceGraph.js')
const { default: assessmentRouter } = await import('../routes/assessment.js')
const { default: jobFamiliesRouter } = await import('../routes/jobFamilies.js')
const { default: missionsRouter } = await import('../routes/missions.js')

const scenarioId = Object.keys(PRE_APPROVED_SCENARIOS)[0]

async function withApp(fn) {
  const app = express()
  app.use(express.json())
  app.use('/api/assessment', assessmentRouter)
  app.use('/api/job-families', jobFamiliesRouter)
  app.use('/api/missions', missionsRouter)
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`)
  } finally {
    server.close()
  }
}

const json = (base, path, init = {}) => fetch(`${base}${path}`, {
  ...init,
  headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))

// Any key that would carry a fabricated number on a candidate surface.
const NUMERIC_CLAIM_KEYS = /^(score|overall|percent\w*|percentile|sem|ci\w*|confidence\w*|match\w*|affinity\w*|readiness\w*|composite\w*|weight|rubricLevel|levelAchieved)$/i

function numericClaims(value, path = '$', out = []) {
  if (Array.isArray(value)) value.forEach((v, i) => numericClaims(v, `${path}[${i}]`, out))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (NUMERIC_CLAIM_KEYS.test(k) && v !== null && v !== undefined) out.push(`${path}.${k}`)
      numericClaims(v, `${path}.${k}`, out)
    }
  } else if (typeof value === 'string' && /\d+(\.\d+)?\s*%|±\s*\d/.test(value)) out.push(`${path} (text precision)`)
  return out
}

async function incompleteSession() {
  const sessionId = randomUUID()
  await createSession(sessionId, {
    scenarioId,
    history: [
      { role: 'assistant', content: 'Here is the situation.' },
      { role: 'user', content: '[Candidate]: I would first check which channel changed.' },
    ],
  })
  // Two units only, one missing provenance: never enough for any claim.
  await evidenceGraph.recordEvidenceUnit({
    session_id: sessionId, capability_id: 'CAP-L1-REASONING', source_turn: 1,
    candidate_action: { dialogue_excerpt: 'I would first check which channel changed.' },
    provenance: { source: 'JUDGE_PANEL' }, rubric_level: 4, judge_agreement: { agreement: 0.9 },
  })
  await evidenceGraph.recordEvidenceUnit({ session_id: sessionId, capability_id: 'CAP-L1-COMMUNICATION', source_turn: 1, rubric_level: 5 })
  return sessionId
}

test('Journey D: incomplete evidence → report V2 is INSUFFICIENT with no numbers, strengths or matches', async () => {
  const sessionId = await incompleteSession()
  await withApp(async (base) => {
    const { status, body } = await json(base, `/api/assessment/report/${sessionId}/v2`)
    assert.equal(status, 200)
    assert.equal(body.status, 'INSUFFICIENT_EVIDENCE')
    assert.equal(body.section1_executiveSummary.summaryStatus, 'INSUFFICIENT_EVIDENCE')
    assert.deepEqual(numericClaims(body), [], 'no score/percent/precision keys or text')
    for (const cap of [...body.section3_layer1TransferableCapabilities, ...body.section4_layer2RoleCapabilities]) {
      assert.notEqual(cap.status, 'SUFFICIENT', `${cap.id} is not sufficient`)
      if (cap.status !== 'PROVISIONAL') assert.equal(cap.level, null, `${cap.id} has no level`)
      assert.ok(Array.isArray(cap.statusReasons) && cap.statusReasons.length > 0, `${cap.id} names why`)
    }
    const reasoning = body.section3_layer1TransferableCapabilities.find((c) => c.id === 'CAP-L1-REASONING')
    assert.equal(reasoning.status, 'INSUFFICIENT_EVIDENCE')
    assert.ok(reasoning.statusReasons.includes('BELOW_MINIMUM_EVIDENCE_UNITS'))
    assert.deepEqual(body.section9_strengthsAndGrowth.strengths, [])
    assert.deepEqual(body.section9_strengthsAndGrowth.growthOpportunities, [])
    assert.deepEqual(body.section7_careerExploration.roles, [], 'no role matches from insufficient evidence')
    assert.deepEqual(body.section11_developmentMissions, [])
    for (const c of body.claims) assert.equal(c.status, 'INSUFFICIENT')
    for (const e of body.section8_roleNeighborhood.edges) assert.equal(e.weight, undefined, 'no edge weights')
  })
})

test('Journey D: employee report carries no readiness percentages', async () => {
  const sessionId = await incompleteSession()
  await withApp(async (base) => {
    const { status, body } = await json(base, `/api/assessment/report/${sessionId}/employee`)
    assert.equal(status, 200)
    assert.deepEqual(numericClaims(body), [])
    for (const cap of body.targetRoleEvaluation.capabilityStatus) assert.notEqual(cap.status, 'SUFFICIENT')
  })
})

test('Journey D: a work-material save is acknowledged only when it happened', async () => {
  const sessionId = randomUUID()
  await createSession(sessionId, { scenarioId: 'prism-sim-mkt-l1', history: [{ role: 'assistant', content: '{}' }] })
  await withApp(async (base) => {
    const unknown = await json(base, `/api/assessment/artifacts/${sessionId}`, { method: 'POST', body: JSON.stringify({ artifactId: 'NO-SUCH-ARTIFACT', updates: { a: 1 } }) })
    assert.equal(unknown.status, 404)
    assert.equal(unknown.body.code, 'ARTIFACT_NOT_FOUND')
    const { body: listed } = await json(base, `/api/assessment/artifacts/${sessionId}`)
    const budget = listed.artifacts.find((a) => a.type === 'BUDGET_MODELER')
    const saved = await json(base, `/api/assessment/artifacts/${sessionId}`, { method: 'POST', body: JSON.stringify({ artifactId: budget.artifactId, updates: { note: 'synthetic' }, notes: 'Synthetic reasoning' }) })
    assert.equal(saved.status, 200)
    assert.equal(saved.body.ok, true)
    const units = await evidenceGraph.getEvidenceUnits(sessionId)
    assert.equal(units.length, 1)
    assert.equal(units[0].evidence_status, 'INSUFFICIENT_EVIDENCE', 'an artifact edit is an unjudged action')
    assert.equal(units[0].rubric_level, null)
  })
})

test('Journey D: unknown sessions and scenarios fail explicitly', async () => {
  await withApp(async (base) => {
    assert.equal((await json(base, `/api/assessment/report/${randomUUID()}/v2`)).status, 404)
    assert.equal((await json(base, `/api/assessment/report/${randomUUID()}/employee`)).status, 404)
    const artifacts = await json(base, `/api/assessment/artifacts/${randomUUID()}`)
    assert.equal(artifacts.status, 404)
    assert.equal(artifacts.body.code, 'SESSION_NOT_FOUND')
  })
})

test('Journey D: role exploration with no input shows no interest reasons and no numbers', async () => {
  await withApp(async (base) => {
    const { status, body } = await json(base, '/api/job-families/explore', { method: 'POST', body: '{}' })
    assert.equal(status, 200)
    assert.deepEqual(numericClaims(body), [])
    for (const rec of body.recommendations) {
      assert.equal(rec.whyShown.some((w) => w.type === 'SELF_REPORTED_INTEREST'), false)
    }
    // A client-supplied capability profile is never trusted.
    const forged = await json(base, '/api/job-families/explore', {
      method: 'POST',
      body: JSON.stringify({ capabilityProfile: { 'CAP-L1-REASONING': { status: 'SUFFICIENT', level: { band: 'STRONG' } } } }),
    })
    for (const rec of forged.body.recommendations) {
      assert.equal(rec.whyShown.some((w) => w.type === 'DEMONSTRATED_CAPABILITY'), false)
    }
    const bad = await json(base, '/api/job-families/explore', { method: 'POST', body: JSON.stringify({ candidateInterests: { R: 'high' } }) })
    assert.equal(bad.status, 422)
    const selfReported = await json(base, '/api/job-families/explore', { method: 'POST', body: JSON.stringify({ candidateInterests: { E: 1, C: 0.5 } }) })
    assert.equal(selfReported.body.basis, 'SELF_REPORTED_INTERESTS')
    assert.deepEqual(numericClaims(selfReported.body), [])
  })
})

test('Journey D: practice missions return practice feedback only, never a level', async () => {
  await withApp(async (base) => {
    const unknown = await json(base, '/api/missions/NO-SUCH-MISSION/submit', { method: 'POST', body: JSON.stringify({ candidateInputs: {} }) })
    assert.equal(unknown.status, 404)
    const { body } = await json(base, '/api/missions/MIS-MKT-EXP-01/submit', {
      method: 'POST', body: JSON.stringify({ candidateInputs: { hypothesis: 'x'.repeat(200) } }),
    })
    assert.equal(body.evidenceType, 'PRACTICE')
    assert.equal(body.levelAchieved, undefined)
    assert.equal(body.observableBehaviors, undefined)
    assert.deepEqual(numericClaims(body), [])
  })
})
