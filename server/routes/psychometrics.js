// Prism v2 (MASA-2) — Phase 3 psychometrics dashboard (read-only, admin).
//
// Surfaces the latest calibration run of each type so a reviewer can inspect
// reliability, item parameters, DIF flags and judge drift before FREEZING a run
// (freezing is a deliberate DB action, never automatic). This route only READS
// calibration_runs — it never scores and never mutates live tables.
//
// Guard: x-admin-token header must equal ADMIN_TOKEN (same as /human-rating).
// If ADMIN_TOKEN is unset the route is disabled (503) so it can't leak in dev.

import { Router } from 'express'
import logger from '../lib/logger.js'
import { query, isDbConfigured } from '../db/pool.js'

const router = Router()

function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_TOKEN
  if (!expected) return res.status(503).json({ error: 'psychometrics dashboard disabled (set ADMIN_TOKEN)' })
  if (req.get('x-admin-token') !== expected) return res.status(401).json({ error: 'unauthorized' })
  if (!isDbConfigured()) return res.status(503).json({ error: 'no database configured' })
  next()
}

const RUN_TYPES = ['irt', 'rasch', 'equate', 'reliability', 'dif', 'conformal', 'channelB_train']

// Latest run per type (prefer a frozen one, else the most recent provisional).
async function latestRuns() {
  const out = {}
  for (const type of RUN_TYPES) {
    const { rows } = await query(
      `SELECT run_id, run_type, inputs_summary, outputs, frozen, applied, created_at
         FROM calibration_runs
        WHERE run_type = $1
        ORDER BY frozen DESC, applied DESC, created_at DESC
        LIMIT 1`,
      [type],
    )
    out[type] = rows[0] || null
  }
  return out
}

// GET /api/psychometrics — JSON summary of the latest calibration state.
router.get('/', requireAdmin, async (_req, res) => {
  try {
    const runs = await latestRuns()
    const reliability = runs.reliability?.outputs || null
    const irtItems = runs.irt?.outputs?.items || []
    const difFlags = runs.dif?.outputs?.flags || []
    const judgeSeverity = runs.rasch?.outputs?.judge_severity || {}
    const conformal = runs.conformal?.outputs || null
    const channelB = runs.channelB_train?.outputs?.dimensions || null

    res.json({
      generatedAt: new Date().toISOString(),
      reliability: reliability && {
        gCoefficient: reliability.g_coefficient,
        variance: {
          person: reliability.var_person,
          scenario: reliability.var_scenario,
          residual: reliability.var_residual,
        },
        nPersons: reliability.n_persons,
        nScenarios: reliability.n_scenarios,
      },
      items: {
        n: irtItems.length,
        misfit: irtItems.filter((i) => i.misfit),
        table: irtItems,
      },
      dif: {
        nFlags: difFlags.length,
        flags: difFlags,
      },
      judgeDrift: judgeSeverity,
      conformal,
      channelB,
      runs: Object.fromEntries(
        Object.entries(runs).map(([k, v]) => [
          k,
          v && { runId: v.run_id, frozen: v.frozen, applied: v.applied, createdAt: v.created_at, status: v.outputs?.status || 'ok' },
        ]),
      ),
    })
  } catch (err) {
    logger.captureException(err, { msg: 'psychometrics_failed' })
    res.status(500).json({ error: 'failed to load psychometrics' })
  }
})

export default router
