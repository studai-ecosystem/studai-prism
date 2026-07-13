// /api/admin/psychometrics — scientific dashboards (Control Centre Phase 3).
//
// Read-only. Reuses the exact underlying data the legacy planes render (pilot
// gates + latest calibration_runs per type + judge drift) so numbers can never
// diverge between consoles. Demographic DIF data is fairness-audit-only.

import { Router } from 'express'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { GATES } from '../pilot.js'
import { modelDriftStatus } from '../../lib/modelDrift.js'

const router = Router()

const RUN_TYPES = ['irt', 'rasch', 'equate', 'reliability', 'dif', 'conformal', 'channelB_train']

async function count(sql, params = []) {
  const r = await query(sql, params).catch(() => null)
  return r?.rows?.[0] ? Number(Object.values(r.rows[0])[0]) : 0
}

router.get('/', requirePermission('psychometrics:read'), async (req, res) => {
  try {
    // Data gates (same definitions as the pilot instrument panel).
    const [realSessions, doubleRated, retestPairs, qualifiedRaters] = await Promise.all([
      count('SELECT COUNT(*) FROM assessment_timeline WHERE is_synthetic = FALSE'),
      count(`SELECT COUNT(*) FROM (
               SELECT hr.session_id FROM human_ratings hr
                 JOIN assessment_timeline t ON t.session_id = hr.session_id AND t.is_synthetic = FALSE
                GROUP BY hr.session_id HAVING COUNT(DISTINCT hr.rater_id) >= 2) d`),
      count(`SELECT COUNT(*) FROM (
               SELECT ss.session_id FROM study_sessions ss
                 JOIN studies s ON s.study_id = ss.study_id
                WHERE s.study_key = 'test_retest') p`),
      count(`SELECT COUNT(*) FROM raters WHERE status = 'qualified'`),
    ])

    // Latest run per type (prefer frozen, then applied, then newest).
    const runs = {}
    for (const type of RUN_TYPES) {
      const r = await query(
        `SELECT run_id, run_type, inputs_summary, outputs, frozen, applied, rejected, created_at
           FROM calibration_runs WHERE run_type = $1
          ORDER BY applied DESC, frozen DESC, created_at DESC LIMIT 1`,
        [type],
      ).catch(() => null)
      runs[type] = r?.rows?.[0] || null
    }

    const reliability = runs.reliability?.outputs || null
    const irtItems = runs.irt?.outputs?.items || []
    const difFlags = runs.dif?.outputs?.flags || []

    res.json({
      gates: {
        realSessions: { current: realSessions, target: GATES.totalRealSessions },
        doubleRatedSessions: { current: doubleRated, target: GATES.doubleRatedSessions },
        testRetestPairs: { current: retestPairs, target: GATES.testRetestPairs },
        qualifiedRaters: { current: qualifiedRaters, target: GATES.ratersQualified },
      },
      reliability: reliability && {
        gCoefficient: reliability.g_coefficient ?? null,
        variance: {
          person: reliability.var_person ?? null,
          scenario: reliability.var_scenario ?? null,
          residual: reliability.var_residual ?? null,
        },
        nPersons: reliability.n_persons ?? null,
      },
      itemCalibration: {
        n: irtItems.length,
        misfit: irtItems.filter((i) => i.misfit).length,
      },
      dif: {
        nFlags: difFlags.length,
        flags: difFlags.slice(0, 50),
        note: 'Demographic data is used ONLY for fairness auditing — it never enters a score.',
      },
      conformal: runs.conformal?.outputs || null,
      channelB: runs.channelB_train?.outputs?.dimensions || null,
      judgeDrift: modelDriftStatus(),
      runs: Object.fromEntries(
        Object.entries(runs).map(([k, v]) => [k, v && {
          runId: v.run_id,
          frozen: v.frozen,
          applied: v.applied,
          rejected: v.rejected,
          createdAt: v.created_at,
          status: v.outputs?.status || 'ok',
        }]),
      ),
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_psychometrics_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
