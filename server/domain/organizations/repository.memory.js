// Organizations + academic structure — memory adapter (same interface as repository.pg.js).
import { ApiError } from '../http/errors.js'
import { clone } from '../campusStore/memoryDb.js'

export function createOrganizationsRepoMemory(db) {
  const now = () => db.clock().toISOString()
  return {
    async createOrganization({ id, name, slug, organizationType, status, country = null, timezone = null }) {
      if ([...db.organizations.values()].some((o) => o.slug === slug)) throw new ApiError('CONFLICT', 'An organization with this slug already exists.')
      const row = { id: id || db.id(), name, slug, organizationType, status, country, timezone, createdAt: now(), updatedAt: now() }
      db.organizations.set(row.id, row)
      return clone(row)
    },
    async getOrganization(id) {
      return clone(db.organizations.get(String(id)) || null)
    },
    async createDepartment({ id, organizationId, name, code = null }) {
      const row = { id: id || db.id(), organizationId, campusId: null, name, code, status: 'ACTIVE', createdAt: now() }
      db.departments.set(row.id, row)
      return clone(row)
    },
    async getDepartment(id) {
      return clone(db.departments.get(String(id)) || null)
    },
    async createCohort({ id, organizationId, departmentId = null, name, semester = null, ownerUserId = null, tags = [] }) {
      const row = { id: id || db.id(), organizationId, departmentId, name, semester, ownerUserId, tags, status: 'ACTIVE', createdAt: now(), updatedAt: now() }
      db.cohorts.set(row.id, row)
      return clone(row)
    },
    async getCohort(id) {
      return clone(db.cohorts.get(String(id)) || null)
    },
    async addCohortMember({ cohortId, userId, addedBy = null }) {
      const key = `${cohortId}:${userId}`
      const existing = db.cohortMembers.get(key)
      const row = { cohortId, userId, status: 'ACTIVE', addedBy: existing?.addedBy ?? addedBy, addedAt: existing?.addedAt ?? now() }
      db.cohortMembers.set(key, row)
      return clone(row)
    },
    async listCohortsForUser(organizationId, userId) {
      return [...db.cohortMembers.values()]
        .filter((m) => m.userId === userId && m.status === 'ACTIVE')
        .map((m) => db.cohorts.get(m.cohortId))
        .filter((c) => c && c.organizationId === organizationId)
        .map(clone)
    },
  }
}
