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
  behavior = null, // Track 3.1 clamped interaction-pattern summary
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
           (response_id, session_id, item_id, exchange_no, candidate_text, latency_ms, asr_confidence, micro_levels, behavior)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          randomUUID(),
          sessionId,
          itemId,
          Number.isFinite(exchangeNo) ? exchangeNo : null,
          typeof candidateText === 'string' ? candidateText : null,
          latency,
          asr,
          microLevels ? JSON.stringify(microLevels) : null,
          behavior ? JSON.stringify(behavior) : null,
        ],
      ),
    )
    .catch((err) =>
      logger.captureException(err, { msg: 'item_response_log_failed', sessionId }),
    )
}

// ── behavioral_features rollup (Track 3.1) ───────────────────────────────────
// One session-level feature vector, computed at /evaluate from the per-turn
// behavior summaries. Includes latency-vs-question-complexity residuals from
// a least-squares fit WITHIN this session (n>=3 turns with both values) — the
// classifier job recomputes population residuals later; these are the
// self-contained per-session view.
export function summarizeSessionBehavior(turns) {
  const rows = (Array.isArray(turns) ? turns : []).filter((t) => t && typeof t === 'object')
  const stats = (xs) => {
    if (!xs.length) return null
    const sorted = [...xs].sort((a, b) => a - b)
    const mean = xs.reduce((s, v) => s + v, 0) / xs.length
    const sd = xs.length > 1 ? Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / (xs.length - 1)) : 0
    return {
      n: xs.length,
      mean: Math.round(mean),
      median: Math.round(sorted[Math.floor(sorted.length / 2)]),
      sd: Math.round(sd),
      min: sorted[0],
      max: sorted[sorted.length - 1],
    }
  }
  const latencies = rows.map((t) => t.responseMs).filter(Number.isFinite)
  // Least-squares latency ~ promptWordCount within the session.
  const pairs = rows
    .filter((t) => Number.isFinite(t.responseMs) && Number.isFinite(t.promptWordCount))
    .map((t) => [t.promptWordCount, t.responseMs])
  let residuals = null
  if (pairs.length >= 3) {
    const n = pairs.length
    const mx = pairs.reduce((s, [x]) => s + x, 0) / n
    const my = pairs.reduce((s, [, y]) => s + y, 0) / n
    const sxx = pairs.reduce((s, [x]) => s + (x - mx) ** 2, 0)
    const sxy = pairs.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0)
    const b = sxx > 0 ? sxy / sxx : 0
    const a = my - b * mx
    const perTurn = pairs.map(([x, y]) => Math.round(y - (a + b * x)))
    const absStats = stats(perTurn.map(Math.abs))
    residuals = {
      slope: +b.toFixed(2),
      intercept: Math.round(a),
      perTurn,
      ...(absStats ? { absMean: absStats.mean, absMax: absStats.max } : {}),
    }
  }
  const typingTurns = rows.filter((t) => t.typing)
  const voiceTurns = rows.filter((t) => t.voice)
  const modalities = rows.map((t) => t.modality).filter(Boolean)
  return {
    turns: rows.length,
    latency: stats(latencies),
    latencyResiduals: residuals,
    typing: typingTurns.length
      ? {
          turns: typingTurns.length,
          meanInterKeyMs: stats(typingTurns.map((t) => t.typing.meanInterKeyMs).filter(Number.isFinite)),
          revisionRatio: +(typingTurns.reduce((s, t) => s + (t.typing.revisionRatio || 0), 0) / typingTurns.length).toFixed(3),
          backspaceTotal: typingTurns.reduce((s, t) => s + (t.typing.backspaceCount || 0), 0),
          longPauseTotal: typingTurns.reduce((s, t) => s + (t.typing.longPauseCount || 0), 0),
          pasteAttempts: typingTurns.reduce((s, t) => s + (t.typing.pasteAttempts || 0), 0),
        }
      : null,
    voice: voiceTurns.length
      ? {
          turns: voiceTurns.length,
          speechOnsetMs: stats(voiceTurns.map((t) => t.voice.speechOnsetMs).filter(Number.isFinite)),
          silenceGapTotal: voiceTurns.reduce((s, t) => s + (t.voice.silenceGapCount || 0), 0),
        }
      : null,
    modalities: modalities.length ? [...new Set(modalities)] : [],
    pressureProbes: rows.filter((t) => t.pressure).map((t) => t.pressure),
  }
}

// Fire-and-forget; never throws.
export function recordBehavioralFeatures(sessionId, features) {
  if (!isTelemetryEnabled()) return
  if (!isUuid(sessionId) || !features) return
  Promise.resolve()
    .then(() =>
      query(
        `INSERT INTO behavioral_features (session_id, features, model_version)
         VALUES ($1, $2, $3)
         ON CONFLICT (session_id)
         DO UPDATE SET features = EXCLUDED.features, model_version = EXCLUDED.model_version`,
        [sessionId, JSON.stringify(features), 't3.1-v1'],
      ),
    )
    .catch((err) => logger.captureException(err, { msg: 'behavioral_features_log_failed', sessionId }))
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
  language = 'en', // Track 4.1 — DIF group variable
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
            scale_version, calibration_run_id, consent_version, flags_active, is_synthetic, language)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
          typeof language === 'string' ? language : 'en',
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
    // Track 2: signed credentials embed evidence quotes derived from the
    // candidate's answers — erasure must destroy them too (delete is the ONE
    // mutation the immutability trigger permits, exactly for this right).
    ['credentials', 'session_id'],
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
