// Campus workspace rows — memory adapter. (PERSONAL is virtual, K18.)
import { clone } from '../campusStore/memoryDb.js'

export function createWorkspacesRepoMemory(db) {
  return {
    async upsertWorkspace({ type, ownerUserId, organizationId, name }) {
      const existing = [...db.workspaces.values()].find((w) => w.type === type && w.ownerUserId === ownerUserId && w.organizationId === organizationId)
      if (existing) {
        existing.status = 'ACTIVE'
        return clone(existing)
      }
      const row = { id: db.id(), type, ownerUserId, organizationId, name, status: 'ACTIVE', createdAt: db.clock().toISOString() }
      db.workspaces.set(row.id, row)
      return clone(row)
    },
    async listWorkspacesForUser(userId) {
      return [...db.workspaces.values()].filter((w) => w.ownerUserId === userId && w.status === 'ACTIVE').map(clone)
    },
    async getWorkspace(id) {
      return clone(db.workspaces.get(String(id)) || null)
    },
  }
}
