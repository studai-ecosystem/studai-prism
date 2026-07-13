// /api/admin/prompts — Prompt Registry (Control Centre Phase 3, plan §12).
//
//   GET  /                         prompts:read    definitions + drift report
//   GET  /:name                    prompts:read    version list (no templates)
//   GET  /versions/:versionId      prompts:read    full version incl. template
//   POST /:name/versions           prompts:manage  create DRAFT version
//   PATCH /versions/:versionId     prompts:manage  edit template — DRAFT ONLY
//   POST /versions/:versionId/status prompts:manage / prompts:publish
//        draft→testing→approved (manage) · approved→production (publish +
//        DUAL APPROVAL 'publish_prompt'; prior production → deprecated)
//   POST /versions/:versionId/rollback prompts:publish
//        production → rolled_back, explicitly re-promoting a named deprecated
//        predecessor (deterministic, never guessy)
//
// The active production prompt is NEVER edited in place — PATCH refuses
// anything but drafts. Runtime remains file-based (audit C15) unless
// PRISM_ADMIN_PROMPT_REGISTRY=true primes the engine cache from the registry
// at boot; the drift report keeps the two honest against each other.

import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import { requirePermission, hasPermission, consumeApproval } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import {
  seedPromptRegistry, promptDrift, extractVariables, canTransitionPrompt,
  isPromptRegistryRuntime, sha256,
} from '../../lib/promptRegistry.js'

const router = Router()

// Idempotent file import, once per boot (RBAC boot-seed pattern).
let seeded = false
router.use(async (req, res, next) => {
  if (!seeded) {
    try {
      await seedPromptRegistry()
      seeded = true
    } catch (err) {
      logger.captureException(err, { msg: 'prompt_registry_seed_failed', requestId: req.requestId })
    }
  }
  next()
})

