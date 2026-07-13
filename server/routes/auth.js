import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import logger from '../lib/logger.js'
import { getJwtSecret } from '../lib/security.js'
import { findUserByEmail, findUserById, createUser, updateUser, publicUser } from '../lib/db.js'

const router = Router()

// JWT secret policy lives in lib/security.js (audit C8): hard-fails in
// production when JWT_SECRET is unset — no silent insecure fallback.
const JWT_EXPIRES_IN = '30d'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// tv = token version (Control Centre Phase 2). Admin-triggered candidate
// session revocation / suspension / password reset bumps user.tokenVersion;
// tokens minted before the bump fail the strict check below. Tokens issued
// before this field existed carry no tv — treated as 0, matching the store
// default, so existing sessions stay valid until an administrator acts.
function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, tv: user.tokenVersion || 0 },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRES_IN },
  )
}

function tokenVersionValid(payload, user) {
  return (payload.tv || 0) === (user.tokenVersion || 0)
}

// ── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, college, year, password } = req.body || {}

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' })
    }
    if (!EMAIL_RE.test(String(email))) {
      return res.status(400).json({ error: 'Please enter a valid email address.' })
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' })
    }

    const passwordHash = await bcrypt.hash(String(password), 10)

    let user
    try {
      user = await createUser({ name, email, college, year, passwordHash })
    } catch (err) {
      if (err.message === 'EMAIL_TAKEN') {
        return res.status(409).json({ error: 'An account with this email already exists.' })
      }
      throw err
    }

    const token = signToken(user)
    res.status(201).json({ token, user: publicUser(user) })
  } catch (err) {
    logger.captureException(err, { msg: 'auth_register_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Failed to create account.' })
  }
})

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {}

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' })
    }

    const user = await findUserByEmail(email)
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash)
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    // Admin-suspended accounts cannot sign in (Control Centre Phase 2).
    if (user.accountState === 'suspended') {
      return res.status(403).json({ error: 'This account is suspended. Contact support@studai.one.' })
    }

    const token = signToken(user)
    res.json({ token, user: publicUser(user) })
  } catch (err) {
    logger.captureException(err, { msg: 'auth_login_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Failed to sign in.' })
  }
})

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated.' })
    }

    let payload
    try {
      payload = jwt.verify(token, getJwtSecret())
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token.' })
    }

    const user = await findUserById(payload.sub)
    if (!user) {
      return res.status(401).json({ error: 'Account not found.' })
    }
    if (!tokenVersionValid(payload, user)) {
      return res.status(401).json({ error: 'Session revoked. Please sign in again.' })
    }
    if (user.accountState === 'suspended') {
      return res.status(403).json({ error: 'This account is suspended. Contact support@studai.one.' })
    }

    res.json({ user: publicUser(user) })
  } catch (err) {
    logger.captureException(err, { msg: 'auth_me_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Failed to load profile.' })
  }
})

// ── PATCH /api/auth/me ───────────────────────────────────────────────────────
// Update the signed-in user's editable profile fields (name, college, year).
router.patch('/me', async (req, res) => {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated.' })
    }

    let payload
    try {
      payload = jwt.verify(token, getJwtSecret())
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token.' })
    }

    const { name, college, year } = req.body || {}
    if (typeof name === 'string' && !name.trim()) {
      return res.status(400).json({ error: 'Name cannot be empty.' })
    }

    const current = await findUserById(payload.sub)
    if (!current) {
      return res.status(401).json({ error: 'Account not found.' })
    }
    if (!tokenVersionValid(payload, current)) {
      return res.status(401).json({ error: 'Session revoked. Please sign in again.' })
    }
    if (current.accountState === 'suspended') {
      return res.status(403).json({ error: 'This account is suspended. Contact support@studai.one.' })
    }

    let user
    try {
      user = await updateUser(payload.sub, { name, college, year })
    } catch (err) {
      if (err.message === 'USER_NOT_FOUND') {
        return res.status(401).json({ error: 'Account not found.' })
      }
      throw err
    }

    res.json({ user: publicUser(user) })
  } catch (err) {
    logger.captureException(err, { msg: 'auth_me_patch_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Failed to update profile.' })
  }
})

export default router
