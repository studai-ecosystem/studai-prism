// Admin authentication & authorization primitives (Control Centre Phase 1).
//
// Design (plan §8 threat model):
//   * Password: bcrypt cost 12, policy >= 12 chars.
//   * MFA: mandatory TOTP (RFC 6238, SHA-1/30s/6 digits) implemented on
//     node:crypto — zero new dependencies. Secrets AES-256-GCM encrypted at
//     rest with a key derived (scrypt) from PRISM_ADMIN_MFA_KEY or JWT_SECRET.
//   * Access token: 15-minute JWT (aud "prism-admin") held in JS memory only.
//   * Refresh: 48-byte random token in an HttpOnly Secure SameSite=Strict
//     cookie scoped to /api/admin; only its SHA-256 hash is stored; rotated on
//     every refresh; revocable per-session.
//   * CSRF: per-session token required in x-admin-csrf on every mutation.
//   * requirePermission() is THE authorization boundary — every /api/admin
//     endpoint declares its permission; '*' (super_admin/break_glass) matches all.

import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../db/pool.js'
import { getJwtSecret, isProduction } from './security.js'
import { permissionsForAdmin, rolesForAdmin } from './adminRbac.js'
import logger from './logger.js'

export const ACCESS_TOKEN_TTL = '15m'
export const ACCESS_AUDIENCE = 'prism-admin'
export const MFA_AUDIENCE = 'prism-admin-mfa'
export const REFRESH_TTL_HOURS = 12
export const BREAK_GLASS_TTL_MINUTES = 60
export const REFRESH_COOKIE = 'prism_admin_rt'
export const PASSWORD_MIN_LENGTH = 12
const MAX_FAILED_LOGINS = 10
const LOCK_MINUTES = 15

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex')

// ── Passwords ────────────────────────────────────────────────────────────────
export function validatePasswordPolicy(password, email = '') {
  const p = String(password || '')
  if (p.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  }
  if (email && p.toLowerCase().includes(String(email).toLowerCase().split('@')[0])) {
    return 'Password must not contain your email name.'
  }
  return null
}

export async function hashPassword(password) {
  return bcrypt.hash(String(password), 12)
}

export async function verifyPassword(password, hash) {
  if (!hash) return false
  return bcrypt.compare(String(password), String(hash))
}

// ── Base32 (RFC 4648, no padding) for authenticator-app secrets ─────────────
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s/g, '')
  let bits = 0
  let value = 0
  const out = []
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch)
    if (idx === -1) throw new Error('invalid base32 character')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

// ── TOTP (RFC 6238; HMAC-SHA1, 30s step, 6 digits) ──────────────────────────
export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20)) // 160-bit, RFC 4226 recommended
}

export function hotpCode(secretBase32, counter, digits = 6) {
  const key = base32Decode(secretBase32)
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const hmac = crypto.createHmac('sha1', key).update(msg).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return String(code % 10 ** digits).padStart(digits, '0')
}

export function totpCode(secretBase32, atMs = Date.now(), stepSeconds = 30, digits = 6) {
  return hotpCode(secretBase32, Math.floor(atMs / 1000 / stepSeconds), digits)
}

// Accept the current step ±1 (clock skew). Constant-time compare.
export function verifyTotp(secretBase32, code, atMs = Date.now()) {
  const given = String(code || '').trim()
  if (!/^\d{6}$/.test(given)) return false
  for (const skew of [-1, 0, 1]) {
    const expected = totpCode(secretBase32, atMs + skew * 30 * 1000)
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return true
  }
  return false
}

export function otpauthUri(secretBase32, email) {
  const label = encodeURIComponent(`StudAI Prism Admin:${email}`)
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent('StudAI Prism Admin')}&algorithm=SHA1&digits=6&period=30`
}

// ── MFA secret encryption at rest (AES-256-GCM) ─────────────────────────────
let _mfaKey = null
function mfaKey() {
  if (_mfaKey) return _mfaKey
  const material = process.env.PRISM_ADMIN_MFA_KEY || getJwtSecret()
  _mfaKey = crypto.scryptSync(material, 'prism-admin-mfa-v1', 32)
  return _mfaKey
}

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', mfaKey(), iv)
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${enc.toString('base64')}`
}

