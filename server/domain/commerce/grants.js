// P8.4/P8.5 — product grants on top of the existing entitlement ledger.
//
//   grantFromPayment     idempotent on provider_event_key / purchase_ref: a
//                        repeated or reordered provider callback returns the
//                        SAME grant and never a second one.
//   isActive / assertNewActivity
//                        expiry and exhaustion gate NEW billable activity only;
//                        nothing here is consulted by report reads.
//   reserve / finalizeOn / releaseForTechnicalFailure
//                        thin wrappers over the existing ledger. The technical
//                        failure release is audited and carries the policy
//                        state PROPOSED: no refund or credit is issued here.
import { ApiError } from '../http/errors.js'
import { auditLog } from '../../lib/telemetry.js'
import { PRODUCTS, PRODUCT_POLICY_VERSION, FUNDING_SOURCES, productFor } from './products.js'

const DAY_MS = 86400000

export function isActive(grant, now = new Date()) {
  if (!grant) return false
  const at = now instanceof Date ? now : new Date(now)
  if (grant.validFrom && new Date(grant.validFrom) > at) return false
  if (grant.validUntil && new Date(grant.validUntil) <= at) return false
  return true
}

// The included quantity for an activity kind on a grant (null = not included).
export function includedQuantity(grant, activity) {
  const inc = grant?.included || {}
  switch (activity) {
    case 'FORMAL_ASSESSMENT': return inc.formalAssessments ?? null
    case 'MISSION_ATTEMPT': return typeof inc.missionsSelectable === 'number' && typeof inc.attemptsPerMission === 'number' ? inc.missionsSelectable * inc.attemptsPerMission : null
    case 'FRESH_CHALLENGE': return inc.freshChallenges ?? null
    case 'PRACTICE_SCENE': return inc.practiceScenes ?? null
    default: return null
  }
}

// Throws for NEW activity on an expired or exhausted grant. `used` is the
// count the caller already took from the ledger / attempt history.
export function assertNewActivity({ grant, activity, used = 0, now = new Date() }) {
  if (!grant) throw new ApiError('ENTITLEMENT_REQUIRED', 'No package covers this activity.')
  if (!isActive(grant, now)) {
    throw new ApiError('PACKAGE_EXPIRED', 'This package\u2019s activity window has ended. Reports you already received stay available.', { status: 409, details: { validUntil: grant.validUntil } })
  }
  const quota = includedQuantity(grant, activity)
  if (quota === null || quota === 0) throw new ApiError('ENTITLEMENT_REQUIRED', 'This activity is not included in your package.')
  if (used >= quota) {
    throw new ApiError('ALLOWANCE_EXHAUSTED', 'You have used every attempt included in this package.', { details: { activity, included: quota, used } })
  }
  return { remaining: quota - used }
}

