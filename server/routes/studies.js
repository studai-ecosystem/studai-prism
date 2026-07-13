// Track 6 — Study Runner routes.
//
// Two access planes, both DB-gated:
//   • Admin (x-admin-token = ADMIN_TOKEN): registry, status transitions,
//     metric computation (append-only results), rater management, IRR
//     dashboard. Same guard pattern as /api/psychometrics.
//   • Rater (x-rater-token): training flow (IRR gate), blinded double-rating
//     queue, rating submission. Raters carry no PII — handle + token only.

import { Router } from 'express'
import { randomUUID, createHash } from 'node:crypto'
import logger from '../lib/logger.js'
import { query, isDbConfigured } from '../db/pool.js'
import { DIMENSION_KEYS } from '../lib/sharedConstants.js'
import { quadraticWeightedKappa, kappaFromLevelMaps } from '../lib/kappa.js'
import {
  seedStudies,
  getStudyByKey,
  recordStudyResult,
  computeSteeringEvidenceDensity,
  evaluateTrainingKappa,
  TRAINING_KAPPA_THRESHOLD,
} from '../lib/studies.js'

const router = Router()

const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex')

function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_TOKEN
  if (!expected) return res.status(503).json({ error: 'study runner disabled (set ADMIN_TOKEN)' })
  if (req.get('x-admin-token') !== expected) return res.status(401).json({ error: 'unauthorized' })
  if (!isDbConfigured()) return res.status(503).json({ error: 'no database configured' })
  next()
}

async function requireRater(req, res, next) {
  if (!isDbConfigured()) return res.status(503).json({ error: 'no database configured' })
  const token = req.get('x-rater-token')
  if (!token) return res.status(401).json({ error: 'rater token required' })
  const r = await query('SELECT * FROM raters WHERE token_hash = $1', [sha256(token)])
  const rater = r?.rows?.[0]
  if (!rater) return res.status(401).json({ error: 'unknown rater token' })
  if (rater.status === 'suspended') return res.status(403).json({ error: 'rater suspended' })
  req.rater = rater
  next()
}

// ── Admin: registry ───────────────────────────────────────────────────────────
router.get('/', requireAdmin, async (_req, res) => {
  const studies = await query(
    `SELECT s.*, (SELECT COUNT(*)::int FROM study_sessions ss
                   WHERE ss.study_id = s.study_id AND ss.is_synthetic = FALSE) AS real_sessions,
             (SELECT COUNT(*)::int FROM study_sessions ss WHERE ss.study_id = s.study_id) AS total_sessions
       FROM studies s ORDER BY s.created_at`,
  )
  const results = await query(
    `SELECT r.*, s.study_key FROM study_results r JOIN studies s ON s.study_id = r.study_id
      ORDER BY r.computed_at DESC LIMIT 50`,
  )
  res.json({ studies: studies?.rows || [], recentResults: results?.rows || [] })
})

router.post('/seed', requireAdmin, async (_req, res) => {
  res.json(await seedStudies())
})

