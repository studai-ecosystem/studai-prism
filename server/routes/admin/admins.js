// /api/admin/admins — administrator lifecycle & RBAC management (Phase 1).
//
//   GET    /                      admins:read     list administrators
//   POST   /                      admins:manage   invite (create) an administrator
//   GET    /roles                 admins:read     role catalogue
//   POST   /:id/roles             admins:manage   grant role (super_admin grant is dual-approved)
//   DELETE /:id/roles/:roleKey    admins:manage   revoke role
//   POST   /:id/state             admins:manage   suspend / reactivate / deactivate (reason required)
//   POST   /:id/reset-password    admins:manage   one-time temporary password (shown once, forced change)
//   GET    /approvals             approvals list (admins:read)
//   POST   /approvals             raise an approval request
//   POST   /approvals/:id/decide  approvals:decide (decider must differ — DB CHECK)
//
// Invariants: you cannot suspend/deactivate yourself; you cannot decide your
// own approval (DB CHECK chk_admin_approvals_dual); granting super_admin
// requires a consumed approval row raised by someone else.

import { Router } from 'express'
import { randomUUID } from 'crypto'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import {
  requirePermission, hashPassword, validatePasswordPolicy, consumeApproval,
  revokeAllSessionsForAdmin,
} from '../../lib/adminAuth.js'
import { ROLES } from '../../lib/adminRbac.js'
import { adminAudit } from '../../lib/adminAudit.js'

const router = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── List ─────────────────────────────────────────────────────────────────────
router.get('/', requirePermission('admins:read'), async (req, res) => {
  const r = await query(
    `SELECT u.admin_id, u.email, u.name, u.state, u.is_break_glass, u.must_change_password,
            u.last_login_at, u.created_at,
            COALESCE(json_agg(ro.role_key) FILTER (WHERE ro.role_key IS NOT NULL), '[]') AS roles
       FROM admin_users u
       LEFT JOIN admin_user_roles ur ON ur.admin_id = u.admin_id
       LEFT JOIN admin_roles ro ON ro.role_id = ur.role_id
      GROUP BY u.admin_id
      ORDER BY u.created_at ASC`,
  )
  res.json({ admins: r?.rows || [] })
})

router.get('/roles', requirePermission('admins:read'), async (_req, res) => {
  res.json({
    roles: Object.entries(ROLES).map(([key, def]) => ({
      roleKey: key, title: def.title, description: def.description, permissions: def.permissions,
    })),
  })
})

