// /api/admin/records — consents, verifications, integrity events (Phase 2).
//
//   GET  /consents                 consents:read          list
//   GET  /verifications            verifications:read     list (PII masked)
//   GET  /verifications/:sessionId verifications:read     detail; unmasked ONLY
//                                  with verifications:read_pii — and that view
//                                  is itself audited (plan §5)
//   GET  /events                   integrity:read         filterable event list
//   POST /events/review            integrity:review       reviewer decision on one event
//
// Proctoring events never auto-invalidate anyone (prompt §22): a reviewer
// decision here is a recorded human judgement; consequences (e.g. marking a
// session invalid) are separate, deliberate actions on the session itself.

import { Router } from 'express'
import { randomUUID } from 'crypto'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import { requirePermission, hasPermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { maskVerification } from '../../lib/adminProduct.js'
import { listConsents, listVerifications, listEventsFiltered, getVerification } from '../../lib/store.js'

const router = Router()

router.get('/consents', requirePermission('consents:read'), async (req, res) => {
  try {
    const { page, pageSize } = req.query
    const result = await listConsents({ page, pageSize })
    res.json({
      ...result,
      rows: result.rows.map((c) => ({
        sessionId: c.sessionId,
        scopes: c.scopes,
        consentVersion: c.meta?.consentVersion || null,
        at: c.at,
      })),
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_consents_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/verifications', requirePermission('verifications:read'), async (req, res) => {
  try {
    const { status, page, pageSize } = req.query
    const result = await listVerifications({ status: status ? String(status) : undefined, page, pageSize })
    // List view is ALWAYS masked — identity fields require the detail endpoint
    // with read_pii, which audits each access.
    res.json({ ...result, rows: result.rows.map(maskVerification) })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_verifications_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/verifications/:sessionId', requirePermission('verifications:read'), async (req, res) => {
  try {
    const v = await getVerification(req.params.sessionId)
    if (!v) return res.status(404).json({ error: 'Verification record not found.' })
    const canSeePii = hasPermission(req.admin, 'verifications:read_pii')
    if (canSeePii) {
      await adminAudit(req, {
        action: 'verification_viewed', entityType: 'verification', entityId: req.params.sessionId,
        reason: req.query.reason ? String(req.query.reason) : null,
      })
      return res.json({ verification: v, pii: 'unmasked' })
    }
    res.json({ verification: maskVerification(v) })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_verification_detail_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/events', requirePermission('integrity:read'), async (req, res) => {
  try {
    const { sessionId, type, page, pageSize } = req.query
    const result = await listEventsFiltered({
      sessionId: sessionId ? String(sessionId) : undefined,
      type: type ? String(type) : undefined,
      page, pageSize,
    })
    // Attach reviewer decisions for the visible page.
    const keys = result.rows.map((e) => [e.sessionId, e.type, e.at])
    let reviews = []
    if (keys.length) {
      const r = await query(
        `SELECT ir.*, u.email AS reviewer FROM integrity_reviews ir
           JOIN admin_users u ON u.admin_id = ir.reviewed_by
          WHERE ir.session_id = ANY($1::text[])`,
        [[...new Set(result.rows.map((e) => e.sessionId))]],
      ).catch(() => null)
      reviews = r?.rows || []
    }
    const reviewMap = new Map(reviews.map((r) => [`${r.session_id}|${r.event_type}|${r.event_at}`, r]))
    res.json({
      ...result,
      rows: result.rows.map((e) => {
        const review = reviewMap.get(`${e.sessionId}|${e.type}|${e.at}`)
        return {
          ...e,
          review: review
            ? { decision: review.decision, note: review.note, reviewer: review.reviewer, at: review.created_at }
            : null,
        }
      }),
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_events_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/events/review', requirePermission('integrity:review'), async (req, res) => {
  try {
    const { sessionId, eventType, eventAt, decision, note } = req.body || {}
    if (!sessionId || !eventType || !eventAt) {
      return res.status(400).json({ error: 'sessionId, eventType and eventAt are required.' })
    }
    if (!['false_positive', 'confirmed', 'escalated'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be false_positive, confirmed or escalated.' })
    }
    await query(
      `INSERT INTO integrity_reviews (review_id, session_id, event_type, event_at, decision, note, reviewed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (session_id, event_type, event_at) DO UPDATE SET
         decision = EXCLUDED.decision, note = EXCLUDED.note,
         reviewed_by = EXCLUDED.reviewed_by, created_at = now()`,
      [randomUUID(), String(sessionId), String(eventType), String(eventAt),
       decision, note ? String(note).slice(0, 2000) : null, req.admin.id],
    )
    await adminAudit(req, {
      action: 'integrity_event_reviewed', entityType: 'session', entityId: String(sessionId),
      after: { eventType, eventAt, decision }, reason: note || null,
    })
    res.json({ ok: true })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_event_review_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
