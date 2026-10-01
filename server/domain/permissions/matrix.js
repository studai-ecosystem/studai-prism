// Permission matrix (spec §29.1; contract §5). Each cell is a SCOPE:
//   ALL         every resource in the organization
//   LIMITED     allowed, but the service restricts sensitive sub-actions
//   ASSIGNED    only cohorts listed in membership.scope.cohortIds
//   DEPARTMENT  only resources in membership.department_id
//   PERMISSION  only if membership.scope.permissions explicitly lists the key
//   OWN         only the actor's own resource
// A missing cell is DENY. `personal_result.read` is granted to no org role.
import { ROLES } from './roles.js'

const ALL = 'ALL'
const LIMITED = 'LIMITED'
const ASSIGNED = 'ASSIGNED'
const DEPARTMENT = 'DEPARTMENT'
const PERMISSION = 'PERMISSION'
const OWN = 'OWN'

export const SCOPES = Object.freeze({ ALL, LIMITED, ASSIGNED, DEPARTMENT, PERMISSION, OWN })

// Rows: permission key → { role: scope }. Keys cover the spec §29.1 table and
// the campus navigation contract (K21).
export const MATRIX = Object.freeze({
  // §29.1 "Manage organization"
  'org.manage': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: LIMITED, STUDAI_ADMIN: ALL },
  // §29.1 "Manage team"
  'team.manage': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, PLACEMENT_OFFICER: LIMITED, STUDAI_ADMIN: ALL },
  'team.read': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, PLACEMENT_OFFICER: ALL, STUDAI_ADMIN: ALL },
  // §29.1 "View all cohorts"
  'cohorts.read': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, PLACEMENT_OFFICER: ASSIGNED, DEPARTMENT_COORDINATOR: DEPARTMENT, FACULTY_MENTOR: ASSIGNED },
  'students.read': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, PLACEMENT_OFFICER: ASSIGNED, DEPARTMENT_COORDINATOR: DEPARTMENT, FACULTY_MENTOR: ASSIGNED },
  'students.manage': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, PLACEMENT_OFFICER: ASSIGNED, DEPARTMENT_COORDINATOR: DEPARTMENT },
  // §29.1 "Create program"
  'programs.write': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, PLACEMENT_OFFICER: ALL, DEPARTMENT_COORDINATOR: LIMITED },
  'programs.read': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, PLACEMENT_OFFICER: ALL, DEPARTMENT_COORDINATOR: DEPARTMENT, FACULTY_MENTOR: ASSIGNED },
  // §29.1 "Assign assessment"
  'assignments.write': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, PLACEMENT_OFFICER: ALL, DEPARTMENT_COORDINATOR: LIMITED },
  'assignments.read': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, PLACEMENT_OFFICER: ASSIGNED, DEPARTMENT_COORDINATOR: DEPARTMENT, FACULTY_MENTOR: ASSIGNED, STUDENT: OWN },
  // §29.1 "View cohort analytics"
  'analytics.read': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, PLACEMENT_OFFICER: ASSIGNED, DEPARTMENT_COORDINATOR: DEPARTMENT, FACULTY_MENTOR: ASSIGNED },
  'reports.read': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, PLACEMENT_OFFICER: ASSIGNED, DEPARTMENT_COORDINATOR: DEPARTMENT, FACULTY_MENTOR: ASSIGNED },
  // §29.1 "View student sponsored result"
  'students.sponsored_result.read': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, PLACEMENT_OFFICER: ASSIGNED, DEPARTMENT_COORDINATOR: DEPARTMENT, FACULTY_MENTOR: ASSIGNED, STUDENT: OWN },
  // §29.1 "View personal Prism result" — personal results are read by their
  // owner in the PERSONAL workspace, never through an organization role.
  'personal_result.read': {},
  // §29.1 "Export cohort data"
  'exports.cohort': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, PLACEMENT_OFFICER: PERMISSION, DEPARTMENT_COORDINATOR: PERMISSION },
  'interventions.read': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, PLACEMENT_OFFICER: ASSIGNED, DEPARTMENT_COORDINATOR: DEPARTMENT, FACULTY_MENTOR: ASSIGNED },
  'interventions.write': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, PLACEMENT_OFFICER: ASSIGNED, DEPARTMENT_COORDINATOR: LIMITED },
  'reassessments.read': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, PLACEMENT_OFFICER: ASSIGNED, DEPARTMENT_COORDINATOR: DEPARTMENT, FACULTY_MENTOR: ASSIGNED },
  'reassessments.write': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, PLACEMENT_OFFICER: ALL, DEPARTMENT_COORDINATOR: LIMITED },
  'org.overview.read': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, PLACEMENT_OFFICER: ALL, DEPARTMENT_COORDINATOR: ALL, FACULTY_MENTOR: ALL, STUDAI_ADMIN: ALL },
  'org.settings.read': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, STUDAI_ADMIN: ALL },
  'integrations.read': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, STUDAI_ADMIN: ALL },
  'billing.read': { ORG_OWNER: ALL, PLACEMENT_DIRECTOR: ALL, STUDAI_ADMIN: ALL },
})

export const PERMISSION_KEYS = Object.freeze(Object.keys(MATRIX))

export function scopeFor(role, permission) {
  if (!ROLES.includes(role)) return null
  const row = MATRIX[permission]
  if (!row) return null
  return row[role] || null
}

// Permission keys a role holds in any scope (for UI visibility only).
export function permissionsForRole(role, membershipScope = {}) {
  const explicit = Array.isArray(membershipScope?.permissions) ? membershipScope.permissions : []
  return PERMISSION_KEYS.filter((key) => {
    const s = scopeFor(role, key)
    if (!s) return false
    if (s === PERMISSION) return explicit.includes(key)
    return true
  })
}