// ── Invite ───────────────────────────────────────────────────────────────────
router.post('/', requirePermission('admins:manage'), async (req, res) => {
  try {
    const { email, name, roleKeys = [], temporaryPassword } = req.body || {}
    if (!EMAIL_RE.test(String(email || ''))) return res.status(400).json({ error: 'Valid email required.' })
    if (!Array.isArray(roleKeys) || roleKeys.some((k) => !ROLES[k])) {
      return res.status(400).json({ error: 'roleKeys must be known role keys.' })
    }
    if (roleKeys.includes('super_admin') || roleKeys.includes('break_glass')) {
      return res.status(400).json({ error: 'super_admin / break_glass cannot be granted at invite. Grant via the dual-approved role endpoint.' })
    }
    const policyError = validatePasswordPolicy(temporaryPassword, email)
    if (policyError) return res.status(400).json({ error: `Temporary password: ${policyError}` })

    const adminId = randomUUID()
    try {
      await query(
        `INSERT INTO admin_users (admin_id, email, name, password_hash, state, must_change_password, invited_by)
         VALUES ($1,$2,$3,$4,'invited',TRUE,$5)`,
        [adminId, String(email).toLowerCase().trim(), String(name || '').trim(), await hashPassword(temporaryPassword), req.admin.id],
      )
    } catch (err) {
      if (/duplicate key/.test(err.message)) return res.status(409).json({ error: 'An administrator with this email already exists.' })
      throw err
    }
    for (const roleKey of roleKeys) {
      await query(
        `INSERT INTO admin_user_roles (admin_id, role_id, granted_by)
         SELECT $1, role_id, $3 FROM admin_roles WHERE role_key = $2
         ON CONFLICT DO NOTHING`,
        [adminId, roleKey, req.admin.id],
      )
    }
    await adminAudit(req, {
      action: 'admin_invited', entityType: 'admin_user', entityId: adminId,
      after: { email: String(email).toLowerCase().trim(), roles: roleKeys },
    })
    // The temporary password is relayed out-of-band by the inviter; the invitee
    // must change it and enrol MFA at first login (state 'invited' + flag).
    res.status(201).json({ adminId, email: String(email).toLowerCase().trim(), roles: roleKeys, state: 'invited' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_invite_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Roles ────────────────────────────────────────────────────────────────────
router.post('/:id/roles', requirePermission('admins:manage'), async (req, res) => {
  try {
    const { roleKey, reason } = req.body || {}
    if (!ROLES[roleKey]) return res.status(400).json({ error: 'Unknown role.' })
    if (!reason) return res.status(400).json({ error: 'A reason is required to grant a role.' })
    const target = await query('SELECT admin_id, email FROM admin_users WHERE admin_id = $1', [req.params.id])
    if (!target?.rows?.[0]) return res.status(404).json({ error: 'Administrator not found.' })

    let approvalId = null
    if (roleKey === 'super_admin' || roleKey === 'break_glass') {
      // Privilege elevation is dual-approved (plan §29): a second super admin
      // must have approved this exact grant.
      const approval = await consumeApproval(`grant_role:${roleKey}`, req.params.id)
      if (!approval) {
        return res.status(409).json({
          error: `Granting ${roleKey} requires dual approval. Raise a request at POST /api/admin/admins/approvals with action "grant_role:${roleKey}" and entityId "${req.params.id}", approved by a different super administrator.`,
          code: 'APPROVAL_REQUIRED',
        })
      }
      approvalId = approval.approval_id
    }

    await query(
      `INSERT INTO admin_user_roles (admin_id, role_id, granted_by)
       SELECT $1, role_id, $3 FROM admin_roles WHERE role_key = $2
       ON CONFLICT DO NOTHING`,
      [req.params.id, roleKey, req.admin.id],
    )
    await adminAudit(req, {
      action: 'admin_role_granted', entityType: 'admin_user', entityId: req.params.id,
      after: { roleKey }, reason, approvalId,
    })
    res.json({ ok: true, roleKey })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_role_grant_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:id/roles/:roleKey', requirePermission('admins:manage'), async (req, res) => {
  const { reason } = req.body || {}
  if (!reason) return res.status(400).json({ error: 'A reason is required to revoke a role.' })
  await query(
    `DELETE FROM admin_user_roles WHERE admin_id = $1 AND role_id = (SELECT role_id FROM admin_roles WHERE role_key = $2)`,
    [req.params.id, req.params.roleKey],
  )
  await adminAudit(req, {
    action: 'admin_role_revoked', entityType: 'admin_user', entityId: req.params.id,
    before: { roleKey: req.params.roleKey }, reason,
  })
  res.json({ ok: true })
})

// ── Account state ────────────────────────────────────────────────────────────
router.post('/:id/state', requirePermission('admins:manage'), async (req, res) => {
  try {
    const { state, reason } = req.body || {}
    if (!['active', 'suspended', 'deactivated'].includes(state)) {
      return res.status(400).json({ error: 'state must be active, suspended or deactivated.' })
    }
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    if (req.params.id === req.admin.id) {
      return res.status(400).json({ error: 'You cannot change your own account state.' })
    }
    const before = await query('SELECT state FROM admin_users WHERE admin_id = $1', [req.params.id])
    if (!before?.rows?.[0]) return res.status(404).json({ error: 'Administrator not found.' })

    await query('UPDATE admin_users SET state = $2 WHERE admin_id = $1', [req.params.id, state])
    if (state !== 'active') await revokeAllSessionsForAdmin(req.params.id, `state → ${state}`)

    await adminAudit(req, {
      action: 'admin_state_changed', entityType: 'admin_user', entityId: req.params.id,
      before: { state: before.rows[0].state }, after: { state }, reason,
    })
    res.json({ ok: true, state })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_state_change_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Password reset (operator-assisted) ───────────────────────────────────────
router.post('/:id/reset-password', requirePermission('admins:manage'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    const target = await query('SELECT admin_id, email FROM admin_users WHERE admin_id = $1', [req.params.id])
    if (!target?.rows?.[0]) return res.status(404).json({ error: 'Administrator not found.' })

    const temp = `Rst-${randomUUID()}` // satisfies length policy; forced change on login
    await query(
      `UPDATE admin_users SET password_hash = $2, must_change_password = TRUE WHERE admin_id = $1`,
      [req.params.id, await hashPassword(temp)],
    )
    await revokeAllSessionsForAdmin(req.params.id, 'password reset')
    await adminAudit(req, {
      action: 'admin_password_reset', entityType: 'admin_user', entityId: req.params.id, reason,
    })
    // Shown exactly once; relay out-of-band. Never logged.
    res.json({ ok: true, temporaryPassword: temp, note: 'Shown once. The administrator must change it at next login.' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_password_reset_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Approvals (dual control) ─────────────────────────────────────────────────
router.get('/approvals', requirePermission('admins:read'), async (req, res) => {
  const r = await query(
    `SELECT a.*, ru.email AS requested_by_email, du.email AS decided_by_email
       FROM admin_approvals a
       JOIN admin_users ru ON ru.admin_id = a.requested_by
       LEFT JOIN admin_users du ON du.admin_id = a.decided_by
      ORDER BY a.created_at DESC LIMIT 100`,
  )
  res.json({ approvals: r?.rows || [] })
})

router.post('/approvals', requirePermission('admins:manage'), async (req, res) => {
  const { action, entityType, entityId, payload, reason, risk = 'high' } = req.body || {}
  if (!action || !reason) return res.status(400).json({ error: 'action and reason are required.' })
  const approvalId = randomUUID()
  await query(
    `INSERT INTO admin_approvals (approval_id, action, entity_type, entity_id, payload, risk, requested_by, requested_reason, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() + interval '72 hours')`,
    [approvalId, String(action), entityType || null, entityId != null ? String(entityId) : null,
     payload ? JSON.stringify(payload) : null, ['low','medium','high'].includes(risk) ? risk : 'high',
     req.admin.id, String(reason)],
  )
  await adminAudit(req, {
    action: 'approval_requested', entityType: 'admin_approval', entityId: approvalId,
    after: { action, entityId }, reason,
  })
  res.status(201).json({ approvalId, status: 'pending', expiresInHours: 72 })
})

router.post('/approvals/:id/decide', requirePermission('approvals:decide'), async (req, res) => {
  try {
    const { decision, reason } = req.body || {}
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'decision must be approved or rejected.' })
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    let r
    try {
      r = await query(
        `UPDATE admin_approvals SET status = $2, decided_by = $3, decided_reason = $4, decided_at = now()
          WHERE approval_id = $1 AND status = 'pending' AND expires_at > now()
          RETURNING *`,
        [req.params.id, decision, req.admin.id, String(reason)],
      )
    } catch (err) {
      if (/chk_admin_approvals_dual/.test(err.message)) {
        return res.status(403).json({ error: 'Dual control: you cannot decide your own request.', code: 'DUAL_CONTROL' })
      }
      throw err
    }
    if (!r?.rows?.[0]) return res.status(404).json({ error: 'No pending, unexpired approval with that id.' })
    await adminAudit(req, {
      action: `approval_${decision}`, entityType: 'admin_approval', entityId: req.params.id, reason,
    })
    res.json({ ok: true, status: decision })
  } catch (err) {
    logger.captureException(err, { msg: 'approval_decide_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
