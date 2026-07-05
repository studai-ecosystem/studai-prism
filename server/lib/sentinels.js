// Stage 1.2 — data-quality sentinels for the pilot.
//
// Daily-runnable checks that ALERT and never delete or mutate. Each check
// returns { check, ok, issues: [...] } with enough detail for a human to act.
// Wire: GET /api/pilot/sentinels (admin) runs them all; alerts are also
// audit-logged (event sentinel_alert) so the weekly report can trend them.

import { query, isDbConfigured } from '../db/pool.js'
import { CONSENT_VERSION } from './sharedConstants.js'

const IMPOSSIBLY_FAST_MEDIAN_MS = 5000 // median per-turn latency under 5s
const IMPOSSIBLY_FAST_TOTAL_MS = 60000 // or a whole session answered in under a minute
const ASR_CONFIDENCE_FLOOR = 0.5 // protocol exclusion threshold (S6)
const LOOKBACK_DAYS = 7

// 1) Silent telemetry drops: completed sessions with zero item_responses.
async function telemetryReconciliation() {
  const r = await query(`
    SELECT t.session_id
      FROM assessment_timeline t
      LEFT JOIN item_responses ir ON ir.session_id = t.session_id
     WHERE t.completed_at > now() - interval '${LOOKBACK_DAYS} days'
     GROUP BY t.session_id
    HAVING COUNT(ir.response_id) = 0`)
  const issues = (r?.rows || []).map((x) => ({ sessionId: x.session_id, problem: 'completed session has no item_responses (telemetry drop?)' }))
  return { check: 'telemetry_reconciliation', ok: issues.length === 0, issues }
}

// 2) ASR-confidence anomalies: sessions whose mean confidence is below the
//    protocol exclusion floor (transcription-quality confound).
async function asrAnomalies() {
  const r = await query(`
    SELECT session_id, ROUND(AVG(asr_confidence)::numeric, 3) AS mean_conf, COUNT(*) AS turns
      FROM item_responses
     WHERE asr_confidence IS NOT NULL
       AND created_at > now() - interval '${LOOKBACK_DAYS} days'
     GROUP BY session_id
    HAVING AVG(asr_confidence) < ${ASR_CONFIDENCE_FLOOR}`)
  const issues = (r?.rows || []).map((x) => ({ sessionId: x.session_id, meanConfidence: Number(x.mean_conf), problem: `mean ASR confidence below ${ASR_CONFIDENCE_FLOOR} — S6 exclusion candidate` }))
  return { check: 'asr_confidence', ok: issues.length === 0, issues }
}

// 3) Impossibly fast sessions: relay/skim signature or broken timer.
async function impossiblyFast() {
  const r = await query(`
    SELECT session_id,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS median_latency,
           SUM(latency_ms) AS total_latency, COUNT(*) AS turns
      FROM item_responses
     WHERE latency_ms IS NOT NULL
       AND created_at > now() - interval '${LOOKBACK_DAYS} days'
     GROUP BY session_id
    HAVING PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) < ${IMPOSSIBLY_FAST_MEDIAN_MS}
        OR SUM(latency_ms) < ${IMPOSSIBLY_FAST_TOTAL_MS}`)
  const issues = (r?.rows || []).map((x) => ({
    sessionId: x.session_id,
    medianLatencyMs: Math.round(Number(x.median_latency)),
    totalLatencyMs: Number(x.total_latency),
    problem: 'session completed implausibly fast — route to human review',
  }))
  return { check: 'impossibly_fast', ok: issues.length === 0, issues }
}

// 4) Consent-version mismatches: sessions recorded under stale consent copy.
async function consentMismatches() {
  const r = await query(`
    SELECT session_id, consent_version
      FROM assessment_timeline
     WHERE completed_at > now() - interval '${LOOKBACK_DAYS} days'
       AND (consent_version IS NULL OR consent_version <> $1)`, [CONSENT_VERSION])
  const issues = (r?.rows || []).map((x) => ({ sessionId: x.session_id, consentVersion: x.consent_version, problem: `consent version differs from current ${CONSENT_VERSION} — verify copy lineage before including in studies` }))
  return { check: 'consent_version', ok: issues.length === 0, issues }
}

// 5) Synthetic leakage: is_synthetic sessions appearing where only real data
//    belongs (human ratings, external ratings). RULE 3 tripwire.
async function syntheticLeakage() {
  const issues = []
  const hr = await query(`
    SELECT DISTINCT hr.session_id FROM human_ratings hr
      JOIN assessment_timeline t ON t.session_id = hr.session_id AND t.is_synthetic = TRUE`)
  for (const row of hr?.rows || []) issues.push({ sessionId: row.session_id, problem: 'human rating recorded on a SYNTHETIC session' })
  const er = await query(`
    SELECT DISTINCT er.session_id FROM external_ratings er
      JOIN assessment_timeline t ON t.session_id = er.session_id AND t.is_synthetic = TRUE`)
  for (const row of er?.rows || []) issues.push({ sessionId: row.session_id, problem: 'external rating recorded on a SYNTHETIC session' })
  return { check: 'synthetic_leakage', ok: issues.length === 0, issues }
}

export async function runSentinels() {
  if (!isDbConfigured()) return { ok: false, error: 'no database configured', checks: [] }
  const checks = []
  for (const fn of [telemetryReconciliation, asrAnomalies, impossiblyFast, consentMismatches, syntheticLeakage]) {
    try {
      checks.push(await fn())
    } catch (err) {
      checks.push({ check: fn.name, ok: false, issues: [{ problem: `sentinel errored: ${err.message}` }] })
    }
  }
  return {
    ok: checks.every((c) => c.ok),
    ranAt: new Date().toISOString(),
    lookbackDays: LOOKBACK_DAYS,
    alerts: checks.filter((c) => !c.ok),
    checks,
  }
}
