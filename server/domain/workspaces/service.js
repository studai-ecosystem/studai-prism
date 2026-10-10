// Workspaces (spec §4.2; contract §4). PERSONAL is derived per user (K18);
// campus workspaces exist only for ACTIVE memberships of ACTIVE organizations,
// and only while the campus flag is on and the campus store is available.
import { personalWorkspaceFor, PERSONAL_WORKSPACE_ID } from './personal.js'
import { permissionsForRole } from '../permissions/matrix.js'
import { workspaceTypeForRole } from '../permissions/roles.js'
import { isEnabled } from '../flags/index.js'

// PROD-READY Phase 9: an EMPLOYER organization opens workspaces only while
// PRISM_EMPLOYER_LND is on. Its employees' sponsored workspace is
// aggregate-only for the employer: an individual report reaches the employer
// only through the employee's own share grant (migration 0063 enforces it).
const employerOn = () => isEnabled('PRISM_EMPLOYER_LND')
export function visibilityPolicyFor(type, organizationType) {
  if (type !== 'CAMPUS_STUDENT') return null
  return organizationType === 'EMPLOYER' ? 'OWNER_AND_SPONSOR_AGGREGATE_ONLY' : 'OWNER_AND_SPONSOR'
}

export function createWorkspaceService({ repos, campusAvailable }) {
  async function campusWorkspaces(user) {
    if (!repos || !campusAvailable()) return []
    const memberships = (await repos.memberships.listMembershipsForUser(user.id))
      .filter((m) => m.status === 'ACTIVE' && m.organizationStatus === 'ACTIVE')
      .filter((m) => m.organizationType !== 'EMPLOYER' || employerOn())
    const rows = await repos.workspaces.listWorkspacesForUser(user.id)
    const out = []
    const seen = new Set()
    for (const m of memberships) {
      const type = workspaceTypeForRole(m.role, m.organizationType)
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
        visibilityPolicy: visibilityPolicyFor(type, m.organizationType),
        // Only an employer workspace carries its organization type, so every
        // campus payload is unchanged.
        ...(m.organizationType === 'EMPLOYER' ? { organizationType: 'EMPLOYER' } : {}),
        role: m.role,
        roles: [m.role],
        permissions,
        // PROD-READY Phase 8: a synthetic demo organization (0061). The app
        // shows a persistent "Demo data" banner while the caller has one.
        isDemo: m.organizationIsDemo === true,
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