router.get('/', requirePermission('prompts:read'), async (req, res) => {
  try {
    const defs = await query(
      `SELECT d.prompt_id, d.name, d.purpose, d.engine,
              COUNT(v.version_id)::int AS version_count,
              COUNT(v.version_id) FILTER (WHERE v.status = 'production')::int AS production_count,
              MAX(v.created_at) AS last_version_at
         FROM prompt_definitions d LEFT JOIN prompt_versions v ON v.prompt_id = d.prompt_id
        GROUP BY d.prompt_id ORDER BY d.name`,
    )
    res.json({
      prompts: defs?.rows || [],
      drift: await promptDrift(),
      runtime: isPromptRegistryRuntime() ? 'database (PRISM_ADMIN_PROMPT_REGISTRY)' : 'versioned files (default)',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_prompts_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/versions/:versionId', requirePermission('prompts:read'), async (req, res) => {
  try {
    const r = await query(
      `SELECT v.*, d.name FROM prompt_versions v JOIN prompt_definitions d ON d.prompt_id = v.prompt_id
        WHERE v.version_id = $1`,
      [req.params.versionId],
    )
    const version = r?.rows?.[0]
    if (!version) return res.status(404).json({ error: 'Version not found.' })
    res.json({ version })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_prompt_version_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:name', requirePermission('prompts:read'), async (req, res) => {
  try {
    const def = await query('SELECT * FROM prompt_definitions WHERE name = $1', [req.params.name])
    if (!def?.rows?.length) return res.status(404).json({ error: 'Prompt not found.' })
    const versions = await query(
      `SELECT version_id, version, language, kind, status, source, model, temperature,
              token_limit, variables, content_hash, created_at
         FROM prompt_versions WHERE prompt_id = $1
        ORDER BY version, language, created_at`,
      [def.rows[0].prompt_id],
    )
    res.json({ prompt: def.rows[0], versions: versions?.rows || [] })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_prompt_detail_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Create draft version ─────────────────────────────────────────────────────
router.post('/:name/versions', requirePermission('prompts:manage'), async (req, res) => {
  try {
    const { version, language = 'en', template, model, temperature, tokenLimit } = req.body || {}
    if (!/^v\d+$/.test(String(version || ''))) return res.status(400).json({ error: "version must look like 'v2'." })
    if (!template || !String(template).trim()) return res.status(400).json({ error: 'template is required.' })
    if (!['en', 'hi', 'hi-en', 'ta'].includes(language)) return res.status(400).json({ error: 'unknown language.' })

    const def = await query('SELECT prompt_id FROM prompt_definitions WHERE name = $1', [req.params.name])
    if (!def?.rows?.length) return res.status(404).json({ error: 'Prompt not found (definitions are seeded from the prompt files).' })

    const versionId = randomUUID()
    try {
      await query(
        `INSERT INTO prompt_versions
           (version_id, prompt_id, version, language, kind, template, variables, model,
            temperature, token_limit, status, source, content_hash, author)
         VALUES ($1,$2,$3,$4,'md',$5,$6,$7,$8,$9,'draft','authored',$10,$11)`,
        [versionId, def.rows[0].prompt_id, String(version), language, String(template),
         JSON.stringify(extractVariables(template)), model || null,
         temperature != null ? Number(temperature) : null,
         tokenLimit != null ? Number(tokenLimit) : null,
         sha256(String(template)), req.admin.id],
      )
    } catch (err) {
      if (/duplicate/.test(String(err?.message))) {
        return res.status(409).json({ error: `Version ${version} (${language}) already exists for ${req.params.name} — versions are immutable identifiers; pick the next number.` })
      }
      throw err
    }
    await adminAudit(req, {
      action: 'prompt_version_created', entityType: 'prompt_version', entityId: versionId,
      after: { name: req.params.name, version, language, status: 'draft' },
    })
    res.status(201).json({ ok: true, versionId, status: 'draft' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_prompt_create_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Edit template — drafts only, never production ────────────────────────────
router.patch('/versions/:versionId', requirePermission('prompts:manage'), async (req, res) => {
  try {
    const { template } = req.body || {}
    if (!template || !String(template).trim()) return res.status(400).json({ error: 'template is required.' })
    const r = await query('SELECT status FROM prompt_versions WHERE version_id = $1', [req.params.versionId])
    const v = r?.rows?.[0]
    if (!v) return res.status(404).json({ error: 'Version not found.' })
    if (v.status !== 'draft') {
      return res.status(409).json({
        error: `A '${v.status}' version is immutable — the active production prompt is never edited in place. Create a new draft version instead.`,
        code: 'IMMUTABLE_VERSION',
      })
    }
    await query(
      `UPDATE prompt_versions SET template = $2, variables = $3, content_hash = $4 WHERE version_id = $1 AND status = 'draft'`,
      [req.params.versionId, String(template), JSON.stringify(extractVariables(template)), sha256(String(template))],
    )
    await adminAudit(req, { action: 'prompt_draft_edited', entityType: 'prompt_version', entityId: req.params.versionId })
    res.json({ ok: true })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_prompt_edit_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Lifecycle transitions ────────────────────────────────────────────────────
router.post('/versions/:versionId/status', requirePermission('prompts:manage'), async (req, res) => {
  try {
    const { status, reason, testResults } = req.body || {}
    const r = await query(
      `SELECT v.*, d.name FROM prompt_versions v JOIN prompt_definitions d ON d.prompt_id = v.prompt_id
        WHERE v.version_id = $1`,
      [req.params.versionId],
    )
    const v = r?.rows?.[0]
    if (!v) return res.status(404).json({ error: 'Version not found.' })
    if (!canTransitionPrompt(v.status, status)) {
      return res.status(409).json({ error: `Cannot move a version from '${v.status}' to '${status}'.`, code: 'BAD_TRANSITION' })
    }

    if (status === 'production') {
      // Publishing = a scoring/behavior change: publisher permission + dual approval.
      if (!hasPermission(req.admin, 'prompts:publish')) {
        return res.status(403).json({ error: 'missing permission: prompts:publish', code: 'FORBIDDEN' })
      }
      if (!reason || String(reason).trim().length < 10) {
        return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required to publish.' })
      }
      const approval = await consumeApproval('publish_prompt', req.params.versionId)
      if (!approval) {
        return res.status(409).json({
          error: 'Publishing to production requires dual approval. Raise a request with action "publish_prompt" and this version id, approved by a different administrator.',
          code: 'APPROVAL_REQUIRED',
        })
      }
      // Demote the current production version of the same (prompt, language).
      const demoted = await query(
        `UPDATE prompt_versions SET status = 'deprecated'
          WHERE prompt_id = $1 AND language = $2 AND status = 'production' AND version_id <> $3
          RETURNING version_id, version`,
        [v.prompt_id, v.language, req.params.versionId],
      )
      await query(
        `UPDATE prompt_versions SET status = 'production', approved_by = $2, approval_id = $3 WHERE version_id = $1`,
        [req.params.versionId, req.admin.id, approval.approval_id],
      )
      await adminAudit(req, {
        action: 'prompt_published', entityType: 'prompt_version', entityId: req.params.versionId,
        before: { demoted: demoted?.rows || [] },
        after: { name: v.name, version: v.version, language: v.language, status: 'production' },
        reason: String(reason).trim(), approvalId: approval.approval_id,
      })
      return res.json({
        ok: true, status: 'production', demoted: demoted?.rows || [],
        note: isPromptRegistryRuntime()
          ? 'Registry runtime is ON — the new version serves after the next boot/prime.'
          : 'Runtime is file-based: this publication is workflow-of-record; the deploy that updates server/prompts completes the cut-over (drift report tracks the gap).',
      })
    }

    // draft ↔ testing ↔ approved transitions.
    await query(
      `UPDATE prompt_versions SET status = $2, test_results = COALESCE($3, test_results) WHERE version_id = $1`,
      [req.params.versionId, status, testResults ? JSON.stringify(testResults) : null],
    )
    await adminAudit(req, {
      action: 'prompt_version_status_changed', entityType: 'prompt_version', entityId: req.params.versionId,
      before: { status: v.status }, after: { status }, reason: reason || null,
    })
    res.json({ ok: true, status })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_prompt_status_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Rollback (explicit, deterministic) ───────────────────────────────────────
router.post('/versions/:versionId/rollback', requirePermission('prompts:publish'), async (req, res) => {
  try {
    const { toVersionId, reason } = req.body || {}
    if (!toVersionId) return res.status(400).json({ error: 'toVersionId (the deprecated predecessor to re-promote) is required.' })
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required for a rollback.' })
    }
    const cur = await query('SELECT * FROM prompt_versions WHERE version_id = $1', [req.params.versionId])
    const current = cur?.rows?.[0]
    if (!current) return res.status(404).json({ error: 'Version not found.' })
    if (current.status !== 'production') return res.status(409).json({ error: 'Only the production version can be rolled back.' })

    const tgt = await query('SELECT * FROM prompt_versions WHERE version_id = $1', [toVersionId])
    const target = tgt?.rows?.[0]
    if (!target || target.prompt_id !== current.prompt_id || target.language !== current.language) {
      return res.status(400).json({ error: 'toVersionId must be a version of the same prompt and language.' })
    }
    if (target.status !== 'deprecated') {
      return res.status(409).json({ error: `Rollback target must be a deprecated former production version (it is '${target.status}').` })
    }

    await query(`UPDATE prompt_versions SET status = 'rolled_back' WHERE version_id = $1`, [req.params.versionId])
    await query(`UPDATE prompt_versions SET status = 'production' WHERE version_id = $1`, [toVersionId])
    await adminAudit(req, {
      action: 'prompt_rolled_back', entityType: 'prompt_version', entityId: req.params.versionId,
      before: { production: req.params.versionId }, after: { production: toVersionId },
      reason: String(reason).trim(),
    })
    res.json({ ok: true, rolledBack: req.params.versionId, nowProduction: toVersionId })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_prompt_rollback_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
