// Entitlements + append-only consumption ledger — memory adapter.
// consumed_quantity counts RESERVED+CONSUMED seats still held (RELEASED frees one).
import { ApiError } from '../http/errors.js'
import { clone } from '../campusStore/memoryDb.js'

export function createEntitlementsRepoMemory(db) {
  const now = () => db.clock().toISOString()
  return {
    async createEntitlement(input) {
      const row = {
        id: input.id || db.id(),
        userId: input.userId ?? null,
        organizationId: input.organizationId ?? null,
        sourceType: input.sourceType,
        sourceReferenceId: input.sourceReferenceId ?? null,
        productCode: input.productCode,
        assessmentDefinitionId: input.assessmentDefinitionId ?? null,
        quantity: input.quantity,
        consumedQuantity: 0,
        validFrom: input.validFrom,
        validUntil: input.validUntil ?? null,
        status: input.status,
        metadata: input.metadata || {},
        createdAt: now(),
      }
      if (row.sourceType === 'INSTITUTION_SPONSORSHIP' && !row.organizationId) throw new ApiError('VALIDATION_FAILED', 'Sponsorship needs an organization.')
      if (!['INSTITUTION_SPONSORSHIP', 'PARTNER_GRANT'].includes(row.sourceType) && !row.userId) throw new ApiError('VALIDATION_FAILED', 'Personal entitlements need a user.')
      if (db.entitlements.has(row.id)) throw new ApiError('CONFLICT', 'This entitlement already exists.')
      db.entitlements.set(row.id, row)
      return clone(row)
    },
    async getEntitlement(id) {
      return clone(db.entitlements.get(String(id)) || null)
    },
    // Status only (a contract's pool); seats and the ledger never change here.
    // With `fromStatuses`, a compare-and-set: null when the row is elsewhere.
    async setStatus(id, status, fromStatuses = null) {
      const row = db.entitlements.get(String(id))
      if (!row || (fromStatuses && !fromStatuses.includes(row.status))) return null
      row.status = status
      return clone(row)
    },
    async listEntitlements({ userId, organizationId, sourceTypes } = {}) {
      return [...db.entitlements.values()]
        .filter((e) => (userId === undefined || e.userId === userId)
          && (organizationId === undefined || e.organizationId === organizationId)
          && (!sourceTypes || sourceTypes.includes(e.sourceType)))
        .map(clone)
    },
    async findConsumption(idempotencyKey) {
      return clone(db.consumptions.find((c) => c.idempotencyKey === idempotencyKey) || null)
    },
    async listConsumptions(entitlementId) {
      return db.consumptions.filter((c) => c.entitlementId === entitlementId).map(clone)
    },
    async findConsumptionById(id) {
      return clone(db.consumptions.find((c) => c.id === String(id)) || null)
    },
    // Atomic: append the event and adjust the held-seat count together.
    // requireOpenReservation (CONSUMED/RELEASED): the session must hold an
    // open RESERVED seat; an already-closed seat replays its closing row.
    async appendEvent({ entitlementId, userId, organizationId = null, sessionId = null, event, idempotencyKey, requireOpenReservation = false }) {
      const existing = db.consumptions.find((c) => c.idempotencyKey === idempotencyKey)
      if (existing) return { consumption: clone(existing), entitlement: clone(db.entitlements.get(existing.entitlementId)), replayed: true }
      const ent = db.entitlements.get(entitlementId)
      if (!ent) throw new ApiError('NOT_FOUND', 'Entitlement not found.')
      if (requireOpenReservation) {
        const events = db.consumptions.filter((c) => c.entitlementId === entitlementId && c.sessionId === sessionId)
        if (!events.some((c) => c.event === 'RESERVED' && c.userId === userId)) throw new ApiError('CONFLICT', 'Nothing is reserved for this session.')
        const closed = events.find((c) => c.event === 'CONSUMED' || c.event === 'RELEASED')
        if (closed) return { consumption: clone(closed), entitlement: clone(ent), replayed: true }
      }
      if (event === 'RESERVED') {
        if (ent.consumedQuantity >= ent.quantity) throw new ApiError('ENTITLEMENT_REQUIRED', 'No seats remain on this entitlement.')
        ent.consumedQuantity += 1
      } else if (event === 'RELEASED') {
        ent.consumedQuantity = Math.max(0, ent.consumedQuantity - 1)
      }
      const row = { id: db.id(), entitlementId, userId, organizationId, sessionId, event, idempotencyKey, createdAt: now() }
      db.consumptions.push(Object.freeze(row))
      return { consumption: clone(row), entitlement: clone(ent), replayed: false }
    },
  }
}
