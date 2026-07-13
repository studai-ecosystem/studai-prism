// /api/admin/disputes — dispute-management workspace (Control Centre Phase 2).
//
//   GET  /                disputes:read    list (workflow overlay + candidate statement)
//   GET  /:sessionId      disputes:read    full dispute file
//   POST /:sessionId/assign      disputes:manage  assign a reviewer
//   POST /:sessionId/transition  disputes:manage  state-machine transition (§10)
//   POST /:sessionId/notes       notes:write
//
// The candidate's statement (v1 store: reason/contact) is never edited. The
// expanded 9-state workflow lives in admin_dispute_workflow; the store's
// coarse 3-state status is kept in sync for compatibility. Resolution that
// changes a score happens via the reports supersession workflow — a dispute
// decision alone never mutates scores.

import { Router } from 'express'
import { randomUUID } from 'crypto'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import {
  DISPUTE_STATES, DISPUTE_TRANSITIONS, canTransitionDispute, coarseDisputeStatus,
} from '../../lib/adminProduct.js'
import { listDisputes, getDispute, setDisputeStatus, getReport, getEvents } from '../../lib/store.js'

const router = Router()

async function workflowFor(sessionIds) {
  if (!sessionIds.length) return {}
  const r = await query(
    `SELECT w.*, u.email AS assigned_email, d.email AS decided_email
       FROM admin_dispute_workflow w
       LEFT JOIN admin_users u ON u.admin_id = w.assigned_to
       LEFT JOIN admin_users d ON d.admin_id = w.decided_by
      WHERE w.session_id = ANY($1::text[])`,
    [sessionIds],
  ).catch(() => null)
  const map = {}
  for (const row of r?.rows || []) {
    map[row.session_id] = {
      state: row.state,
      assignedTo: row.assigned_to,
      assignedEmail: row.assigned_email,
      decision: row.decision,
      decidedBy: row.decided_email,
      decidedAt: row.decided_at,
      updatedAt: row.updated_at,
    }
  }
  return map
}

