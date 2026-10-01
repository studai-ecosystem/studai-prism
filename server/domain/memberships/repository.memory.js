// Organization memberships + org invites — memory adapter.
import { clone } from '../campusStore/memoryDb.js'

export function createMembershipsRepoMemory(db) {
  const now = () => db.clock().toISOString()
  const withOrg = (m) => m && ({ ...clone(m), organizationName: db.organizations.get(m.organizationId)?.name ?? null, organizationStatus: db.organizations.get(m.organizationId)?.status ?? null })
  return {
    async upsertMembership({ organizationId, userId, role, status, departmentId = null, scope = {}, invitedBy = null }) {
      const existing = [...db.memberships.values()].find((m) => m.organizationId === organizationId && m.userId === userId && m.role === role)
      const joinedAt = status === 'ACTIVE' ? (existing?.joinedAt || now()) : (existing?.joinedAt ?? null)
      const row = existing
        ? { ...existing, status, departmentId: departmentId ?? existing.departmentId, scope: scope && Object.keys(scope).length ? scope : existing.scope, joinedAt, updatedAt: now() }
        : { id: db.id(), organizationId, userId, role, status, departmentId, scope: scope || {}, invitedBy, joinedAt, createdAt: now(), updatedAt: now() }
      db.memberships.set(row.id, row)
      return withOrg(row)
    },
    async listMembershipsForUser(userId) {
      return [...db.memberships.values()].filter((m) => m.userId === userId).map(withOrg)
    },
    async createInvite({ organizationId, email, role, cohortId = null, departmentId = null, tokenHash, invitedBy, expiresAt }) {
      const row = { id: db.id(), organizationId, email, role, cohortId, departmentId, tokenHash, status: 'PENDING', invitedBy, expiresAt, acceptedBy: null, acceptedAt: null, createdAt: now() }
      db.invites.set(row.id, row)
      return clone(row)
    },
    async findInviteByTokenHash(tokenHash) {
      const row = [...db.invites.values()].find((i) => i.tokenHash === tokenHash)
      return row ? withOrg(row) : null
    },
    async updateInvite(id, { status, acceptedBy = null, acceptedAt = null }) {
      const row = db.invites.get(id)
      if (!row) return null
      Object.assign(row, { status, acceptedBy, acceptedAt })
      return clone(row)
    },
  }
}
