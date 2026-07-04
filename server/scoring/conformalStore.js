// Prism v2 (MASA-2) — Phase 2 conformal calibration loader.
//
// Builds the (panel, human) nonconformity pairs from persisted human_ratings.
// A human rating row is {session_id, dimension, score}; we average a session's
// human dimension scores into an overall (same 25/25/20/20/10 weights) and pair
// it with that session's stored panel overall. Returns a conformal table.

import { query, isDbConfigured } from '../db/pool.js'
import { DIMENSION_WEIGHTS } from './dualScorerConfig.js'
import { buildConformal } from './conformal.js'
import logger from '../lib/logger.js'

function weightedOverall(dimScores) {
  let sum = 0
  let wsum = 0
  for (const [dim, w] of Object.entries(DIMENSION_WEIGHTS)) {
    if (Number.isFinite(dimScores[dim])) { sum += dimScores[dim] * w; wsum += w }
  }
  return wsum > 0 ? sum / wsum : null
}

// Load the conformal table from the DB. Falls back to provisional when there is
// no DB or too few human-rated pairs (buildConformal handles the threshold).
export async function loadConformalTable() {
  if (!isDbConfigured()) return buildConformal([])
  try {
    // Average human scores per (session, dimension), then per session.
    const { rows } = await query(`
      SELECT session_id, dimension, AVG(score)::numeric AS score
      FROM human_ratings
      GROUP BY session_id, dimension
    `)
    const bySession = new Map()
    for (const r of rows) {
      if (!bySession.has(r.session_id)) bySession.set(r.session_id, {})
      bySession.get(r.session_id)[r.dimension] = Number(r.score)
    }
    const pairs = []
    for (const [sessionId, dims] of bySession) {
      const human = weightedOverall(dims)
      if (!Number.isFinite(human)) continue
      // The panel overall is stored on the report's audit trail / report store;
      // join via reports table is JSON-store specific, so we read it from
      // ability/judge telemetry when present. Here we approximate with the
      // session's most recent scoring_complete audit payload.
      const ar = await query(
        `SELECT payload->>'overall' AS overall FROM audit_log
         WHERE session_id=$1 AND event_type='scoring_complete'
         ORDER BY id DESC LIMIT 1`,
        [sessionId],
      )
      const panel = Number(ar.rows?.[0]?.overall)
      if (Number.isFinite(panel)) pairs.push({ panel, human })
    }
    return buildConformal(pairs)
  } catch (err) {
    logger.captureException(err, { msg: 'conformal_load_failed' })
    return buildConformal([])
  }
}
