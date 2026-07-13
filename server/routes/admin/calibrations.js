// /api/admin/calibrations — calibration-run lifecycle (Control Centre Phase 3).
//
//   GET  /            calibrations:read    list w/ derived status
//   GET  /:id         calibrations:read    full run (inputs summary + outputs)
//   POST /:id/freeze  calibrations:freeze  DUAL-APPROVED review checkpoint
//   POST /:id/apply   calibrations:apply   DUAL-APPROVED activation — REAL effect:
//                                          scoring/equating.js keys on
//                                          frozen = true AND applied = true
//   POST /:id/reject  calibrations:freeze  mark unusable with reason
//
// Rules (plan §13): freezing and applying are SEPARATE deliberate actions,
// each requiring reason + a second administrator's approval. Exactly one
// applied run per run_type — applying a new run atomically un-applies and
// marks the previous one superseded. Applied history is never deleted.

import { Router } from 'express'
import logger from '../../lib/logger.js'
import { query, getPool } from '../../db/pool.js'
import { requirePermission, consumeApproval } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { auditLog } from '../../lib/telemetry.js'

const router = Router()

function derivedStatus(run) {
  if (run.rejected) return 'rejected'
  if (run.applied) return 'applied'
  if (run.superseded_by) return 'superseded'
  if (run.frozen) return 'frozen'
  return 'draft'
}

