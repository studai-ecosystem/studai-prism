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
import { auditLog } from '../../lib/telemetry.js'
import {
  DISPUTE_STATES, DISPUTE_TRANSITIONS, canTransitionDispute, coarseDisputeStatus, businessDaysSince,
} from '../../lib/adminProduct.js'
import { REVIEW_OUTCOMES, REVIEW_TARGET_BUSINESS_DAYS } from '../../lib/sharedConstants.js'
import { toOperationalReport } from '../../lib/reportPolicy.js'
import { loadPromptJson } from '../../engine/prompts.js'
import { getLatestCredential, revokeCredential } from '../../lib/credentials.js'
import { listDisputes, getDispute, setDisputeStatus, setDisputeResolution, getReport, getEvents, createEntitlement } from '../../lib/store.js'

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
    // Charter §11: seven-business-day decision-target MONITORING (a target we
    // track — not a guaranteed legal SLA).
    let rows = result.rows.map((d) => {
      const w = workflow[d.sessionId] || { state: 'open' }
      const terminal = w.state === 'resolved' || w.state === 'rejected'
      const ageBusinessDays = terminal ? null : businessDaysSince(d.at)
      return {
        ...d,
        workflow: w,
        ageBusinessDays,
        overdue: typeof ageBusinessDays === 'number' && ageBusinessDays > REVIEW_TARGET_BUSINESS_DAYS,
      }
    })
    if (state) rows = rows.filter((d) => d.workflow.state === String(state))
    res.json({
      ...result,
      rows,
      states: DISPUTE_STATES,
      reviewTarget: { businessDays: REVIEW_TARGET_BUSINESS_DAYS, note: 'decision target we monitor — not a guaranteed legal SLA' },
    })
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
        // Charter §6: no composite in ordinary operational views.
        report: report ? {
          reportReady: true,
          reliability: report.reliability?.level || null,
          flaggedForReview: Boolean(report.flaggedForReview),
          issuedAt: report.issuedAt,
          corrected: Boolean(report.correction),
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

// ── Blinded review packet (charter §11) ──────────────────────────────────────
// Reviewers are blinded to unnecessary identity: the packet carries ONLY the
// identity-scrubbed transcript (§5 blinded turns), the rubric, the evidence,
// the administration context and the system output required for the review —
// never the candidate's name, email or account details. Assembly is audited.
router.get('/:sessionId/review-packet', requirePermission('disputes:manage'), async (req, res) => {
  try {
    const sid = req.params.sessionId
    const dispute = await getDispute(sid)
    if (!dispute) return res.status(404).json({ error: 'Dispute not found.' })
    const report = await getReport(sid)
    if (!report) return res.status(404).json({ error: 'No report for this session.' })

    const transcript = await query(
      'SELECT turns, scenario_key, is_synthetic FROM session_transcripts WHERE session_id = $1',
      [sid],
    ).then((r) => r?.rows?.[0] || null).catch(() => null)
    const timeline = await query(
      'SELECT scenario_key, scale_version, consent_version, flags_active, language FROM assessment_timeline WHERE session_id = $1',
      [sid],
    ).then((r) => r?.rows?.[0] || null).catch(() => null)

    const ops = toOperationalReport(report)
    await adminAudit(req, { action: 'review_packet_assembled', entityType: 'dispute', entityId: sid })
    auditLog('review_packet_assembled', sid, { by: 'admin_console' })
    res.json({
      note: 'BLINDED review packet — no candidate identity. Integrity signals never change capability scores.',
      candidateStatement: { reason: dispute.reason, at: dispute.at },
      transcript: transcript?.turns || null,
      rubric: loadPromptJson('dimension_rubric.v1'),
      administration: timeline ? {
        scenarioKey: timeline.scenario_key,
        scaleVersion: timeline.scale_version,
        consentVersion: timeline.consent_version,
        flagsActive: timeline.flags_active,
        language: timeline.language,
      } : { scenario: report.scenario || null, language: report.scoring?.language || 'en' },
      systemOutput: {
        scores: ops.scores || null,
        insufficientEvidence: ops.insufficientEvidence || [],
        evidence: report.evidence || null,
        feedback: report.feedback || null,
        highlights: report.highlights || [],
        growthAreas: report.growthAreas || [],
        reliability: report.reliability || null,
      },
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_dispute_packet_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Decide (charter §11) ─────────────────────────────────────────────────────
// The four review outcomes. Every decision writes immutable audit rows and a
// candidate-READABLE explanation (private reviewer reasoning stays in notes).
//   upheld                    — report stands as issued.
//   invalidated_reassessment  — session invalidated; a FREE reassessment
//                               entitlement (mode 'review_grant') is minted and
//                               any active credential is revoked so every
//                               shared verification link shows the change.
//   superseded                — decision recorded here; the corrected report
//                               itself goes through the dual-approved
//                               supersession workflow (reports plane), which
//                               reissues the credential chain.
//   second_review             — routed back for another blinded review cycle.
router.post('/:sessionId/decide', requirePermission('disputes:manage'), async (req, res) => {
  try {
    const sid = req.params.sessionId
    const { outcome, explanation, reason } = req.body || {}
    if (!Object.hasOwn(REVIEW_OUTCOMES, String(outcome || ''))) {
      return res.status(400).json({ error: `outcome must be one of: ${Object.keys(REVIEW_OUTCOMES).join(', ')}` })
    }
    if (!explanation || String(explanation).trim().length < 20) {
      return res.status(400).json({ error: 'A candidate-readable explanation (>= 20 characters) is required.' })
    }
    const dispute = await getDispute(sid)
    if (!dispute) return res.status(404).json({ error: 'Dispute not found.' })
    if (dispute.resolution) {
      return res.status(409).json({ error: 'This review has already been decided.', code: 'ALREADY_DECIDED' })
    }

    const secondReview = outcome === 'second_review'
    const nextState = secondReview ? 'human_review' : 'resolved'
    await query(
      `INSERT INTO admin_dispute_workflow (session_id, state, decision, decided_by, decided_at, updated_at)
       VALUES ($1,$2,$3,$4,CASE WHEN $5 THEN now() ELSE NULL END,now())
       ON CONFLICT (session_id) DO UPDATE SET
         state = $2,
         decision = $3,
         decided_by = CASE WHEN $5 THEN $4 ELSE admin_dispute_workflow.decided_by END,
         decided_at = CASE WHEN $5 THEN now() ELSE admin_dispute_workflow.decided_at END,
         updated_at = now()`,
      [sid, nextState, `${outcome}: ${String(explanation).trim()}`, req.admin.id, !secondReview],
    ).catch(() => null)

    let reassessmentSessionId = null
    let credentialRevoked = false
    if (outcome === 'invalidated_reassessment') {
      // Free reassessment — a REAL candidate mode (calibration-eligible).
      reassessmentSessionId = randomUUID()
      await createEntitlement({ sessionId: reassessmentSessionId, mode: 'review_grant', amount: 0 })
      // §11: previously shared verification links must show the change —
      // revoking the credential turns every share/verify surface into an
      // explicit 'revoked' verdict (the notification mechanism link-holders see).
      const credential = await getLatestCredential(sid).catch(() => null)
      if (credential && credential.status === 'active') {
        credentialRevoked = Boolean(await revokeCredential(credential.credential_id, 'assessment invalidated after human review'))
      }
    }

    if (!secondReview) {
      // Candidate-readable outcome (never private reviewer reasoning).
      await setDisputeResolution(sid, {
        outcome,
        outcomeLabel: REVIEW_OUTCOMES[outcome],
        explanation: String(explanation).trim().slice(0, 2000),
        decidedAt: new Date().toISOString(),
        ...(reassessmentSessionId ? { reassessmentSessionId } : {}),
      })
      await setDisputeStatus(sid, 'resolved').catch(() => null)
    } else {
      await setDisputeStatus(sid, 'in_review').catch(() => null)
    }

    // Immutable decision trail — assessment audit_log AND admin plane.
    auditLog('review_decision', sid, {
      outcome,
      by: 'admin_console',
      reassessmentSessionId,
      credentialRevoked,
    })
    await adminAudit(req, {
      action: 'review_decided', entityType: 'dispute', entityId: sid,
      after: { outcome, reassessmentSessionId, credentialRevoked },
      reason: reason || String(explanation).trim().slice(0, 200),
    })

    res.json({ ok: true, outcome, state: nextState, reassessmentSessionId, credentialRevoked })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_dispute_decide_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
