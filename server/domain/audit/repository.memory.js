// Data-access audit trail — memory adapter (append-only).
import { clone } from '../campusStore/memoryDb.js'

export function createAuditRepoMemory(db) {
  return {
    async recordDataAccess(event) {
      const row = Object.freeze({ id: db.id(), createdAt: db.clock().toISOString(), ...event })
      db.dataAccessEvents.push(row)
      return clone(row)
    },
    async listDataAccess({ organizationId, subjectUserId } = {}) {
      return db.dataAccessEvents
        .filter((e) => (organizationId === undefined || e.organizationId === organizationId) && (subjectUserId === undefined || e.subjectUserId === subjectUserId))
        .map(clone)
    },
  }
}
