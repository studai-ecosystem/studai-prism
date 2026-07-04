// Prism v2 (MASA-2) — Phase 2 human ratings writer (gold anchor set).
//
// One row per (session, dimension) human score. Feeds conformal calibration and
// (Phase 3) Channel B training. Returns the number of rows written, or null
// when the telemetry DB is not configured.

import { randomUUID } from 'node:crypto'
import { query, isDbConfigured } from '../db/pool.js'
import { DIMENSIONS } from './dualScorerConfig.js'

export async function recordHumanRatings({ sessionId, raterId, scores, rubricVersion = 'v1' }) {
  if (!isDbConfigured()) return null
  let n = 0
  for (const dim of DIMENSIONS) {
    const score = Number(scores?.[dim])
    if (!Number.isFinite(score)) continue
    const clamped = Math.max(0, Math.min(100, Math.round(score)))
    await query(
      `INSERT INTO human_ratings (rating_id, session_id, rater_id, dimension, score, rubric_version)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), sessionId, String(raterId), dim, clamped, rubricVersion],
    )
    n += 1
  }
  return n
}
