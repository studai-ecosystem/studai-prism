// Track 6 gate tests — study runner.
//
// Local (no-DB) coverage: weighted-kappa golden values, deterministic +
// balanced arm assignment, IRR-gate logic, registry definitions vs protocol
// docs. DB behaviors (immutability triggers, append-only results, seed
// idempotence) are DB-gated and verified against a real Postgres.

import test from 'node:test'
import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { quadraticWeightedKappa, kappaFromLevelMaps } from '../lib/kappa.js'
import {
  PREREGISTERED_STUDIES,
  TRAINING_REFS,
  armFor,
  evaluateTrainingKappa,
  TRAINING_KAPPA_THRESHOLD,
} from '../lib/studies.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIMS = ['criticalThinking', 'communication', 'collaboration', 'problemSolving', 'aiDigitalFluency']

// ── weighted kappa ────────────────────────────────────────────────────────────
test('T6.3: kappa — perfect agreement is 1', () => {
  assert.equal(quadraticWeightedKappa([0, 1, 2, 3, 4, 2, 3], [0, 1, 2, 3, 4, 2, 3]), 1)
})

test('T6.3: kappa — chance-level constant disagreement is 0', () => {
  assert.equal(quadraticWeightedKappa([0, 0, 0, 0], [4, 4, 4, 4]), 0)
})

test('T6.3: kappa — symmetric, NA-excluding, and monotone in disagreement', () => {
  const a = [0, 1, 2, 3, 4, 0, 1, 2, 3, 4]
  const close = [0, 1, 2, 3, 4, 1, 2, 3, 4, 3] // off-by-one on half
  const far = [4, 3, 2, 1, 0, 4, 3, 2, 1, 0] // reversed
  const kClose = quadraticWeightedKappa(a, close)
  const kFar = quadraticWeightedKappa(a, far)
  assert.equal(kClose, quadraticWeightedKappa(close, a), 'symmetry')
  assert.ok(kClose > kFar, 'closer ratings → higher kappa')
  assert.ok(kClose > 0.5 && kClose < 1)
  assert.ok(kFar < 0)
  // NA pairs are excluded pairwise, not zero-filled.
  assert.equal(quadraticWeightedKappa([0, 'NA', 2], [0, 3, 2]), 1)
  assert.equal(quadraticWeightedKappa(['NA'], ['NA']), null, 'no scorable pairs → null')
})

test('T6.3: kappaFromLevelMaps aligns dimensions across items', () => {
  const a = [{ criticalThinking: 3, communication: 2 }, { criticalThinking: 1, communication: 4 }]
  const b = [{ criticalThinking: 3, communication: 2 }, { criticalThinking: 1, communication: 4 }]
  assert.equal(kappaFromLevelMaps(a, b, ['criticalThinking', 'communication']), 1)
})

// ── IRR gate ─────────────────────────────────────────────────────────────────
test('T6.3: IRR gate qualifies at/above threshold and excludes below it', () => {
  const refs = TRAINING_REFS.map((t) => t.reference_levels)
  const perfect = evaluateTrainingKappa(refs, refs, DIMS)
  assert.equal(perfect.kappa, 1)
  assert.ok(perfect.qualified)

  // A rater who calls everything "2" has no discrimination — must not qualify.
  const flat = refs.map(() => ({ criticalThinking: 2, communication: 2, collaboration: 2, problemSolving: 2, aiDigitalFluency: 2 }))
  const bad = evaluateTrainingKappa(flat, refs, DIMS)
  assert.ok(bad.kappa === null || bad.kappa < TRAINING_KAPPA_THRESHOLD)
  assert.ok(!bad.qualified)
})

