// Prism v2 (MASA-2) — Phase 3 equating.
//
// Applies the per-scenario equating constant kappa produced by the offline
// calibration job (calibration/jobs/equate.py) so a candidate is not advantaged
// or penalised by which scenario they drew.
//
//   Flag:  PRISM_V2_EQUATING=true   (default off → kappa is 0, v1 reproducible)
//
// The constant is ONLY applied when ALL of these hold:
//   • the flag is on,
//   • a calibration_runs row of run_type='equate' is frozen AND applied,
//   • that scenario has a kappa entry.
// Otherwise the raw score passes through unchanged. Equated scores are always
// re-clamped 0–100 (server is the source of truth).

import logger from '../lib/logger.js'
import { query, isDbConfigured } from '../db/pool.js'

export function isEquatingEnabled() {
  return process.env.PRISM_V2_EQUATING === 'true' && isDbConfigured()
}

const clamp = (n) => Math.max(0, Math.min(100, n))

// Short-lived cache so we don't hit the DB on every score. Frozen runs are
// immutable, so a 5-minute TTL is safe.
let _cache = { at: 0, table: null }
const TTL_MS = 5 * 60 * 1000

async function loadKappaTable() {
  if (!isEquatingEnabled()) return null
  const now = Date.now()
  if (_cache.table && now - _cache.at < TTL_MS) return _cache.table
  try {
    const { rows } = await query(
      `SELECT outputs FROM calibration_runs
        WHERE run_type = 'equate' AND frozen = true AND applied = true
        ORDER BY created_at DESC LIMIT 1`,
    )
    const table = rows[0]?.outputs?.kappa ?? {}
    _cache = { at: now, table }
    return table
  } catch (err) {
    logger.captureException(err, { msg: 'equating_load_failed' })
    return null
  }
}

// Returns the equated score for one scenario. Falls back to the raw score
// whenever equating is off or no kappa exists for that scenario.
export async function equateScore(scenarioKey, rawScore) {
  if (!isEquatingEnabled() || !scenarioKey) return clamp(rawScore)
  const table = await loadKappaTable()
  const kappa = table && Number.isFinite(table[scenarioKey]) ? table[scenarioKey] : 0
  return clamp(rawScore + kappa)
}

// Test/ops hook: drop the cache (e.g. right after freezing a new run).
export function _clearEquatingCache() {
  _cache = { at: 0, table: null }
}
