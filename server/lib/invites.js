// Group assessment invite links.
//
// An administrator mints a link that lets up to max_uses signed-in candidates
// start ONE assessment each inside a time window — the college-cohort flow.
// Storage is Postgres (the same DB the admin console requires); the minted
// entitlements live in the regular v1 entitlement store with mode='invite'.
//
// Token discipline mirrors credentials.js: the raw token is returned exactly
// once at creation; only its sha256 is stored. Redemption is idempotent per
// (invite, user) — redeeming twice returns the SAME sessionId, never a second
// seat.

import { randomUUID, randomBytes, createHash } from 'crypto'
import { getPool, query } from '../db/pool.js'
import { createEntitlement, revokeEntitlement } from './store.js'
import logger from './logger.js'

const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex')

export function isInvitesAvailable() {
  return Boolean(process.env.DATABASE_URL)
}

// ── Admin operations ─────────────────────────────────────────────────────────

// Custom coupon codes (e.g. "msw") are stored lowercase so candidates can
// type them in any case; random link tokens stay case-sensitive.
const CODE_RE = /^[a-z0-9][a-z0-9-]{2,31}$/

// Charter §22: cohort plan metadata — validated, price-free (pricing is
// provisional/unpublished, HA-015; quotes live in documents, never the DB).
export function sanitizePlan(plan) {
  if (plan === null || plan === undefined) return null
  if (typeof plan !== 'object' || Array.isArray(plan)) {
    throw Object.assign(new Error('plan must be an object'), { code: 'INVALID_PLAN' })
  }
  const out = {}
  if (plan.cohortPlanned !== undefined && plan.cohortPlanned !== null && plan.cohortPlanned !== '') {
    const n = Number(plan.cohortPlanned)
    if (!Number.isInteger(n) || n < 1 || n > 10000) {
      throw Object.assign(new Error('plan.cohortPlanned must be an integer between 1 and 10000'), { code: 'INVALID_PLAN' })
    }
    out.cohortPlanned = n
  }
  // Human-review allowance — charter indicative default: up to 5% of cohort.
  const pct = plan.reviewAllowancePct === undefined || plan.reviewAllowancePct === null || plan.reviewAllowancePct === ''
    ? 5
    : Number(plan.reviewAllowancePct)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw Object.assign(new Error('plan.reviewAllowancePct must be between 0 and 100'), { code: 'INVALID_PLAN' })
  }
  out.reviewAllowancePct = pct
  if (plan.term !== undefined && plan.term !== null) out.term = String(plan.term).slice(0, 100)
  if (plan.notes !== undefined && plan.notes !== null) out.notes = String(plan.notes).slice(0, 1000)
  const allowed = new Set(['cohortPlanned', 'reviewAllowancePct', 'term', 'notes'])
  for (const key of Object.keys(plan)) {
    if (!allowed.has(key)) {
      // Refuse unknown keys so prices can never sneak into the database plan.
      throw Object.assign(new Error(`plan.${key} is not a recognised plan field`), { code: 'INVALID_PLAN' })
    }
  }
  return out
}