export function createGrantService({ repos, ledger = null, clock = () => new Date(), audit = auditLog }) {
  const commerce = () => {
    const r = repos?.commerce
    if (!r) throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Purchases are temporarily unavailable.')
    return r
  }

  async function grant({ userId, productCode, fundingSource, purchaseRef = null, providerEventKey = null }) {
    const product = productFor(productCode)
    if (!userId) throw new ApiError('VALIDATION_FAILED', 'A user is required for a grant.')
    if (!product) throw new ApiError('VALIDATION_FAILED', 'Unknown product.')
    if (!FUNDING_SOURCES.includes(fundingSource)) throw new ApiError('VALIDATION_FAILED', 'Unknown funding source.')
    if (fundingSource === 'PAID' && !product.purchasable) throw new ApiError('CONFLICT', 'This product is not available for purchase.')
    if (!providerEventKey && !purchaseRef) throw new ApiError('VALIDATION_FAILED', 'A provider event key or purchase reference is required.')
    const existing = (await commerce().findGrantByProviderEventKey(providerEventKey)) || (await commerce().findGrantByPurchaseRef(purchaseRef))
    if (existing) return { grant: existing, created: false }
    const at = clock()
    const { grant: row, created } = await commerce().createGrant({
      userId, productCode: product.code, productVersion: product.version, included: product.included || {},
      selectedMissionIds: [], validFrom: at.toISOString(),
      validUntil: product.windowDays ? new Date(at.getTime() + product.windowDays * DAY_MS).toISOString() : null,
      fundingSource, purchaseRef, providerEventKey, policyVersion: PRODUCT_POLICY_VERSION,
    })
    if (created) audit('commerce.grant.created', null, { grantId: row.id, productCode: row.productCode, productVersion: row.productVersion, fundingSource, policyVersion: row.policyVersion })
    return { grant: row, created }
  }

  return {
    PRODUCTS,
    isActive,
    assertNewActivity,
    // Server-verified payment (or webhook) → grant. Same provider event key → same grant.
    async grantFromPayment({ userId, providerEventKey, purchaseRef = null, productCode = 'PERSONAL_DEVELOPMENT_SPRINT' }) {
      if (!providerEventKey) throw new ApiError('VALIDATION_FAILED', 'A provider event key is required.')
      return grant({ userId, productCode, fundingSource: 'PAID', purchaseRef, providerEventKey })
    },
    async grantForDev({ userId, reference, productCode = 'PERSONAL_DEVELOPMENT_SPRINT' }) {
      return grant({ userId, productCode, fundingSource: 'DEV', purchaseRef: null, providerEventKey: `dev:${reference}` })
    },
    async grantForInvite({ userId, reference, productCode = 'PERSONAL_DEVELOPMENT_SPRINT' }) {
      return grant({ userId, productCode, fundingSource: 'INVITE', purchaseRef: null, providerEventKey: `invite:${reference}` })
    },
    async listForUser(userId) {
      const at = clock()
      return (await commerce().listGrantsForUser(userId)).map((g) => ({ ...g, active: isActive(g, at) }))
    },
    // Four selectable missions, chosen once; not the whole library.
    async selectMissions({ userId, grantId, missionIds }) {
      const g = await commerce().getGrant(grantId)
      if (!g || g.userId !== userId) throw new ApiError('NOT_FOUND', 'Not found')
      if (!isActive(g, clock())) throw new ApiError('PACKAGE_EXPIRED', 'This package\u2019s activity window has ended.', { status: 409 })
      const max = g.included?.missionsSelectable ?? 0
      const ids = [...new Set((missionIds || []).map(String))]
      if (!ids.length || ids.length > max) throw new ApiError('VALIDATION_FAILED', `Choose between 1 and ${max} missions.`)
      if (g.selectedMissionIds.length) throw new ApiError('CONFLICT', 'Missions for this package are already chosen.')
      const updated = await commerce().setSelectedMissions(g.id, ids)
      audit('commerce.grant.missions_selected', null, { grantId: g.id, count: ids.length })
      return updated
    },

    // Ledger pass-throughs (existing reserve → consume / release semantics).
    async reserve(args) {
      if (!ledger) throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'The entitlement ledger is unavailable.')
      return ledger.reserve(args)
    },
    async finalizeOn(event, args) {
      if (!ledger) throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'The entitlement ledger is unavailable.')
      return ledger.finalizeOn(event, args)
    },
    // Documented technical failure: the reserved seat is released and the
    // decision audited. Policy state PROPOSED — no refund/credit is issued.
    async releaseForTechnicalFailure(reservationId, reason, { actorId = null } = {}) {
      if (!ledger) throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'The entitlement ledger is unavailable.')
      if (typeof reason !== 'string' || reason.trim().length < 5) throw new ApiError('VALIDATION_FAILED', 'A reason is required to release a reservation.')
      const reservation = await repos.entitlements.findConsumptionById(reservationId)
      if (!reservation || reservation.event !== 'RESERVED') throw new ApiError('NOT_FOUND', 'Not found')
      const { consumption, replayed } = await ledger.release({ entitlementId: reservation.entitlementId, user: { id: reservation.userId }, sessionId: reservation.sessionId })
      if (!replayed) {
        audit('entitlement.released_technical_failure', reservation.sessionId, {
          reservationId, entitlementId: reservation.entitlementId, reason: reason.trim().slice(0, 500), actorId,
          policy: 'PROPOSED', refundIssued: false, creditIssued: false,
        })
      }
      return { consumption, replayed, policy: 'PROPOSED', refundIssued: false }
    },
  }
}
