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

// ── ability_estimates ────────────────────────────────────────────────────────
// Phase 1: persist the running θ + per-dimension coverage snapshot after each
// exchange. Fire-and-forget; never throws. Upserts on (session_id, exchange_no).
export function recordAbilityEstimate({ sessionId, exchangeNo, thetaMean, thetaVar, coverage }) {
  if (!isTelemetryEnabled()) return
  if (!isUuid(sessionId)) return
  Promise.resolve()
    .then(() =>
      query(
        `INSERT INTO ability_estimates (session_id, exchange_no, theta_mean, theta_var, coverage)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (session_id, exchange_no)
         DO UPDATE SET theta_mean = EXCLUDED.theta_mean,
                       theta_var  = EXCLUDED.theta_var,
                       coverage   = EXCLUDED.coverage`,
        [
          sessionId,
          Number.isFinite(exchangeNo) ? exchangeNo : 0,
          Number.isFinite(thetaMean) ? thetaMean : null,
          Number.isFinite(thetaVar) ? thetaVar : null,
          coverage ? JSON.stringify(coverage) : null,
        ],
      ),
    )
    .catch((err) => logger.captureException(err, { msg: 'ability_estimate_log_failed', sessionId }))
}

// ── assessment_timeline (Track 0.2) ──────────────────────────────────────────────
// One row per COMPLETED assessment — the longitudinal raw material for growth
// curves and "same conditions?" comparisons. Pseudonymous: candidate_id only,
// never user id/email. Fire-and-forget; never throws.
export function recordTimelineEntry({
  sessionId,
  candidateId,
  scenarioKey,
  scaleVersion,
  calibrationRunId = null,
  consentVersion = null,
  flagsActive = null,
  isSynthetic = false,
}) {
  if (!isTelemetryEnabled()) return
  if (!isUuid(sessionId)) return
  Promise.resolve()
    .then(async () => {
      // attempt_no is 1-based per candidate at write time.
      let attemptNo = null
      if (isUuid(candidateId)) {
        const r = await query(
          'SELECT COUNT(*)::int AS n FROM assessment_timeline WHERE candidate_id = $1',
          [candidateId],
        )
        attemptNo = (r?.rows?.[0]?.n ?? 0) + 1
      }
      await query(
        `INSERT INTO assessment_timeline
           (timeline_id, candidate_id, session_id, attempt_no, scenario_key,
            scale_version, calibration_run_id, consent_version, flags_active, is_synthetic)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (session_id) DO NOTHING`,
        [
          randomUUID(),
          isUuid(candidateId) ? candidateId : null,
          sessionId,
          attemptNo,
          scenarioKey || null,
          scaleVersion || null,
          calibrationRunId,
          consentVersion,
          flagsActive ? JSON.stringify(flagsActive) : null,
          Boolean(isSynthetic),
        ],
      )
    })
    .catch((err) => logger.captureException(err, { msg: 'timeline_log_failed', sessionId }))
}

// Snapshot of PRISM_* feature flags at test time (T0.2). Names+values only —
// anything smelling like a secret is excluded defensively.
export function activeFlagSnapshot(env = process.env) {
  const out = {}
  for (const [k, v] of Object.entries(env)) {
    if (!/^PRISM_[A-Z0-9_]+$/.test(k)) continue
    if (/KEY|SECRET|TOKEN|PASS/.test(k)) continue
    if (typeof v === 'string' && v.length <= 40) out[k] = v
  }
  return out
}

// ── session_transcripts (Track 6.3) ──────────────────────────────────────────
// Blinded rating material for the human-rating workbench: the conversation
// turns WITHOUT any AI scores. Pseudonymous; erasure-cascaded. Fire-and-forget.
export function recordSessionTranscript({ sessionId, turns, scenarioKey, isSynthetic = false }) {
  if (!isTelemetryEnabled()) return
  if (!isUuid(sessionId) || !Array.isArray(turns) || !turns.length) return
  Promise.resolve()
    .then(() =>
      query(
        `INSERT INTO session_transcripts (session_id, turns, scenario_key, is_synthetic)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (session_id) DO NOTHING`,
        [sessionId, JSON.stringify(turns), scenarioKey || null, Boolean(isSynthetic)],
      ),
    )
    .catch((err) => logger.captureException(err, { msg: 'transcript_log_failed', sessionId }))
}

// ── erasure cascade (Track 0.4 / audit C23) ────────────────────────────────
// AWAITED (not fire-and-forget): right-to-erasure must be reliable. Deletes
// every telemetry/research row tied to a session, child tables first.
// Returns per-table deleted counts; {} when telemetry is off.
export async function eraseTelemetry(sessionId) {
  if (!isTelemetryEnabled() || !isUuid(sessionId)) return {}
  const counts = {}
  const votes = await query(
    `DELETE FROM judge_votes WHERE response_id IN
       (SELECT response_id FROM item_responses WHERE session_id = $1)`,
    [sessionId],
  )
  counts.judge_votes = votes?.rowCount ?? 0
  for (const [table, col] of [
    ['item_responses', 'session_id'],
    ['ability_estimates', 'session_id'],
    ['behavioral_features', 'session_id'],
    ['assessment_timeline', 'session_id'],
    ['human_ratings', 'session_id'],
    ['session_transcripts', 'session_id'],
    ['study_sessions', 'session_id'],
    ['audit_log', 'session_id'],
  ]) {
    const r = await query(`DELETE FROM ${table} WHERE ${col} = $1`, [sessionId]).catch(() => null)
    counts[table] = r?.rowCount ?? 0
  }
  return counts
}

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
