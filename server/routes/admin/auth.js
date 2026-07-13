// /api/admin/auth — administrator authentication (Control Centre Phase 1).
//
// Flow (MFA is MANDATORY — there is no password-only session):
//   POST /login        {email, password}
//     → 200 {mfaRequired:true,  mfaToken}   (has a confirmed TOTP method)
//     → 200 {mfaSetupRequired:true, mfaToken} (first login: must enrol TOTP)
//   POST /mfa/setup    {mfaToken}            → {secret, otpauthUri} (unconfirmed method)
//   POST /mfa/confirm  {mfaToken, code}      → confirms method, mints session
//   POST /mfa/verify   {mfaToken, code}      → mints session
//   POST /refresh      (cookie only)         → rotates refresh, new access token
//   POST /logout                             → revokes session, clears cookie
//   GET  /me                                 → identity, roles, permissions, env
//   GET  /sessions                           → device/session list
//   POST /sessions/:id/revoke                → revoke one session
//   POST /password/change {current, next, code} → re-auth + TOTP, revokes other sessions
//   POST /break-glass/activate {email, password, code, reason} → 60-min alerted session
//
// Access tokens are returned in the JSON body (held in JS memory client-side);
// the refresh token travels ONLY in an HttpOnly SameSite=Strict cookie scoped
// to /api/admin. Every auth event is written to the immutable admin audit trail.

import { Router } from 'express'
import { randomUUID } from 'crypto'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import {
  findAdminByEmail, findAdminById, verifyPassword, hashPassword, validatePasswordPolicy,
  registerFailedLogin, registerSuccessfulLogin, isLocked,
  confirmedMfaMethods, verifyAdminTotp, generateTotpSecret, otpauthUri, encryptSecret,
  decryptSecret, verifyTotp,
  signAccessToken, signMfaToken, verifyMfaToken,
  createAdminSession, rotateAdminSession, revokeAdminSession, revokeAllSessionsForAdmin,
  readCookie, setRefreshCookie, clearRefreshCookie,
  requireAdminAuth, requireCsrf, requireSameOrigin,
  REFRESH_COOKIE, ACCESS_TOKEN_TTL,
} from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { rolesForAdmin, permissionsForAdmin } from '../../lib/adminRbac.js'

const router = Router()

// Uniform failure body — never reveals whether the email exists.
const BAD_CREDS = { error: 'Invalid email or password.', code: 'BAD_CREDENTIALS' }

async function adminContext(adminId) {
  const admin = await findAdminById(adminId)
  if (!admin) return null
  return {
    admin,
    roles: await rolesForAdmin(adminId),
    permissions: [...(await permissionsForAdmin(adminId))],
  }
}

async function mintSession(req, res, admin, { breakGlass = false, breakGlassReason = null } = {}) {
  const { sessionId, refreshToken, csrfToken } = await createAdminSession(admin, req, {
    breakGlass, breakGlassReason,
  })
  setRefreshCookie(res, refreshToken, { breakGlass })
  const ctx = await adminContext(admin.admin_id)
  return {
    accessToken: signAccessToken(admin, sessionId),
    accessTokenTtl: ACCESS_TOKEN_TTL,
    csrfToken,
    admin: {
      id: admin.admin_id,
      email: admin.email,
      name: admin.name,
      state: admin.state,
      mustChangePassword: admin.must_change_password,
      roles: ctx?.roles || [],
      permissions: ctx?.permissions || [],
    },
  }
}

