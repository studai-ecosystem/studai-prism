// /api/admin/privacy — data-subject request workflow (Phase 6, plan §21).
//
//   GET  /                    privacy:read     requests + retention rules
//   POST /                    privacy:create   open a request (support may open on behalf)
//   GET  /:id                 privacy:read     full request incl. plan/receipt
//   POST /:id/verify          privacy:manage   resolve + confirm the data subject
//   POST /:id/dry-run         privacy:manage   ERASURE: build the plan (mutates nothing)
//   POST /:id/execute         privacy:execute  ERASURE: dual-approved ('privacy_erasure'),
//                                              runs the real cascade, stores the receipt
//   POST /:id/fulfil          privacy:manage   ACCESS/EXPORT: assemble the package (ledgered);
//                                              CORRECTION/RESTRICTION/SHARING: record outcome
//   POST /:id/reject          privacy:manage   reject with reason
//   PUT  /retention/:entity   retention:manage documented retention policy
//
// Erasure can NEVER run without: a dry-run plan on file, an approval decided
// by a DIFFERENT administrator, and the executor holding privacy:execute.
// Every completed erasure leaves a receipt on the request AND in the
// immutable admin audit trail.

import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import { requirePermission, consumeApproval } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import {
  resolveCandidate, buildErasurePlan, executeErasure, buildAccessPackage,
} from '../../lib/privacyPlanner.js'
import {
  seedRetentionDefaults, runRetention, ENFORCEABLE_ENTITIES, activeHolds,
  isRetentionEnforcementEnabled,
} from '../../lib/retentionEnforcement.js'

const router = Router()

const RETENTION_ENTITIES = [
  'job_applications', 'integrity_events', 'admin_sessions', 'practice_replays',
  'session_transcripts', 'verification_records', 'support_notes',
]

// Seed retention rows once per boot (NULL days = "requires a decision") plus
// the charter §16 provisional defaults (labelled pending counsel, HA-003).
let seeded = false
router.use(async (req, res, next) => {
  if (!seeded) {
    try {
      for (const entity of RETENTION_ENTITIES) {
        await query(
          `INSERT INTO data_retention_rules (rule_id, entity) VALUES ($1,$2)
           ON CONFLICT (entity) DO NOTHING`,
          [randomUUID(), entity],
        )
      }
      await seedRetentionDefaults()
      seeded = true
    } catch (err) {
      logger.captureException(err, { msg: 'retention_seed_failed', requestId: req.requestId })
    }
  }
  next()
})

