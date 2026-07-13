// /api/admin/flags — feature-flag registry & change workflow (Phase 5, §24).
//
//   GET  /                        flags:read     registry + live env state +
//                                                flip-check verdicts + pending changes
//   POST /:flagKey/request        flags:request  raise a change request
//   POST /changes/:id/decide      flags:approve  approve/reject (DIFFERENT admin — DB CHECK)
//   POST /changes/:id/mark-applied flags:request confirm the operator's env action;
//                                                VERIFIED against the live environment
//   POST /changes/:id/cancel      flags:request  requester withdraws
//
// THE ONE LAW: this router never assigns process.env.PRISM_* — the CI source
// scan enforces it. "Enable" means: request → (dual) approval → OPERATOR env
// action → mark-applied verifies reality. A production enable of a
// science-gated flag is refused outright while its flip-check verdict is
// NO-GO — a missing data gate cannot be approved around (prompt §24).

import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import {
  seedFlagRegistry, liveFlagState, isScienceGated, gateVerdict, FLAG_CATALOGUE,
} from '../../lib/flagRegistry.js'

const router = Router()

let seeded = false
router.use(async (req, res, next) => {
  if (!seeded) {
    try {
      await seedFlagRegistry()
      seeded = true
    } catch (err) {
      logger.captureException(err, { msg: 'flag_registry_seed_failed', requestId: req.requestId })
    }
  }
  next()
})

