import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import logger from '../lib/logger.js'
import { findUserByEmail, findUserById, createUser, updateUser, publicUser } from '../lib/db.js'

const router = Router()

// Read lazily at call time: with ESM, route modules are imported before
// dotenv's config() runs in index.js, so process.env isn't populated yet here.
function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    logger.warn('jwt_secret_missing', { detail: 'Using an insecure default. Set JWT_SECRET in server/.env for production.' })
    return 'dev-insecure-secret-change-me'
  }
  return secret
}
const JWT_EXPIRES_IN = '30d'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN })
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
