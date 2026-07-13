// /api/admin/exports — research exports with a mandatory ledger (Phase 4).
//
//   GET  /           exports:create   export ledger (who exported what, when, why)
//   POST /research   exports:create   pseudonymous research export
//
// Rules: only PSEUDONYMOUS research tables are exportable (allowlist below —
// no users, no verifications, no consents, nothing with PII). Every export
// writes an admin_exports ledger row + audit event. Exports beyond the row
// cap are dual-approved ('large_export') per plan §29.

import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import { requirePermission, consumeApproval } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'

const router = Router()

const DEFAULT_CAP = 1000

// Allowlisted pseudonymous datasets → exact SQL (no caller-supplied columns).
const DATASETS = {
  timeline: `SELECT timeline_id, candidate_id, session_id, attempt_no, scenario_key, scale_version,
                    consent_version, language, is_synthetic, final_theta, completed_at
               FROM assessment_timeline ORDER BY completed_at DESC`,
  item_responses: `SELECT response_id, session_id, item_id, exchange_no, latency_ms, asr_confidence,
                          micro_levels, behavior, created_at
                     FROM item_responses ORDER BY created_at DESC`,
  human_ratings: `SELECT rating_id, session_id, rater_id, dimension, score, rubric_version, created_at
                    FROM human_ratings ORDER BY created_at DESC`,
  study_results: `SELECT r.result_id, s.study_key, r.metric_name, r.value, r.detail, r.n,
                         r.analysis_version, r.superseded_by, r.computed_at
                    FROM study_results r JOIN studies s ON s.study_id = r.study_id
                   ORDER BY r.computed_at DESC`,
  external_ratings: `SELECT rating_id, session_id, source_org, exercise_type, rater_role, score,
                            rated_at, supersedes, created_at
                       FROM external_ratings ORDER BY created_at DESC`,
  replays: `SELECT replay_id, source_session_id, exchange_no, moment, is_practice, created_at
              FROM practice_replays ORDER BY created_at DESC`,
}

router.get('/', requirePermission('exports:create'), async (req, res) => {
  try {
    const r = await query(
      `SELECT e.export_id, e.entity_type, e.filters, e.row_count, e.purpose, e.created_at,
              u.email AS exported_by
         FROM admin_exports e JOIN admin_users u ON u.admin_id = e.admin_id
        ORDER BY e.created_at DESC LIMIT 200`,
    )
    res.json({ exports: r?.rows || [], datasets: Object.keys(DATASETS), defaultCap: DEFAULT_CAP })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_exports_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/research', requirePermission('exports:create'), async (req, res) => {
  try {
    const { dataset, rowLimit, purpose } = req.body || {}
    if (!DATASETS[dataset]) {
      return res.status(400).json({
        error: `dataset must be one of: ${Object.keys(DATASETS).join(', ')} (pseudonymous research data only — PII stores are never exportable here).`,
      })
    }
    if (!purpose || String(purpose).trim().length < 10) {
      return res.status(400).json({ error: 'A specific purpose (>= 10 characters) is required — it goes on the export ledger.' })
    }
    const requested = Math.max(1, Number(rowLimit) || DEFAULT_CAP)

    let approvalId = null
    if (requested > DEFAULT_CAP) {
      const approval = await consumeApproval('large_export', dataset)
      if (!approval) {
        return res.status(409).json({
          error: `Exports beyond ${DEFAULT_CAP} rows require dual approval. Raise a request with action "large_export" and entityId "${dataset}", approved by a different administrator.`,
          code: 'APPROVAL_REQUIRED',
        })
      }
      approvalId = approval.approval_id
    }

    const r = await query(`${DATASETS[dataset]} LIMIT ${Math.min(requested, 50000)}`)
    const rows = r?.rows || []

    await query(
      `INSERT INTO admin_exports (export_id, admin_id, entity_type, filters, row_count, purpose)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), req.admin.id, `research_${dataset}`,
       JSON.stringify({ rowLimit: requested }), rows.length, String(purpose).trim().slice(0, 400)],
    )
    await adminAudit(req, {
      action: 'research_export_created', entityType: 'export', entityId: dataset,
      after: { rows: rows.length, requested }, reason: String(purpose).trim(), approvalId,
    })
    res.json({ generatedAt: new Date().toISOString(), dataset, rows: rows.length, export: rows })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_research_export_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