router.get('/', requirePermission('flags:read'), async (req, res) => {
  try {
    const flags = await query('SELECT * FROM feature_flags ORDER BY risk DESC, flag_key')
    const changes = await query(
      `SELECT c.*, ru.email AS requested_by_email, du.email AS decided_by_email
         FROM feature_flag_changes c
         JOIN admin_users ru ON ru.admin_id = c.requested_by
         LEFT JOIN admin_users du ON du.admin_id = c.decided_by
        ORDER BY c.created_at DESC LIMIT 100`,
    )
    const out = []
    for (const f of flags?.rows || []) {
      const verdict = await gateVerdict(f.flag_key)
      out.push({
        ...f,
        liveState: liveFlagState(f.flag_key),
        scienceGated: isScienceGated(f.flag_key),
        flipCheck: verdict ? { verdict: verdict.verdict, reason: verdict.reason || null } : null,
      })
    }
    res.json({
      flags: out,
      changes: changes?.rows || [],
      law: 'The console never flips a flag. Approved requests are applied by an operator as environment actions, then verified here.',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_flags_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/:flagKey/request', requirePermission('flags:request'), async (req, res) => {
  try {
    const { environment, requestedState, reason } = req.body || {}
    if (!['development', 'staging', 'production'].includes(environment)) {
      return res.status(400).json({ error: 'environment must be development, staging or production.' })
    }
    if (!['on', 'off'].includes(requestedState)) return res.status(400).json({ error: "requestedState must be 'on' or 'off'." })
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required.' })
    }
    const flag = await query('SELECT * FROM feature_flags WHERE flag_key = $1', [req.params.flagKey])
    const f = flag?.rows?.[0]
    if (!f) return res.status(404).json({ error: 'Flag not in the registry.' })

    // Data-gate enforcement: a production ENABLE of a science-gated flag is
    // refused while flip-check says NO-GO/ESCALATE — no approval can bypass it.
    if (requestedState === 'on' && environment === 'production' && isScienceGated(req.params.flagKey)) {
      const verdict = await gateVerdict(req.params.flagKey)
      if (verdict?.verdict !== 'GO') {
        return res.status(409).json({
          error: `Flip-check verdict for ${req.params.flagKey} is ${verdict?.verdict || 'UNKNOWN'} — its data gate is not met, so an enable request cannot even be raised. The verifier blesses; humans flip; nobody skips the gate.`,
          code: 'DATA_GATE_NOT_MET',
          flipCheck: verdict,
        })
      }
    }

    // Dual control applies to production changes and to every high-risk flag;
    // low/medium-risk development or staging changes auto-approve.
    const needsApproval = environment === 'production' || f.risk === 'high'
    const changeId = randomUUID()
    await query(
      `INSERT INTO feature_flag_changes
         (change_id, flag_key, environment, requested_state, reason, requested_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [changeId, req.params.flagKey, environment, requestedState, String(reason).trim(),
       req.admin.id, needsApproval ? 'requested' : 'approved'],
    )
    await adminAudit(req, {
      action: 'flag_change_requested', entityType: 'feature_flag', entityId: req.params.flagKey,
      after: { changeId, environment, requestedState, autoApproved: !needsApproval },
      reason: String(reason).trim(),
    })
    res.status(201).json({
      ok: true, changeId,
      status: needsApproval ? 'requested' : 'approved',
      next: needsApproval
        ? 'A DIFFERENT administrator with flags:approve must decide this request.'
        : 'Approved. An operator applies the environment change, then marks it applied here.',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_flag_request_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/changes/:id/decide', requirePermission('flags:approve'), async (req, res) => {
  try {
    const { decision, reason } = req.body || {}
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'decision must be approved or rejected.' })
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    let r
    try {
      r = await query(
        `UPDATE feature_flag_changes SET status = $2, decided_by = $3, decided_reason = $4, updated_at = now()
          WHERE change_id = $1 AND status = 'requested' RETURNING flag_key`,
        [req.params.id, decision, req.admin.id, String(reason)],
      )
    } catch (err) {
      if (/chk_flag_change_dual/.test(String(err?.message))) {
        return res.status(403).json({ error: 'Dual control: you cannot decide your own flag request.', code: 'DUAL_CONTROL' })
      }
      throw err
    }
    if (!r?.rows?.length) return res.status(404).json({ error: 'No pending request with that id.' })
    await adminAudit(req, {
      action: `flag_change_${decision}`, entityType: 'feature_flag', entityId: r.rows[0].flag_key,
      after: { changeId: req.params.id }, reason,
    })
    res.json({ ok: true, status: decision })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_flag_decide_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// The operator applied the env change out-of-band; verify it took effect.
// (Only meaningful for THIS process's environment — i.e. production requests
// verified on the production console; dev/staging are attested with a note.)
router.post('/changes/:id/mark-applied', requirePermission('flags:request'), async (req, res) => {
  try {
    const r = await query('SELECT * FROM feature_flag_changes WHERE change_id = $1', [req.params.id])
    const change = r?.rows?.[0]
    if (!change) return res.status(404).json({ error: 'Change not found.' })
    if (change.status !== 'approved') {
      return res.status(409).json({ error: `Only approved changes can be marked applied (this one is '${change.status}').` })
    }

    let verification = 'attested (environment not observable from this process)'
    if (change.environment === 'production') {
      const live = liveFlagState(change.flag_key)
      if (live !== change.requested_state) {
        return res.status(409).json({
          error: `Live environment disagrees: ${change.flag_key} is '${live}' but the approved request wants '${change.requested_state}'. Apply the operator env change first — this endpoint verifies reality, it does not create it.`,
          code: 'ENV_MISMATCH',
        })
      }
      verification = 'verified against the live environment'
    }
    await query(
      `UPDATE feature_flag_changes SET status = 'applied_by_operator', applied_note = $2, updated_at = now()
        WHERE change_id = $1`,
      [req.params.id, `${verification}${req.body?.note ? ` — ${String(req.body.note).slice(0, 300)}` : ''}`],
    )
    await adminAudit(req, {
      action: 'flag_change_applied', entityType: 'feature_flag', entityId: change.flag_key,
      after: { changeId: req.params.id, verification },
    })
    res.json({ ok: true, status: 'applied_by_operator', verification })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_flag_apply_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/changes/:id/cancel', requirePermission('flags:request'), async (req, res) => {
  try {
    const r = await query(
      `UPDATE feature_flag_changes SET status = 'cancelled', updated_at = now()
        WHERE change_id = $1 AND status IN ('requested','approved') AND requested_by = $2
        RETURNING flag_key`,
      [req.params.id, req.admin.id],
    )
    if (!r?.rows?.length) return res.status(404).json({ error: 'No cancellable request of yours with that id.' })
    await adminAudit(req, {
      action: 'flag_change_cancelled', entityType: 'feature_flag', entityId: r.rows[0].flag_key,
      after: { changeId: req.params.id },
    })
    res.json({ ok: true })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_flag_cancel_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