// ── List ─────────────────────────────────────────────────────────────────────
router.get('/', requirePermission('disputes:read'), async (req, res) => {
  try {
    const { status, state, page, pageSize } = req.query
    const result = await listDisputes({ status: status ? String(status) : undefined, page, pageSize })
    const workflow = await workflowFor(result.rows.map((d) => d.sessionId))
    let rows = result.rows.map((d) => ({ ...d, workflow: workflow[d.sessionId] || { state: 'open' } }))
    if (state) rows = rows.filter((d) => d.workflow.state === String(state))
    res.json({ ...result, rows, states: DISPUTE_STATES })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_disputes_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Detail ───────────────────────────────────────────────────────────────────
router.get('/:sessionId', requirePermission('disputes:read'), async (req, res) => {
  try {
    const dispute = await getDispute(req.params.sessionId)
    if (!dispute) return res.status(404).json({ error: 'Dispute not found.' })
    const [report, events] = await Promise.all([
      getReport(req.params.sessionId), getEvents(req.params.sessionId),
    ])
    const workflow = (await workflowFor([req.params.sessionId]))[req.params.sessionId] || { state: 'open' }
    const notes = await query(
      `SELECT n.note_id, n.category, n.body, n.created_at, u.email AS author
         FROM admin_notes n JOIN admin_users u ON u.admin_id = n.author_id
        WHERE n.entity_type = 'dispute' AND n.entity_id = $1 ORDER BY n.created_at DESC LIMIT 100`,
      [req.params.sessionId],
    ).then((r) => r?.rows || []).catch(() => [])
    const audit = await query(
      `SELECT action, admin_email, reason, created_at FROM admin_audit_events
        WHERE entity_type = 'dispute' AND entity_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.params.sessionId],
    ).then((r) => r?.rows || []).catch(() => [])

    res.json({
      dispute,
      workflow,
      allowedTransitions: DISPUTE_TRANSITIONS[workflow.state] || [],
      related: {
        report: report ? {
          overall: report.scores?.overall ?? null,
          reliability: report.reliability?.level || null,
          flaggedForReview: Boolean(report.flaggedForReview),
          issuedAt: report.issuedAt,
          correction: report.correction || null,
        } : null,
        integrityEventCount: events.length,
      },
      notes,
      audit,
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_dispute_detail_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Assign ───────────────────────────────────────────────────────────────────
router.post('/:sessionId/assign', requirePermission('disputes:manage'), async (req, res) => {
  try {
    const { adminId, reason } = req.body || {}
    if (!adminId) return res.status(400).json({ error: 'adminId is required.' })
    const dispute = await getDispute(req.params.sessionId)
    if (!dispute) return res.status(404).json({ error: 'Dispute not found.' })
    const target = await query('SELECT admin_id FROM admin_users WHERE admin_id = $1 AND state = $2', [adminId, 'active'])
    if (!target?.rows?.[0]) return res.status(400).json({ error: 'Assignee must be an active administrator.' })

    await query(
      `INSERT INTO admin_dispute_workflow (session_id, state, assigned_to, updated_at)
       VALUES ($1,'assigned',$2,now())
       ON CONFLICT (session_id) DO UPDATE SET
         assigned_to = $2,
         state = CASE WHEN admin_dispute_workflow.state = 'open' THEN 'assigned' ELSE admin_dispute_workflow.state END,
         updated_at = now()`,
      [req.params.sessionId, adminId],
    )
    await adminAudit(req, {
      action: 'dispute_assigned', entityType: 'dispute', entityId: req.params.sessionId,
      after: { assignedTo: adminId }, reason: reason || null,
    })
    res.json({ ok: true })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_dispute_assign_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── State transition ─────────────────────────────────────────────────────────
router.post('/:sessionId/transition', requirePermission('disputes:manage'), async (req, res) => {
  try {
    const { state, reason, decision } = req.body || {}
    if (!DISPUTE_STATES.includes(state)) {
      return res.status(400).json({ error: `state must be one of: ${DISPUTE_STATES.join(', ')}` })
    }
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    const dispute = await getDispute(req.params.sessionId)
    if (!dispute) return res.status(404).json({ error: 'Dispute not found.' })

    const current = (await workflowFor([req.params.sessionId]))[req.params.sessionId]?.state || 'open'
    if (!canTransitionDispute(current, state)) {
      return res.status(409).json({
        error: `Cannot move a dispute from '${current}' to '${state}'.`,
        code: 'BAD_TRANSITION',
        allowed: DISPUTE_TRANSITIONS[current] || [],
      })
    }
    const terminal = state === 'resolved' || state === 'rejected'
    if (terminal && (!decision || String(decision).trim().length < 10)) {
      return res.status(400).json({ error: 'Resolving or rejecting requires a written decision (>= 10 characters).' })
    }

    await query(
      `INSERT INTO admin_dispute_workflow (session_id, state, decision, decided_by, decided_at, updated_at)
       VALUES ($1,$2,$3,$4,CASE WHEN $5 THEN now() ELSE NULL END,now())
       ON CONFLICT (session_id) DO UPDATE SET
         state = $2,
         decision = COALESCE($3, admin_dispute_workflow.decision),
         decided_by = CASE WHEN $5 THEN $4 ELSE admin_dispute_workflow.decided_by END,
         decided_at = CASE WHEN $5 THEN now() ELSE admin_dispute_workflow.decided_at END,
         updated_at = now()`,
      [req.params.sessionId, state, terminal ? String(decision).trim() : null, req.admin.id, terminal],
    )
    // Keep the candidate-store coarse status in sync (open/in_review/resolved).
    await setDisputeStatus(req.params.sessionId, coarseDisputeStatus(state)).catch(() => null)

    await adminAudit(req, {
      action: 'dispute_state_changed', entityType: 'dispute', entityId: req.params.sessionId,
      before: { state: current }, after: { state, decision: terminal ? String(decision).trim() : undefined },
      reason,
    })
    res.json({ ok: true, state })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_dispute_transition_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Notes ────────────────────────────────────────────────────────────────────
router.post('/:sessionId/notes', requirePermission('notes:write'), async (req, res) => {
  try {
    const { body, category } = req.body || {}
    if (!body || !String(body).trim()) return res.status(400).json({ error: 'Note body required.' })
    const dispute = await getDispute(req.params.sessionId)
    if (!dispute) return res.status(404).json({ error: 'Dispute not found.' })
    const noteId = randomUUID()
    await query(
      `INSERT INTO admin_notes (note_id, entity_type, entity_id, author_id, category, body)
       VALUES ($1,'dispute',$2,$3,$4,$5)`,
      [noteId, req.params.sessionId, req.admin.id, String(category || 'general').slice(0, 40), String(body).slice(0, 4000)],
    )
    await adminAudit(req, { action: 'note_added', entityType: 'dispute', entityId: req.params.sessionId })
    res.status(201).json({ ok: true, noteId })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_dispute_note_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
