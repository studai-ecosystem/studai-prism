// Organization roles (spec §29). The server is the only authority on access.
export const ROLES = Object.freeze([
  'ORG_OWNER',
  'PLACEMENT_DIRECTOR',
  'PLACEMENT_OFFICER',
  'DEPARTMENT_COORDINATOR',
  'FACULTY_MENTOR',
  'STUDENT',
  'PRISM_REVIEWER',
  'STUDAI_ADMIN',
])

// Roles an institution can invite (platform roles are granted by operators only).
export const INVITABLE_ROLES = Object.freeze([
  'ORG_OWNER',
  'PLACEMENT_DIRECTOR',
  'PLACEMENT_OFFICER',
  'DEPARTMENT_COORDINATOR',
  'FACULTY_MENTOR',
  'STUDENT',
])

export const STAFF_ROLES = Object.freeze(ROLES.filter((r) => r !== 'STUDENT'))

export const MEMBERSHIP_STATUSES = Object.freeze(['INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED'])

export function isRole(role) {
  return ROLES.includes(role)
}

// Which workspace a membership opens (spec §4.2).
export function workspaceTypeForRole(role) {
  return role === 'STUDENT' ? 'CAMPUS_STUDENT' : 'CAMPUS_ADMIN'
}
