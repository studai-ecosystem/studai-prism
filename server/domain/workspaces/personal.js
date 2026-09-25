// The PERSONAL workspace is derived from the authenticated user (K18): it needs
// no database row, so direct customers work with or without the campus store.
export const PERSONAL_WORKSPACE_ID = 'personal'

export function personalWorkspaceFor(user) {
  return {
    id: PERSONAL_WORKSPACE_ID,
    type: 'PERSONAL',
    name: 'Personal',
    organizationId: null,
    organizationName: null,
    ownerUserId: user.id,
    visibilityPolicy: 'OWNER_ONLY',
    role: null,
  }
}
