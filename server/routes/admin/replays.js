// /api/admin/replays — practice-replay administration (Control Centre Phase 4).
//
//   GET  /                 replays:read   list (+ abuse-flag state)
//   GET  /export           replays:read + exports:create — research export (ledgered)
//   GET  /:replayId        replays:read   full replay (turns + moment)
//   POST /:replayId/flag   replays:flag   abuse flag → admin incident + audit
//
// Structural guarantee (Track 5.1, unchanged): replays live in a practice-only
// ledger and can never touch a certified score or credential — this console
// adds no path that could. Erasure of replay data runs through the Phase 6
// privacy workflow, not ad-hoc deletion here.

import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import { requirePermission, hasPermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'

const router = Router()

router.get('/', requirePermission('replays:read'), async (req, res) => {
  try {
    const { sourceSessionId } = req.query
    const params = []
    let clause = ''
    if (sourceSessionId) { params.push(String(sourceSessionId)); clause = 'WHERE r.source_session_id = $1::uuid' }
    const r = await query(
      `SELECT r.replay_id, r.source_session_id, r.exchange_no, r.moment,
              jsonb_array_length(r.turns) AS turn_count, r.created_at,
              EXISTS (SELECT 1 FROM admin_incidents i
                       WHERE i.kind = 'replay_abuse' AND i.detail->>'replayId' = r.replay_id::text
                         AND i.status <> 'resolved') AS flagged
         FROM practice_replays r ${clause}
        ORDER BY r.created_at DESC LIMIT 200`,
      params,
    ).catch(() => null)
    res.json({
      replays: r?.rows || [],
      note: 'Practice-only ledger — replays never touch certified scores or credentials (structural). Erasure runs through the privacy workflow (Phase 6).',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_replays_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Research export — pseudonymous replay data; every export is ledgered.
router.get('/export', requirePermission('replays:read'), async (req, res) => {
  try {
    if (!hasPermission(req.admin, 'exports:create')) {
      return res.status(403).json({ error: 'missing permission: exports:create', code: 'FORBIDDEN' })
    }
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 200))
    const r = await query(
      `SELECT replay_id, source_session_id, exchange_no, moment, turns, is_practice, created_at
         FROM practice_replays ORDER BY created_at DESC LIMIT $1`,
      [limit],
    )
    const rows = r?.rows || []
    await query(
      `INSERT INTO admin_exports (export_id, admin_id, entity_type, filters, row_count, purpose)
       VALUES ($1,$2,'practice_replays',$3,$4,$5)`,
      [randomUUID(), req.admin.id, JSON.stringify({ limit }), rows.length,
       req.query.purpose ? String(req.query.purpose).slice(0, 400) : 'replay research export'],
    )
    await adminAudit(req, {
      action: 'replays_exported', entityType: 'export', entityId: null, after: { rows: rows.length },
    })
    res.json({ generatedAt: new Date().toISOString(), rows: rows.length, export: rows })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_replays_export_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:replayId', requirePermission('replays:read'), async (req, res) => {
  try {
    const r = await query('SELECT * FROM practice_replays WHERE replay_id = $1', [req.params.replayId])
    const replay = r?.rows?.[0]
    if (!replay) return res.status(404).json({ error: 'Replay not found.' })
    const incidents = await query(
      `SELECT incident_id, severity, status, detail, created_at FROM admin_incidents
        WHERE kind = 'replay_abuse' AND detail->>'replayId' = $1 ORDER BY created_at DESC`,
      [req.params.replayId],
    ).catch(() => null)
    res.json({ replay, incidents: incidents?.rows || [] })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_replay_detail_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:replayId/flag', requirePermission('replays:flag'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required to flag a replay.' })
    }
    const r = await query('SELECT replay_id, source_session_id FROM practice_replays WHERE replay_id = $1', [req.params.replayId])
    const replay = r?.rows?.[0]
    if (!replay) return res.status(404).json({ error: 'Replay not found.' })

    const incidentId = randomUUID()
    await query(
      `INSERT INTO admin_incidents (incident_id, kind, severity, title, detail, opened_by)
       VALUES ($1,'replay_abuse','medium','Practice replay flagged for abuse review',$2,$3)`,
      [incidentId, JSON.stringify({
        replayId: req.params.replayId,
        sourceSessionId: replay.source_session_id,
        reason: String(reason).trim(),
      }), req.admin.id],
    )
    await adminAudit(req, {
      action: 'replay_flagged', entityType: 'replay', entityId: req.params.replayId,
      after: { incidentId }, reason: String(reason).trim(),
    })
    res.status(201).json({ ok: true, incidentId })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_replay_flag_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
