// /api/admin/payments — payments & entitlements (Control Centre Phase 2).
//
//   GET  /                    payments:read    list w/ filters
//   GET  /metrics             payments:read    finance summary
//   POST /grant               payments:grant   controlled entitlement (reason required)
//   POST /:sessionId/revoke   payments:revoke  revoke an UNUSED entitlement
//
// Successful payment identifiers and amounts are never edited — there is no
// endpoint for it. Corrections belong to a reconciliation ledger (Phase 5).

import { Router } from 'express'
import { randomUUID } from 'crypto'
import logger from '../../lib/logger.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import {
  listEntitlements, findEntitlementByRef, createEntitlement, revokeEntitlement,
} from '../../lib/store.js'

const router = Router()

router.get('/', requirePermission('payments:read'), async (req, res) => {
  try {
    const { q, mode, consumed, page, pageSize } = req.query
    const result = await listEntitlements({
      q: q ? String(q) : undefined,
      mode: mode ? String(mode) : undefined,
      consumed: consumed === 'true' ? true : consumed === 'false' ? false : undefined,
      page, pageSize,
    })
    res.json(result)
  } catch (err) {
    logger.captureException(err, { msg: 'admin_payments_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/metrics', requirePermission('payments:read'), async (req, res) => {
  try {
    // Aggregate over the full entitlement set (paged store scan, ≤100/page).
    const all = []
    let page = 1
    for (;;) {
      const batch = await listEntitlements({ page, pageSize: 100 })
      all.push(...batch.rows)
      if (page * batch.pageSize >= batch.total) break
      page += 1
      if (page > 200) break // hard safety cap
    }
    const paid = all.filter((p) => p.mode === 'paid')
    res.json({
      totalEntitlements: all.length,
      byMode: all.reduce((acc, p) => { acc[p.mode] = (acc[p.mode] || 0) + 1; return acc }, {}),
      paidCount: paid.length,
      revenue: paid.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
      unconsumed: all.filter((p) => !p.consumed).length,
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_payments_metrics_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/grant', requirePermission('payments:grant'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    const sessionId = randomUUID()
    // mode 'admin_grant' ≠ 'paid' → synthetic-flagged by the timeline rule,
    // so granted sessions stay out of calibration data (conservative default).
    const entitlement = await createEntitlement({ sessionId, mode: 'admin_grant', amount: 0 })
    await adminAudit(req, {
      action: 'entitlement_granted', entityType: 'entitlement', entityId: sessionId, reason,
    })
    res.status(201).json({ ok: true, entitlement })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_payment_grant_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:sessionId/revoke', requirePermission('payments:revoke'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    const before = await findEntitlementByRef(req.params.sessionId)
    const result = await revokeEntitlement(req.params.sessionId, reason)
    if (!result.ok) {
      if (result.error === 'NOT_FOUND') return res.status(404).json({ error: 'Entitlement not found.' })
      return res.status(409).json({
        error: 'This entitlement was already consumed by a started assessment — it cannot be revoked.',
        code: 'ALREADY_CONSUMED',
      })
    }
    await adminAudit(req, {
      action: 'entitlement_revoked', entityType: 'entitlement', entityId: req.params.sessionId,
      before: { consumed: before?.consumed ?? null, mode: before?.mode ?? null },
      after: { consumed: true, revoked: true }, reason,
    })
    res.json({ ok: true })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_payment_revoke_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
