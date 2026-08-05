// /api/admin/margin — charter §23 contribution-margin dashboard + finance export.
//
//   GET /summary          margin:read   channel stats, KNOWN AI cost, honest UNKNOWNs
//   GET /cohorts          margin:read   per-invite cohort accounting (§22 admin visibility)
//   GET /assessments/:sid margin:read   per-assessment cost rollup
//   GET /export.csv       margin:read   finance-ready CSV (ledgered via admin audit)
//
// HONESTY: unknown costs render as UNKNOWN, never zero; margins are UNKNOWN
// unless every input is measured (lib/margin.js). No profitability claims.

import { Router } from 'express'
import logger from '../../lib/logger.js'
import { isDbConfigured } from '../../db/pool.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { summarizeMargin, marginByCohort, rollupSessionCosts, financeExportRows } from '../../lib/margin.js'

const router = Router()

router.use((req, res, next) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Margin dashboard requires the database.' })
  next()
})

router.get('/summary', requirePermission('margin:read'), async (req, res) => {
  try {
    res.json(await summarizeMargin({ from: req.query.from || null, to: req.query.to || null }))
  } catch (err) {
    logger.captureException(err, { msg: 'admin_margin_summary_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/cohorts', requirePermission('margin:read'), async (req, res) => {
  try {
    res.json({ cohorts: await marginByCohort() })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_margin_cohorts_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/assessments/:sessionId', requirePermission('margin:read'), async (req, res) => {
  try {
    res.json(await rollupSessionCosts(req.params.sessionId))
  } catch (err) {
    logger.captureException(err, { msg: 'admin_margin_rollup_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// JSON twin of the CSV export for the admin console (adminFetch is JSON-only);
// same rows, same audit trail.
router.get('/export', requirePermission('margin:read'), async (req, res) => {
  try {
    const rows = await financeExportRows({ limit: req.query.limit })
    await adminAudit(req, {
      action: 'margin_export',
      entityType: 'finance_export',
      entityId: 'margin-json',
      after: { rows: rows.length },
    })
    res.json({ rows })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_margin_export_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/export.csv', requirePermission('margin:read'), async (req, res) => {
  try {
    const rows = await financeExportRows({ limit: req.query.limit })
    // Every finance export is audited (who exported, how many rows).
    await adminAudit(req, {
      action: 'margin_export',
      entityType: 'finance_export',
      entityId: 'margin-csv',
      after: { rows: rows.length },
    })
    const header = 'session_id,issued_at,channel,revenue_inr,ai_cost_usd'
    const lines = rows.map((r) =>
      [r.sessionId, r.issuedAt, r.channel, r.revenueInr, r.aiCostUsd].join(','))
    res.setHeader('content-type', 'text/csv; charset=utf-8')
    res.setHeader('content-disposition', 'attachment; filename="prism-margin-export.csv"')
    res.send([header, ...lines].join('\n'))
  } catch (err) {
    logger.captureException(err, { msg: 'admin_margin_export_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
