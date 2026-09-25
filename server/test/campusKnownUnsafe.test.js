// Prism Campus C0.08 — known-unsafe behaviours captured as `todo` regression
// tests. Each assertion describes the FAIL-CLOSED behaviour required by spec §33
// and currently fails; Phase 2 (C2.10) removes every `todo` and makes them pass.

import '../test-support/isolatedDataDir.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import express from 'express'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
const read = (rel) => readFileSync(join(REPO, rel), 'utf8')
// In-memory store paths only: these suites must never write to a real database.
delete process.env.DATABASE_URL

async function withApp(mount, router, fn) {
  const app = express()
  app.use(express.json())
  app.use(mount, router)
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`)
  } finally {
    server.close()
  }
}

test('evidence write path: a unit without candidate action/provenance is INSUFFICIENT_EVIDENCE with rubric_level null', { todo: 'fixed in Phase 2 (C2.02)' }, async () => {
  const { default: evidenceGraph } = await import('../lib/evidenceGraph.js')
  const unit = await evidenceGraph.recordEvidenceUnit({ session_id: randomUUID(), capability_id: 'CAP-L1-REASONING' })
  assert.equal(unit.rubric_level, null, 'no default rubric level')
  assert.equal(unit.evidence_status, 'INSUFFICIENT_EVIDENCE')
  assert.notEqual(unit.confidence_status, 'VERIFIED_CONSENSUS', 'never a default verification')
})

test('evidence schema: a campus migration drops the VERIFIED_CONSENSUS default and makes rubric_level nullable', { todo: 'fixed in Phase 2 (C2.01)' }, () => {
  const dir = join(REPO, 'server', 'db', 'migrations')
  const campus = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f) && !f.endsWith('.down.sql') && Number(f.slice(0, 4)) >= 25)
  const sql = campus.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
  assert.match(sql, /confidence_status\s+DROP\s+DEFAULT/i)
  assert.match(sql, /rubric_level\s+DROP\s+NOT\s+NULL/i)
})

test('reportV2: an empty session yields no fallback scores, quotes, archetype or precision', { todo: 'fixed in Phase 2 (C2.06)' }, async () => {
  const { buildStudentReportV2 } = await import('../lib/reportV2.js')
  const report = await buildStudentReportV2(randomUUID(), { history: [] }, {})
  for (const cap of report.section3_layer1TransferableCapabilities || []) {
    assert.equal(cap.score ?? null, null, `${cap.id} has no fabricated score`)
    assert.equal(cap.rubricLevel ?? null, null, `${cap.id} has no fabricated level`)
  }
  assert.equal(report.section1_executiveSummary?.archetype ?? null, null, 'no fixed archetype')
  assert.equal(report.section2_methodologicalIntegrity?.sem ?? null, null, 'no fixed precision')
  assert.deepEqual(report.section9_strengthsAndGrowth?.strengths ?? [], [], 'no invented strengths')
})

test('role exploration: no default interest vector and no numeric match score', { todo: 'fixed in Phase 2 (C2.07)' }, async () => {
  const { default: router } = await import('../routes/jobFamilies.js')
  await withApp('/api/job-families', router, async (base) => {
    const r = await fetch(`${base}/api/job-families/explore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const body = await r.json()
    for (const rec of body.recommendations || []) {
      assert.equal(rec.composite_score, undefined, 'no numeric composite affinity')
      for (const why of rec.why_this_role_appeared || rec.whyShown || []) {
        assert.notEqual(why.type, 'VOCATIONAL_INTEREST', 'no interest reason without supplied interests')
      }
    }
  })
})

test('frontend: Explore mode has no default RIASEC vector and does not auto-evaluate', { todo: 'fixed in Phase 2 (C2.12)' }, () => {
  const src = read('src/pages/ExploreMode.jsx')
  assert.doesNotMatch(src, /E:\s*0\.\d/, 'no pre-filled interest scores')
  assert.doesNotMatch(src, /useEffect\(\(\)\s*=>\s*\{\s*runAffinityEvaluation\(\)/, 'no evaluate-on-mount')
})

test('frontend: the assessment workspace hard-codes no scenario or job family', { todo: 'fixed in Phase 2 (C2.14)' }, () => {
  const src = read('src/pages/AssessmentWorkspace.jsx')
  assert.doesNotMatch(src, /prism-sim-mkt-l1|STUDAI-JF-MKT-L1|Lumina/)
})

test('frontend: the assessment workspace never fabricates stakeholder dialogue', { todo: 'fixed in Phase 2 (C2.14)' }, () => {
  const src = read('src/pages/AssessmentWorkspace.jsx')
  assert.doesNotMatch(src, /Fallback turn|speaker:\s*'(Elena|Marcus)/)
})

test('scenario lookup: unknown ids fail explicitly instead of falling back to the marketing scenario', { todo: 'fixed in Phase 2 (C2.05)' }, async () => {
  const { getScenarioByAssessmentId } = await import('../lib/scenarioBank.js')
  assert.equal(getScenarioByAssessmentId('no-such-assessment') ?? null, null, 'bank lookup of an unknown id returns nothing')
  const src = read('server/lib/reportV2.js')
  assert.doesNotMatch(src, /\|\|\s*['"]prism-sim-mkt-l1['"]|\|\|\s*\{\s*title:\s*['"]Lumina/, 'reportV2 has no marketing fallback')
})

async function artifactsFor(sid) {
  const { default: router } = await import('../routes/assessment.js')
  return withApp('/api/assessment', router, async (base) => {
    const r = await fetch(`${base}/api/assessment/artifacts/${sid}`)
    return r.json().catch(() => ({}))
  })
}

test('artifacts endpoint: an unknown session never receives the marketing scenario', { todo: 'fixed in Phase 2 (C2.05)' }, async () => {
  const body = await artifactsFor(randomUUID())
  assert.equal(body.scenarioTitle ?? null, null, 'no scenario title for an unknown session')
  assert.deepEqual(body.artifacts ?? [], [], 'no scenario artifacts for an unknown session')
})

test('artifacts endpoint: a test-mkt-session- prefix does not revive the marketing scenario', { todo: 'fixed in Phase 2 (C2.05)' }, async () => {
  const body = await artifactsFor(`test-mkt-session-${randomUUID()}`)
  assert.equal(body.scenarioTitle ?? null, null, 'no scenario title for a prefixed unknown session')
  assert.deepEqual(body.artifacts ?? [], [], 'no scenario artifacts for a prefixed unknown session')
})

test('missions: a long hypothesis never yields Level 4 or unobserved behaviours', { todo: 'fixed in Phase 2 (C2.09)' }, async () => {
  const { default: router } = await import('../routes/missions.js')
  await withApp('/api/missions', router, async (base) => {
    const r = await fetch(`${base}/api/missions/MIS-MKT-EXP-01/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateInputs: { hypothesis: 'x'.repeat(40), budgetAllocated: true } }),
    })
    const body = await r.json()
    assert.equal(body.levelAchieved ?? null, null, 'no rubric level from text length')
    assert.deepEqual(body.observableBehaviors ?? [], [], 'no behaviours without a matching check')
  })
})
