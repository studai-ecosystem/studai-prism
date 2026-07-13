// /api/admin/studies — Study Runner administration (Control Centre Phase 3).
//
//   GET  /                      studies:read    registry + session counts + recent results
//   POST /                      studies:manage  create a PREREGISTRATION
//   PATCH /:studyKey            studies:manage  edit ONLY while status='preregistered'
//   POST /:studyKey/status      studies:manage  legal transitions only
//   GET  /:studyKey/results     studies:read    result history (supersession chains)
//   POST /:studyKey/compute     studies:compute steering_ab only (others are Python jobs)
//   GET  /external-ratings      studies:read    transferability anchors + chains
//   POST /external-ratings      studies:manage  add rating / superseding correction
//
// Immutability (DB-enforced, surfaced here): study_sessions arm assignments
// are UPDATE-blocked by trigger; study_results are append-only (corrections
// SUPERSEDE via new rows); external_ratings are append-only. This router
// cannot edit or delete any historical result — no such endpoint exists.

import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { computeSteeringEvidenceDensity, recordStudyResult } from '../../lib/studies.js'

const router = Router()

const STUDY_TRANSITIONS = {
  preregistered: ['active', 'abandoned'],
  active: ['complete', 'abandoned'],
  complete: [],
  abandoned: [],
}

