// /api/admin/system — integration health, model registry, job monitor (Phase 5).
//
//   GET  /health   system:read    every integration: configured/status/latency —
//                                 BOOLEANS AND NUMBERS ONLY, never secrets
//                                 (test scans responses against env secret values)
//   GET  /models   system:read    live AI config + registry metadata (no keys)
//   POST /models   models:manage  add registry metadata row
//   GET  /jobs     system:read    job monitor: system_jobs + calibration runs +
//                                 recent exports (real observable work)
//   POST /jobs/:id/cancel jobs:manage  cancel a QUEUED system job
//
// Honesty note: there is no queue runtime in this codebase (fire-and-forget
// promises + externally-run Python jobs). The monitor shows REAL records; the
// system_jobs table is the substrate for a future queue — no fake retry
// buttons for work nothing can re-run.

import { Router } from 'express'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { isMailEnabled } from '../../lib/mailer.js'
import { getPublicKeyInfo, isGlassBoxEnabled } from '../../lib/credentials.js'
import { modelDriftStatus } from '../../lib/modelDrift.js'
import { randomUUID } from 'node:crypto'
import {
  aiProvider,
  awsRegion,
  conversationModel,
  fastModel,
  isSpeechToTextEnabled,
  isTextToSpeechEnabled,
  judgeModel,
  policyFor,
  speechToTextModel,
} from '../../services/ai/index.js'

const router = Router()