router.get('/', requirePermission('privacy:read'), async (req, res) => {
  try {
    const requests = await query(
      `SELECT r.request_id, r.kind, r.scope, r.candidate_email, r.session_id, r.status,
              r.created_at, r.completed_at, u.email AS opened_by_email
         FROM privacy_requests r JOIN admin_users u ON u.admin_id = r.opened_by
        ORDER BY r.created_at DESC LIMIT 200`,
    )
    const retention = await query('SELECT * FROM data_retention_rules ORDER BY entity')
    res.json({
      requests: requests?.rows || [],
      retention: (retention?.rows || []).map((r) => ({
        ...r,
        state: r.retention_days == null
          ? 'NOT SET — requires an explicit operator decision'
          : `${r.retention_days} days${r.provisional ? ' · PROVISIONAL, pending counsel' : ''}`,
      })),
      holds: await activeHolds(),
      enforcement: {
        scheduled: isRetentionEnforcementEnabled(),
        enforceableEntities: ENFORCEABLE_ENTITIES,
        note: 'Provisional defaults are labelled pending counsel (HA-003); the payment period is NOT legally approved. Scheduled enforcement stays off until humans enable PRISM_RETENTION_ENFORCEMENT — dry-runs and deliberate audited runs are available anytime.',
      },
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_privacy_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', requirePermission('privacy:create'), async (req, res) => {
  try {
    const { kind, scope = 'candidate', candidateEmail, candidateUserId, sessionId, details } = req.body || {}
    if (!['access', 'export', 'correction', 'erasure', 'restriction', 'sharing_revocation'].includes(kind)) {
      return res.status(400).json({ error: 'invalid kind' })
    }
    if (!['candidate', 'session'].includes(scope)) return res.status(400).json({ error: 'scope must be candidate or session' })
    if (scope === 'session' && !sessionId) return res.status(400).json({ error: 'sessionId required for session scope.' })
    if (scope === 'candidate' && !candidateEmail && !candidateUserId) {
      return res.status(400).json({ error: 'candidateEmail or candidateUserId required for candidate scope.' })
    }
    if (!details || String(details).trim().length < 10) {
      return res.status(400).json({ error: 'details (>= 10 characters) required — record how the request reached us.' })
    }
    const requestId = randomUUID()
    await query(
      `INSERT INTO privacy_requests
         (request_id, kind, scope, candidate_user_id, candidate_email, session_id, details, opened_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [requestId, kind, scope, candidateUserId || null,
       candidateEmail ? String(candidateEmail).toLowerCase().trim() : null,
       sessionId || null, String(details).trim(), req.admin.id],
    )
    await adminAudit(req, {
      action: 'privacy_request_opened', entityType: 'privacy_request', entityId: requestId,
      after: { kind, scope }, reason: String(details).trim().slice(0, 200),
    })
    res.status(201).json({ ok: true, requestId, status: 'received' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_privacy_create_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:id', requirePermission('privacy:read'), async (req, res) => {
  try {
    const r = await query(
      `SELECT r.*, u.email AS opened_by_email FROM privacy_requests r
         JOIN admin_users u ON u.admin_id = r.opened_by WHERE r.request_id = $1`,
      [req.params.id],
    )
    const request = r?.rows?.[0]
    if (!request) return res.status(404).json({ error: 'Request not found.' })
    res.json({ request })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_privacy_detail_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

async function loadRequest(id) {
  const r = await query('SELECT * FROM privacy_requests WHERE request_id = $1', [id])
  return r?.rows?.[0] || null
}

// ── Verify the data subject ──────────────────────────────────────────────────
router.post('/:id/verify', requirePermission('privacy:manage'), async (req, res) => {
  try {
    const request = await loadRequest(req.params.id)
    if (!request) return res.status(404).json({ error: 'Request not found.' })
    if (!['received', 'verifying'].includes(request.status)) {
      return res.status(409).json({ error: `Cannot verify a '${request.status}' request.` })
    }
    if (request.scope === 'candidate') {
      const user = await resolveCandidate({
        candidateUserId: request.candidate_user_id, candidateEmail: request.candidate_email,
      })
      if (!user) {
        return res.status(404).json({ error: 'No candidate account matches this request — check the email/id.' })
      }
      await query(
        `UPDATE privacy_requests SET candidate_user_id = $2, status = 'verifying', updated_at = now()
          WHERE request_id = $1`,
        [req.params.id, user.id],
      )
    } else {
      await query(
        `UPDATE privacy_requests SET status = 'verifying', updated_at = now() WHERE request_id = $1`,
        [req.params.id],
      )
    }
    await adminAudit(req, {
      action: 'privacy_request_verified', entityType: 'privacy_request', entityId: req.params.id,
      reason: req.body?.note || null,
    })
    res.json({ ok: true, status: 'verifying' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_privacy_verify_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Erasure: dry run ─────────────────────────────────────────────────────────
router.post('/:id/dry-run', requirePermission('privacy:manage'), async (req, res) => {
  try {
    const request = await loadRequest(req.params.id)
    if (!request) return res.status(404).json({ error: 'Request not found.' })
    if (request.kind !== 'erasure') return res.status(409).json({ error: 'Dry runs apply to erasure requests only.' })
    if (!['verifying', 'dry_run', 'awaiting_approval'].includes(request.status)) {
      return res.status(409).json({ error: `Verify the data subject first (status is '${request.status}').` })
    }
    const plan = await buildErasurePlan(request)
    await query(
      `UPDATE privacy_requests SET dry_run_plan = $2, status = 'awaiting_approval', updated_at = now()
        WHERE request_id = $1`,
      [req.params.id, JSON.stringify(plan)],
    )
    await adminAudit(req, {
      action: 'privacy_erasure_dry_run', entityType: 'privacy_request', entityId: req.params.id,
      after: { sessions: plan.sessions.length, accountRecordWillBeDeleted: plan.accountRecordWillBeDeleted },
    })
    res.json({ ok: true, status: 'awaiting_approval', plan })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_privacy_dryrun_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Erasure: execute (dual-approved) ─────────────────────────────────────────
router.post('/:id/execute', requirePermission('privacy:execute'), async (req, res) => {
  try {
    const request = await loadRequest(req.params.id)
    if (!request) return res.status(404).json({ error: 'Request not found.' })
    if (request.kind !== 'erasure') return res.status(409).json({ error: 'Execute applies to erasure requests only.' })
    if (request.status !== 'awaiting_approval' || !request.dry_run_plan) {
      return res.status(409).json({
        error: 'A dry-run plan must be on file before execution — run the dry run first.',
        code: 'NO_DRY_RUN',
      })
    }
    const approval = await consumeApproval('privacy_erasure', req.params.id)
    if (!approval) {
      return res.status(409).json({
        error: 'Erasure execution requires dual approval. Raise a request with action "privacy_erasure" and this request id, approved by a different administrator.',
        code: 'APPROVAL_REQUIRED',
      })
    }
    await query(`UPDATE privacy_requests SET status = 'executing', updated_at = now() WHERE request_id = $1`, [req.params.id])

    let receipt
    try {
      receipt = await executeErasure(request)
    } catch (err) {
      if (err.code === 'LEGAL_HOLD_ACTIVE') {
        // Charter §16: a legal hold blocks erasure until released — the
        // request returns to awaiting_approval (the approval was consumed;
        // a fresh one is required after the hold is lifted, deliberately).
        await query(`UPDATE privacy_requests SET status = 'awaiting_approval', updated_at = now() WHERE request_id = $1`, [req.params.id])
        await adminAudit(req, {
          action: 'privacy_erasure_blocked_by_hold', entityType: 'privacy_request', entityId: req.params.id,
          after: { holdId: err.holdId },
        })
        return res.status(409).json({
          error: 'An active legal hold covers this candidate or a session in scope. Release the hold first — erasure supersedes retention, but never a legal hold.',
          code: 'LEGAL_HOLD_ACTIVE',
          holdId: err.holdId,
        })
      }
      throw err
    }
    await query(
      `UPDATE privacy_requests SET status = 'completed', receipt = $2, approval_id = $3,
              completed_at = now(), updated_at = now() WHERE request_id = $1`,
      [req.params.id, JSON.stringify(receipt), approval.approval_id],
    )
    // The erasure receipt lands in the immutable admin trail too.
    await adminAudit(req, {
      action: 'privacy_erasure_executed', entityType: 'privacy_request', entityId: req.params.id,
      after: {
        sessionsErased: receipt.sessions.length,
        accountDeleted: receipt.accountDeleted,
      },
      approvalId: approval.approval_id,
      reason: req.body?.reason || 'approved erasure request',
    })
    res.json({ ok: true, status: 'completed', receipt })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_privacy_execute_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Access / export / correction / restriction / sharing revocation ─────────
router.post('/:id/fulfil', requirePermission('privacy:manage'), async (req, res) => {
  try {
    const request = await loadRequest(req.params.id)
    if (!request) return res.status(404).json({ error: 'Request not found.' })
    if (request.kind === 'erasure') return res.status(409).json({ error: 'Erasure fulfils through dry-run + execute.' })
    if (!['verifying', 'dry_run'].includes(request.status)) {
      return res.status(409).json({ error: `Verify the data subject first (status is '${request.status}').` })
    }

    if (request.kind === 'access' || request.kind === 'export') {
      const pkg = await buildAccessPackage(request)
      await query(
        `INSERT INTO admin_exports (export_id, admin_id, entity_type, filters, row_count, purpose)
         VALUES ($1,$2,'privacy_data_package',$3,$4,$5)`,
        [randomUUID(), req.admin.id, JSON.stringify({ requestId: req.params.id }),
         pkg.sessions.length, `privacy ${request.kind} request`],
      )
      await query(
        `UPDATE privacy_requests SET status = 'completed', completed_at = now(), updated_at = now()
          WHERE request_id = $1`,
        [req.params.id],
      )
      await adminAudit(req, {
        action: 'privacy_package_fulfilled', entityType: 'privacy_request', entityId: req.params.id,
        after: { kind: request.kind, sessions: pkg.sessions.length },
      })
      return res.json({ ok: true, status: 'completed', package: pkg })
    }

    // correction / restriction / sharing_revocation: the actual change runs
    // through its own governed workflow (profile edit, report supersession,
    // credential revocation) — this records the resolution.
    const { resolution } = req.body || {}
    if (!resolution || String(resolution).trim().length < 10) {
      return res.status(400).json({ error: 'A written resolution (>= 10 characters) is required — name the governed workflow that handled it.' })
    }
    await query(
      `UPDATE privacy_requests SET status = 'completed', decided_reason = $2, completed_at = now(), updated_at = now()
        WHERE request_id = $1`,
      [req.params.id, String(resolution).trim()],
    )
    await adminAudit(req, {
      action: 'privacy_request_resolved', entityType: 'privacy_request', entityId: req.params.id,
      after: { kind: request.kind }, reason: String(resolution).trim(),
    })
    res.json({ ok: true, status: 'completed' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_privacy_fulfil_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:id/reject', requirePermission('privacy:manage'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required to reject.' })
    }
    const r = await query(
      `UPDATE privacy_requests SET status = 'rejected', decided_reason = $2, updated_at = now()
        WHERE request_id = $1 AND status NOT IN ('completed','rejected') RETURNING request_id`,
      [req.params.id, String(reason).trim()],
    )
    if (!r?.rows?.length) return res.status(409).json({ error: 'Request not found or already closed.' })
    await adminAudit(req, {
      action: 'privacy_request_rejected', entityType: 'privacy_request', entityId: req.params.id,
      reason: String(reason).trim(),
    })
    res.json({ ok: true, status: 'rejected' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_privacy_reject_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Retention rules ──────────────────────────────────────────────────────────
router.put('/retention/:entity', requirePermission('retention:manage'), async (req, res) => {
  try {
    const { retentionDays, basis } = req.body || {}
    if (retentionDays != null && (!Number.isInteger(retentionDays) || retentionDays < 1)) {
      return res.status(400).json({ error: 'retentionDays must be a positive integer (or null = undecided).' })
    }
    if (!basis || String(basis).trim().length < 10) {
      return res.status(400).json({ error: 'A written legal/operational basis (>= 10 characters) is required.' })
    }
    // An explicit operator decision replaces the provisional charter default.
    const r = await query(
      `UPDATE data_retention_rules SET retention_days = $2, basis = $3, provisional = FALSE, updated_by = $4, updated_at = now()
        WHERE entity = $1 RETURNING entity`,
      [req.params.entity, retentionDays ?? null, String(basis).trim(), req.admin.id],
    )
    if (!r?.rows?.length) return res.status(404).json({ error: 'Unknown retention entity.' })
    await adminAudit(req, {
      action: 'retention_rule_set', entityType: 'retention_rule', entityId: req.params.entity,
      after: { retentionDays: retentionDays ?? null }, reason: String(basis).trim(),
    })
    res.json({ ok: true })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_retention_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Retention enforcement runs (charter §16) ─────────────────────────────────
// Dry-run is available to privacy:manage; a REAL enforcement pass requires
// retention:manage (wildcard-only), a dry-run receipt for the same entity
// within the last 24h, and leaves a receipt + audit rows either way.
router.post('/retention/:entity/run', requirePermission('privacy:manage'), async (req, res) => {
  try {
    const entity = req.params.entity
    const dryRun = req.body?.dryRun !== false
    if (!dryRun) {
      const { hasPermission } = await import('../../lib/adminAuth.js')
      if (!hasPermission(req.admin, 'retention:manage')) {
        return res.status(403).json({ error: 'Enforcement requires retention:manage (dry-run needs only privacy:manage).' })
      }
      const recent = await query(
        `SELECT run_id FROM retention_runs
          WHERE entity = $1 AND mode = 'dry_run' AND created_at > now() - interval '24 hours'
          ORDER BY created_at DESC LIMIT 1`,
        [entity],
      )
      if (!recent?.rows?.length) {
        return res.status(409).json({ error: 'Run a dry-run for this entity first (within 24 hours) — enforcement never runs blind.', code: 'DRY_RUN_REQUIRED' })
      }
    }
    const result = await runRetention(entity, { dryRun, ranBy: req.admin.id })
    if (!result.ok) return res.status(409).json(result)
    await adminAudit(req, {
      action: dryRun ? 'retention_dry_run' : 'retention_enforced',
      entityType: 'retention_rule', entityId: entity,
      after: { matched: result.receipt.matched, deleted: result.receipt.deleted, cutoff: result.receipt.cutoff },
    })
    res.json(result)
  } catch (err) {
    logger.captureException(err, { msg: 'admin_retention_run_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Legal holds (charter §16) ────────────────────────────────────────────────
// A hold suspends BOTH retention enforcement AND candidate erasure for the
// referenced session/candidate/entity until released. Placement and release
// are audited governance actions.
router.post('/holds', requirePermission('privacy:manage'), async (req, res) => {
  try {
    const { scope, reference, reason } = req.body || {}
    if (!['session', 'candidate', 'entity'].includes(scope)) {
      return res.status(400).json({ error: "scope must be 'session', 'candidate' or 'entity'." })
    }
    if (!reference || !String(reference).trim()) return res.status(400).json({ error: 'reference is required.' })
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'A written reason (>= 10 characters) is required.' })
    }
    const holdId = randomUUID()
    await query(
      `INSERT INTO legal_holds (hold_id, scope, reference, reason, placed_by) VALUES ($1,$2,$3,$4,$5)`,
      [holdId, scope, String(reference).trim(), String(reason).trim(), req.admin.id],
    )
    await adminAudit(req, {
      action: 'legal_hold_placed', entityType: 'legal_hold', entityId: holdId,
      after: { scope, reference: String(reference).trim() }, reason: String(reason).trim(),
    })
    res.status(201).json({ ok: true, holdId })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_hold_place_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/holds/:id/release', requirePermission('privacy:manage'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'A written release reason (>= 10 characters) is required.' })
    }
    const r = await query(
      `UPDATE legal_holds SET released_at = now(), release_reason = $2
        WHERE hold_id = $1 AND released_at IS NULL RETURNING hold_id`,
      [req.params.id, String(reason).trim()],
    )
    if (!r?.rows?.length) return res.status(404).json({ error: 'Hold not found or already released.' })
    await adminAudit(req, {
      action: 'legal_hold_released', entityType: 'legal_hold', entityId: req.params.id,
      reason: String(reason).trim(),
    })
    res.json({ ok: true })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_hold_release_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Contract retention overrides (charter §16) ───────────────────────────────
// Validated: known entity + contract reference + positive days + written
// basis. The enforcement engine uses the LONGEST applicable period — an
// override can extend, never silently shorten, what the timer keeps.
router.post('/retention/:entity/overrides', requirePermission('retention:manage'), async (req, res) => {
  try {
    const { contractRef, retentionDays, basis } = req.body || {}
    if (!contractRef || String(contractRef).trim().length < 3) {
      return res.status(400).json({ error: 'A contract reference is required.' })
    }
    if (!Number.isInteger(retentionDays) || retentionDays < 1) {
      return res.status(400).json({ error: 'retentionDays must be a positive integer.' })
    }
    if (!basis || String(basis).trim().length < 10) {
      return res.status(400).json({ error: 'A written basis (>= 10 characters) is required.' })
    }
    const known = await query('SELECT entity FROM data_retention_rules WHERE entity = $1', [req.params.entity])
    if (!known?.rows?.length) return res.status(404).json({ error: 'Unknown retention entity.' })
    const overrideId = randomUUID()
    await query(
      `INSERT INTO retention_overrides (override_id, entity, contract_ref, retention_days, basis, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [overrideId, req.params.entity, String(contractRef).trim(), retentionDays, String(basis).trim(), req.admin.id],
    )
    await adminAudit(req, {
      action: 'retention_override_recorded', entityType: 'retention_rule', entityId: req.params.entity,
      after: { overrideId, contractRef: String(contractRef).trim(), retentionDays }, reason: String(basis).trim(),
    })
    res.status(201).json({ ok: true, overrideId })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_retention_override_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
