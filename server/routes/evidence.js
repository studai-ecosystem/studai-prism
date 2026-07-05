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

const router = Router()

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
