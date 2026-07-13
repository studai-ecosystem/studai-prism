// /api/admin/raters — human-rater administration (Control Centre Phase 3).
//
//   GET  /                       raters:read    roster + activity + training progress
//   POST /                       raters:manage  create (token shown ONCE)
//   POST /:id/rotate-token       raters:manage  new token shown ONCE, old dies
//   POST /:id/state              raters:manage  suspend / reactivate
//   POST /:id/reset-training     raters:manage  wipe answers, back to training
//   GET  /irr                    raters:read    pairwise human–human weighted kappa
//   GET  /training-refs          raters:read    reference lifecycle view
//   POST /training-refs          raters:manage  create DRAFT reference
//   POST /training-refs/:id/status raters:manage draft → active → retired
//
// Token hashes are never revealed (SELECTs never include token_hash). Raters
// carry no PII — handle only. Human ratings themselves are NOT edited here:
// corrections are versioned supersessions (ratings:supersede, psychometric
// admin) and land with the human-rating review queue.

import { Router } from 'express'
import { randomUUID, createHash } from 'node:crypto'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { DIMENSION_KEYS } from '../../lib/sharedConstants.js'
import { kappaFromLevelMaps } from '../../lib/kappa.js'
import { TRAINING_KAPPA_THRESHOLD } from '../../lib/studies.js'

const router = Router()
const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex')

