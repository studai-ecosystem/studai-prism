// Stage 1 — the pilot's operational instrument panel (admin-gated).
//
//   GET /api/pilot/dashboard   — live counters vs every data gate + projections
//   GET /api/pilot/sentinels   — Stage 1.2 data-quality checks (alert, never delete)
//   GET /api/pilot/incident/:sessionId — Stage 1.3 complete evidence trail for human review
//   GET /api/pilot/report/weekly — Stage 1.4 honest weekly report (markdown)
//
// THE ONE LAW applies: this router reads and reports. It flips no flags,
// mutates no scoring data, and deletes nothing.

import { Router } from 'express'
import logger from '../lib/logger.js'
import { query, isDbConfigured } from '../db/pool.js'
import { auditLog } from '../lib/telemetry.js'
import { runSentinels } from '../lib/sentinels.js'
import { TRAINING_KAPPA_THRESHOLD } from '../lib/studies.js'
import { getReport, getConsent } from '../lib/store.js'
import { getLatestCredential } from '../lib/credentials.js'
import { modelDriftStatus } from '../lib/modelDrift.js'

const router = Router()

function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_TOKEN
  if (!expected) return res.status(503).json({ error: 'pilot panel disabled (set ADMIN_TOKEN)' })
  if (req.get('x-admin-token') !== expected) return res.status(401).json({ error: 'unauthorized' })
  if (!isDbConfigured()) return res.status(503).json({ error: 'no database configured' })
  next()
}
router.use(requireAdmin)

// ── Stage 1.1 data-gate targets (from the protocols/master prompt) ───────────
export const GATES = {
  totalRealSessions: 300, // IRT calibration
  doubleRatedSessions: 100, // Channel B / S2
  conformalPairsMin: 30, // first conformal calibration
  conformalPairsFull: 100,
  testRetestPairs: 30, // S3 protocol minimum
  ratersQualified: 4,
}

async function count(sql, params = []) {
  const r = await query(sql, params).catch(() => null)
  return r?.rows?.[0] ? Number(Object.values(r.rows[0])[0]) : 0
}

