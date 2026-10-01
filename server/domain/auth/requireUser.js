// Single JWT authentication path for /api/v1 (replaces per-router getAuthUser
// copies for new code). Verifies signature, token version and account state.
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../../lib/security.js'
import { findUserById, publicUser } from '../../lib/db.js'
import { ApiError } from '../http/errors.js'

function bearer(req) {
  const header = req.get?.('authorization') || req.headers?.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7) : null
}

export async function authenticate(req, { findUser = findUserById } = {}) {
  const token = bearer(req)
  if (!token) return { user: null, reason: 'missing' }
  let payload
  try {
    payload = jwt.verify(token, getJwtSecret())
  } catch {
    return { user: null, reason: 'invalid' }
  }
  const record = await findUser(payload.sub)
  if (!record) return { user: null, reason: 'unknown' }
  if ((payload.tv || 0) !== (record.tokenVersion || 0)) return { user: null, reason: 'revoked' }
  if (record.accountState === 'suspended') return { user: null, reason: 'suspended' }
  return { user: publicUser(record), reason: null }
}

export function createRequireUser(deps = {}) {
  return async function requireUser(req, _res, next) {
    try {
      const { user, reason } = await authenticate(req, deps)
      if (!user) {
        return next(reason === 'suspended'
          ? new ApiError('FORBIDDEN', 'This account is suspended.')
          : new ApiError('UNAUTHENTICATED', 'Sign in to continue.'))
      }
      req.user = user
      return next()
    } catch (err) {
      return next(err)
    }
  }
}

export const requireUser = createRequireUser()
