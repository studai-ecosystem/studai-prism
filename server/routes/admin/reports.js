// /api/admin/reports — report administration (Control Centre Phase 2).
//
//   GET  /                  reports:read      list
//   GET  /:sessionId        reports:read      full report + version history + delivery state
//   POST /:sessionId/resend reports:resend    email the report link to the ACCOUNT email
//   POST /:sessionId/hold   reports:hold      delivery hold (reason required)
//   POST /:sessionId/release reports:hold     release hold
//   POST /:sessionId/supersede reports:supersede  DUAL-APPROVED reviewed score correction
//
// Supersession rules (plan §9 / prompt §8-9):
//   * never a silent overwrite — the current report is snapshotted into
//     report_versions before the correction is written, and every version is
//     kept forever;
//   * corrected scores pass the SAME clamp + weighted recompute as the scoring
//     pipeline (sharedConstants), so no correction can exceed 0–100 or bend
//     the published weights;
//   * requires an APPROVED admin_approvals row (action 'supersede_report',
//     entity = session id) decided by a DIFFERENT administrator;
//   * the assessment audit_log gets a row too — a score changed, and every
//     score-affecting decision writes the decision trail (build rule).

import { Router } from 'express'
import { randomUUID } from 'crypto'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import { requirePermission, consumeApproval } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { auditLog } from '../../lib/telemetry.js'
import { sanitizeCorrectionScores } from '../../lib/adminProduct.js'
import { listReports, getReport, saveReport } from '../../lib/store.js'
import { findUserById } from '../../lib/db.js'
import { isMailEnabled, sendReportLinkEmail } from '../../lib/mailer.js'

const router = Router()

async function deliveryState(sessionId) {
  const r = await query('SELECT * FROM report_admin_states WHERE session_id = $1', [sessionId])
    .catch(() => null)
  const row = r?.rows?.[0]
  return row
    ? { deliveryHold: row.delivery_hold, holdReason: row.hold_reason, updatedAt: row.updated_at }
    : { deliveryHold: false, holdReason: null, updatedAt: null }
}

async function versionsFor(sessionId) {
  const r = await query(
    `SELECT v.version_id, v.version, v.kind, v.reason, v.created_at, u.email AS created_by
       FROM report_versions v LEFT JOIN admin_users u ON u.admin_id = v.created_by
      WHERE v.session_id = $1 ORDER BY v.version ASC`,
    [sessionId],
  ).catch(() => null)
  return r?.rows || []
}

async function nextVersion(sessionId) {
  const r = await query(
    'SELECT COALESCE(MAX(version), 0) AS v FROM report_versions WHERE session_id = $1',
    [sessionId],
  )
  return Number(r?.rows?.[0]?.v || 0) + 1
}