// ── Roster ───────────────────────────────────────────────────────────────────
router.get('/', requirePermission('raters:read'), async (req, res) => {
  try {
    const r = await query(
      `SELECT r.rater_id, r.handle, r.status, r.training_kappa, r.created_at,
              (SELECT COUNT(*)::int FROM rater_training_answers a WHERE a.rater_id = r.rater_id) AS training_answered,
              (SELECT COUNT(DISTINCT hr.session_id)::int FROM human_ratings hr WHERE hr.rater_id = r.rater_id::text) AS sessions_rated,
              (SELECT MAX(hr.created_at) FROM human_ratings hr WHERE hr.rater_id = r.rater_id::text) AS last_rated_at
         FROM raters r ORDER BY r.created_at`,
    )
    const refs = await query(`SELECT COUNT(*)::int AS n FROM rater_training_refs WHERE status = 'active'`)
    res.json({
      raters: r?.rows || [],
      trainingTotal: refs?.rows?.[0]?.n ?? 0,
      threshold: TRAINING_KAPPA_THRESHOLD,
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_raters_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Create (token shown once) ────────────────────────────────────────────────
router.post('/', requirePermission('raters:manage'), async (req, res) => {
  try {
    const handle = String(req.body?.handle || '').trim()
    if (!handle || handle.length > 40) return res.status(400).json({ error: 'handle (<= 40 chars) required.' })
    const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')
    const raterId = randomUUID()
    try {
      await query('INSERT INTO raters (rater_id, handle, token_hash) VALUES ($1,$2,$3)', [raterId, handle, sha256(token)])
    } catch (err) {
      if (/duplicate/.test(String(err?.message))) return res.status(409).json({ error: 'Handle already exists.' })
      throw err
    }
    await adminAudit(req, { action: 'rater_created', entityType: 'rater', entityId: raterId, after: { handle } })
    res.status(201).json({ raterId, handle, token, note: 'Store this token now — only its hash is kept.' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_rater_create_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:id/rotate-token', requirePermission('raters:manage'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')
    const r = await query(
      'UPDATE raters SET token_hash = $2 WHERE rater_id = $1 RETURNING handle',
      [req.params.id, sha256(token)],
    )
    if (!r?.rows?.length) return res.status(404).json({ error: 'Rater not found.' })
    await adminAudit(req, { action: 'rater_token_rotated', entityType: 'rater', entityId: req.params.id, reason })
    res.json({ ok: true, token, note: 'New token shown once; the previous token is dead.' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_rater_rotate_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:id/state', requirePermission('raters:manage'), async (req, res) => {
  try {
    const { state, reason } = req.body || {}
    if (!['suspended', 'reactivate'].includes(state)) {
      return res.status(400).json({ error: "state must be 'suspended' or 'reactivate'." })
    }
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    const before = await query('SELECT status, training_kappa FROM raters WHERE rater_id = $1', [req.params.id])
    const rater = before?.rows?.[0]
    if (!rater) return res.status(404).json({ error: 'Rater not found.' })

    // Reactivation restores the earned status: qualified iff the training gate
    // was passed; otherwise back to training. Suspension never erases progress.
    const next = state === 'suspended'
      ? 'suspended'
      : rater.training_kappa != null && Number(rater.training_kappa) >= TRAINING_KAPPA_THRESHOLD
        ? 'qualified'
        : 'training'
    await query('UPDATE raters SET status = $2 WHERE rater_id = $1', [req.params.id, next])
    await adminAudit(req, {
      action: state === 'suspended' ? 'rater_suspended' : 'rater_reactivated',
      entityType: 'rater', entityId: req.params.id,
      before: { status: rater.status }, after: { status: next }, reason,
    })
    res.json({ ok: true, status: next })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_rater_state_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:id/reset-training', requirePermission('raters:manage'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    const before = await query('SELECT status FROM raters WHERE rater_id = $1', [req.params.id])
    if (!before?.rows?.length) return res.status(404).json({ error: 'Rater not found.' })

    await query('DELETE FROM rater_training_answers WHERE rater_id = $1', [req.params.id])
    await query(
      `UPDATE raters SET training_kappa = NULL,
              status = CASE WHEN status = 'suspended' THEN 'suspended' ELSE 'training' END
        WHERE rater_id = $1`,
      [req.params.id],
    )
    await adminAudit(req, {
      action: 'rater_training_reset', entityType: 'rater', entityId: req.params.id,
      before: { status: before.rows[0].status }, reason,
    })
    res.json({ ok: true })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_rater_reset_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── IRR (pairwise human–human weighted kappa on overlapping sessions) ────────
router.get('/irr', requirePermission('raters:read'), async (req, res) => {
  try {
    const ratings = await query(
      'SELECT session_id, rater_id, dimension, score FROM human_ratings ORDER BY created_at',
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
        pairs.push({
          raterA: raterIds[i], raterB: raterIds[j], sharedSessions: shared.length,
          kappa: kappaFromLevelMaps(
            shared.map((sid) => a.get(sid)),
            shared.map((sid) => b.get(sid)),
            DIMENSION_KEYS,
          ),
        })
      }
    }
    res.json({ threshold: TRAINING_KAPPA_THRESHOLD, humanHumanPairs: pairs })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_irr_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Training references (draft → active → retired) ──────────────────────────
router.get('/training-refs', requirePermission('raters:read'), async (req, res) => {
  try {
    const r = await query(
      `SELECT ref_id, rubric_version, status, created_at,
              jsonb_array_length(transcript) AS turn_count,
              (SELECT COUNT(*)::int FROM rater_training_answers a WHERE a.ref_id = t.ref_id) AS answer_count
         FROM rater_training_refs t ORDER BY created_at`,
    )
    res.json({ refs: r?.rows || [] })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_training_refs_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/training-refs', requirePermission('raters:manage'), async (req, res) => {
  try {
    const { transcript, referenceLevels, rubricVersion } = req.body || {}
    if (!Array.isArray(transcript) || !transcript.length ||
        !transcript.every((t) => t && typeof t.speaker === 'string' && typeof t.text === 'string')) {
      return res.status(400).json({ error: 'transcript must be a non-empty array of {speaker, text}.' })
    }
    if (!referenceLevels || typeof referenceLevels !== 'object') {
      return res.status(400).json({ error: 'referenceLevels required.' })
    }
    for (const dim of DIMENSION_KEYS) {
      const v = referenceLevels[dim]
      if (!Number.isInteger(v) || v < 0 || v > 4) {
        return res.status(400).json({ error: `referenceLevels.${dim} must be an integer 0–4.` })
      }
    }
    const refId = randomUUID()
    // New references start as DRAFT — a rubric owner reviews and activates
    // them deliberately; only active references enter rater training.
    await query(
      `INSERT INTO rater_training_refs (ref_id, transcript, reference_levels, rubric_version, status)
       VALUES ($1,$2,$3,$4,'draft')`,
      [refId, JSON.stringify(transcript), JSON.stringify(referenceLevels), String(rubricVersion || 'v1').slice(0, 20)],
    )
    await adminAudit(req, { action: 'training_ref_created', entityType: 'training_ref', entityId: refId })
    res.status(201).json({ ok: true, refId, status: 'draft' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_training_ref_create_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/training-refs/:id/status', requirePermission('raters:manage'), async (req, res) => {
  try {
    const { status, reason } = req.body || {}
    if (!['active', 'retired'].includes(status)) {
      return res.status(400).json({ error: "status must be 'active' or 'retired'." })
    }
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    const before = await query('SELECT status FROM rater_training_refs WHERE ref_id = $1', [req.params.id])
    const ref = before?.rows?.[0]
    if (!ref) return res.status(404).json({ error: 'Training reference not found.' })
    const legal = { draft: ['active'], active: ['retired'], retired: [] }
    if (!legal[ref.status]?.includes(status)) {
      return res.status(409).json({ error: `Cannot move a training reference from '${ref.status}' to '${status}'.`, allowed: legal[ref.status] })
    }
    await query('UPDATE rater_training_refs SET status = $2 WHERE ref_id = $1', [req.params.id, status])
    await adminAudit(req, {
      action: status === 'active' ? 'training_ref_activated' : 'training_ref_retired',
      entityType: 'training_ref', entityId: req.params.id,
      before: { status: ref.status }, after: { status }, reason,
    })
    res.json({ ok: true, status })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_training_ref_status_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