router.get('/', requirePermission('calibrations:read'), async (req, res) => {
  try {
    const { runType } = req.query
    const params = []
    let clause = ''
    if (runType) { params.push(String(runType)); clause = 'WHERE run_type = $1' }
    const r = await query(
      `SELECT run_id, run_type, inputs_summary, frozen, applied, rejected, superseded_by,
              review_note, frozen_at, applied_at, created_at
         FROM calibration_runs ${clause} ORDER BY created_at DESC LIMIT 200`,
      params,
    )
    res.json({
      runs: (r?.rows || []).map((run) => ({ ...run, status: derivedStatus(run) })),
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_calibrations_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:id', requirePermission('calibrations:read'), async (req, res) => {
  try {
    const r = await query('SELECT * FROM calibration_runs WHERE run_id = $1', [req.params.id])
    const run = r?.rows?.[0]
    if (!run) return res.status(404).json({ error: 'Calibration run not found.' })
    res.json({ run: { ...run, status: derivedStatus(run) } })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_calibration_detail_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Freeze (dual-approved review checkpoint) ─────────────────────────────────
router.post('/:id/freeze', requirePermission('calibrations:freeze'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'A specific review reason (>= 10 characters) is required to freeze a run.' })
    }
    const r = await query('SELECT * FROM calibration_runs WHERE run_id = $1', [req.params.id])
    const run = r?.rows?.[0]
    if (!run) return res.status(404).json({ error: 'Calibration run not found.' })
    if (run.rejected) return res.status(409).json({ error: 'This run was rejected — it cannot be frozen.', code: 'REJECTED' })
    if (run.frozen) return res.status(409).json({ error: 'This run is already frozen.', code: 'ALREADY_FROZEN' })

    const approval = await consumeApproval('freeze_calibration', req.params.id)
    if (!approval) {
      return res.status(409).json({
        error: 'Freezing a calibration run requires dual approval. Raise a request with action "freeze_calibration" and this run id, approved by a different administrator.',
        code: 'APPROVAL_REQUIRED',
      })
    }

    await query(
      `UPDATE calibration_runs SET frozen = TRUE, frozen_at = now(), frozen_by = $2,
              reviewed_by = $2, review_note = $3 WHERE run_id = $1`,
      [req.params.id, req.admin.id, String(reason).trim()],
    )
    auditLog('calibration_frozen', null, {
      by: 'admin_console', runId: req.params.id, runType: run.run_type,
      approvalId: approval.approval_id, reason: String(reason).trim(),
    })
    await adminAudit(req, {
      action: 'calibration_frozen', entityType: 'calibration_run', entityId: req.params.id,
      after: { runType: run.run_type, frozen: true }, reason: String(reason).trim(),
      approvalId: approval.approval_id,
    })
    res.json({ ok: true, status: 'frozen' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_calibration_freeze_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Apply (dual-approved; one applied run per run_type) ──────────────────────
router.post('/:id/apply', requirePermission('calibrations:apply'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required to apply a run.' })
    }
    const r = await query('SELECT * FROM calibration_runs WHERE run_id = $1', [req.params.id])
    const run = r?.rows?.[0]
    if (!run) return res.status(404).json({ error: 'Calibration run not found.' })
    if (run.rejected) return res.status(409).json({ error: 'This run was rejected — it cannot be applied.', code: 'REJECTED' })
    if (!run.frozen) {
      return res.status(409).json({
        error: 'Only FROZEN runs can be applied. Freeze (with its own dual approval) first — freezing and applying are separate deliberate actions.',
        code: 'NOT_FROZEN',
      })
    }
    if (run.applied) return res.status(409).json({ error: 'This run is already the applied run for its type.', code: 'ALREADY_APPLIED' })

    const approval = await consumeApproval('apply_calibration', req.params.id)
    if (!approval) {
      return res.status(409).json({
        error: 'Applying a calibration run requires dual approval. Raise a request with action "apply_calibration" and this run id, approved by a different administrator.',
        code: 'APPROVAL_REQUIRED',
      })
    }

    // Atomic hand-over: exactly one applied run per run_type.
    const pool = getPool()
    const client = await pool.connect()
    let previous = null
    try {
      await client.query('BEGIN')
      const prev = await client.query(
        `UPDATE calibration_runs SET applied = FALSE, superseded_by = $2
          WHERE run_type = $1 AND applied = TRUE RETURNING run_id`,
        [run.run_type, req.params.id],
      )
      previous = prev?.rows?.[0]?.run_id || null
      await client.query(
        `UPDATE calibration_runs SET applied = TRUE, applied_at = now(), applied_by = $2
          WHERE run_id = $1`,
        [req.params.id, req.admin.id],
      )
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    // Applying a calibration changes how scores are computed (equating reads
    // frozen+applied) — this is a score-affecting decision. Decision trail:
    auditLog('calibration_applied', null, {
      by: 'admin_console', runId: req.params.id, runType: run.run_type,
      supersededRunId: previous, approvalId: approval.approval_id, reason: String(reason).trim(),
    })
    await adminAudit(req, {
      action: 'calibration_applied', entityType: 'calibration_run', entityId: req.params.id,
      before: { previousApplied: previous }, after: { runType: run.run_type, applied: true },
      reason: String(reason).trim(), approvalId: approval.approval_id,
    })
    res.json({ ok: true, status: 'applied', supersededRunId: previous })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_calibration_apply_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Reject ───────────────────────────────────────────────────────────────────
router.post('/:id/reject', requirePermission('calibrations:freeze'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required to reject a run.' })
    }
    const r = await query('SELECT * FROM calibration_runs WHERE run_id = $1', [req.params.id])
    const run = r?.rows?.[0]
    if (!run) return res.status(404).json({ error: 'Calibration run not found.' })
    if (run.applied) {
      return res.status(409).json({
        error: 'The APPLIED run cannot be rejected — apply a replacement run instead (supersession), so scoring never loses its calibration.',
        code: 'APPLIED',
      })
    }
    if (run.rejected) return res.status(409).json({ error: 'Already rejected.' })

    await query(
      `UPDATE calibration_runs SET rejected = TRUE, reviewed_by = $2, review_note = $3 WHERE run_id = $1`,
      [req.params.id, req.admin.id, String(reason).trim()],
    )
    await adminAudit(req, {
      action: 'calibration_rejected', entityType: 'calibration_run', entityId: req.params.id,
      after: { runType: run.run_type, rejected: true }, reason: String(reason).trim(),
    })
    res.json({ ok: true, status: 'rejected' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_calibration_reject_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