router.get('/health', requirePermission('system:read'), async (req, res) => {
  try {
    // PostgreSQL: measured round-trip.
    let postgres = { configured: true, ok: false, latencyMs: null }
    const t0 = Date.now()
    try {
      await query('SELECT 1')
      postgres = { configured: true, ok: true, latencyMs: Date.now() - t0 }
    } catch {
      postgres = { configured: true, ok: false, latencyMs: null }
    }

    const drift = modelDriftStatus()
    const lastCalibration = await query(
      'SELECT run_type, created_at FROM calibration_runs ORDER BY created_at DESC LIMIT 1',
    ).then((r) => r?.rows?.[0] || null).catch(() => null)

    res.json({
      generatedAt: new Date().toISOString(),
      application: {
        ok: true,
        node: process.version,
        uptimeSeconds: Math.round(process.uptime()),
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      },
      postgres,
      bedrock: {
        configured: aiProvider() === 'aws-bedrock',
        region: awsRegion(),
        model: judgeModel(),
        authentication: 'AWS default credential provider chain',
        driftStatus: drift.status,
      },
      speechToText: { configured: isSpeechToTextEnabled(), provider: 'aws-bedrock', model: speechToTextModel() },
      textToSpeech: { configured: isTextToSpeechEnabled(), provider: 'amazon-polly', flag: process.env.PRISM_TTS_NEURAL === 'true' },
      email: { configured: isMailEnabled() },
      razorpay: {
        configured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
        dummyMode: process.env.PRISM_DUMMY_PAYMENTS === 'true',
      },
      credentialSigning: {
        configured: Boolean(getPublicKeyInfo()),
        keyId: getPublicKeyInfo()?.keyId || null,
        glassBox: isGlassBoxEnabled(),
      },
      calibrationJobs: {
        runtime: 'external (calibration/run_all.py — operator-scheduled)',
        lastRun: lastCalibration,
      },
      dataDir: { path: Boolean(process.env.DATA_DIR) ? 'custom (persistent)' : 'default (server/data)' },
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_health_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── AI model registry ────────────────────────────────────────────────────────
router.get('/models', requirePermission('system:read'), async (req, res) => {
  try {
    const registry = await query('SELECT * FROM model_registry ORDER BY provider, deployment')
    const drift = modelDriftStatus()
    res.json({
      live: {
        provider: aiProvider(),
        region: awsRegion(),
        judgeModel: judgeModel(),
        judgeDeployment: judgeModel(),
        conversationModel: conversationModel(),
        fastModel: fastModel(),
        fallbackModel: policyFor('conversation').fallbackModelId,
        judgeModels: process.env.PRISM_JUDGE_MODELS || null,
        judgeSamples: Number(process.env.PRISM_JUDGE_SAMPLES) || 5,
        microRaterModel: fastModel(),
        anchoredModel: drift.anchoredModelId,
        anchoredDeployment: drift.anchoredDeployment,
        driftStatus: drift.status,
      },
      registry: registry?.rows || [],
      note: 'Metadata only — API keys are environment secrets and never appear here. Judge routing is NEVER cost-optimised (fingerprint law).',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_models_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/models', requirePermission('models:manage'), async (req, res) => {
  try {
    const { provider, deployment, purpose, costPerMtokIn, costPerMtokOut, fallback, allowedWorkloads, releasedAt, notes } = req.body || {}
    if (!provider || !deployment) return res.status(400).json({ error: 'provider and deployment are required.' })
    const modelId = randomUUID()
    try {
      await query(
        `INSERT INTO model_registry
           (model_id, provider, deployment, purpose, cost_per_mtok_in, cost_per_mtok_out,
            fallback, allowed_workloads, released_at, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [modelId, String(provider).slice(0, 60), String(deployment).slice(0, 120),
         String(purpose || '').slice(0, 200),
         costPerMtokIn != null ? Number(costPerMtokIn) : null,
         costPerMtokOut != null ? Number(costPerMtokOut) : null,
         fallback ? String(fallback).slice(0, 120) : null,
         allowedWorkloads ? JSON.stringify(allowedWorkloads) : null,
         releasedAt || null, notes ? String(notes).slice(0, 1000) : null],
      )
    } catch (err) {
      if (/duplicate/.test(String(err?.message))) return res.status(409).json({ error: 'This provider/deployment pair is already registered.' })
      throw err
    }
    await adminAudit(req, {
      action: 'model_registered', entityType: 'model', entityId: modelId,
      after: { provider, deployment },
    })
    res.status(201).json({ ok: true, modelId })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_model_create_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Job monitor ──────────────────────────────────────────────────────────────
router.get('/jobs', requirePermission('system:read'), async (req, res) => {
  try {
    const [systemJobs, calibrationRuns, exports_] = await Promise.all([
      query('SELECT * FROM system_jobs ORDER BY created_at DESC LIMIT 100').then((r) => r?.rows || []).catch(() => []),
      query(
        `SELECT run_id, run_type, frozen, applied, rejected, created_at,
                outputs->>'status' AS job_status
           FROM calibration_runs ORDER BY created_at DESC LIMIT 25`,
      ).then((r) => r?.rows || []).catch(() => []),
      query(
        `SELECT e.export_id, e.entity_type, e.row_count, e.created_at, u.email AS by
           FROM admin_exports e JOIN admin_users u ON u.admin_id = e.admin_id
          ORDER BY e.created_at DESC LIMIT 25`,
      ).then((r) => r?.rows || []).catch(() => []),
    ])
    res.json({
      systemJobs,
      calibrationRuns,
      recentExports: exports_,
      runtime: 'No queue runtime exists — calibration jobs are operator-run Python; system_jobs is the substrate for future queued work.',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_jobs_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/jobs/:id/cancel', requirePermission('jobs:manage'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    const r = await query(
      `UPDATE system_jobs SET state = 'cancelled', last_error = $2, updated_at = now()
        WHERE job_id = $1 AND state = 'queued' RETURNING kind`,
      [req.params.id, `cancelled: ${String(reason).slice(0, 300)}`],
    )
    if (!r?.rows?.length) return res.status(409).json({ error: 'Only queued jobs can be cancelled.' })
    await adminAudit(req, {
      action: 'job_cancelled', entityType: 'system_job', entityId: req.params.id, reason,
    })
    res.json({ ok: true, state: 'cancelled' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_job_cancel_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
