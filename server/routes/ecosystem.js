import { Router } from 'express'
import crypto from 'crypto'
import logger from '../lib/logger.js'
import { authenticate } from '../domain/auth/requireUser.js'

const router = Router()

// Example roles in the StudAI Hire ecosystem. These are NOT matched to the
// candidate: no capability is "verified" here and no fit is claimed (C2.04).
const CURATED_HIRE_ROLES = [
  {
    job_ref: 'hire_job_bizops_01',
    title: 'Operations Associate',
    company: {
      name: 'Nexus Logistics',
      slug: 'nexus-logistics',
      is_verified: true,
    },
    job_family: 'STUDAI-JF-BIZOPS-L1',
    location: 'Bengaluru, India (Hybrid)',
    work_mode: 'hybrid',
    salary_range: { min: 650000, max: 900000, currency: 'INR', period: 'yearly' },
    alignment_reason: 'This role emphasises problem solving and communication.',
    target_constructs: ['problem_solving', 'communication'],
    application_url: 'https://hire.studai.one/jobs/operations-associate',
  },
  {
    job_ref: 'hire_job_growth_02',
    title: 'Business Operations Analyst',
    company: {
      name: 'FinFlow Technologies',
      slug: 'finflow-tech',
      is_verified: true,
    },
    job_family: 'STUDAI-JF-BIZOPS-L1',
    location: 'Mumbai, India (Hybrid)',
    work_mode: 'hybrid',
    salary_range: { min: 750000, max: 1100000, currency: 'INR', period: 'yearly' },
    alignment_reason: 'This role emphasises critical thinking and AI fluency.',
    target_constructs: ['critical_thinking', 'ai_fluency'],
    application_url: 'https://hire.studai.one/jobs/bizops-analyst',
  },
  {
    job_ref: 'hire_job_ops_03',
    title: 'Associate Product Operations Specialist',
    company: {
      name: 'Vantage Health Systems',
      slug: 'vantage-health',
      is_verified: true,
    },
    job_family: 'STUDAI-JF-BIZOPS-L1',
    location: 'Remote, India',
    work_mode: 'remote',
    salary_range: { min: 600000, max: 850000, currency: 'INR', period: 'yearly' },
    alignment_reason: 'This role emphasises collaboration and structured stakeholder work.',
    target_constructs: ['collaboration', 'critical_thinking'],
    application_url: 'https://hire.studai.one/jobs/product-ops-specialist',
  },
]

export function mintEcosystemJwt(payload, secret) {
  const header = { typ: 'JWT', alg: 'HS256' }
  const h = Buffer.from(JSON.stringify(header)).toString('base64url')
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')
  return `${h}.${p}.${sig}`
}

/**
 * GET /api/ecosystem/aligned-jobs
 * Return example roles in the StudAI Hire ecosystem (not matched to the candidate).
 */
// Phase 1S (N5): production never falls back to a localhost service, and never
// shows the curated example roles (fictional employers marked "verified",
// with salary ranges) as if they were StudAI Hire listings; without a
// configured, answering Hire API the list is empty and the page shows none.
const isProduction = () => process.env.NODE_ENV === 'production'

router.get('/aligned-jobs', async (req, res) => {
  if (isProduction() && !process.env.HIRE_API_URL) {
    return res.json({ status: 'ok', source: 'not_configured', jobs: [] })
  }
  const fallback = () => (isProduction()
    ? res.json({ status: 'ok', source: 'unavailable', jobs: [] })
    : res.json({ status: 'ok', source: 'curated_feed', jobs: CURATED_HIRE_ROLES }))
  try {
    const hireApiUrl = process.env.HIRE_API_URL || 'http://localhost:8000/api/v1/ecosystem/jobs/recommended'

    // Attempt to query live HIRE API with a short timeout
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 1500)
      const resp = await fetch(`${hireApiUrl}?job_family=STUDAI-JF-BIZOPS-L1&limit=6`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      clearTimeout(timeoutId)

      if (resp.ok) {
        const json = await resp.json()
        if (json?.data && Array.isArray(json.data) && json.data.length > 0) {
          const normalized = json.data.map(j => ({
            ...j,
            target_constructs: j.target_constructs || j.target_competencies || [],
          }))
          return res.json({ status: 'ok', source: 'hire_api', jobs: normalized })
        }
      }
    } catch {
      // Graceful fallback (development: curated example roles; production: none)
    }

    return fallback()
  } catch (err) {
    logger.error('aligned_jobs_failed', { error: err.message })
    return fallback()
  }
})

