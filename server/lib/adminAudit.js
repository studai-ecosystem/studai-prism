// Admin audit trail (Control Centre plan §27).
//
// Every administrative MUTATION writes an immutable admin_audit_events row
// (UPDATE/DELETE blocked by trigger, migration 0011). Two mechanisms:
//
//   1. adminAudit(...)        — explicit writes (auth events, precise
//                               before/after states from handlers).
//   2. adminAuditMiddleware   — safety net: any mutating /api/admin request
//                               that completes without an explicit audit row
//                               still gets a generic one, so no mutation can
//                               ship unaudited by omission.
//
// This trail is SEPARATE from the assessment audit_log (score decisions):
// that table records what the SYSTEM decided; this one records what a HUMAN
// ADMINISTRATOR did.

import { query } from '../db/pool.js'
import logger from './logger.js'

export async function adminAudit(req, {
  action,
  entityType = null,
  entityId = null,
  before = null,
  after = null,
  reason = null,
  approvalId = null,
  adminOverride = null, // for auth events before req.admin exists
}) {
  const admin = adminOverride || req.admin || {}
  try {
    await query(
      `INSERT INTO admin_audit_events
         (admin_id, admin_email, roles, action, entity_type, entity_id,
          before, after, reason, approval_id, ip, user_agent, request_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        admin.id || null,
        admin.email || null,
        JSON.stringify(admin.roles || []),
        action,
        entityType,
        entityId != null ? String(entityId) : null,
        before != null ? JSON.stringify(before) : null,
        after != null ? JSON.stringify(after) : null,
        reason,
        approvalId,
        req.ip || null,
        req.get?.('user-agent')?.slice(0, 400) || null,
        req.requestId || null,
      ],
    )
    if (req.res?.locals) req.res.locals.audited = true
    else if (req._auditRes?.locals) req._auditRes.locals.audited = true
  } catch (err) {
    // An unauditable mutation is a security event in itself — surface loudly.
    logger.captureException(err, { msg: 'admin_audit_write_failed', action, requestId: req.requestId })
  }
}

// Handlers can call res.locals.setAudit({...}) to enrich the automatic row, or
// call adminAudit() themselves (which sets res.locals.audited).
export function adminAuditMiddleware(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  req._auditRes = res
  res.locals.audited = false
  res.locals.auditInfo = null
  res.locals.setAudit = (info) => { res.locals.auditInfo = info }

  res.on('finish', () => {
    // Only successful mutations need the safety net; failures changed nothing.
    if (res.locals.audited || res.statusCode >= 400) return
    const info = res.locals.auditInfo || {}
    adminAudit(req, {
      action: info.action || `${req.method} ${req.baseUrl}${req.path}`,
      entityType: info.entityType || null,
      entityId: info.entityId || null,
      before: info.before || null,
      after: info.after || null,
      reason: info.reason || req.body?.reason || null,
      approvalId: info.approvalId || null,
    })
  })
  next()
}