// Status transitions are deliberate admin actions (preregistered → active → complete).
router.post('/:studyKey/status', requireAdmin, async (req, res) => {
  const { status } = req.body || {}
  if (!['preregistered', 'active', 'complete', 'abandoned'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' })
  }
  const r = await query('UPDATE studies SET status = $2 WHERE study_key = $1 RETURNING study_key, status', [req.params.studyKey, status])
  if (!r?.rows?.length) return res.status(404).json({ error: 'unknown study' })
  res.json(r.rows[0])
})

// ── Admin: Study-1 metric computation (append-only) ──────────────────────────
router.post('/steering_ab/compute', requireAdmin, async (req, res) => {
  try {
    const byArm = await computeSteeringEvidenceDensity({ includeSynthetic: Boolean(req.body?.includeSynthetic) })
    if (!byArm) return res.status(503).json({ error: 'no database configured' })
    const n = Object.values(byArm).reduce((s, a) => s + (a.sessions || 0), 0)
    const resultId = await recordStudyResult({
      studyKey: 'steering_ab',
      metricName: 'evidence_density_by_arm',
      value: null,
      detail: { byArm, includeSynthetic: Boolean(req.body?.includeSynthetic) },
      n,
      analysisVersion: 'steering-density-v1',
      supersedes: req.body?.supersedes || null,
    })
    res.json({ ok: true, resultId, byArm, n })
  } catch (err) {
    logger.captureException(err, { msg: 'steering_compute_failed' })
    res.status(500).json({ error: 'metric computation failed' })
  }
})

// ── Admin: raters ─────────────────────────────────────────────────────────────
// Creates a rater and returns the access token ONCE (only the hash is stored).
router.post('/raters', requireAdmin, async (req, res) => {
  const handle = String(req.body?.handle || '').trim()
  if (!handle || handle.length > 40) return res.status(400).json({ error: 'handle (<=40 chars) required' })
  const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')
  try {
    const raterId = randomUUID()
    await query('INSERT INTO raters (rater_id, handle, token_hash) VALUES ($1,$2,$3)', [raterId, handle, sha256(token)])
    res.status(201).json({ raterId, handle, token, note: 'Store this token now — it is not retrievable again.' })
  } catch (err) {
    if (String(err?.message || '').includes('duplicate')) return res.status(409).json({ error: 'handle already exists' })
    logger.captureException(err, { msg: 'rater_create_failed' })
    res.status(500).json({ error: 'failed to create rater' })
  }
})

router.get('/raters', requireAdmin, async (_req, res) => {
  const r = await query(
    `SELECT rater_id, handle, status, training_kappa, created_at,
            (SELECT COUNT(DISTINCT session_id)::int FROM human_ratings hr WHERE hr.rater_id = raters.rater_id::text) AS sessions_rated
       FROM raters ORDER BY created_at`,
  )
  res.json({ raters: r?.rows || [] })
})

// ── Admin: IRR dashboard ─────────────────────────────────────────────────────
// Pairwise human–human weighted kappa on overlapping sessions (levels = score/25),
// plus each rater's training kappa. Human–LLM kappa lands with study 2's job.
router.get('/irr', requireAdmin, async (_req, res) => {
  const ratings = await query(
    `SELECT session_id, rater_id, dimension, score FROM human_ratings ORDER BY created_at`,
  )
  const byRater = new Map()
  for (const row of ratings?.rows || []) {
    if (!byRater.has(row.rater_id)) byRater.set(row.rater_id, new Map())
    const sessions = byRater.get(row.rater_id)
    if (!sessions.has(row.session_id)) sessions.set(row.session_id, {})
    sessions.get(row.session_id)[row.dimension] = Math.round(row.score / 25)
  }
  const raterIds = [...byRater.keys()]
  const pairs = []
  for (let i = 0; i < raterIds.length; i++) {
    for (let j = i + 1; j < raterIds.length; j++) {
      const a = byRater.get(raterIds[i])
      const b = byRater.get(raterIds[j])
      const shared = [...a.keys()].filter((sid) => b.has(sid))
      if (!shared.length) continue
      const kappa = kappaFromLevelMaps(
        shared.map((sid) => a.get(sid)),
        shared.map((sid) => b.get(sid)),
        DIMENSION_KEYS,
      )
      pairs.push({ raterA: raterIds[i], raterB: raterIds[j], sharedSessions: shared.length, kappa })
    }
  }
  const training = await query('SELECT handle, status, training_kappa FROM raters ORDER BY handle')
  res.json({ threshold: TRAINING_KAPPA_THRESHOLD, humanHumanPairs: pairs, raters: training?.rows || [] })
})

// ── Rater: training flow (IRR gate) ──────────────────────────────────────────
router.get('/rater/me', requireRater, async (req, res) => {
  const answered = await query('SELECT COUNT(*)::int AS n FROM rater_training_answers WHERE rater_id = $1', [req.rater.rater_id])
  const total = await query(`SELECT COUNT(*)::int AS n FROM rater_training_refs WHERE status = 'active'`)
  res.json({
    handle: req.rater.handle,
    status: req.rater.status,
    trainingKappa: req.rater.training_kappa === null ? null : Number(req.rater.training_kappa),
    trainingAnswered: answered?.rows?.[0]?.n ?? 0,
    trainingTotal: total?.rows?.[0]?.n ?? 0,
    threshold: TRAINING_KAPPA_THRESHOLD,
    dimensions: DIMENSION_KEYS,
  })
})

router.get('/rater/training/next', requireRater, async (req, res) => {
  const r = await query(
    `SELECT ref_id, transcript, rubric_version FROM rater_training_refs
      WHERE status = 'active'
        AND ref_id NOT IN (SELECT ref_id FROM rater_training_answers WHERE rater_id = $1)
      ORDER BY created_at LIMIT 1`,
    [req.rater.rater_id],
  )
  if (!r?.rows?.length) return res.json({ done: true })
  res.json({ done: false, ref: r.rows[0] })
})

router.post('/rater/training/:refId', requireRater, async (req, res) => {
  const levels = req.body?.levels
  if (!levels || typeof levels !== 'object') return res.status(400).json({ error: 'levels required' })
  try {
    await query(
      `INSERT INTO rater_training_answers (answer_id, rater_id, ref_id, levels)
       VALUES ($1,$2,$3,$4) ON CONFLICT (rater_id, ref_id) DO NOTHING`,
      [randomUUID(), req.rater.rater_id, req.params.refId, JSON.stringify(levels)],
    )
    // When every training transcript is answered, evaluate the IRR gate.
    // Retired/draft references are excluded from both the answer set and the
    // total (Control Centre Phase 3 training-reference lifecycle).
    const rows = await query(
      `SELECT a.levels AS answer, t.reference_levels AS reference
         FROM rater_training_answers a JOIN rater_training_refs t ON t.ref_id = a.ref_id
        WHERE a.rater_id = $1 AND t.status = 'active' ORDER BY t.created_at`,
      [req.rater.rater_id],
    )
    const total = await query(`SELECT COUNT(*)::int AS n FROM rater_training_refs WHERE status = 'active'`)
    let gate = null
    if ((rows?.rows?.length || 0) >= (total?.rows?.[0]?.n || Infinity)) {
      gate = evaluateTrainingKappa(
        rows.rows.map((r) => r.answer),
        rows.rows.map((r) => r.reference),
        DIMENSION_KEYS,
      )
      await query(
        `UPDATE raters SET training_kappa = $2, status = $3 WHERE rater_id = $1 AND status <> 'suspended'`,
        [req.rater.rater_id, gate.kappa, gate.qualified ? 'qualified' : 'training'],
      )
    }
    res.json({ ok: true, gate })
  } catch (err) {
    logger.captureException(err, { msg: 'training_answer_failed' })
    res.status(500).json({ error: 'failed to record training answer' })
  }
})

// ── Rater: blinded double-rating queue ───────────────────────────────────────
// Real (non-synthetic) transcripts with <2 distinct raters, not yet rated by
// THIS rater. Transcript only — no AI scores anywhere in the payload.
router.get('/rater/queue/next', requireRater, async (req, res) => {
  if (req.rater.status !== 'qualified') {
    return res.status(403).json({ error: `Complete training first (weighted kappa >= ${TRAINING_KAPPA_THRESHOLD}).` })
  }
  const r = await query(
    `SELECT st.session_id, st.turns, st.scenario_key
       FROM session_transcripts st
      WHERE st.is_synthetic = FALSE
        AND (SELECT COUNT(DISTINCT hr.rater_id) FROM human_ratings hr WHERE hr.session_id = st.session_id) < 2
        AND NOT EXISTS (SELECT 1 FROM human_ratings hr2 WHERE hr2.session_id = st.session_id AND hr2.rater_id = $1)
      ORDER BY st.created_at LIMIT 1`,
    [String(req.rater.rater_id)],
  )
  if (!r?.rows?.length) return res.json({ done: true })
  res.json({ done: false, session: r.rows[0], dimensions: DIMENSION_KEYS })
})

router.post('/rater/rate/:sessionId', requireRater, async (req, res) => {
  if (req.rater.status !== 'qualified') {
    return res.status(403).json({ error: 'Ratings from unqualified raters are excluded (IRR gate).' })
  }
  const levels = req.body?.levels
  if (!levels || typeof levels !== 'object') return res.status(400).json({ error: 'levels required' })
  try {
    let n = 0
    for (const dim of DIMENSION_KEYS) {
      const lvl = Number(levels[dim])
      if (!Number.isInteger(lvl) || lvl < 0 || lvl > 4) continue // NA levels are simply not stored
      await query(
        `INSERT INTO human_ratings (rating_id, session_id, rater_id, dimension, score, rubric_version)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [randomUUID(), req.params.sessionId, String(req.rater.rater_id), dim, lvl * 25, 'workbench-v1'],
      )
      n++
    }
    res.json({ ok: true, dimensionsRated: n })
  } catch (err) {
    logger.captureException(err, { msg: 'rating_submit_failed' })
    res.status(500).json({ error: 'failed to record rating' })
  }
})

// ── Track 4.3: transferability study — external live-exercise ratings ────────
// A partner college links a Prism session to an independent HUMAN-rated live
// exercise for the same candidate (the sim-to-reality anchor). Admin-gated;
// append-only (corrections supersede, never edit); role only — no rater PII.
router.post('/transfer/:sessionId/rating', requireAdmin, async (req, res) => {
  const { sourceOrg, exerciseType, raterRole, score, notes, ratedAt, supersedes } = req.body || {}
  if (!sourceOrg || !exerciseType) return res.status(400).json({ error: 'sourceOrg and exerciseType required' })
  const n = Number(score)
  if (!Number.isFinite(n) || n < 0 || n > 100) return res.status(400).json({ error: 'score must be 0-100' })
  try {
    const ratingId = randomUUID()
    await query(
      `INSERT INTO external_ratings (rating_id, session_id, source_org, exercise_type, rater_role, score, notes, rated_at, supersedes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        ratingId,
        req.params.sessionId,
        String(sourceOrg).slice(0, 200),
        String(exerciseType).slice(0, 100),
        raterRole ? String(raterRole).slice(0, 100) : null,
        n,
        notes ? String(notes).slice(0, 2000) : null,
        ratedAt || null,
        supersedes || null,
      ],
    )
    res.status(201).json({ ok: true, ratingId })
  } catch (err) {
    logger.captureException(err, { msg: 'external_rating_failed' })
    res.status(500).json({ error: 'failed to record external rating' })
  }
})

router.get('/transfer/ratings', requireAdmin, async (_req, res) => {
  try {
    const r = await query(
      'SELECT rating_id, session_id, source_org, exercise_type, rater_role, score, rated_at, supersedes, created_at FROM external_ratings ORDER BY created_at DESC LIMIT 500',
    )
    res.json({ ratings: r?.rows || [] })
  } catch (err) {
    logger.captureException(err, { msg: 'external_ratings_list_failed' })
    res.status(500).json({ error: 'failed to list external ratings' })
  }
})

// ── Track 1.5: test–retest study enrolment ───────────────────────────────
// Admin-triggered: tags a consenting pilot candidate's session into the
// preregistered test_retest study (arm = baseline | retest). Assignment is
// immutable (study_sessions trigger); form assignment reuses the Track 0.3
// never-same-scenario rule automatically on the retest session.
router.post('/test_retest/enroll', requireAdmin, async (req, res) => {
  const { sessionId, arm } = req.body || {}
  if (!sessionId || !['baseline', 'retest'].includes(arm)) {
    return res.status(400).json({ error: "sessionId and arm ('baseline'|'retest') required" })
  }
  try {
    const study = await getStudyByKey('test_retest')
    if (!study) return res.status(404).json({ error: 'test_retest study not registered' })
    const isSynthetic = Boolean(req.body?.isSynthetic)
    await query(
      `INSERT INTO study_sessions (study_id, session_id, arm, is_synthetic)
       VALUES ($1,$2,$3,$4) ON CONFLICT (study_id, session_id) DO NOTHING`,
      [study.study_id, sessionId, arm, isSynthetic],
    )
    const r = await query(
      'SELECT arm FROM study_sessions WHERE study_id = $1 AND session_id = $2',
      [study.study_id, sessionId],
    )
    res.status(201).json({ ok: true, sessionId, arm: r?.rows?.[0]?.arm || arm, study: 'test_retest' })
  } catch (err) {
    logger.captureException(err, { msg: 'test_retest_enroll_failed' })
    res.status(500).json({ error: 'failed to enroll session' })
  }
})

export default router
