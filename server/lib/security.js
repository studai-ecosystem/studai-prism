// Security primitives (audit C7/C8/C21 — remediation Phase 2).
//
// Central place for the JWT secret policy, production startup checks and the
// rate-limit configurations, so no route module can quietly reintroduce an
// insecure fallback.

import { rateLimit } from 'express-rate-limit'
import logger from './logger.js'

export function isProduction() {
  return process.env.NODE_ENV === 'production'
}

// ── JWT secret (C8) ──────────────────────────────────────────────────────────
// In production a missing JWT_SECRET is FATAL — there is no fallback. The dev
// fallback below exists only so local clones run without a .env; it is never
// used when NODE_ENV=production (assertProductionSecrets aborts boot first,
// and this function throws as defense-in-depth).
const DEV_ONLY_FALLBACK = 'dev-insecure-secret-change-me'

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (secret) return secret
  if (isProduction()) {
    throw new Error('JWT_SECRET is not set. Refusing to sign/verify tokens with the development fallback in production (audit C8).')
  }
  logger.warn('jwt_secret_missing', {
    detail: 'Using an insecure development-only default. Set JWT_SECRET in server/.env.',
  })
  return DEV_ONLY_FALLBACK
}

// ── Startup checks (C8) ──────────────────────────────────────────────────────
// Called from index.js before the server starts listening. Throws (→ exit 1)
// instead of warning: a mis-provisioned production instance must not serve
// traffic with a well-known signing secret.
export function assertProductionSecrets() {
  if (!isProduction()) return
  const missing = []
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET')
  if (missing.length) {
    throw new Error(
      `Refusing to start in production: missing required secret(s): ${missing.join(', ')} (audit C8).`,
    )
  }
}

// ── Rate limiters (C7) ───────────────────────────────────────────────────────
// req.ip is proxy-aware because index.js sets `trust proxy` (Azure App Service
// fronts the app with one proxy hop). Azure ARR appends the SOURCE PORT to
// X-Forwarded-For ("1.2.3.4:56789") — without normalisation every connection
// would get its own bucket, silently disabling per-IP limits (observed in prod
// 2026-07-05). Strip the port so limits key on the real client address.
export function clientIpKey(req) {
  const raw = String(req.ip || 'unknown')
  const v4 = raw.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)
  if (v4) return v4[1]
  const v6 = raw.match(/^\[([0-9a-fA-F:.]+)\]:\d+$/)
  if (v6) return v6[1]
  return raw
}

const baseOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIpKey,
  // The library's own IP-format check rejects ARR's "ip:port" — our
  // keyGenerator handles it, so silence that specific validation.
  validate: { ip: false, keyGeneratorIpFallback: false },
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
}

// Brute-force guard for credential endpoints: 5 attempts/min/IP.
export const authLimiter = rateLimit({ ...baseOptions, windowMs: 60 * 1000, limit: 5 })

// Whisper transcription is the main cost-abuse vector: 20/min/IP comfortably
// covers one candidate answering questions, not a script farming STT.
export const transcribeLimiter = rateLimit({ ...baseOptions, windowMs: 60 * 1000, limit: 20 })

// Proctor events fire on violations — a legitimate session produces a handful
// per minute at worst.
export const eventLimiter = rateLimit({ ...baseOptions, windowMs: 60 * 1000, limit: 60 })

// Report emails: 5 per 10 minutes per IP.
export const sendReportLimiter = rateLimit({ ...baseOptions, windowMs: 10 * 60 * 1000, limit: 5 })

// Broad safety net across the whole API surface.
export const apiLimiter = rateLimit({ ...baseOptions, windowMs: 60 * 1000, limit: 300 })
