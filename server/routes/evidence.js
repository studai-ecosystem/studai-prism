// Phase 3 Stage 4.3 — the open adversarial benchmark, rendered from the registry.
//
// PUBLIC surface — therefore governed by the claims ceiling: while S4 has no
// result, this page says "preregistered, not yet run" and claims nothing.
// When the red-team study lands, the evasion rate renders straight from the
// immutable study_results row — update mechanics are automatic, copy is not
// hand-edited.

import { Router } from 'express'
import logger from '../lib/logger.js'
import { query, isDbConfigured } from '../db/pool.js'
import { isGlassBoxEnabled } from '../lib/credentials.js'
import { isLangEnabled } from '../lib/lang.js'
import { isVelocityEnabled } from '../lib/velocity.js'
import { isReplayEnabled } from '../lib/replay.js'

const router = Router()

// ── GET /api/evidence/claims ─────────────────────────────────────────────────
// LAW 1's single source for the UI: every public statistic, badge and claim
// renders from THIS endpoint (which renders from the registry) or not at all.
// A stat the registry can't back is null — and the UI's useClaims() hook
// renders its designed pending state. No hardcoded numbers in JSX, ever.
let _claimsCache = { at: 0, body: null }
router.get('/claims', async (_req, res) => {
  try {
    if (Date.now() - _claimsCache.at < 60_000 && _claimsCache.body) return res.json(_claimsCache.body)
    let stats = { assessedRealSessions: null, kappaAiHuman: null, testRetestR: null, evasionRate: null, transferR: null, difLanguages: null }
    if (isDbConfigured()) {
      const n = await query('SELECT COUNT(*)::int AS n FROM assessment_timeline WHERE is_synthetic = FALSE').catch(() => null)
      const real = n?.rows?.[0]?.n ?? 0
      stats.assessedRealSessions = real > 0 ? real : null // zero is not a marketing number
      const results = await query(`
        SELECT s.study_key, r.metric_name, r.value, r.n, r.computed_at
          FROM study_results r JOIN studies s ON s.study_id = r.study_id
         WHERE r.superseded_by IS NULL
           AND r.metric_name <> 'deploy_probe'
           AND COALESCE(r.detail->>'includeSynthetic', 'false') <> 'true'`).catch(() => null)
      for (const row of results?.rows || []) {
        const stamped = { value: row.value === null ? null : Number(row.value), n: row.n, date: String(row.computed_at).slice(0, 10) }
        if (row.study_key === 'human_llm_agreement') stats.kappaAiHuman = stamped
        if (row.study_key === 'test_retest') stats.testRetestR = stamped
        if (row.study_key === 'adversarial_evasion') stats.evasionRate = stamped
        if (row.study_key === 'sim_to_real_transfer') stats.transferR = stamped
        if (row.study_key === 'multilingual_dif') stats.difLanguages = stamped
      }
    }
    const body = {
      // The one claim live today — its exact ceiling wording.
      standingClaim: 'cryptographically verifiable evidence chain',
      glassBoxLive: isGlassBoxEnabled(),
      stats,
      // Feature flags the UI may branch on (behavior-visible anyway; never secrets).
      features: {
        velocity: isVelocityEnabled(),
        languages: isLangEnabled(),
        replay: isReplayEnabled(),
      },
      note: 'Null means pending. The UI renders designed pending states, never a substitute number.',
    }
    _claimsCache = { at: Date.now(), body }
    res.json(body)
  } catch (err) {
    logger.captureException(err, { msg: 'claims_endpoint_failed', requestId: req?.requestId })
    res.status(500).json({ error: 'claims unavailable' })
  }
})

router.get('/adversarial', async (req, res) => {
  try {
    let result = null
    let study = null
    if (isDbConfigured()) {
      const s = await query(
        "SELECT title, hypothesis, preregistered_metric, protocol_doc, status FROM studies WHERE study_key = 'adversarial_evasion'",
      ).catch(() => null)
      study = s?.rows?.[0] || null
      const r = await query(
        `SELECT r.metric_name, r.value, r.n, r.analysis_version, r.computed_at
           FROM study_results r JOIN studies st ON st.study_id = r.study_id
          WHERE st.study_key = 'adversarial_evasion' AND r.superseded_by IS NULL
          ORDER BY r.computed_at DESC LIMIT 1`,
      ).catch(() => null)
      result = r?.rows?.[0] || null
    }
    res.json({
      benchmark: 'Prism open adversarial benchmark',
      status: result ? 'published' : 'preregistered — not yet run',
      protocol: study
        ? { title: study.title, hypothesis: study.hypothesis, preregisteredMetric: study.preregistered_metric, protocolDoc: study.protocol_doc, registryStatus: study.status }
        : { note: 'study registry unavailable' },
      currentEvasionRate: result
        ? { metric: result.metric_name, value: Number(result.value), n: result.n, analysisVersion: result.analysis_version, computedAt: result.computed_at }
        : null,
      note: result
        ? 'The evasion rate above renders from the immutable study registry.'
        : 'No detection claim is made until the preregistered red-team study has real data. The protocol is public; the number will render here from the immutable registry when it exists.',
      redTeamInvitation:
        'Standing invitation: recruited red-team participation runs under the preregistered protocol with explicit informed consent. Responsible-disclosure contact: security@studai.one.',
      detectionPolicy:
        'Detection signals are advisory only — they route a session to human review; they never auto-fail a candidate.',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'adversarial_benchmark_failed', requestId: req.requestId })
    res.status(500).json({ error: 'benchmark page failed' })
  }
})

export default router