// ── Registry ─────────────────────────────────────────────────────────────────
router.get('/', requirePermission('studies:read'), async (req, res) => {
  try {
    const studies = await query(
      `SELECT s.*,
              (SELECT COUNT(*)::int FROM study_sessions ss WHERE ss.study_id = s.study_id AND ss.is_synthetic = FALSE) AS real_sessions,
              (SELECT COUNT(*)::int FROM study_sessions ss WHERE ss.study_id = s.study_id) AS total_sessions,
              (SELECT COUNT(*)::int FROM study_results r WHERE r.study_id = s.study_id) AS result_count
         FROM studies s ORDER BY s.created_at`,
    )
    const results = await query(
      `SELECT r.result_id, r.metric_name, r.value, r.n, r.analysis_version, r.superseded_by,
              r.computed_at, s.study_key
         FROM study_results r JOIN studies s ON s.study_id = r.study_id
        ORDER BY r.computed_at DESC LIMIT 50`,
    )
    res.json({ studies: studies?.rows || [], recentResults: results?.rows || [] })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_studies_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Preregistration ──────────────────────────────────────────────────────────
router.post('/', requirePermission('studies:manage'), async (req, res) => {
  try {
    const { studyKey, title, hypothesis, preregisteredMetric, protocolDoc, cohortTags } = req.body || {}
    for (const [field, v] of [['studyKey', studyKey], ['title', title], ['hypothesis', hypothesis],
                              ['preregisteredMetric', preregisteredMetric], ['protocolDoc', protocolDoc]]) {
      if (!v || !String(v).trim()) return res.status(400).json({ error: `${field} is required — a preregistration is a scientific commitment.` })
    }
    if (!/^[a-z0-9_]{3,60}$/.test(String(studyKey))) {
      return res.status(400).json({ error: 'studyKey must be 3–60 chars of a-z, 0-9, underscore.' })
    }
    const studyId = randomUUID()
    try {
      await query(
        `INSERT INTO studies (study_id, study_key, title, hypothesis, preregistered_metric, protocol_doc, cohort_tags, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'preregistered')`,
        [studyId, String(studyKey), String(title).trim(), String(hypothesis).trim(),
         String(preregisteredMetric).trim(), String(protocolDoc).trim(),
         cohortTags ? JSON.stringify(cohortTags) : null],
      )
    } catch (err) {
      if (/duplicate/.test(String(err?.message))) return res.status(409).json({ error: 'A study with this key already exists.' })
      throw err
    }
    await adminAudit(req, {
      action: 'study_preregistered', entityType: 'study', entityId: String(studyKey),
      after: { title: String(title).trim(), preregisteredMetric: String(preregisteredMetric).trim() },
    })
    res.status(201).json({ ok: true, studyId, studyKey, status: 'preregistered' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_study_create_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Edit — ONLY before activation ────────────────────────────────────────────
router.patch('/:studyKey', requirePermission('studies:manage'), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM studies WHERE study_key = $1', [req.params.studyKey])
    const study = existing?.rows?.[0]
    if (!study) return res.status(404).json({ error: 'Study not found.' })
    if (study.status !== 'preregistered') {
      return res.status(409).json({
        error: `An ${study.status} study cannot be edited — the preregistration is the scientific commitment. Corrections after activation require a new study.`,
        code: 'IMMUTABLE_AFTER_ACTIVATION',
      })
    }
    const allowed = ['title', 'hypothesis', 'preregisteredMetric', 'protocolDoc', 'cohortTags']
    const bodyKeys = Object.keys(req.body || {}).filter((k) => k !== 'reason')
    const outside = bodyKeys.filter((k) => !allowed.includes(k))
    if (outside.length) return res.status(400).json({ error: `Not editable: ${outside.join(', ')}` })

    const patch = {
      title: typeof req.body.title === 'string' ? req.body.title.trim() : study.title,
      hypothesis: typeof req.body.hypothesis === 'string' ? req.body.hypothesis.trim() : study.hypothesis,
      preregistered_metric: typeof req.body.preregisteredMetric === 'string' ? req.body.preregisteredMetric.trim() : study.preregistered_metric,
      protocol_doc: typeof req.body.protocolDoc === 'string' ? req.body.protocolDoc.trim() : study.protocol_doc,
      cohort_tags: req.body.cohortTags !== undefined ? JSON.stringify(req.body.cohortTags) : study.cohort_tags,
    }
    await query(
      `UPDATE studies SET title=$2, hypothesis=$3, preregistered_metric=$4, protocol_doc=$5, cohort_tags=$6
        WHERE study_key = $1 AND status = 'preregistered'`,
      [req.params.studyKey, patch.title, patch.hypothesis, patch.preregistered_metric, patch.protocol_doc, patch.cohort_tags],
    )
    await adminAudit(req, {
      action: 'study_edited_before_activation', entityType: 'study', entityId: req.params.studyKey,
      before: { title: study.title, hypothesis: study.hypothesis, preregisteredMetric: study.preregistered_metric },
      after: { title: patch.title, hypothesis: patch.hypothesis, preregisteredMetric: patch.preregistered_metric },
      reason: req.body?.reason || null,
    })
    res.json({ ok: true })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_study_edit_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Status transitions (legal machine) ───────────────────────────────────────
router.post('/:studyKey/status', requirePermission('studies:manage'), async (req, res) => {
  try {
    const { status, reason } = req.body || {}
    if (!Object.keys(STUDY_TRANSITIONS).includes(status)) return res.status(400).json({ error: 'invalid status' })
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    const existing = await query('SELECT status FROM studies WHERE study_key = $1', [req.params.studyKey])
    const current = existing?.rows?.[0]?.status
    if (!current) return res.status(404).json({ error: 'Study not found.' })
    if (!STUDY_TRANSITIONS[current].includes(status)) {
      return res.status(409).json({
        error: `Cannot move a study from '${current}' to '${status}'.`,
        allowed: STUDY_TRANSITIONS[current],
      })
    }
    await query('UPDATE studies SET status = $2 WHERE study_key = $1', [req.params.studyKey, status])
    await adminAudit(req, {
      action: 'study_status_changed', entityType: 'study', entityId: req.params.studyKey,
      before: { status: current }, after: { status }, reason,
    })
    res.json({ ok: true, status })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_study_status_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Results (append-only history; supersession chains visible) ───────────────
router.get('/:studyKey/results', requirePermission('studies:read'), async (req, res) => {
  try {
    const r = await query(
      `SELECT r.* FROM study_results r JOIN studies s ON s.study_id = r.study_id
        WHERE s.study_key = $1 ORDER BY r.computed_at DESC LIMIT 100`,
      [req.params.studyKey],
    )
    res.json({
      results: r?.rows || [],
      note: 'Results are append-only (DB trigger). Corrections create a superseding row; nothing is ever edited or deleted.',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_study_results_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Compute (steering_ab only — the rest are Python calibration jobs) ────────
router.post('/:studyKey/compute', requirePermission('studies:compute'), async (req, res) => {
  try {
    if (req.params.studyKey !== 'steering_ab') {
      return res.status(501).json({
        error: `'${req.params.studyKey}' is computed by its preregistered Python job (calibration/jobs), not the console — results land in the registry when the job runs.`,
        code: 'PYTHON_JOB',
      })
    }
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
    await adminAudit(req, {
      action: 'study_metric_computed', entityType: 'study', entityId: 'steering_ab',
      after: { resultId, n, supersedes: req.body?.supersedes || null },
    })
    res.json({ ok: true, resultId, byArm, n })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_study_compute_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── External ratings (transferability anchors; append-only) ─────────────────
router.get('/external-ratings/list', requirePermission('studies:read'), async (req, res) => {
  try {
    const { sessionId } = req.query
    const params = []
    let clause = ''
    if (sessionId) { params.push(String(sessionId)); clause = 'WHERE session_id = $1::uuid' }
    const r = await query(
      `SELECT rating_id, session_id, source_org, exercise_type, rater_role, score, notes,
              rated_at, supersedes, created_at
         FROM external_ratings ${clause} ORDER BY created_at DESC LIMIT 200`,
      params,
    ).catch(() => null)
    // Mark superseded rows (a later row points at them).
    const rows = r?.rows || []
    const supersededIds = new Set(rows.map((row) => row.supersedes).filter(Boolean))
    res.json({
      ratings: rows.map((row) => ({ ...row, superseded: supersededIds.has(row.rating_id) })),
      note: 'Append-only: corrections add a new rating with `supersedes` — existing ratings are never edited.',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_external_ratings_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/external-ratings', requirePermission('studies:manage'), async (req, res) => {
  try {
    const { sessionId, sourceOrg, exerciseType, raterRole, score, notes, ratedAt, supersedes } = req.body || {}
    if (!sessionId || !sourceOrg || !exerciseType) {
      return res.status(400).json({ error: 'sessionId, sourceOrg and exerciseType are required.' })
    }
    const n = Number(score)
    if (!Number.isFinite(n) || n < 0 || n > 100) return res.status(400).json({ error: 'score must be 0–100.' })
    if (supersedes) {
      const prior = await query('SELECT rating_id FROM external_ratings WHERE rating_id = $1', [supersedes])
      if (!prior?.rows?.length) return res.status(400).json({ error: 'supersedes must reference an existing rating.' })
    }
    const ratingId = randomUUID()
    await query(
      `INSERT INTO external_ratings (rating_id, session_id, source_org, exercise_type, rater_role, score, notes, rated_at, supersedes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [ratingId, String(sessionId), String(sourceOrg).slice(0, 120), String(exerciseType).slice(0, 80),
       raterRole ? String(raterRole).slice(0, 60) : null, n,
       notes ? String(notes).slice(0, 2000) : null, ratedAt || null, supersedes || null],
    )
    await adminAudit(req, {
      action: supersedes ? 'external_rating_superseded' : 'external_rating_added',
      entityType: 'external_rating', entityId: ratingId,
      after: { sessionId, sourceOrg, exerciseType, score: n, supersedes: supersedes || null },
    })
    res.status(201).json({ ok: true, ratingId })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_external_rating_add_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
