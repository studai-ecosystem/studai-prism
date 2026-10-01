// can(actor, permission, resource) — deny by default (contract §5).
//   actor:    { userId, memberships: [{ organizationId, role, status, departmentId, scope }] }
//   resource: { organizationId, ownerUserId?, cohortId?, departmentId? }
// Returns { allowed, reason, scope, role, cohortIds?, departmentId? }. With no
// cohort/department on the resource (a list request), ASSIGNED/DEPARTMENT are
// allowed and the returned scope tells the service how to filter.
import { scopeFor, SCOPES } from './matrix.js'

const deny = (reason) => ({ allowed: false, reason, scope: null })

// Most-permissive-first so an actor holding two roles gets the wider scope.
const RANK = { ALL: 5, LIMITED: 4, DEPARTMENT: 3, ASSIGNED: 2, PERMISSION: 1, OWN: 0 }

function evaluate(membership, actor, permission, resource) {
  const scope = scopeFor(membership.role, permission)
  if (!scope) return deny('ROLE_NOT_PERMITTED')
  const base = { allowed: true, reason: 'ALLOWED', scope, role: membership.role }
  switch (scope) {
    case SCOPES.ALL:
    case SCOPES.LIMITED:
      return base
    case SCOPES.PERMISSION: {
      const explicit = Array.isArray(membership.scope?.permissions) ? membership.scope.permissions : []
      return explicit.includes(permission) ? base : deny('PERMISSION_NOT_GRANTED')
    }
    case SCOPES.OWN:
      return resource.ownerUserId && resource.ownerUserId === actor.userId ? base : deny('NOT_OWNER')
    case SCOPES.ASSIGNED: {
      const cohortIds = Array.isArray(membership.scope?.cohortIds) ? membership.scope.cohortIds.map(String) : []
      if (resource.cohortId === undefined) return { ...base, cohortIds }
      return resource.cohortId && cohortIds.includes(String(resource.cohortId)) ? { ...base, cohortIds } : deny('NOT_ASSIGNED')
    }
    case SCOPES.DEPARTMENT: {
      const departmentId = membership.departmentId || null
      if (!departmentId) return deny('NO_DEPARTMENT')
      if (resource.departmentId === undefined) return { ...base, departmentId }
      return resource.departmentId && String(resource.departmentId) === String(departmentId) ? { ...base, departmentId } : deny('OUTSIDE_DEPARTMENT')
    }
    default:
      return deny('UNKNOWN_SCOPE')
  }
}

export function can(actor, permission, resource = {}) {
  if (!actor?.userId) return deny('UNAUTHENTICATED')
  if (!resource.organizationId) return deny('NO_ORGANIZATION')
  const memberships = (actor.memberships || []).filter((m) =>
    m.status === 'ACTIVE' && String(m.organizationId) === String(resource.organizationId))
  if (memberships.length === 0) return deny('NOT_A_MEMBER')
  const decisions = memberships.map((m) => evaluate(m, actor, permission, resource))
  const allowed = decisions.filter((d) => d.allowed).sort((a, b) => RANK[b.scope] - RANK[a.scope])
  return allowed[0] || decisions[0]
}