// Linear projection to a target from the last 14 days' velocity. Honest:
// null when there is no velocity — never a fabricated date.
function projectDate(current, target, ratePerDay) {
  if (current >= target) return 'reached'
  if (!ratePerDay || ratePerDay <= 0) return null
  const days = Math.ceil((target - current) / ratePerDay)
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

async function gatherDashboard() {
  const totalReal = await count('SELECT COUNT(*) FROM assessment_timeline WHERE is_synthetic = FALSE')
  const totalSynthetic = await count('SELECT COUNT(*) FROM assessment_timeline WHERE is_synthetic = TRUE')
  const last14 = await count("SELECT COUNT(*) FROM assessment_timeline WHERE is_synthetic = FALSE AND completed_at > now() - interval '14 days'")
  const sessionsPerDay = last14 / 14

  // Double-rated: real sessions with >= 2 distinct raters.
  const doubleRated = await count(`
    SELECT COUNT(*) FROM (
      SELECT hr.session_id FROM human_ratings hr
        JOIN assessment_timeline t ON t.session_id = hr.session_id AND t.is_synthetic = FALSE
       GROUP BY hr.session_id HAVING COUNT(DISTINCT hr.rater_id) >= 2) d`)
  const doubleRated14 = await count(`
    SELECT COUNT(*) FROM (
      SELECT hr.session_id FROM human_ratings hr
        JOIN assessment_timeline t ON t.session_id = hr.session_id AND t.is_synthetic = FALSE
       WHERE hr.created_at > now() - interval '14 days'
       GROUP BY hr.session_id HAVING COUNT(DISTINCT hr.rater_id) >= 2) d`)

  // S1 arm balance (real sessions only).
  const arms = await query(`
    SELECT ss.arm, COUNT(*)::int AS n FROM study_sessions ss
      JOIN studies s ON s.study_id = ss.study_id AND s.study_key = 'steering_ab'
     WHERE ss.is_synthetic = FALSE GROUP BY ss.arm`).catch(() => null)
  const armBalance = Object.fromEntries((arms?.rows || []).map((r) => [r.arm, r.n]))

  // Test–retest pairs: candidates with both arms present (real).
  const retestPairs = await count(`
    SELECT COUNT(*) FROM (
      SELECT ss.session_id FROM study_sessions ss
        JOIN studies s ON s.study_id = ss.study_id AND s.study_key = 'test_retest'
       WHERE ss.arm = 'retest' AND ss.is_synthetic = FALSE) p`)

  // Raters + IRR trend.
  const raters = await query(
    "SELECT handle, status, training_kappa FROM raters WHERE handle NOT LIKE 'e2e-%' ORDER BY handle",
  ).catch(() => null)
  const qualified = (raters?.rows || []).filter((r) => r.status === 'qualified').length

  // Per-scenario response accumulation across the frozen 8-item bank.
  const perScenario = await query(`
    SELECT t.scenario_key, COUNT(DISTINCT t.session_id)::int AS sessions,
           COUNT(ir.response_id)::int AS responses
      FROM assessment_timeline t
      LEFT JOIN item_responses ir ON ir.session_id = t.session_id
     WHERE t.is_synthetic = FALSE
     GROUP BY t.scenario_key ORDER BY sessions DESC`).catch(() => null)

  const ratedPerDay = doubleRated14 / 14
  return {
    generatedAt: new Date().toISOString(),
    sessions: {
      totalReal,
      totalSynthetic,
      target: GATES.totalRealSessions,
      perDay14d: +sessionsPerDay.toFixed(2),
      projectedGateDate: projectDate(totalReal, GATES.totalRealSessions, sessionsPerDay),
    },
    doubleRating: {
      doubleRated,
      target: GATES.doubleRatedSessions,
      perDay14d: +ratedPerDay.toFixed(2),
      projectedGateDate: projectDate(doubleRated, GATES.doubleRatedSessions, ratedPerDay),
      conformalPairs: { current: doubleRated, min: GATES.conformalPairsMin, full: GATES.conformalPairsFull },
    },
    steeringAb: { armBalance, balanced: Object.keys(armBalance).length === 2 && Math.abs((armBalance.executive || 0) - (armBalance.lite || 0)) <= Math.max(5, 0.2 * ((armBalance.executive || 0) + (armBalance.lite || 0))) },
    testRetest: { pairs: retestPairs, target: GATES.testRetestPairs, projectedGateDate: projectDate(retestPairs, GATES.testRetestPairs, sessionsPerDay / 10) },
    raters: {
      qualified,
      target: GATES.ratersQualified,
      irrThreshold: TRAINING_KAPPA_THRESHOLD,
      roster: (raters?.rows || []).map((r) => ({ handle: r.handle, status: r.status, trainingKappa: r.training_kappa === null ? null : Number(r.training_kappa) })),
    },
    scenarioAccumulation: perScenario?.rows || [],
    modelDrift: modelDriftStatus(),
  }
}

router.get('/dashboard', async (req, res) => {
  try {
    res.json(await gatherDashboard())
  } catch (err) {
    logger.captureException(err, { msg: 'pilot_dashboard_failed', requestId: req.requestId })
    res.status(500).json({ error: 'dashboard failed' })
  }
})

// ── Stage 1.2 sentinels ──────────────────────────────────────────────────────
router.get('/sentinels', async (req, res) => {
  try {
    const result = await runSentinels()
    if (!result.ok && result.alerts?.length) {
      auditLog('sentinel_alert', null, {
        alerts: result.alerts.map((a) => ({ check: a.check, count: a.issues.length })),
      })
    }
    res.json(result)
  } catch (err) {
    logger.captureException(err, { msg: 'sentinels_failed', requestId: req.requestId })
    res.status(500).json({ error: 'sentinel run failed' })
  }
})

// ── Stage 1.3 incident evidence trail ────────────────────────────────────────
// The COMPLETE file a human needs to adjudicate a flagged session. Assembles;
// never judges. Pseudonymous throughout.
router.get('/incident/:sessionId', async (req, res) => {
  const sid = req.params.sessionId
  try {
    const [events, responses, votes, transcript, timeline] = await Promise.all([
      query('SELECT event_type, payload, created_at FROM audit_log WHERE session_id = $1 ORDER BY id', [sid]),
      query('SELECT exchange_no, latency_ms, asr_confidence, micro_levels, behavior, created_at FROM item_responses WHERE session_id = $1 ORDER BY exchange_no', [sid]),
      query(`SELECT jv.vote_no, jv.judge_model, jv.levels, jv.stability_flag, ir.exchange_no
               FROM judge_votes jv JOIN item_responses ir ON ir.response_id = jv.response_id
              WHERE ir.session_id = $1 ORDER BY ir.exchange_no, jv.vote_no`, [sid]),
      query('SELECT turns, scenario_key, is_synthetic FROM session_transcripts WHERE session_id = $1', [sid]),
      query('SELECT attempt_no, scenario_key, scale_version, consent_version, flags_active, is_synthetic, language, completed_at FROM assessment_timeline WHERE session_id = $1', [sid]),
    ])
    const report = await getReport(sid).catch(() => null)
    const consent = await getConsent(sid).catch(() => null)
    const credential = await getLatestCredential(sid).catch(() => null)
    const integrity = (events?.rows || []).filter((e) =>
      ['tab_switch', 'screenshot_attempt', 'fullscreen_exit', 'paste', 'face_absent', 'multiple_faces', 'looking_away', 'pressure_probe'].includes(e.event_type))

    auditLog('incident_file_assembled', sid, { requestedBy: 'admin', events: events?.rows?.length || 0 })
    res.json({
      sessionId: sid,
      assembledAt: new Date().toISOString(),
      note: 'Evidence file for HUMAN review. Nothing in this assembly changes any score or status.',
      timeline: timeline?.rows?.[0] || null,
      consent: consent ? { scopes: consent.scopes, version: consent.meta?.consentVersion, at: consent.at } : null,
      report: report ? { overall: report.scores?.overall, reliability: report.reliability, reviewStatus: report.reviewStatus || null, scoring: report.scoring || null } : null,
      credential: credential ? { credentialId: credential.credential_id, status: credential.status, bundleHash: credential.bundle_hash } : null,
      integrityEvents: integrity,
      decisionTrail: events?.rows || [],
      turns: responses?.rows || [],
      judgeVotes: votes?.rows || [],
      blindedTranscript: transcript?.rows?.[0]?.turns || null,
    })
  } catch (err) {
    logger.captureException(err, { msg: 'incident_file_failed', requestId: req.requestId })
    res.status(500).json({ error: 'incident assembly failed' })
  }
})

// ── Stage 1.4 weekly report ──────────────────────────────────────────────────
router.get('/report/weekly', async (req, res) => {
  try {
    const d = await gatherDashboard()
    const s = await runSentinels()
    const line = (label, cur, target, proj) =>
      `- ${label}: **${cur} / ${target}**${proj === 'reached' ? ' — reached' : proj ? ` — projected ${proj}` : ' — NO CURRENT VELOCITY (this will not clear on its own)'}`
    // The single biggest bottleneck, stated plainly (Stage 1.4 requirement).
    const sessionGap = GATES.totalRealSessions - d.sessions.totalReal
    const ratingGap = GATES.doubleRatedSessions - d.doubleRating.doubleRated
    const raterGap = GATES.ratersQualified - d.raters.qualified
    let bottleneck
    if (raterGap > 0) bottleneck = `RATER RECRUITMENT: ${d.raters.qualified}/${GATES.ratersQualified} qualified raters. Without raters, zero double-rated sessions accumulate and S2 — the single most important study — cannot run. Recruit and train raters now.`
    else if (ratingGap > sessionGap) bottleneck = `RATER THROUGHPUT: double-rating (${d.doubleRating.doubleRated}/${GATES.doubleRatedSessions}) trails session volume. Add rater hours before adding sessions.`
    else if (sessionGap > 0) bottleneck = `SESSION VOLUME: ${d.sessions.totalReal}/${GATES.totalRealSessions} real sessions at ${d.sessions.perDay14d}/day. Onboarding more candidates is the constraint.`
    else bottleneck = 'No gate bottleneck — verify protocol-deviation log and proceed to Stage 2.'

    const md = [
      `# Prism pilot weekly report — ${new Date().toISOString().slice(0, 10)}`,
      '',
      '## Progress vs data gates',
      line('Real completed sessions (IRT gate)', d.sessions.totalReal, GATES.totalRealSessions, d.sessions.projectedGateDate),
      line('Double-rated sessions (S2/Channel B gate)', d.doubleRating.doubleRated, GATES.doubleRatedSessions, d.doubleRating.projectedGateDate),
      line('Test–retest pairs (S3 gate)', d.testRetest.pairs, GATES.testRetestPairs, d.testRetest.projectedGateDate),
      line('Qualified raters', d.raters.qualified, GATES.ratersQualified, d.raters.qualified >= GATES.ratersQualified ? 'reached' : null),
      `- S1 arm balance: ${JSON.stringify(d.steeringAb.armBalance)} — ${d.steeringAb.balanced ? 'balanced' : 'IMBALANCED (check assignment flag)'}`,
      '',
      '## Data quality (sentinels)',
      s.ok ? '- All sentinel checks clean.' : s.alerts.map((a) => `- ALERT ${a.check}: ${a.issues.length} issue(s) — first: ${a.issues[0]?.problem}`).join('\n'),
      '',
      '## The single biggest bottleneck',
      bottleneck,
      '',
      `_Model-drift status: ${d.modelDrift.status} (${d.modelDrift.liveDeployment})_`,
      '_Generated by the pilot instrument panel. Numbers render from the database; nothing here is hand-written._',
    ].join('\n')
    res.type('text/markdown').send(md)
  } catch (err) {
    logger.captureException(err, { msg: 'weekly_report_failed', requestId: req.requestId })
    res.status(500).json({ error: 'weekly report failed' })
  }
})

export default router
