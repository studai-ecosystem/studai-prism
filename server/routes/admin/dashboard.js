// /api/admin/dashboard — Command Centre metrics, alerts, pending actions.
//
// Phase 1 scope: metrics available from the telemetry database plus admin-plane
// state. Read-only; requires dashboard:read. Store-backed counters (reports,
// disputes by status, payments) join in Phase 2 with the entity explorers.

import { Router } from 'express'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { countUsers } from '../../lib/db.js'
import { listReports, listDisputes, listEntitlements } from '../../lib/store.js'
import { runSentinels } from '../../lib/sentinels.js'
import { modelDriftStatus } from '../../lib/modelDrift.js'

const router = Router()

async function count(sql, params = []) {
  const r = await query(sql, params).catch(() => null)
  return r?.rows?.[0] ? Number(Object.values(r.rows[0])[0]) : 0
}

router.get('/', requirePermission('dashboard:read'), async (req, res) => {
  try {
    const [
      totalUsers,
      realSessions, syntheticSessions, sessionsLast7,
      credentialsActive, credentialsRevoked,
      activeStudies, qualifiedRaters, doubleRated,
      pendingApprovals, adminsActive, recentAdminEvents,
      breakGlassOpen,
      reportsTotal, disputesOpen, entitlementsUnconsumed,
    ] = await Promise.all([
      countUsers().catch(() => null),
      count('SELECT COUNT(*) FROM assessment_timeline WHERE is_synthetic = FALSE'),
      count('SELECT COUNT(*) FROM assessment_timeline WHERE is_synthetic = TRUE'),
      count("SELECT COUNT(*) FROM assessment_timeline WHERE completed_at > now() - interval '7 days'"),
      count("SELECT COUNT(*) FROM credentials WHERE status = 'active'"),
      count("SELECT COUNT(*) FROM credentials WHERE status = 'revoked'"),
      count("SELECT COUNT(*) FROM studies WHERE status = 'active'"),
      count("SELECT COUNT(*) FROM raters WHERE status = 'qualified'"),
      count(`SELECT COUNT(*) FROM (
               SELECT hr.session_id FROM human_ratings hr
                GROUP BY hr.session_id HAVING COUNT(DISTINCT hr.rater_id) >= 2) d`),
      count("SELECT COUNT(*) FROM admin_approvals WHERE status = 'pending' AND expires_at > now()"),
      count("SELECT COUNT(*) FROM admin_users WHERE state = 'active'"),
      query(
        `SELECT action, admin_email, entity_type, entity_id, created_at
           FROM admin_audit_events ORDER BY created_at DESC LIMIT 15`,
      ).then((r) => r?.rows || []).catch(() => []),
      count(`SELECT COUNT(*) FROM admin_incidents WHERE kind = 'break_glass' AND status = 'open'`),
      listReports({ page: 1, pageSize: 1 }).then((r) => r.total).catch(() => null),
      listDisputes({ status: 'open', page: 1, pageSize: 1 }).then((r) => r.total).catch(() => null),
      listEntitlements({ consumed: false, page: 1, pageSize: 1 }).then((r) => r.total).catch(() => null),
    ])

    res.json({
      metrics: {
        totalUsers,
        assessments: { real: realSessions, synthetic: syntheticSessions, last7Days: sessionsLast7 },
        credentials: { active: credentialsActive, revoked: credentialsRevoked },
        studiesActive: activeStudies,
        ratersQualified: qualifiedRaters,
        doubleRatedSessions: doubleRated,
        adminsActive,
        reportsTotal,
        disputesOpen,
        entitlementsUnconsumed,
      },
      pending: { approvals: pendingApprovals, breakGlassIncidents: breakGlassOpen },
      recentAdminActivity: recentAdminEvents,
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_dashboard_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Alerts: data-quality sentinels + model drift + admin-plane security signals.
// Reuses the pilot instruments (read-only by construction).
router.get('/alerts', requirePermission('dashboard:read'), async (req, res) => {
  try {
    const [sentinels, failedLogins24h, lockedAccounts] = await Promise.all([
      runSentinels().catch((err) => {
        logger.captureException(err, { msg: 'admin_dashboard_sentinels_failed' })
        return null
      }),
      count(`SELECT COUNT(*) FROM admin_audit_events
              WHERE action IN ('admin_login_failed','admin_mfa_failed')
                AND created_at > now() - interval '24 hours'`),
      count('SELECT COUNT(*) FROM admin_users WHERE locked_until > now()'),
    ])
    res.json({
      sentinels: sentinels?.alerts || [],
      modelDrift: modelDriftStatus(),
      security: { failedAdminLogins24h: failedLogins24h, lockedAdminAccounts: lockedAccounts },
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_dashboard_alerts_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
