// /api/admin/organizations/:orgId/pilot-report — the pilot technical report
// for one organization (PROD-READY Phase 8). DARK: 404 unless
// PRISM_PILOT_REPORT_EXPORT is on (registered OFF).
//
//   POST /:orgId/pilot-report   organizations:read + exports:create
//        { format: 'markdown' | 'json', term?, purpose (>= 10 chars) }
//
// Fills docs/commercial/PILOT_TECHNICAL_REPORT_TEMPLATE_v1.md from live
// aggregates (domain/pilotReport/service.js): small-group suppression,
// PROVISIONAL / INSUFFICIENT as computed, no individual result. Every export
// writes an admin_exports ledger row (counts nothing personal) and an admin
// audit event; a demo organization's report is labelled synthetic.
import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import logger from '../../lib/logger.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { query as defaultQuery, isDbConfigured } from '../../db/pool.js'
import { buildPilotReport, renderPilotReportMarkdown } from '../../domain/pilotReport/service.js'

export const PILOT_REPORT_FLAG = 'PRISM_PILOT_REPORT_EXPORT'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let defaultCampus = null
async function defaultCtx() {
  if (!defaultCampus) {
    const { createDefaultCampusContext } = await import('../../domain/campusStore/defaultContext.js')
    defaultCampus = createDefaultCampusContext()
  }
  return defaultCampus
}

async function defaultAdminState(sessionId) {
  if (!isDbConfigured()) return null
  const { rows } = await defaultQuery('SELECT invalid, review_state FROM admin_session_states WHERE session_id = $1', [String(sessionId)])
  return rows[0] ? { invalid: rows[0].invalid, reviewState: rows[0].review_state } : null
}

async function defaultLedger(req, entry) {
  await defaultQuery(
    `INSERT INTO admin_exports (export_id, admin_id, entity_type, filters, row_count, purpose) VALUES ($1,$2,$3,$4,$5,$6)`,
    [randomUUID(), req.admin.id, 'pilot_technical_report', JSON.stringify(entry.filters), 0, entry.purpose],
  )
}

// `campus`, `audit`, `ledger`, `adminState` and `clock` are injected by tests.
export function createPilotReportRouter({ campus = null, audit = adminAudit, ledger = defaultLedger, adminState = defaultAdminState, clock = () => new Date() } = {}) {
  const router = Router()
  router.post('/:orgId/pilot-report',
    (_req, res, next) => (process.env[PILOT_REPORT_FLAG] === 'true' ? next() : res.status(404).json({ error: 'Not found' })),
    requirePermission('organizations:read'), requirePermission('exports:create'),
    async (req, res) => {
      try {
        if (!UUID.test(req.params.orgId)) return res.status(404).json({ error: 'Not found.' })
        const { format = 'markdown', term = null, purpose } = req.body || {}
        if (!['markdown', 'json'].includes(format)) return res.status(400).json({ error: 'format must be markdown or json.' })
        const why = String(purpose || '').trim()
        if (why.length < 10) return res.status(400).json({ error: 'A specific purpose (>= 10 characters) is required — it goes on the export ledger.' })
        const termText = term == null ? null : String(term).replace(/[\r\n|]+/g, ' ').trim().slice(0, 80) || null
        const model = await buildPilotReport({ campus: campus || await defaultCtx(), organizationId: req.params.orgId, term: termText, adminState, now: clock() })
        const filters = { organizationId: req.params.orgId, format, term: termText, isDemo: model.organization.isDemo }
        await ledger(req, { filters, purpose: why.slice(0, 400) })
        await audit(req, {
          action: 'pilot_report_exported', entityType: 'organization', entityId: req.params.orgId,
          after: { format, term: termText, minGroupSize: model.minGroupSize, isDemo: model.organization.isDemo, version: model.version },
          reason: why.slice(0, 400),
        })
        res.set('Cache-Control', 'no-store')
        if (format === 'json') return res.json({ report: model })
        res.type('text/markdown; charset=utf-8').send(renderPilotReportMarkdown(model))
      } catch (err) {
        if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: 'Not found.' })
        if (err?.code === 'CAMPUS_STORE_UNAVAILABLE') return res.status(503).json({ error: 'The campus store is not available.' })
        logger.captureException(err, { msg: 'admin_pilot_report_failed', requestId: req.requestId })
        res.status(500).json({ error: 'Internal server error' })
      }
    })
  return router
}

export default createPilotReportRouter()
