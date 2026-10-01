// /api/admin/validation — staff plane of the V3 evidence double-rating queue
// (Campus Phase 12, C12.01). Dark unless PRISM_V3_RATING_QUEUE is on.
//
//   POST /enqueue     validation:manage   { sessionId, reason } queue a session's evidence units (identity-free items)
//   GET  /summary     psychometrics:read  queue counts
//   GET  /agreement   psychometrics:read  descriptive kappa per capability (claims stay PENDING)

import { Router } from 'express'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { ratingQueueEnabled, fail } from '../validation.js'

const SESSION_ID = /^[A-Za-z0-9._:-]{1,64}$/

let defaultCampus = null
async function defaultCtx() {
  if (!defaultCampus) {
    const { createDefaultCampusContext } = await import('../../domain/campusStore/defaultContext.js')
    defaultCampus = createDefaultCampusContext()
  }
  return defaultCampus
}

export function createValidationAdminRouter({ campus = null, audit = adminAudit } = {}) {
  const router = Router()
  const ctx = async () => campus || defaultCtx()
  router.use((req, res, next) => (ratingQueueEnabled() ? next() : res.status(404).json({ error: 'Not found' })))

  router.post('/enqueue', requirePermission('validation:manage'), async (req, res) => {
    try {
      const sessionId = String(req.body?.sessionId || '')
      const reason = String(req.body?.reason || '').trim()
      if (!SESSION_ID.test(sessionId)) return res.status(400).json({ error: 'sessionId is required.' })
      if (reason.length < 10) return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required.' })
      const out = await (await ctx()).validation.enqueueSession(sessionId, { enqueuedBy: `admin:${req.admin.id}` })
      await audit(req, { action: 'evidence_rating_enqueued', entityType: 'session', entityId: sessionId, after: out, reason: reason.slice(0, 500) })
      res.json({ ok: true, ...out })
    } catch (err) { fail(res, err, 'admin_validation_enqueue_failed', req) }
  })

  router.get('/summary', requirePermission('psychometrics:read'), async (req, res) => {
    try { res.json(await (await ctx()).validation.summary()) } catch (err) { fail(res, err, 'admin_validation_summary_failed', req) }
  })

  router.get('/agreement', requirePermission('psychometrics:read'), async (req, res) => {
    try { res.json(await (await ctx()).validation.agreement()) } catch (err) { fail(res, err, 'admin_validation_agreement_failed', req) }
  })

  return router
}

export default createValidationAdminRouter()
