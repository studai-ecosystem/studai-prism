// Under-18 guardian-consent path (PROD-READY Phase 8; AGE_GATING_POLICY_v1
// addendum 2026-10-10). Dark: every entry point checks PRISM_UNDER18_PATH and
// behaves as today when it is off. Copy is DRAFT pending HA-006 and HA-005.
//
// Flow (only while the flag is on):
//   1. A learner registers saying they are under 18 and names a guardian's
//      email address. The account is created WITHOUT an age declaration, so
//      the existing commencement gate (403 AGE_CONFIRMATION_REQUIRED, frozen
//      legacy router and the V3 path that uses it) keeps blocking any start.
//   2. A single-use link (only its hash is stored) is emailed to the guardian.
//   3. The guardian opens the link, reads the draft copy and agrees or
//      declines. Agreeing marks the record VERIFIED (verification method:
//      possession of the emailed link) and writes a declaration to the
//      account whose version and basis name the guardian consent — never an
//      18+ confirmation.
//   4. The guardian can withdraw with the same link: the record becomes
//      WITHDRAWN and the guardian-based declaration is removed from the
//      account, so the commencement gate blocks again.
import { createHash, randomBytes } from 'node:crypto'
import {
  GUARDIAN_CONSENT_COPY, GUARDIAN_CONSENT_COPY_VERSION, GUARDIAN_DECLARATION_BASIS,
  GUARDIAN_DECLARATION_VERSION, GUARDIAN_LINK_DAYS,
} from './copy.js'

export const UNDER18_FLAG = 'PRISM_UNDER18_PATH'
export const isUnder18PathEnabled = (env = process.env) => env[UNDER18_FLAG] === 'true'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DAY_MS = 24 * 60 * 60 * 1000
export const hashGuardianToken = (token) => createHash('sha256').update(`guardian-consent:${String(token)}`).digest('hex')

export class GuardianConsentError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

export function normalizeGuardianEmail(value, learnerEmail = '') {
  const email = String(value || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email) || email.length > 320) throw new GuardianConsentError('GUARDIAN_EMAIL_INVALID', 'Please enter a valid email address for your parent or guardian.')
  if (email === String(learnerEmail || '').trim().toLowerCase()) throw new GuardianConsentError('GUARDIAN_EMAIL_SAME', 'Your parent or guardian needs their own email address.')
  return email
}

// What the learner and the guardian see about a record (never the token hash).
export function publicConsent(r) {
  if (!r) return null
  return { status: r.status, requestedAt: r.requestedAt, expiresAt: r.expiresAt, decidedAt: r.decidedAt, withdrawnAt: r.withdrawnAt, copyVersion: r.copyVersion }
}

export function createGuardianConsentService({
  repo, users, sendGuardianEmail = async () => false, linkFor = (token) => `/guardian-consent/${encodeURIComponent(token)}`,
  clock = () => new Date(), tokenFactory = () => randomBytes(32).toString('base64url'),
}) {
  async function issue(user, guardianEmail) {
    const now = clock()
    const token = tokenFactory()
    const record = await repo.create({
      userId: user.id, guardianEmail, copyVersion: GUARDIAN_CONSENT_COPY_VERSION, tokenHash: hashGuardianToken(token),
      expiresAt: new Date(now.getTime() + GUARDIAN_LINK_DAYS * DAY_MS), now,
    })
    let emailSent = false
    try {
      emailSent = Boolean(await sendGuardianEmail({ to: guardianEmail, url: linkFor(token), learnerName: user.name || null }))
    } catch {
      emailSent = false
    }
    return { record, emailSent }
  }

  async function usable(token) {
    const record = token ? await repo.findByTokenHash(hashGuardianToken(token)) : null
    if (!record) throw new GuardianConsentError('NOT_FOUND', 'Not found', 404)
    return record
  }

  return {
    // Step 1 (called by registration after the account exists).
    async request(user, guardianEmailRaw) {
      const guardianEmail = normalizeGuardianEmail(guardianEmailRaw, user.email)
      const { record, emailSent } = await issue(user, guardianEmail)
      return { consent: publicConsent(record), emailSent }
    },

    async statusFor(user) {
      return publicConsent(await repo.latestForUser(user.id))
    },

    // A new link (the open one lapses): a typo in the address, or a lost email.
    async resend(user, guardianEmailRaw = null) {
      const latest = await repo.latestForUser(user.id)
      if (latest?.status === 'VERIFIED') throw new GuardianConsentError('CONFLICT', 'Your parent or guardian has already agreed.', 409)
      const guardianEmail = normalizeGuardianEmail(guardianEmailRaw || latest?.guardianEmail, user.email)
      await repo.expirePending(user.id)
      const { record, emailSent } = await issue(user, guardianEmail)
      return { consent: publicConsent(record), emailSent }
    },

    // What the guardian sees before deciding (draft copy, learner's name as entered).
    async view(token) {
      const record = await usable(token)
      const learner = await users.findById(record.userId)
      const expired = record.status === 'PENDING' && new Date(record.expiresAt) <= clock()
      return { consent: { ...publicConsent(record), status: expired ? 'EXPIRED' : record.status }, learnerName: learner?.name || null, copy: GUARDIAN_CONSENT_COPY }
    },

    async decide(token, decision) {
      if (!['GRANT', 'DECLINE'].includes(decision)) throw new GuardianConsentError('VALIDATION_FAILED', 'Choose whether you agree.')
      const record = await usable(token)
      const now = clock()
      if (record.status !== 'PENDING') throw new GuardianConsentError('CONFLICT', 'This request has already been answered.', 409)
      if (new Date(record.expiresAt) <= now) {
        await repo.transition(record.id, { from: ['PENDING'], to: 'EXPIRED', at: now })
        throw new GuardianConsentError('GUARDIAN_LINK_EXPIRED', 'This link has expired. The learner can send a new one.', 410)
      }
      const to = decision === 'GRANT' ? 'VERIFIED' : 'DECLINED'
      const updated = await repo.transition(record.id, { from: ['PENDING'], to, at: now })
      if (!updated) throw new GuardianConsentError('CONFLICT', 'This request has already been answered.', 409)
      if (to === 'VERIFIED') {
        await users.recordAgeDeclaration(record.userId, {
          version: GUARDIAN_DECLARATION_VERSION, basis: GUARDIAN_DECLARATION_BASIS, guardianConsentId: record.id, at: now.toISOString(),
        })
      }
      return publicConsent(updated)
    },

    async withdraw(token) {
      const record = await usable(token)
      const updated = await repo.transition(record.id, { from: ['VERIFIED'], to: 'WITHDRAWN', at: clock() })
      if (!updated) throw new GuardianConsentError('CONFLICT', 'There is no consent to withdraw.', 409)
      await users.clearGuardianAgeDeclaration(record.userId)
      return publicConsent(updated)
    },
  }
}