// ── A/B assignment ───────────────────────────────────────────────────────────
test('T6.2: arm assignment is deterministic and both arms occur across 50 sessions', () => {
  const studyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const counts = { executive: 0, lite: 0 }
  for (let i = 0; i < 50; i++) {
    const sid = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
    const arm1 = armFor(studyId, sid)
    const arm2 = armFor(studyId, sid)
    assert.equal(arm1, arm2, 'assignment is deterministic (retry-safe, non-flippable)')
    counts[arm1]++
  }
  assert.ok(counts.executive >= 10 && counts.lite >= 10, `both arms populated: ${JSON.stringify(counts)}`)
})

// ── registry ─────────────────────────────────────────────────────────────────
test('T6.1: all 6 studies are pre-registered with hypothesis, metric, and an existing protocol doc', async () => {
  assert.equal(PREREGISTERED_STUDIES.length, 6)
  const keys = PREREGISTERED_STUDIES.map((s) => s.study_key)
  assert.deepEqual(
    [...keys].sort(),
    ['adversarial_evasion', 'human_llm_agreement', 'multilingual_dif', 'sim_to_real_transfer', 'steering_ab', 'test_retest'],
  )
  for (const s of PREREGISTERED_STUDIES) {
    assert.ok(s.hypothesis.length > 30, `${s.study_key} has a real hypothesis`)
    assert.ok(s.preregistered_metric.length > 20, `${s.study_key} has a preregistered metric`)
    // Protocol docs live in the repo — the registry must not point at nothing.
    const repoRoot = join(__dirname, '..', '..')
    await access(join(repoRoot, s.protocol_doc))
  }
})

test('T6.3: training refs cover the rubric range (not all mid-scale)', () => {
  const levels = TRAINING_REFS.flatMap((t) => Object.values(t.reference_levels))
  assert.ok(levels.includes(0) && levels.includes(4), 'training set spans level 0 and level 4')
  assert.equal(TRAINING_REFS.length >= 3, true)
})

// ── DB-gated: immutability + append-only + seed idempotence ─────────────────
const dbReady = Boolean(process.env.DATABASE_URL)
test('T6.2/T6.4: assignment immutability + append-only results (needs DATABASE_URL)', { skip: !dbReady }, async () => {
  const { query } = await import('../db/pool.js')
  const { seedStudies, getStudyByKey, recordStudyResult } = await import('../lib/studies.js')

  const first = await seedStudies()
  const second = await seedStudies()
  assert.equal(second.inserted, 0, 'seed is idempotent')

  const study = await getStudyByKey('steering_ab')
  const sid = crypto.randomUUID()
  await query(
    'INSERT INTO study_sessions (study_id, session_id, arm, is_synthetic) VALUES ($1,$2,$3,TRUE)',
    [study.study_id, sid, 'executive'],
  )
  await assert.rejects(
    query('UPDATE study_sessions SET arm = $3 WHERE study_id = $1 AND session_id = $2', [study.study_id, sid, 'lite']),
    /immutable/,
    'arm updates are blocked by trigger',
  )

  const r1 = await recordStudyResult({ studyKey: 'steering_ab', metricName: 'gate_test', value: 1, n: 0, analysisVersion: 'test' })
  await assert.rejects(
    query('UPDATE study_results SET value = 999 WHERE result_id = $1', [r1]),
    /append-only/,
    'metric values cannot be mutated',
  )
  await assert.rejects(query('DELETE FROM study_results WHERE result_id = $1', [r1]), /append-only/)
  const r2 = await recordStudyResult({ studyKey: 'steering_ab', metricName: 'gate_test', value: 2, n: 0, analysisVersion: 'test', supersedes: r1 })
  const chain = await query('SELECT result_id, superseded_by FROM study_results WHERE result_id = ANY($1)', [[r1, r2]])
  const old = chain.rows.find((r) => r.result_id === r1)
  assert.equal(old.superseded_by, r2, 'supersession chain recorded')

  // cleanup (assignments are deletable for erasure; results are permanent by design — leave test rows superseded)
  await query('DELETE FROM study_sessions WHERE session_id = $1', [sid])
})