// ── List ─────────────────────────────────────────────────────────────────────
router.get('/', requirePermission('reports:read'), async (req, res) => {
  try {
    const { q, userId, minOverall, maxOverall, page, pageSize } = req.query
    const result = await listReports({
      q: q ? String(q) : undefined,
      userId: userId ? String(userId) : undefined,
      minOverall: minOverall != null && minOverall !== '' ? Number(minOverall) : undefined,
      maxOverall: maxOverall != null && maxOverall !== '' ? Number(maxOverall) : undefined,
      page, pageSize,
    })
    res.json(result)
  } catch (err) {
    logger.captureException(err, { msg: 'admin_reports_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Detail ───────────────────────────────────────────────────────────────────
router.get('/:sessionId', requirePermission('reports:read'), async (req, res) => {
  try {
    const report = await getReport(req.params.sessionId)
    if (!report) return res.status(404).json({ error: 'Report not found.' })
    res.json({
      report,
      versions: await versionsFor(req.params.sessionId),
      delivery: await deliveryState(req.params.sessionId),
      mailEnabled: isMailEnabled(),
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_report_detail_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Resend (to the account email ONLY — audit C10) ───────────────────────────
router.post('/:sessionId/resend', requirePermission('reports:resend'), async (req, res) => {
  try {
    const report = await getReport(req.params.sessionId)
    if (!report) return res.status(404).json({ error: 'Report not found.' })

    const delivery = await deliveryState(req.params.sessionId)
    if (delivery.deliveryHold) {
      return res.status(409).json({ error: 'This report is under a delivery hold. Release it first.', code: 'HELD' })
    }
    if (!isMailEnabled()) {
      return res.status(503).json({ error: 'Email is not configured on this deployment.', code: 'MAIL_DISABLED' })
    }
    const user = report.userId ? await findUserById(report.userId) : null
    if (!user?.email) {
      return res.status(409).json({ error: 'No account email on record for this report.', code: 'NO_ACCOUNT_EMAIL' })
    }

    const base = process.env.PUBLIC_BASE_URL || 'https://prism.studai.one'
    await sendReportLinkEmail({
      to: user.email, // account email only — never caller-supplied
      name: user.name,
      reportUrl: `${base}/score?session=${encodeURIComponent(req.params.sessionId)}`,
    })
    await adminAudit(req, {
      action: 'report_resent', entityType: 'report', entityId: req.params.sessionId,
      reason: req.body?.reason || null,
    })
    res.json({ ok: true, sentTo: 'account email on record' })
  } catch (err) {
    if (err.message === 'mail_not_configured') {
      return res.status(503).json({ error: 'Email is not configured on this deployment.', code: 'MAIL_DISABLED' })
    }
    logger.captureException(err, { msg: 'admin_report_resend_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Delivery hold / release ──────────────────────────────────────────────────
async function setHold(req, res, hold) {
  const { reason } = req.body || {}
  if (!reason) return res.status(400).json({ error: 'A reason is required.' })
  const report = await getReport(req.params.sessionId)
  if (!report) return res.status(404).json({ error: 'Report not found.' })
  await query(
    `INSERT INTO report_admin_states (session_id, delivery_hold, hold_reason, updated_by, updated_at)
     VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (session_id) DO UPDATE SET delivery_hold = $2, hold_reason = $3, updated_by = $4, updated_at = now()`,
    [req.params.sessionId, hold, String(reason), req.admin.id],
  )
  await adminAudit(req, {
    action: hold ? 'report_held' : 'report_released',
    entityType: 'report', entityId: req.params.sessionId, reason,
  })
  res.json({ ok: true, deliveryHold: hold })
}

router.post('/:sessionId/hold', requirePermission('reports:hold'), (req, res) =>
  setHold(req, res, true).catch((err) => {
    logger.captureException(err, { msg: 'admin_report_hold_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }),
)

router.post('/:sessionId/release', requirePermission('reports:hold'), (req, res) =>
  setHold(req, res, false).catch((err) => {
    logger.captureException(err, { msg: 'admin_report_release_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }),
)

// ── Reviewed supersession (dual-approved) ────────────────────────────────────
router.post('/:sessionId/supersede', requirePermission('reports:supersede'), async (req, res) => {
  try {
    const { scores, reason } = req.body || {}
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required for a score correction.' })
    }
    const current = await getReport(req.params.sessionId)
    if (!current) return res.status(404).json({ error: 'Report not found.' })

    let clean
    try {
      clean = sanitizeCorrectionScores(scores)
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }

    // Dual control: a DIFFERENT administrator must have approved this exact
    // correction (action supersede_report, entity = session id).
    const approval = await consumeApproval('supersede_report', req.params.sessionId)
    if (!approval) {
      return res.status(409).json({
        error: 'Report supersession requires dual approval. Raise a request at POST /api/admin/admins/approvals with action "supersede_report" and this session id, approved by a different administrator.',
        code: 'APPROVAL_REQUIRED',
      })
    }

    // Version history: v1 is always the report as originally issued; each
    // correction appends exactly one new version. The pre-correction state is
    // therefore always the previous version row — nothing is ever overwritten.
    let v = await nextVersion(req.params.sessionId)
    if (v === 1) {
      await query(
        `INSERT INTO report_versions (version_id, session_id, version, kind, report, reason, created_by)
         VALUES ($1,$2,1,'initial',$3,'as originally issued',NULL)`,
        [randomUUID(), req.params.sessionId, JSON.stringify(current)],
      )
      v = 2
    }

    const corrected = {
      ...current,
      scores: clean,
      correction: {
        version: v,
        reason: String(reason).trim(),
        approvalId: approval.approval_id,
        correctedAt: new Date().toISOString(),
        previousOverall: current.scores?.overall ?? null,
        originallyIssuedAt: current.correction?.originallyIssuedAt || current.issuedAt || null,
      },
    }
    delete corrected.sessionId // saveReport re-stamps it
    await saveReport(req.params.sessionId, corrected)
    await query(
      `INSERT INTO report_versions (version_id, session_id, version, kind, report, reason, created_by)
       VALUES ($1,$2,$3,'correction',$4,$5,$6)`,
      [randomUUID(), req.params.sessionId, v, JSON.stringify(corrected), String(reason).trim(), req.admin.id],
    )

    // A score changed: decision-trail row in the assessment audit_log too.
    auditLog('report_superseded', req.params.sessionId, {
      by: 'admin_console',
      approvalId: approval.approval_id,
      before: current.scores,
      after: clean,
      reason: String(reason).trim(),
    })
    await adminAudit(req, {
      action: 'report_superseded', entityType: 'report', entityId: req.params.sessionId,
      before: { scores: current.scores }, after: { scores: clean },
      reason: String(reason).trim(), approvalId: approval.approval_id,
    })
    res.json({ ok: true, version: v, scores: clean })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_report_supersede_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
