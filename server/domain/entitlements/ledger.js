// Entitlement ledger (spec §31.2; contract §6): reserve → consume on the
// billable event, or release on abandon. Every step is an append-only
// consumption row keyed by an idempotency key; the entitlement row's scope is
// re-checked against the resolution so a campus action can never touch a
// personal entitlement (and vice versa).
import { ApiError } from '../http/errors.js'
import { auditLog } from '../../lib/telemetry.js'

// When a sponsored seat is finalised (spec §31.2): a contract-minted pool
// carries its billable event in metadata; any other pool uses the default
// (a completed eligible assessment).
export const BILLABLE_EVENTS = Object.freeze(['ASSESSMENT_STARTED', 'ASSESSMENT_COMPLETED', 'REPORT_GENERATED'])
export const DEFAULT_BILLABLE_EVENT = 'ASSESSMENT_COMPLETED'
export const billableEventOf = (entitlement) => (BILLABLE_EVENTS.includes(entitlement?.metadata?.billableEvent) ? entitlement.metadata.billableEvent : DEFAULT_BILLABLE_EVENT)

function assertScope(entitlement, resolution, user) {
  const scope = resolution?.scope || {}
  if (entitlement.sourceType === 'INSTITUTION_SPONSORSHIP') {
    if (scope.sponsorType !== 'INSTITUTION' || scope.organizationId !== entitlement.organizationId) {
      throw new ApiError('FORBIDDEN', 'This entitlement belongs to a different scope.')
    }
    if (entitlement.userId && entitlement.userId !== user.id) throw new ApiError('FORBIDDEN', 'This entitlement belongs to a different scope.')
    return
  }
  if (scope.sponsorType !== 'PERSONAL' || entitlement.organizationId || entitlement.userId !== user.id) {
    throw new ApiError('FORBIDDEN', 'This entitlement belongs to a different scope.')
  }
}

export function createEntitlementLedger({ repos, clock = () => new Date(), audit = auditLog }) {
  const ledger = {
    async reserve({ resolution, user, sessionId, idempotencyKey }) {
      if (!idempotencyKey) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key is required.')
      const key = `reserve:${user.id}:${idempotencyKey}`
      const replay = await repos.entitlements.findConsumption(key)
      if (replay) return { consumption: replay, replayed: true }
      if (!resolution?.allowed) throw new ApiError(resolution?.reason === 'ENTITLEMENT_EXPIRED' ? 'ENTITLEMENT_EXPIRED' : 'ENTITLEMENT_REQUIRED', 'No entitlement covers this assessment.')
      if (!resolution.consumptionRequired) return { consumption: null, replayed: false, legacy: true }
      const entitlement = await repos.entitlements.getEntitlement(resolution.entitlementId)
      if (!entitlement) throw new ApiError('ENTITLEMENT_REQUIRED', 'No entitlement covers this assessment.')
      assertScope(entitlement, resolution, user)
      const at = clock()
      if (entitlement.validUntil && new Date(entitlement.validUntil) <= at) throw new ApiError('ENTITLEMENT_EXPIRED', 'This entitlement has expired.')
      if (entitlement.status !== 'ACTIVE') throw new ApiError('ENTITLEMENT_REQUIRED', 'This entitlement is not active.')
      // The repository's own idempotency check is the authority under a race:
      // two concurrent Begins with one key return the same reservation.
      const { consumption, replayed: raced } = await repos.entitlements.appendEvent({
        entitlementId: entitlement.id, userId: user.id, organizationId: entitlement.organizationId,
        sessionId, event: 'RESERVED', idempotencyKey: key,
      })
      return { consumption, replayed: Boolean(raced) }
    },

    // consume/release: the open-reservation check runs inside the repository's
    // locked write, so a concurrent consume and release can never both close
    // the same seat.
    async consume({ entitlementId, user, sessionId }) {
      const entitlement = await repos.entitlements.getEntitlement(entitlementId)
      if (!entitlement) throw new ApiError('CONFLICT', 'Nothing is reserved for this session.')
      const { consumption, replayed } = await repos.entitlements.appendEvent({
        entitlementId, userId: user.id, organizationId: entitlement.organizationId, sessionId,
        event: 'CONSUMED', idempotencyKey: `consume:${entitlementId}:${sessionId}`, requireOpenReservation: true,
      })
      if (!replayed) audit('entitlement.consumed', sessionId, { entitlementId, sourceType: entitlement.sourceType, organizationId: entitlement.organizationId })
      return { consumption, replayed }
    },

    async release({ entitlementId, user, sessionId }) {
      const entitlement = await repos.entitlements.getEntitlement(entitlementId)
      if (!entitlement) throw new ApiError('CONFLICT', 'Nothing is reserved for this session.')
      const { consumption, replayed } = await repos.entitlements.appendEvent({
        entitlementId, userId: user.id, organizationId: entitlement.organizationId, sessionId,
        event: 'RELEASED', idempotencyKey: `release:${entitlementId}:${sessionId}`, requireOpenReservation: true,
      })
      return { consumption, replayed }
    },

    // Consume now only if `event` is this pool's billable event (e.g. a
    // contract billed on ASSESSMENT_STARTED closes the seat at start). The
    // completion path always consumes, so a seat is never left open.
    async finalizeOn(event, { entitlementId, user, sessionId }) {
      const entitlement = entitlementId ? await repos.entitlements.getEntitlement(entitlementId) : null
      if (!entitlement || billableEventOf(entitlement) !== event) return null
      return ledger.consume({ entitlementId, user, sessionId })
    },
  }
  return ledger
}