// ── POST /login ──────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' })

    const admin = await findAdminByEmail(email)
    if (!admin) return res.status(401).json(BAD_CREDS)

    if (isLocked(admin)) {
      await adminAudit(req, {
        action: 'admin_login_blocked_locked', entityType: 'admin_user', entityId: admin.admin_id,
        adminOverride: { id: admin.admin_id, email: admin.email },
      })
      return res.status(423).json({ error: 'Account temporarily locked after repeated failures. Try again later.', code: 'LOCKED' })
    }
    if (!['active', 'invited'].includes(admin.state)) {
      return res.status(403).json({ error: `Account is ${admin.state}.`, code: 'INACTIVE' })
    }
    if (admin.is_break_glass) {
      return res.status(403).json({ error: 'Break-glass accounts must use /break-glass/activate.', code: 'BREAK_GLASS_ONLY' })
    }

    const ok = await verifyPassword(password, admin.password_hash)
    if (!ok) {
      const state = await registerFailedLogin(admin.admin_id)
      await adminAudit(req, {
        action: 'admin_login_failed', entityType: 'admin_user', entityId: admin.admin_id,
        after: { failedCount: state?.failed_login_count },
        adminOverride: { id: admin.admin_id, email: admin.email },
      })
      return res.status(401).json(BAD_CREDS)
    }

    // Suspicious-login signal: same account, new source address.
    if (admin.last_login_ip && req.ip && admin.last_login_ip !== req.ip) {
      logger.warn('admin_login_new_ip', { adminId: admin.admin_id, requestId: req.requestId })
      await adminAudit(req, {
        action: 'admin_login_new_ip', entityType: 'admin_user', entityId: admin.admin_id,
        adminOverride: { id: admin.admin_id, email: admin.email },
      })
    }

    const methods = await confirmedMfaMethods(admin.admin_id)
    if (!methods.length) {
      // Mandatory MFA: password alone NEVER yields a session.
      return res.json({ mfaSetupRequired: true, mfaToken: signMfaToken(admin.admin_id, 'setup') })
    }
    return res.json({ mfaRequired: true, mfaToken: signMfaToken(admin.admin_id, 'verify') })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_login_failed_internal', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── POST /mfa/setup — enrol TOTP (first login) ───────────────────────────────