/**
 * POST /api/ecosystem/handover-token
 * Mint a one-time 60-second authorization code for secure transition into Hire or Career without browser tokens.
 *
 * Phase 1S (audit 2026-10-10, N5): the caller must be signed in, and the
 * identity handed over is that account's (from the account store, v1_users /
 * users.json) — never a placeholder. The server-to-server pre-authorization
 * to Hire carries a short-lived HS256 token signed with ECOSYSTEM_SECRET (no
 * secret, no pre-authorization). Production refuses with 503 when the
 * destination's base URL is not configured instead of redirecting to localhost.
 */
const DESTINATIONS = Object.freeze({ hire: 'HIRE_BASE_URL', career: 'CAREER_BASE_URL' })
const DEV_BASE = Object.freeze({ hire: 'http://localhost:8000', career: 'http://localhost:3000' })
const SAFE_REF = /^[A-Za-z0-9_.:-]{1,128}$/

function baseUrlFor(destination) {
  const configured = process.env[DESTINATIONS[destination]]
  if (configured) return configured.replace(/\/$/, '')
  return isProduction() ? null : DEV_BASE[destination]
}

router.post('/handover-token', async (req, res) => {
  try {
    const { user, reason } = await authenticate(req)
    if (!user) {
      return reason === 'suspended'
        ? res.status(403).json({ error: 'This account is suspended.', code: 'ACCOUNT_SUSPENDED' })
        : res.status(401).json({ error: 'Sign in to continue.', code: 'UNAUTHENTICATED' })
    }
    const { destination = 'hire', targetJobRef = null, credentialId = null } = req.body || {}
    if (!Object.hasOwn(DESTINATIONS, destination)) return res.status(400).json({ error: 'Unknown destination.', code: 'INVALID_DESTINATION' })
    for (const ref of [targetJobRef, credentialId]) {
      if (ref !== null && ref !== undefined && (typeof ref !== 'string' || !SAFE_REF.test(ref))) {
        return res.status(400).json({ error: 'Invalid reference.', code: 'INVALID_REFERENCE' })
      }
    }
    const base = baseUrlFor(destination)
    if (!base) return res.status(503).json({ error: 'This hand-over is not configured yet.', code: 'NOT_CONFIGURED' })
    if (!user.email) return res.status(409).json({ error: 'Your account has no email address to hand over.', code: 'IDENTITY_UNAVAILABLE' })
    const candidate = { id: String(user.id), email: String(user.email), name: String(user.name || '') }

    // Server-to-server backchannel pre-authorization if destination is Hire
    const secret = process.env.ECOSYSTEM_SECRET
    if (destination === 'hire' && secret) {
      try {
        const now = Math.floor(Date.now() / 1000)
        const assertion = mintEcosystemJwt({
          iss: 'studai-prism', aud: 'studai-hire', sub: candidate.id, iat: now, exp: now + 60,
          jti: crypto.randomUUID(), purpose: 'ecosystem_pre_authorize',
        }, secret)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 1500)
        const preAuthResp = await fetch(`${base}/api/v1/ecosystem/auth/pre-authorize`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${assertion}`,
          },
          body: JSON.stringify({
            ecosystem_person_id: candidate.id,
            email: candidate.email,
            name: candidate.name,
            destination: 'hire',
            target_job_ref: targetJobRef || null,
            source_credential_id: credentialId || null,
          }),
        })
        clearTimeout(timeoutId)

        if (preAuthResp.ok) {
          const preAuthData = await preAuthResp.json()
          if (preAuthData?.code && typeof preAuthData?.redirect_url === 'string' && preAuthData.redirect_url.startsWith(`${base}/`)) {
            return res.json({
              status: 'ok',
              code: preAuthData.code,
              redirect_url: preAuthData.redirect_url,
              destination: 'hire',
              expires_in: 60,
            })
          }
        }
      } catch {
        // Fall back to localized single-use authorization code if Hire is offline
      }
    }

    // Default localized 60s authorization code (carries no identity)
    const authCode = `eco_auth_${crypto.randomBytes(16).toString('hex')}`
    let redirectUrl = ''
    if (destination === 'career') {
      redirectUrl = `${base}/dashboard?code=${encodeURIComponent(authCode)}`
    } else {
      redirectUrl = `${base}/ecosystem/handover?code=${encodeURIComponent(authCode)}`
      if (targetJobRef) {
        redirectUrl += `&target_job=${encodeURIComponent(targetJobRef)}`
      }
    }

    return res.json({
      status: 'ok',
      code: authCode,
      redirect_url: redirectUrl,
      destination,
      expires_in: 60,
    })
  } catch (err) {
    logger.error('handover_token_generation_failed', { error: err.message })
    return res.status(500).json({ error: 'Failed to generate ecosystem authorization code.' })
  }
})

export default router
