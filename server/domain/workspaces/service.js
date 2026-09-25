// Workspaces (spec §4.2; contract §4). PERSONAL is derived per user (K18);
// campus workspaces exist only for ACTIVE memberships of ACTIVE organizations,
// and only while the campus flag is on and the campus store is available.
import { personalWorkspaceFor, PERSONAL_WORKSPACE_ID } from './personal.js'
import { permissionsForRole } from '../permissions/matrix.js'
import { workspaceTypeForRole } from '../permissions/roles.js'

export function createWorkspaceService({ repos, campusAvailable }) {
  async function campusWorkspaces(user) {
    if (!repos || !campusAvailable()) return []
    const memberships = (await repos.memberships.listMembershipsForUser(user.id))
      .filter((m) => m.status === 'ACTIVE' && m.organizationStatus === 'ACTIVE')
    const rows = await repos.workspaces.listWorkspacesForUser(user.id)
    const out = []
    const seen = new Set()
    for (const m of memberships) {
      const type = workspaceTypeForRole(m.role)
      let row = rows.find((w) => w.type === type && w.organizationId === m.organizationId)
      if (!row) row = await repos.workspaces.upsertWorkspace({ type, ownerUserId: user.id, organizationId: m.organizationId, name: m.organizationName })
      const existing = out.find((w) => w.id === row.id)
      const permissions = permissionsForRole(m.role, m.scope)
      if (existing) {
        existing.permissions = [...new Set([...existing.permissions, ...permissions])]
        existing.roles.push(m.role)
        continue
      }
      if (seen.has(row.id)) continue
      seen.add(row.id)
      out.push({
        id: row.id,
        type,
        name: m.organizationName,
        organizationId: m.organizationId,
        organizationName: m.organizationName,
        ownerUserId: user.id,
        visibilityPolicy: type === 'CAMPUS_STUDENT' ? 'OWNER_AND_SPONSOR' : null,
        role: m.role,
        roles: [m.role],
        permissions,
      })
    }
    return out
  }

  return {
    async listWorkspaces(user) {
      return [{ ...personalWorkspaceFor(user), permissions: [] }, ...(await campusWorkspaces(user))]
    },
    async getWorkspace(user, workspaceId) {
      if (!workspaceId || workspaceId === PERSONAL_WORKSPACE_ID) return { ...personalWorkspaceFor(user), permissions: [] }
      return (await campusWorkspaces(user)).find((w) => w.id === workspaceId) || null
    },
    async actorFor(user) {
      // Only ACTIVE memberships of ACTIVE organizations ever authorize anything.
      const memberships = repos && campusAvailable()
        ? (await repos.memberships.listMembershipsForUser(user.id)).filter((m) => m.organizationStatus === 'ACTIVE')
        : []
      return { userId: user.id, memberships }
    },
  }
}
