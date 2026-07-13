// /api/admin/audit — audit-trail views (Control Centre Phase 6, plan §27).
//
//   GET /            audit:read  search (action, admin, entity, time range)
//   GET /entity/:type/:id        entity timeline (admin trail + assessment
//                                decision trail when the entity is a session)
//   GET /admins/:adminId/timeline  one administrator's actions
//   GET /security                security-event summary (failed logins,
//                                lockouts, break-glass, PII views, incidents)
//   GET /export                  ledgered JSON export (capped)
//
// STRUCTURALLY READ-ONLY: this router registers no mutating routes at all
// (test-enforced), and admin_audit_events blocks UPDATE/DELETE by trigger —
// the ordinary admin interface cannot edit or delete audit history.

import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'

const router = Router()

const SECURITY_ACTIONS = [
  'admin_login_failed', 'admin_mfa_failed', 'admin_login_new_ip', 'admin_login_blocked_locked',
  'break_glass_activated', 'admin_session_revoked', 'admin_password_reset',
  'verification_viewed', 'user_pii_viewed', 'admin_role_granted', 'admin_state_changed',
]

function buildFilters(qs) {
  const where = []
  const params = []
  if (qs.action) { params.push(String(qs.action)); where.push(`action = $${params.length}`) }
  if (qs.adminEmail) { params.push(`%${String(qs.adminEmail).toLowerCase()}%`); where.push(`LOWER(COALESCE(admin_email,'')) LIKE $${params.length}`) }
  if (qs.entityType) { params.push(String(qs.entityType)); where.push(`entity_type = $${params.length}`) }
  if (qs.entityId) { params.push(String(qs.entityId)); where.push(`entity_id = $${params.length}`) }
  if (qs.from) { params.push(String(qs.from)); where.push(`created_at >= $${params.length}::timestamptz`) }
  if (qs.to) { params.push(String(qs.to)); where.push(`created_at <= $${params.length}::timestamptz`) }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params }
}

router.get('/', requirePermission('audit:read'), async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize) || 50))
    const { clause, params } = buildFilters(req.query)
    const total = await query(`SELECT COUNT(*) FROM admin_audit_events ${clause}`, params)
    const rows = await query(
      `SELECT event_id, admin_email, roles, action, entity_type, entity_id, reason,
              approval_id, ip, request_id, created_at
         FROM admin_audit_events ${clause}
        ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    )
    res.json({
      total: Number(total?.rows?.[0]?.count || 0), page, pageSize,
      rows: rows?.rows || [],
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_audit_search_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/entity/:type/:id', requirePermission('audit:read'), async (req, res) => {
  try {
    const adminEvents = await query(
      `SELECT event_id, admin_email, action, before, after, reason, created_at
         FROM admin_audit_events WHERE entity_type = $1 AND entity_id = $2
        ORDER BY created_at DESC LIMIT 200`,
      [req.params.type, req.params.id],
    )
    // Sessions also carry the assessment decision trail (system decisions).
    let decisionTrail = []
    if (['session', 'report'].includes(req.params.type)) {
      decisionTrail = await query(
        `SELECT event_type, payload, created_at FROM audit_log
          WHERE session_id = $1::uuid ORDER BY id DESC LIMIT 200`,
        [req.params.id],
      ).then((r) => r?.rows || []).catch(() => [])
    }
    res.json({ adminEvents: adminEvents?.rows || [], decisionTrail })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_audit_entity_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/admins/:adminId/timeline', requirePermission('audit:read'), async (req, res) => {
  try {
    const rows = await query(
      `SELECT event_id, action, entity_type, entity_id, reason, ip, created_at
         FROM admin_audit_events WHERE admin_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [req.params.adminId],
    )
    res.json({ rows: rows?.rows || [] })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_audit_admin_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/security', requirePermission('audit:read'), async (req, res) => {
  try {
    const [events, byAction, lockedAccounts, breakGlassOpen, incidents] = await Promise.all([
      query(
        `SELECT event_id, admin_email, action, entity_type, entity_id, ip, created_at
           FROM admin_audit_events WHERE action = ANY($1::text[])
          ORDER BY created_at DESC LIMIT 100`,
        [SECURITY_ACTIONS],
      ).then((r) => r?.rows || []),
      query(
        `SELECT action, COUNT(*)::int AS n FROM admin_audit_events
          WHERE action = ANY($1::text[]) AND created_at > now() - interval '7 days'
          GROUP BY action ORDER BY n DESC`,
        [SECURITY_ACTIONS],
      ).then((r) => r?.rows || []),
      query(`SELECT COUNT(*) FROM admin_users WHERE locked_until > now()`).then((r) => Number(r.rows[0].count)),
      query(`SELECT COUNT(*) FROM admin_incidents WHERE status <> 'resolved'`).then((r) => Number(r.rows[0].count)),
      query(
        `SELECT incident_id, kind, severity, title, status, created_at
           FROM admin_incidents ORDER BY created_at DESC LIMIT 25`,
      ).then((r) => r?.rows || []),
    ])
    res.json({
      last7Days: byAction,
      lockedAdminAccounts: lockedAccounts,
      openIncidents: breakGlassOpen,
      incidents,
      recentEvents: events,
      watched: SECURITY_ACTIONS,
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_audit_security_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Export is a READ that must itself leave a trace: ledger + audit event.
router.get('/export', requirePermission('audit:read'), async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(5000, Number(req.query.limit) || 1000))
    const { clause, params } = buildFilters(req.query)
    const rows = await query(
      `SELECT * FROM admin_audit_events ${clause} ORDER BY created_at DESC LIMIT ${limit}`,
      params,
    )
    await query(
      `INSERT INTO admin_exports (export_id, admin_id, entity_type, filters, row_count, purpose)
       VALUES ($1,$2,'admin_audit_events',$3,$4,$5)`,
      [randomUUID(), req.admin.id, JSON.stringify({ ...req.query }), rows?.rows?.length || 0,
       req.query.purpose ? String(req.query.purpose).slice(0, 400) : 'audit export'],
    )
    await adminAudit(req, {
      action: 'audit_trail_exported', entityType: 'export', entityId: null,
      after: { rows: rows?.rows?.length || 0 },
    })
    res.json({ generatedAt: new Date().toISOString(), rows: rows?.rows?.length || 0, export: rows?.rows || [] })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_audit_export_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
