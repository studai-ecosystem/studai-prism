// The v1-store records the V3 support routes read and write (PROD-READY
// Phase 4), bound to a store implementation (lib/store.js in the app; the same
// module over an isolated data directory in tests):
//   * identity-check records (v1_verifications) and the assurance level
//     (lib/identityAssurance.js, charter §9);
//   * the session's accommodation record (v1_accommodations) that the frozen
//     engine reads at start (charter §13). An approved pre-start decision is
//     written once; an existing decided record is never changed.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function legacySupportSources(store, { assuranceFor } = {}) {
  return {
    getVerification: (sessionId) => store.getVerification(sessionId),
    recordVerification: (sessionId, record) => store.recordVerification(sessionId, record),
    ...(assuranceFor ? { assuranceFor } : {}),
    async recordAccommodationDecision(sessionId, { needs, modes, material, note, decidedBy }) {
      const existing = await store.getAccommodation(sessionId)
      if (existing && existing.status !== 'requested') return existing
      await store.requestAccommodation(sessionId, needs)
      // v1_accommodations.decided_by is a UUID (admin console ids are UUIDs).
      return store.decideAccommodation(sessionId, { approved: true, modes, material, note, decidedBy: UUID.test(String(decidedBy || '')) ? decidedBy : null })
    },
  }
}
