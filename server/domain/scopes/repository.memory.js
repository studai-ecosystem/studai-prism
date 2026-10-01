// Assessment session sponsorship scope — memory adapter. Rows are immutable.
import { ApiError } from '../http/errors.js'
import { clone } from '../campusStore/memoryDb.js'

export function createScopesRepoMemory(db) {
  return {
    async createSessionScope(scope) {
      if (db.sessionScopes.has(scope.sessionId)) throw new ApiError('CONFLICT', 'This session already has a scope.')
      if (scope.sponsorType === 'PERSONAL' && (scope.sponsorOrganizationId || scope.visibilityPolicy !== 'OWNER_ONLY')) {
        throw new ApiError('VALIDATION_FAILED', 'Personal sessions are owner-only.')
      }
      const row = { cohortId: null, programId: null, ...scope, createdAt: db.clock().toISOString() }
      db.sessionScopes.set(scope.sessionId, row)
      return clone(row)
    },
    async getSessionScope(sessionId) {
      return clone(db.sessionScopes.get(String(sessionId)) || null)
    },
  }
}
