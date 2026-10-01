// Read-only adapter from legacy per-session entitlements (payments store:
// { sessionId, mode, userId, consumed }) to the V2 source vocabulary
// (contract §6). Legacy records are never mutated or copied.
export const LEGACY_MODE_SOURCE = Object.freeze({
  paid: 'PERSONAL_PURCHASE',
  license: 'PERSONAL_PURCHASE',
  coupon: 'PROMO',
  dummy: 'PROMO',
  dev: 'PROMO',
  invite: 'ADMIN_GRANT',
  review_grant: 'ADMIN_GRANT',
})

export function fromLegacyEntitlement(record) {
  if (!record || !record.sessionId) return null
  const sourceType = LEGACY_MODE_SOURCE[record.mode] || null
  if (!sourceType) return null
  return {
    id: `legacy:${record.sessionId}`,
    legacy: true,
    legacySessionId: record.sessionId,
    userId: record.userId || null,
    organizationId: null,
    sourceType,
    productCode: 'PRISM_PERSONAL_ASSESSMENT',
    quantity: 1,
    consumedQuantity: record.consumed ? 1 : 0,
    validFrom: record.createdAt ? new Date(record.createdAt).toISOString() : null,
    validUntil: null,
    status: record.consumed ? 'EXHAUSTED' : 'ACTIVE',
  }
}