export function decryptSecret(stored) {
  const [ivB64, tagB64, dataB64] = String(stored).split('.')
  const decipher = crypto.createDecipheriv('aes-256-gcm', mfaKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}

// ── Tokens ───────────────────────────────────────────────────────────────────
export function signAccessToken(admin, sessionId) {
  return jwt.sign(
    { sub: admin.admin_id, email: admin.email, sid: sessionId },
    getJwtSecret(),
    { expiresIn: ACCESS_TOKEN_TTL, audience: ACCESS_AUDIENCE },
  )
}

// Short-lived token that carries the identity BETWEEN password check and MFA
// verification. It grants no API access (its audience is rejected everywhere).
export function signMfaToken(adminId, purpose) {
  return jwt.sign({ sub: adminId, purpose }, getJwtSecret(), {
    expiresIn: '10m',
    audience: MFA_AUDIENCE,
  })
}

export function verifyMfaToken(token) {
  return jwt.verify(token, getJwtSecret(), { audience: MFA_AUDIENCE })
}

// ── Refresh sessions ─────────────────────────────────────────────────────────
export async function createAdminSession(admin, req, { breakGlass = false, breakGlassReason = null } = {}) {
  const sessionId = crypto.randomUUID()
  const refreshToken = crypto.randomBytes(48).toString('hex')
  const csrfToken = crypto.randomBytes(24).toString('hex')
  const hours = breakGlass ? BREAK_GLASS_TTL_MINUTES / 60 : REFRESH_TTL_HOURS
  await query(
    `INSERT INTO admin_sessions
       (session_id, admin_id, refresh_hash, csrf_token, ip, user_agent, is_break_glass, break_glass_reason, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() + ($9 || ' hours')::interval)`,
    [
      sessionId, admin.admin_id, sha256(refreshToken), csrfToken,
      req.ip || null, req.get?.('user-agent') || null,
      breakGlass, breakGlassReason, String(hours),
    ],
  )
  return { sessionId, refreshToken, csrfToken }
}

// Rotate: single-use refresh tokens. Returns null when invalid/expired/revoked.
export async function rotateAdminSession(refreshToken) {
  if (!refreshToken) return null
  const r = await query(
    `SELECT s.*, u.state, u.email FROM admin_sessions s
       JOIN admin_users u ON u.admin_id = s.admin_id
      WHERE s.refresh_hash = $1`,
    [sha256(refreshToken)],
  )
  const session = r?.rows?.[0]
  if (!session) return null
  if (session.revoked_at || new Date(session.expires_at) < new Date()) return null
  if (session.state !== 'active') return null
  const newToken = crypto.randomBytes(48).toString('hex')
  await query(
    `UPDATE admin_sessions SET refresh_hash = $1, last_seen_at = now() WHERE session_id = $2`,
    [sha256(newToken), session.session_id],
  )
  return { session, refreshToken: newToken }
}

export async function revokeAdminSession(sessionId, reason) {
  await query(
    `UPDATE admin_sessions SET revoked_at = now(), revoke_reason = $2
      WHERE session_id = $1 AND revoked_at IS NULL`,
    [sessionId, reason || 'logout'],
  )
}

export async function revokeAllSessionsForAdmin(adminId, reason) {
  await query(
    `UPDATE admin_sessions SET revoked_at = now(), revoke_reason = $2
      WHERE admin_id = $1 AND revoked_at IS NULL`,
    [adminId, reason || 'revoked'],
  )
}

// ── Cookie helpers (no cookie-parser dependency) ─────────────────────────────
export function readCookie(req, name) {
  const header = req.headers?.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim())
  }
  return null
}

export function setRefreshCookie(res, token, { breakGlass = false } = {}) {
  const maxAgeSec = breakGlass ? BREAK_GLASS_TTL_MINUTES * 60 : REFRESH_TTL_HOURS * 3600
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'strict',
    path: '/api/admin',
    maxAge: maxAgeSec * 1000,
  })
}

export function clearRefreshCookie(res) {
  res.cookie(REFRESH_COOKIE, '', {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'strict',
    path: '/api/admin',
    maxAge: 0,
  })
}

// ── Account lookups & lockout ────────────────────────────────────────────────
export async function findAdminByEmail(email) {
  const r = await query('SELECT * FROM admin_users WHERE email = $1', [String(email || '').toLowerCase().trim()])
  return r?.rows?.[0] || null
}

export async function findAdminById(adminId) {
  const r = await query('SELECT * FROM admin_users WHERE admin_id = $1', [adminId])
  return r?.rows?.[0] || null
}

export async function registerFailedLogin(adminId) {
  const r = await query(
    `UPDATE admin_users SET failed_login_count = failed_login_count + 1,
            locked_until = CASE WHEN failed_login_count + 1 >= $2
                                THEN now() + ($3 || ' minutes')::interval ELSE locked_until END
      WHERE admin_id = $1
      RETURNING failed_login_count, locked_until`,
    [adminId, MAX_FAILED_LOGINS, String(LOCK_MINUTES)],
  )
  return r?.rows?.[0]
}

export async function registerSuccessfulLogin(adminId, ip) {
  await query(
    `UPDATE admin_users SET failed_login_count = 0, locked_until = NULL,
            last_login_at = now(), last_login_ip = $2
      WHERE admin_id = $1`,
    [adminId, ip || null],
  )
}

