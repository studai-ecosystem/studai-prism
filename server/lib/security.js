// Security primitives (audit C7/C8/C21 — remediation Phase 2).
//
// Central place for the JWT secret policy, production startup checks and the
// rate-limit configurations, so no route module can quietly reintroduce an
// insecure fallback.

import { rateLimit } from 'express-rate-limit'
import logger from './logger.js'
import { aiProvider, allowedModelIds } from '../services/ai/modelRouter.js'

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
  for (const key of [
    'JWT_SECRET',
    'AWS_SECRETS_MANAGER_SECRET_ID',
    'AI_PROVIDER',
    'BEDROCK_PRIMARY_MODEL',
    'BEDROCK_CONVERSATION_MODEL',
    'BEDROCK_FAST_MODEL',
    'BEDROCK_FALLBACK_MODEL',
    'BEDROCK_EMBEDDING_MODEL',
    'BEDROCK_MULTIMODAL_MODEL',
    'BEDROCK_STT_MODEL',
  ]) {
    if (!process.env[key]) missing.push(key)
  }
  if (!process.env.AWS_REGION && !process.env.AWS_DEFAULT_REGION) missing.push('AWS_REGION')
  if (missing.length) {
    throw new Error(
      `Refusing to start in production: missing required secret(s): ${missing.join(', ')} (audit C8).`,
    )
  }
  if (aiProvider() !== 'aws-bedrock') {
    throw new Error('Refusing to start in production: AI_PROVIDER must be aws-bedrock.')
  }
  const modelIdPattern = /^(?:arn:aws[a-z-]*:bedrock:|(?:global|us|eu|jp|au)\.|[a-z0-9-]+\.)[A-Za-z0-9._:/-]+$/
  const invalidModelIds = [...allowedModelIds()].filter((modelId) => !modelIdPattern.test(modelId))
  if (invalidModelIds.length) {
    throw new Error(`Refusing to start in production: invalid Bedrock model ID(s): ${invalidModelIds.join(', ')}.`)
  }
  if ([...allowedModelIds()].some((modelId) => modelId.startsWith('global.')) && process.env.BEDROCK_ALLOW_GLOBAL_INFERENCE !== 'true') {
    throw new Error('Refusing to start in production: global Bedrock inference requires BEDROCK_ALLOW_GLOBAL_INFERENCE=true after data-residency approval.')
  }
  if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
    throw new Error('Refusing to start in production with a long-lived Bedrock API key; use an IAM role or federated temporary credentials.')
  }
  const azureRoleArn = process.env.AWS_AZURE_FEDERATED_ROLE_ARN
  const azureAudience = process.env.AWS_AZURE_FEDERATED_AUDIENCE
  if (Boolean(azureRoleArn) !== Boolean(azureAudience)) {
    throw new Error('Refusing to start in production: Azure federation role and audience must be configured together.')
  }
  if (azureRoleArn && !/^arn:aws:iam::\d{12}:role\/[A-Za-z0-9+=,.@_/-]+$/.test(azureRoleArn)) {
    throw new Error('Refusing to start in production: invalid Azure-federated AWS role ARN.')
  }
  if (azureAudience && !azureAudience.startsWith('api://')) {
    throw new Error('Refusing to start in production: invalid Azure federation audience.')
  }
  const envCredentialParts = [process.env.AWS_ACCESS_KEY_ID, process.env.AWS_SECRET_ACCESS_KEY, process.env.AWS_SESSION_TOKEN]
  if (envCredentialParts.some(Boolean) && !envCredentialParts.every(Boolean)) {
    throw new Error('Refusing to start in production with incomplete AWS environment credentials; use an IAM role or a complete temporary STS credential set.')
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

// Server transcription is the main cost-abuse vector: 20/min/IP comfortably
// covers one candidate answering questions, not a script farming STT.
export const transcribeLimiter = rateLimit({ ...baseOptions, windowMs: 60 * 1000, limit: 20 })

// Proctor events fire on violations — a legitimate session produces a handful
// per minute at worst.
export const eventLimiter = rateLimit({ ...baseOptions, windowMs: 60 * 1000, limit: 60 })

// Report emails: 5 per 10 minutes per IP.
export const sendReportLimiter = rateLimit({ ...baseOptions, windowMs: 10 * 60 * 1000, limit: 5 })

// Broad safety net across the whole API surface.
export const apiLimiter = rateLimit({ ...baseOptions, windowMs: 60 * 1000, limit: 300 })

// ── Admin Control Centre limiters ────────────────────────────────────────────
// Credential endpoints for ADMINISTRATORS: tighter than the candidate authLimiter
// window because admin brute force is a higher-value target (plan §8).
export const adminAuthLimiter = rateLimit({ ...baseOptions, windowMs: 60 * 1000, limit: 5 })

// Authenticated admin plane: generous for console use, hostile to scraping.
export const adminApiLimiter = rateLimit({ ...baseOptions, windowMs: 60 * 1000, limit: 120 })
