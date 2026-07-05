// Track 1 gate tests — Skill Velocity (dark).
//
// Gates: 4-point synthetic trajectory renders correctly with uncertainty
// bands; 2 points = no trend claim; 1 point = none; cross-scale comparison
// blocked without an equating transform; GROWTH.md documents the exact
// rules; zero user-facing velocity marketing (grep).

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  isVelocityEnabled, thetaFromReport, growthFit, trendDecision, velocityView,
  TREND_Z, MIN_POINTS_FOR_TREND, COHORT_MIN_FOR_PERCENTILE,
} from '../lib/velocity.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

test('T1: velocity is dark by default (flag off => endpoint invisible)', async () => {
  delete process.env.PRISM_VELOCITY
  assert.equal(isVelocityEnabled(), false)
  const { buildApp } = await import('../app.js')
  const app = buildApp()
  const server = app.listen(0)
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/assessment/velocity`)
    assert.equal(res.status, 404)
  } finally {
    server.close()
  }
})

// ── T1.1: θ extraction from reports ──────────────────────────────────────────
test('T1.1: panel report yields per-dimension theta + SE from vote dispersion', () => {
  const report = {
    scores: { criticalThinking: 75, communication: 50, collaboration: 60, problemSolving: 80, aiDigitalFluency: 40, overall: 63 },
    reliability: { perDimensionBand: { criticalThinking: 10, communication: 25, collaboration: 5, problemSolving: 8, aiDigitalFluency: 12 } },
  }
  const t = thetaFromReport(report)
  assert.equal(t.source, 'panel')
  assert.equal(t.dimensions.criticalThinking.theta, 3)
  assert.equal(t.dimensions.communication.se, 1) // 25/25
  assert.equal(t.dimensions.collaboration.se, 0.25, 'SE floor prevents impossible precision')
  assert.ok(t.overall.theta > 2.4 && t.overall.theta < 2.7)
  // Executive posterior takes precedence for the overall.
  const exec = thetaFromReport({ ...report, theta: { mean: 2.8, var: 0.04 } })
  assert.equal(exec.source, 'ledger')
  assert.equal(exec.overall.theta, 2.8)
  assert.ok(exec.overall.se >= 0.25)
  assert.equal(thetaFromReport(null), null)
})

// ── T1.2: weighted growth fit ────────────────────────────────────────────────
test('T1.2: measurement-error weighting — noisy points influence the slope less', () => {
  // Perfect +0.5/attempt line.
  const clean = growthFit([1, 2, 3, 4].map((x) => ({ x, theta: 1 + 0.5 * x, se: 0.3 })))
  assert.ok(Math.abs(clean.slope - 0.5) < 1e-9)
  assert.ok(clean.slopeSe > 0)
  // Same line + one wild outlier: trusted (small SE) vs distrusted (huge SE).
  const pts = [1, 2, 3].map((x) => ({ x, theta: 1 + 0.5 * x, se: 0.3 }))
  const trusted = growthFit([...pts, { x: 4, theta: 0.2, se: 0.3 }])
  const distrusted = growthFit([...pts, { x: 4, theta: 0.2, se: 5 }])
  assert.ok(Math.abs(distrusted.slope - 0.5) < Math.abs(trusted.slope - 0.5), 'high-SE outlier pulls less')
  assert.equal(growthFit([{ x: 1, theta: 2, se: 0.3 }]), null)
  assert.equal(growthFit([]), null)
})

// ── T1.3 gates: 1 point / 2 points / >=3 points ─────────────────────────────
test('T1.3: honesty ladder — none / need_more / trend-or-flat', () => {
  const p = (attemptNo, theta, se = 0.3, scaleVersion = 'prism-scale-v1') => ({ attemptNo, theta, se, scaleVersion })
  assert.equal(trendDecision([]).state, 'none')
  const one = trendDecision([p(1, 2.0)])
  assert.equal(one.state, 'single')
  assert.ok(!JSON.stringify(one).match(/grow|trend up|improv/i), '1 point carries no trend language')
  const two = trendDecision([p(1, 2.0), p(2, 2.6)])
  assert.equal(two.state, 'need_more')
  assert.ok(two.message.includes('after your next assessment'))
  assert.ok(!('fit' in two), '2 points never expose a slope')
  // 4 clean rising points → trend, with the documented threshold.
  const rising = trendDecision([p(1, 1.0), p(2, 1.5), p(3, 2.0), p(4, 2.5)])
  assert.equal(rising.state, 'trend')
  assert.ok(Math.abs(rising.fit.slope - 0.5) < 1e-6)
  assert.equal(rising.z, TREND_Z)
  assert.ok(Math.abs(rising.fit.slope) > TREND_Z * rising.fit.slopeSe)
  // Flat/noisy points → within measurement uncertainty, no growth claim.
  const flat = trendDecision([p(1, 2.0, 0.6), p(2, 2.1, 0.6), p(3, 1.9, 0.6), p(4, 2.05, 0.6)])
  assert.equal(flat.state, 'flat')
  assert.ok(flat.message.includes('within measurement uncertainty'))
  assert.equal(MIN_POINTS_FOR_TREND, 3)
  assert.equal(COHORT_MIN_FOR_PERCENTILE, 20)
})

// ── T1.4: equating dependency ────────────────────────────────────────────────
test('T1.4: cross-scale comparison is blocked without an equating transform', () => {
  const entries = [
    { attemptNo: 1, theta: 1.5, se: 0.3, scaleVersion: 'prism-scale-v1' },
    { attemptNo: 2, theta: 2.0, se: 0.3, scaleVersion: 'prism-scale-v1' },
    { attemptNo: 3, theta: 2.5, se: 0.3, scaleVersion: 'prism-scale-v2' }, // future scale, no transform
  ]
  const blocked = trendDecision(entries)
  assert.equal(blocked.state, 'not_comparable')
  assert.ok(blocked.message.includes('no equating transform'))
  assert.ok(!('fit' in blocked), 'no trend computed across unequated scales')
  // With a transform on record, comparison is allowed again.
  const allowed = trendDecision(entries, { equatingTransforms: { 'prism-scale-v2->prism-scale-v1': (t) => t } })
  assert.notEqual(allowed.state, 'not_comparable')
})

// ── Gate: 4-session synthetic trajectory renders correctly ───────────────────
test('T1 gate: synthetic 4-session candidate renders trajectory + bands; overall trend correct', () => {
  const rows = [1, 2, 3, 4].map((n) => ({
    attempt_no: n,
    scale_version: 'prism-scale-v1',
    completed_at: `2026-0${n}-01`,
    is_synthetic: true, // RULE 3 — the demo candidate is flagged
    final_theta: {
      source: 'panel',
      overall: { theta: 1 + 0.4 * n, se: 0.28 },
      dimensions: { criticalThinking: { theta: 1 + 0.5 * n, se: 0.3 }, communication: { theta: 2, se: 0.3 } },
    },
  }))
  const view = velocityView(rows)
  assert.equal(view.attempts.length, 4)
  assert.ok(view.attempts.every((a) => a.isSynthetic))
  assert.equal(view.overall.points.length, 4)
  assert.ok(view.overall.points.every((pt) => Number.isFinite(pt.se)), 'uncertainty bands present')
  assert.equal(view.overall.decision.state, 'trend')
  assert.equal(view.dimensions.criticalThinking.decision.state, 'trend')
  assert.equal(view.dimensions.communication.decision.state, 'flat', 'flat dimension makes no claim')
  assert.equal(view.dimensions.problemSolving.decision.state, 'none', 'missing dimension makes none')
  // 2-attempt candidate: explicit need_more everywhere.
  const two = velocityView(rows.slice(0, 2))
  assert.equal(two.overall.decision.state, 'need_more')
})

// ── Gate: GROWTH.md documents the enforced rules ─────────────────────────────
test('T1 gate: GROWTH.md exists and documents model, N and threshold', async () => {
  const doc = await readFile(join(__dirname, '..', 'psychometrics', 'GROWTH.md'), 'utf-8')
  for (const required of ['weighted', '1/SE', '1.96', 'N ≥ 20', 'Trend available after your next assessment', 'not_comparable', 'is_synthetic']) {
    assert.ok(doc.includes(required), `GROWTH.md documents: ${required}`)
  }
})

// ── Gate: zero user-facing velocity marketing ────────────────────────────────
test('T1 gate: no velocity marketing anywhere in the client (grep)', async () => {
  const banned = /skill velocity|growth percentile|velocity report|measure your growth|growth certified/i
  const walk = async (dir) => {
    const out = []
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) out.push(...(await walk(p)))
      else if (/\.(jsx|js|html)$/.test(entry.name)) out.push(p)
    }
    return out
  }
  for (const f of await walk(join(__dirname, '..', '..', 'src'))) {
    const text = await readFile(f, 'utf-8')
    assert.ok(!banned.test(text), `velocity marketing found in ${f}`)
  }
})