export function isLocked(admin) {
  return Boolean(admin.locked_until && new Date(admin.locked_until) > new Date())
}

// ── MFA methods ──────────────────────────────────────────────────────────────
export async function confirmedMfaMethods(adminId) {
  const r = await query(
    `SELECT * FROM admin_mfa_methods WHERE admin_id = $1 AND confirmed_at IS NOT NULL`,
    [adminId],
  )
  return r?.rows || []
}

export async function verifyAdminTotp(adminId, code) {
  const methods = await confirmedMfaMethods(adminId)
  for (const m of methods) {
    try {
      if (verifyTotp(decryptSecret(m.secret_encrypted), code)) return true
    } catch (err) {
      logger.captureException(err, { msg: 'admin_mfa_decrypt_failed', methodId: m.method_id })
    }
  }
  return false
}

// ── Middleware ───────────────────────────────────────────────────────────────
// Verifies the access token, re-checks account state and session revocation in
// the DB (a revoked session dies within one request, not after 15 minutes),
// and attaches req.admin = { id, email, roles, permissions, sessionId }.
export async function requireAdminAuth(req, res, next) {
  try {
    const header = req.get('authorization') || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ error: 'authentication required', code: 'NO_TOKEN' })

    let claims
    try {
      claims = jwt.verify(token, getJwtSecret(), { audience: ACCESS_AUDIENCE })
    } catch {
      return res.status(401).json({ error: 'invalid or expired token', code: 'BAD_TOKEN' })
    }

    const admin = await findAdminById(claims.sub)
    if (!admin || admin.state !== 'active') {
      return res.status(403).json({ error: 'account is not active', code: 'INACTIVE' })
    }
    const s = await query(
      'SELECT session_id, csrf_token, revoked_at, expires_at, is_break_glass FROM admin_sessions WHERE session_id = $1',
      [claims.sid],
    )
    const session = s?.rows?.[0]
    if (!session || session.revoked_at || new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ error: 'session revoked or expired', code: 'SESSION_GONE' })
    }

    req.admin = {
      id: admin.admin_id,
      email: admin.email,
      name: admin.name,
      mustChangePassword: admin.must_change_password,
      isBreakGlass: session.is_break_glass,
      sessionId: session.session_id,
      csrfToken: session.csrf_token,
      roles: await rolesForAdmin(admin.admin_id),
      permissions: await permissionsForAdmin(admin.admin_id),
    }
    next()
  } catch (err) {
    logger.captureException(err, { msg: 'admin_auth_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export function hasPermission(admin, key) {
  return Boolean(admin?.permissions?.has('*') || admin?.permissions?.has(key))
}

export function requirePermission(key) {
  return (req, res, next) => {
    if (!req.admin) return res.status(401).json({ error: 'authentication required', code: 'NO_TOKEN' })
    if (!hasPermission(req.admin, key)) {
      return res.status(403).json({
        error: `missing permission: ${key}`,
        code: 'FORBIDDEN',
        explanation: 'This action requires a role that grants this permission. Ask a super administrator.',
      })
    }
    next()
  }
}

// CSRF: mutations must echo the per-session token. GET/HEAD/OPTIONS exempt.
export function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const given = req.get('x-admin-csrf') || ''
  const expected = req.admin?.csrfToken || ''
  const a = Buffer.from(String(given))
  const b = Buffer.from(String(expected))
  if (!given || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'CSRF token missing or invalid', code: 'CSRF' })
  }
  next()
}

// Same-origin check for the cookie-only refresh endpoint (which cannot carry
// the CSRF header because a fresh page load has no JS state yet).
export function requireSameOrigin(req, res, next) {
  const origin = req.get('origin')
  if (!origin) return next() // same-origin fetches may omit Origin
  const host = req.get('host')
  try {
    if (new URL(origin).host !== host) {
      return res.status(403).json({ error: 'cross-origin request rejected', code: 'ORIGIN' })
    }
  } catch {
    return res.status(403).json({ error: 'invalid origin', code: 'ORIGIN' })
  }
  next()
}

// ── Dual approval ────────────────────────────────────────────────────────────
// Consumes an APPROVED admin_approvals row for (action, entityId). Dual control
// is guaranteed at decision time by the DB CHECK (decided_by <> requested_by);
// execution marks the row 'executed' atomically so it is single-use.
export async function consumeApproval(action, entityId) {
  const r = await query(
    `UPDATE admin_approvals SET status = 'executed', executed_at = now()
      WHERE approval_id = (
        SELECT approval_id FROM admin_approvals
         WHERE action = $1 AND entity_id = $2
           AND status = 'approved' AND expires_at > now()
         ORDER BY created_at ASC LIMIT 1)
      RETURNING *`,
    [action, entityId],
  )
  return r?.rows?.[0] || null
}