export async function createInvite({ label = '', maxUses = 10, startsAt = null, expiresAt, createdBy, code = null, institution = '', plan = null, renewalOf = null }) {
  const uses = Number(maxUses)
  if (!Number.isInteger(uses) || uses < 1 || uses > 100) {
    throw Object.assign(new Error('maxUses must be an integer between 1 and 100'), { code: 'INVALID_MAX_USES' })
  }
  const expiry = new Date(expiresAt)
  if (!expiresAt || Number.isNaN(expiry.getTime()) || expiry <= new Date()) {
    throw Object.assign(new Error('expiresAt must be a future timestamp'), { code: 'INVALID_EXPIRY' })
  }
  const start = startsAt ? new Date(startsAt) : new Date()
  if (Number.isNaN(start.getTime()) || expiry <= start) {
    throw Object.assign(new Error('the window must end after it starts'), { code: 'INVALID_WINDOW' })
  }
  let token
  if (code !== null) {
    token = String(code).trim().toLowerCase()
    if (!CODE_RE.test(token)) {
      throw Object.assign(
        new Error('A coupon code must be 3-32 characters: letters, digits and dashes.'),
        { code: 'INVALID_CODE' },
      )
    }
  } else {
    token = randomBytes(24).toString('base64url')
  }

  const inviteId = randomUUID()
  const cleanPlan = sanitizePlan(plan)
  if (renewalOf) {
    const prior = await getInvite(renewalOf)
    if (!prior) throw Object.assign(new Error('renewalOf must reference an existing invite'), { code: 'INVALID_RENEWAL' })
  }
  try {
    await query(
      `INSERT INTO assessment_invites (invite_id, token_hash, label, max_uses, starts_at, expires_at, created_by, institution, plan, renewal_of)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [inviteId, hashToken(token), String(label).slice(0, 200), uses, start.toISOString(), expiry.toISOString(), createdBy,
        String(institution || '').slice(0, 200), cleanPlan ? JSON.stringify(cleanPlan) : null, renewalOf || null],
    )
  } catch (err) {
    if (err?.code === '23505') {
      throw Object.assign(new Error('This code is already in use.'), { code: 'CODE_TAKEN' })
    }
    throw err
  }
  const invite = await getInvite(inviteId)
  return { invite, token }
}

function rowToInvite(row) {
  return {
    inviteId: row.invite_id,
    label: row.label,
    maxUses: row.max_uses,
    usedCount: row.used_count,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
    institution: row.institution || '',
    plan: row.plan || null,
    renewalOf: row.renewal_of || null,
    status: row.revoked_at
      ? 'revoked'
      : new Date(row.expires_at) < new Date()
        ? 'expired'
        : row.used_count >= row.max_uses
          ? 'exhausted'
          : new Date(row.starts_at) > new Date()
            ? 'scheduled'
            : 'active',
  }
}

export async function getInvite(inviteId) {
  const r = await query('SELECT * FROM assessment_invites WHERE invite_id = $1', [inviteId])
  return r?.rows?.[0] ? rowToInvite(r.rows[0]) : null
}

export async function listInvites() {
  const r = await query('SELECT * FROM assessment_invites ORDER BY created_at DESC LIMIT 500')
  return (r?.rows || []).map(rowToInvite)
}

export async function listRedemptions(inviteId) {
  const r = await query(
    'SELECT redemption_id, user_email, session_id, redeemed_at FROM invite_redemptions WHERE invite_id = $1 ORDER BY redeemed_at',
    [inviteId],
  )
  return (r?.rows || []).map((row) => ({
    redemptionId: row.redemption_id,
    userEmail: row.user_email,
    sessionId: row.session_id,
    redeemedAt: row.redeemed_at,
  }))
}

export async function revokeInvite(inviteId, reason = '') {
  const r = await query(
    `UPDATE assessment_invites SET revoked_at = now(), revoke_reason = $2
     WHERE invite_id = $1 AND revoked_at IS NULL RETURNING invite_id`,
    [inviteId, String(reason).slice(0, 500)],
  )
  return Boolean(r?.rows?.length)
}

// ── Candidate redemption ─────────────────────────────────────────────────────
// Returns { sessionId, alreadyRedeemed } or throws with .code:
//   INVITE_NOT_FOUND · INVITE_REVOKED · INVITE_NOT_STARTED · INVITE_EXPIRED ·
//   INVITE_EXHAUSTED
export async function redeemInvite(token, { userId, userEmail }) {
  const pool = getPool()
  if (!pool) throw Object.assign(new Error('invites unavailable'), { code: 'NO_DB' })

  // Exact match first (random link tokens are case-sensitive); fall back to
  // the lowercase form so typed coupon codes work in any case.
  let found = await query('SELECT * FROM assessment_invites WHERE token_hash = $1', [hashToken(token)])
  if (!found?.rows?.length) {
    found = await query('SELECT * FROM assessment_invites WHERE token_hash = $1', [hashToken(String(token).trim().toLowerCase())])
  }
  const row = found?.rows?.[0]
  if (!row) throw Object.assign(new Error('This invite link is not valid.'), { code: 'INVITE_NOT_FOUND' })

  // Idempotent per candidate: a second visit returns their existing session.
  const prior = await query(
    'SELECT session_id FROM invite_redemptions WHERE invite_id = $1 AND user_id = $2',
    [row.invite_id, userId],
  )
  if (prior?.rows?.length) return { sessionId: prior.rows[0].session_id, alreadyRedeemed: true }

  const now = new Date()
  if (row.revoked_at) throw Object.assign(new Error('This invite link has been withdrawn.'), { code: 'INVITE_REVOKED' })
  if (new Date(row.starts_at) > now) throw Object.assign(new Error('This invite is not open yet.'), { code: 'INVITE_NOT_STARTED' })
  if (new Date(row.expires_at) < now) throw Object.assign(new Error('This invite link has expired.'), { code: 'INVITE_EXPIRED' })

  // Mint the entitlement first; if the seat claim below loses, revoke it.
  const sessionId = randomUUID()
  await createEntitlement({ sessionId, mode: 'invite', amount: 0 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const seat = await client.query(
      `UPDATE assessment_invites
          SET used_count = used_count + 1
        WHERE invite_id = $1 AND revoked_at IS NULL
          AND used_count < max_uses
          AND now() >= starts_at AND now() <= expires_at
        RETURNING used_count`,
      [row.invite_id],
    )
    if (!seat.rows.length) {
      await client.query('ROLLBACK')
      await revokeEntitlement(sessionId, 'invite_seat_unavailable').catch(() => {})
      throw Object.assign(new Error('All seats on this invite have been used.'), { code: 'INVITE_EXHAUSTED' })
    }
    const ins = await client.query(
      `INSERT INTO invite_redemptions (redemption_id, invite_id, user_id, user_email, session_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (invite_id, user_id) DO NOTHING
       RETURNING redemption_id`,
      [randomUUID(), row.invite_id, userId, userEmail || '', sessionId],
    )
    if (!ins.rows.length) {
      // Raced by the same user's parallel request — give back the seat and
      // return their existing session.
      await client.query('ROLLBACK')
      await revokeEntitlement(sessionId, 'invite_duplicate_redemption').catch(() => {})
      const existing = await query(
        'SELECT session_id FROM invite_redemptions WHERE invite_id = $1 AND user_id = $2',
        [row.invite_id, userId],
      )
      return { sessionId: existing.rows[0].session_id, alreadyRedeemed: true }
    }
    await client.query('COMMIT')
    logger.info('invite_redeemed', { inviteId: row.invite_id, sessionId })
    return { sessionId, alreadyRedeemed: false }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