router.post('/mfa/setup', async (req, res) => {
  try {
    const { mfaToken } = req.body || {}
    let claims
    try {
      claims = verifyMfaToken(mfaToken)
    } catch {
      return res.status(401).json({ error: 'Invalid or expired MFA token. Sign in again.', code: 'BAD_MFA_TOKEN' })
    }
    const admin = await findAdminById(claims.sub)
    if (!admin) return res.status(401).json(BAD_CREDS)
    if ((await confirmedMfaMethods(admin.admin_id)).length) {
      return res.status(409).json({ error: 'MFA is already configured.', code: 'MFA_EXISTS' })
    }
    const secret = generateTotpSecret()
    // Replace any prior unconfirmed attempt.
    await query(
      `DELETE FROM admin_mfa_methods WHERE admin_id = $1 AND confirmed_at IS NULL`,
      [admin.admin_id],
    )
    await query(
      `INSERT INTO admin_mfa_methods (method_id, admin_id, kind, secret_encrypted)
       VALUES ($1,$2,'totp',$3)`,
      [randomUUID(), admin.admin_id, encryptSecret(secret)],
    )
    // The raw secret is shown exactly once, at enrolment.
    res.json({ secret, otpauthUri: otpauthUri(secret, admin.email) })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_mfa_setup_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── POST /mfa/confirm — verify first code, activate account, mint session ────
router.post('/mfa/confirm', async (req, res) => {
  try {
    const { mfaToken, code } = req.body || {}
    let claims
    try {
      claims = verifyMfaToken(mfaToken)
    } catch {
      return res.status(401).json({ error: 'Invalid or expired MFA token. Sign in again.', code: 'BAD_MFA_TOKEN' })
    }
    const admin = await findAdminById(claims.sub)
    if (!admin) return res.status(401).json(BAD_CREDS)

    const r = await query(
      `SELECT * FROM admin_mfa_methods WHERE admin_id = $1 AND confirmed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [admin.admin_id],
    )
    const method = r?.rows?.[0]
    if (!method) return res.status(400).json({ error: 'No pending MFA enrolment. Call /mfa/setup first.', code: 'NO_PENDING_MFA' })
    if (!verifyTotp(decryptSecret(method.secret_encrypted), code)) {
      return res.status(401).json({ error: 'Incorrect code. Check your authenticator app.', code: 'BAD_CODE' })
    }

    await query('UPDATE admin_mfa_methods SET confirmed_at = now() WHERE method_id = $1', [method.method_id])
    if (admin.state === 'invited') {
      await query(`UPDATE admin_users SET state = 'active' WHERE admin_id = $1`, [admin.admin_id])
      admin.state = 'active'
    }
    await registerSuccessfulLogin(admin.admin_id, req.ip)
    await adminAudit(req, {
      action: 'admin_mfa_enrolled', entityType: 'admin_user', entityId: admin.admin_id,
      adminOverride: { id: admin.admin_id, email: admin.email },
    })
    const session = await mintSession(req, res, admin)
    await adminAudit(req, {
      action: 'admin_login', entityType: 'admin_user', entityId: admin.admin_id,
      adminOverride: { id: admin.admin_id, email: admin.email },
    })
    res.json(session)
  } catch (err) {
    logger.captureException(err, { msg: 'admin_mfa_confirm_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── POST /mfa/verify — normal second factor ─────────────────────────────────
router.post('/mfa/verify', async (req, res) => {
  try {
    const { mfaToken, code } = req.body || {}
    let claims
    try {
      claims = verifyMfaToken(mfaToken)
    } catch {
      return res.status(401).json({ error: 'Invalid or expired MFA token. Sign in again.', code: 'BAD_MFA_TOKEN' })
    }
    const admin = await findAdminById(claims.sub)
    if (!admin || admin.state !== 'active') return res.status(403).json({ error: 'Account is not active.', code: 'INACTIVE' })
    if (isLocked(admin)) return res.status(423).json({ error: 'Account temporarily locked.', code: 'LOCKED' })

    if (!(await verifyAdminTotp(admin.admin_id, code))) {
      const state = await registerFailedLogin(admin.admin_id)
      await adminAudit(req, {
        action: 'admin_mfa_failed', entityType: 'admin_user', entityId: admin.admin_id,
        after: { failedCount: state?.failed_login_count },
        adminOverride: { id: admin.admin_id, email: admin.email },
      })
      return res.status(401).json({ error: 'Incorrect code.', code: 'BAD_CODE' })
    }

    await registerSuccessfulLogin(admin.admin_id, req.ip)
    const session = await mintSession(req, res, admin)
    await adminAudit(req, {
      action: 'admin_login', entityType: 'admin_user', entityId: admin.admin_id,
      adminOverride: { id: admin.admin_id, email: admin.email },
    })
    res.json(session)
  } catch (err) {
    logger.captureException(err, { msg: 'admin_mfa_verify_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── POST /refresh — cookie-only rotation ─────────────────────────────────────
router.post('/refresh', requireSameOrigin, async (req, res) => {
  try {
    const token = readCookie(req, REFRESH_COOKIE)
    const rotated = await rotateAdminSession(token)
    if (!rotated) {
      clearRefreshCookie(res)
      return res.status(401).json({ error: 'Session expired. Sign in again.', code: 'SESSION_GONE' })
    }
    const admin = await findAdminById(rotated.session.admin_id)
    setRefreshCookie(res, rotated.refreshToken, { breakGlass: rotated.session.is_break_glass })
    const ctx = await adminContext(admin.admin_id)
    res.json({
      accessToken: signAccessToken(admin, rotated.session.session_id),
      accessTokenTtl: ACCESS_TOKEN_TTL,
      csrfToken: rotated.session.csrf_token,
      admin: {
        id: admin.admin_id, email: admin.email, name: admin.name, state: admin.state,
        mustChangePassword: admin.must_change_password,
        roles: ctx?.roles || [], permissions: ctx?.permissions || [],
      },
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_refresh_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Authenticated endpoints ──────────────────────────────────────────────────
router.post('/logout', requireAdminAuth, async (req, res) => {
  await revokeAdminSession(req.admin.sessionId, 'logout')
  clearRefreshCookie(res)
  await adminAudit(req, { action: 'admin_logout', entityType: 'admin_session', entityId: req.admin.sessionId })
  res.json({ ok: true })
})

router.get('/me', requireAdminAuth, async (req, res) => {
  res.json({
    admin: {
      id: req.admin.id,
      email: req.admin.email,
      name: req.admin.name,
      roles: req.admin.roles,
      permissions: [...req.admin.permissions],
      isBreakGlass: req.admin.isBreakGlass,
    },
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  })
})

router.get('/sessions', requireAdminAuth, async (req, res) => {
  const r = await query(
    `SELECT session_id, ip, user_agent, is_break_glass, created_at, last_seen_at, expires_at, revoked_at
       FROM admin_sessions WHERE admin_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.admin.id],
  )
  res.json({
    sessions: (r?.rows || []).map((s) => ({ ...s, current: s.session_id === req.admin.sessionId })),
  })
})

router.post('/sessions/:sessionId/revoke', requireAdminAuth, requireCsrf, async (req, res) => {
  const r = await query(
    'SELECT admin_id FROM admin_sessions WHERE session_id = $1',
    [req.params.sessionId],
  )
  const target = r?.rows?.[0]
  if (!target) return res.status(404).json({ error: 'Session not found.' })
  // Own sessions always revocable; others' sessions need admins:manage.
  if (target.admin_id !== req.admin.id && !req.admin.permissions.has('*') && !req.admin.permissions.has('admins:manage')) {
    return res.status(403).json({ error: 'missing permission: admins:manage', code: 'FORBIDDEN' })
  }
  await revokeAdminSession(req.params.sessionId, `revoked by ${req.admin.email}`)
  await adminAudit(req, {
    action: 'admin_session_revoked', entityType: 'admin_session', entityId: req.params.sessionId,
    reason: req.body?.reason || null,
  })
  res.json({ ok: true })
})

router.post('/password/change', requireAdminAuth, requireCsrf, async (req, res) => {
  try {
    const { current, next, code } = req.body || {}
    const admin = await findAdminById(req.admin.id)
    if (!(await verifyPassword(current, admin.password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect.', code: 'BAD_CREDENTIALS' })
    }
    if (!(await verifyAdminTotp(admin.admin_id, code))) {
      return res.status(401).json({ error: 'Incorrect MFA code.', code: 'BAD_CODE' })
    }
    const policyError = validatePasswordPolicy(next, admin.email)
    if (policyError) return res.status(400).json({ error: policyError })

    await query(
      `UPDATE admin_users SET password_hash = $2, password_changed_at = now(), must_change_password = FALSE
        WHERE admin_id = $1`,
      [admin.admin_id, await hashPassword(next)],
    )
    // Kill every other session — a password change is a security boundary.
    await query(
      `UPDATE admin_sessions SET revoked_at = now(), revoke_reason = 'password_changed'
        WHERE admin_id = $1 AND session_id <> $2 AND revoked_at IS NULL`,
      [admin.admin_id, req.admin.sessionId],
    )
    await adminAudit(req, { action: 'admin_password_changed', entityType: 'admin_user', entityId: admin.admin_id })
    res.json({ ok: true })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_password_change_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Break-glass ──────────────────────────────────────────────────────────────
// A separately provisioned emergency account (is_break_glass = TRUE). Requires
// password + TOTP + explicit reason; session is hard-capped at 60 minutes and
// loudly alerted. Every action it takes is audited like any other admin.
router.post('/break-glass/activate', async (req, res) => {
  try {
    const { email, password, code, reason } = req.body || {}
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'A specific reason (>= 10 characters) is required to activate break-glass access.' })
    }
    const admin = await findAdminByEmail(email)
    if (!admin || !admin.is_break_glass) return res.status(401).json(BAD_CREDS)
    if (isLocked(admin)) return res.status(423).json({ error: 'Account locked.', code: 'LOCKED' })
    if (!(await verifyPassword(password, admin.password_hash))) {
      await registerFailedLogin(admin.admin_id)
      return res.status(401).json(BAD_CREDS)
    }
    if (!(await verifyAdminTotp(admin.admin_id, code))) {
      await registerFailedLogin(admin.admin_id)
      return res.status(401).json({ error: 'Incorrect code.', code: 'BAD_CODE' })
    }
    await registerSuccessfulLogin(admin.admin_id, req.ip)

    logger.warn('BREAK_GLASS_ACTIVATED', { adminId: admin.admin_id, requestId: req.requestId })
    await adminAudit(req, {
      action: 'break_glass_activated', entityType: 'admin_user', entityId: admin.admin_id,
      reason: String(reason).trim(),
      adminOverride: { id: admin.admin_id, email: admin.email },
    })
    await query(
      `INSERT INTO admin_incidents (incident_id, kind, severity, title, detail, opened_by)
       VALUES ($1,'break_glass','critical','Break-glass access activated',$2,$3)`,
      [randomUUID(), JSON.stringify({ reason: String(reason).trim(), ip: req.ip }), admin.admin_id],
    )
    const session = await mintSession(req, res, admin, {
      breakGlass: true, breakGlassReason: String(reason).trim(),
    })
    res.json({ ...session, expiresInMinutes: 60 })
  } catch (err) {
    logger.captureException(err, { msg: 'break_glass_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
