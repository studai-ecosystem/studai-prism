// /api/admin/bank — scenario & item bank administration (Control Centre Phase 3).
//
//   GET  /scenarios          scenarios:read  bank grouped by scenario_key + freeze status
//   GET  /items              items:read      item/probe list w/ filters + response counts
//   POST /items/:id/retire   items:retire    retire (never delete) with reason
//
// THE FREEZE (build rule): the scenario bank stays at <= 8 active scenarios
// until the first IRT calibration run is FROZEN. There is deliberately NO
// create/edit endpoint here while frozen — per-item response counts must
// accumulate or nothing can ever be calibrated. The UI explains this instead
// of showing dead buttons. Calibrated or historically used items are retired
// or superseded, never deleted (item_responses reference them forever).

import { Router } from 'express'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { auditLog } from '../../lib/telemetry.js'

const router = Router()

async function bankFreezeStatus() {
  const r = await query(
    `SELECT run_id, created_at FROM calibration_runs
      WHERE run_type = 'irt' AND frozen = TRUE ORDER BY created_at DESC LIMIT 1`,
  ).catch(() => null)
  const frozenIrt = r?.rows?.[0] || null
  return {
    bankFrozen: !frozenIrt,
    unfrozenBy: frozenIrt ? { runId: frozenIrt.run_id, at: frozenIrt.created_at } : null,
    rule: 'Scenario bank is frozen at <= 8 active scenarios until the first IRT calibration run is frozen — per-item response counts must accumulate or nothing can be calibrated.',
  }
}

router.get('/scenarios', requirePermission('scenarios:read'), async (req, res) => {
  try {
    const r = await query(
      `SELECT scenario_key,
              COUNT(*)::int                                         AS item_count,
              COUNT(*) FILTER (WHERE kind = 'probe')::int           AS probe_count,
              COUNT(*) FILTER (WHERE status = 'provisional')::int   AS provisional,
              COUNT(*) FILTER (WHERE status = 'calibrated')::int    AS calibrated,
              COUNT(*) FILTER (WHERE status = 'retired')::int       AS retired,
              MIN(tier_label)                                       AS tier_label,
              (SELECT COUNT(*)::int FROM item_responses ir
                 JOIN items i2 ON i2.item_id = ir.item_id
                WHERE i2.scenario_key = items.scenario_key)         AS response_count
         FROM items GROUP BY scenario_key ORDER BY scenario_key`,
    )
    res.json({
      scenarios: (r?.rows || []).map((row) => ({
        ...row,
        // A scenario whose every item is retired is a retired scenario.
        status: row.retired === row.item_count ? 'retired' : row.calibrated > 0 ? 'calibrating' : 'provisional',
      })),
      freeze: await bankFreezeStatus(),
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_scenarios_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/items', requirePermission('items:read'), async (req, res) => {
  try {
    const { scenarioKey, kind, dimension, status } = req.query
    const where = []
    const params = []
    if (scenarioKey) { params.push(String(scenarioKey)); where.push(`i.scenario_key = $${params.length}`) }
    if (kind) { params.push(String(kind)); where.push(`i.kind = $${params.length}`) }
    if (dimension) { params.push(String(dimension)); where.push(`i.dimension = $${params.length}`) }
    if (status) { params.push(String(status)); where.push(`i.status = $${params.length}`) }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const r = await query(
      `SELECT i.item_id, i.scenario_key, i.kind, i.dimension, i.facet, i.tier_label,
              i.difficulty_b, i.discrimination_a, i.severity, i.status, i.created_at,
              (SELECT COUNT(*)::int FROM item_responses ir WHERE ir.item_id = i.item_id) AS response_count
         FROM items i ${clause}
        ORDER BY i.scenario_key, i.kind, i.dimension LIMIT 500`,
      params,
    )
    res.json({ items: r?.rows || [] })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_items_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/items/:id/retire', requirePermission('items:retire'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required to retire an item.' })
    }
    const before = await query('SELECT item_id, scenario_key, kind, dimension, status FROM items WHERE item_id = $1', [req.params.id])
    const item = before?.rows?.[0]
    if (!item) return res.status(404).json({ error: 'Item not found.' })
    if (item.status === 'retired') return res.status(409).json({ error: 'Item is already retired.' })

    await query(`UPDATE items SET status = 'retired' WHERE item_id = $1`, [req.params.id])
    // Item availability affects future probe selection — decision trail too.
    auditLog('item_retired', null, {
      by: 'admin_console', itemId: item.item_id, scenarioKey: item.scenario_key,
      kind: item.kind, dimension: item.dimension, reason: String(reason).trim(),
    })
    await adminAudit(req, {
      action: 'item_retired', entityType: 'item', entityId: req.params.id,
      before: { status: item.status }, after: { status: 'retired' }, reason: String(reason).trim(),
    })
    res.json({ ok: true, status: 'retired' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_item_retire_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
