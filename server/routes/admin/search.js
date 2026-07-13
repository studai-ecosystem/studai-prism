// /api/admin/search — global search (Control Centre Phase 2, plan §6).
//
// One query across candidates, sessions, payments, credentials and disputes.
// Results are PERMISSION-FILTERED: each group is looked up only when the
// caller holds its read permission, and PII masking follows the same rules as
// the entity endpoints. No permission → the group is absent, not empty.

import { Router } from 'express'
import logger from '../../lib/logger.js'
import { query, isDbConfigured } from '../../db/pool.js'
import { hasPermission } from '../../lib/adminAuth.js'
import { maskEmail } from '../../lib/adminProduct.js'
import { listUsers } from '../../lib/db.js'
import { listSessions, findEntitlementByRef, getDispute, getReport } from '../../lib/store.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    if (q.length < 3) return res.status(400).json({ error: 'Query must be at least 3 characters.' })
    const results = {}

    if (hasPermission(req.admin, 'users:read')) {
      const canSeePii = hasPermission(req.admin, 'users:read_pii')
      const users = await listUsers({ q, page: 1, pageSize: 5 })
      results.users = users.rows.map((u) => ({
        id: u.id,
        email: canSeePii ? u.email : maskEmail(u.email),
        name: u.name || '',
        accountState: u.accountState || 'active',
      }))
    }

    if (hasPermission(req.admin, 'sessions:read')) {
      const sessions = await listSessions({ q, page: 1, pageSize: 5 })
      results.sessions = sessions.rows.map((s) => ({
        sessionId: s.sessionId, scenarioId: s.scenarioId,
        startedAt: s.startedAt, completedAt: s.completedAt,
      }))
      const report = await getReport(q)
      if (report) {
        results.sessions.unshift({
          sessionId: q, scenarioId: report.scenario?.title || null,
          startedAt: null, completedAt: null, exactReportMatch: true,
        })
      }
    }

    if (hasPermission(req.admin, 'payments:read')) {
      const ent = await findEntitlementByRef(q)
      results.payments = ent ? [ent] : []
    }

    if (hasPermission(req.admin, 'disputes:read')) {
      const dispute = await getDispute(q)
      results.disputes = dispute ? [{ sessionId: dispute.sessionId, status: dispute.status, at: dispute.at }] : []
    }

    if (hasPermission(req.admin, 'credentials:read') && isDbConfigured()) {
      const creds = await query(
        `SELECT credential_id, session_id, status, issued_at FROM credentials
          WHERE credential_id::text = $1 OR session_id::text = $1
          ORDER BY issued_at DESC LIMIT 5`,
        [q],
      ).catch(() => null)
      results.credentials = creds?.rows || []
    }

    res.json({ q, results })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_search_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
