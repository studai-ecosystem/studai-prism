// Prism v2 (MASA-2) — Phase 0 telemetry.
//
// PURE ADDITIVE LOGGING. This module never changes assessment behavior: every
// function is a no-op unless BOTH the flag is on AND a Postgres DB is
// configured, and every write is wrapped so a telemetry failure can never break
// the conversation or scoring flow.
//
//   Flag:  PRISM_V2_TELEMETRY=true   (default off → v1 byte-identical)
//   DB:    DATABASE_URL=postgres://… (no-op when unset)
//
// What it records (Part C tables):
//   • audit_log       — every score-affecting decision (scenario pick, AI turn,
//                       submission, scoring) as an event trail.
//   • item_responses  — one row per candidate exchange, with latency + ASR
//                       confidence, linked to the probe item for that turn.

import { randomUUID } from 'node:crypto'
import logger from './logger.js'
import { query, isDbConfigured } from '../db/pool.js'
import { probeItemId } from './itemIds.js'

export function isTelemetryEnabled() {
  return process.env.PRISM_V2_TELEMETRY === 'true' && isDbConfigured()
}

// Valid v4/v5 UUID — session_id / item_id columns are UUID, so we skip (rather
// than crash) any non-UUID session id from a legacy/dev path.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v)
}

// ── audit_log ────────────────────────────────────────────────────────────────
// Fire-and-forget. Records a score-affecting decision. Never throws.
export function auditLog(eventType, sessionId, payload = {}) {
  if (!isTelemetryEnabled()) return
  Promise.resolve()
    .then(() =>
      query(
        'INSERT INTO audit_log (session_id, event_type, payload) VALUES ($1, $2, $3)',
        [isUuid(sessionId) ? sessionId : null, String(eventType), JSON.stringify(payload ?? {})],
      ),
    )
    .catch((err) => logger.captureException(err, { msg: 'audit_log_failed', eventType }))
}

// ── item_responses ───────────────────────────────────────────────────────────
// One row per candidate turn. The probe item id is derived from the scenario +
// the dimension the director targeted this turn, so it joins to the seeded
// items table without a lookup. Fire-and-forget; never throws.
export function recordItemResponse({
  sessionId,
  scenarioKey,
  dimension,
  exchangeNo,
  candidateText,
  latencyMs,
  asrConfidence,
  microLevels = null,
}) {
  if (!isTelemetryEnabled()) return
  if (!isUuid(sessionId)) return // UUID-typed column; skip legacy ids
  const itemId = scenarioKey && dimension ? probeItemId(scenarioKey, dimension) : null
  const latency = Number.isFinite(latencyMs) ? Math.round(latencyMs) : null
  const asr = Number.isFinite(asrConfidence) ? asrConfidence : null
  Promise.resolve()
    .then(() =>
      query(
        `INSERT INTO item_responses
           (response_id, session_id, item_id, exchange_no, candidate_text, latency_ms, asr_confidence, micro_levels)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          randomUUID(),
          sessionId,
          itemId,
          Number.isFinite(exchangeNo) ? exchangeNo : null,
          typeof candidateText === 'string' ? candidateText : null,
          latency,
          asr,
          microLevels ? JSON.stringify(microLevels) : null,
        ],
      ),
    )
    .catch((err) =>
      logger.captureException(err, { msg: 'item_response_log_failed', sessionId }),
    )
}

export { isDbConfigured }

// ── readers (Phase 2) ────────────────────────────────────────────────────────
// Map exchange_no → response_id for a session, so the dual scorer can link a
// candidate turn to its persisted item_response (for judge_votes FK). Returns
// {} when telemetry is off or the DB is unavailable.
export async function getResponseIdsBySession(sessionId) {
  if (!isTelemetryEnabled() || !isUuid(sessionId)) return {}
  try {
    const res = await query(
      'SELECT exchange_no, response_id FROM item_responses WHERE session_id=$1 ORDER BY exchange_no',
      [sessionId],
    )
    const map = {}
    for (const row of res?.rows || []) map[row.exchange_no] = row.response_id
    return map
  } catch {
    return {}
  }
}
