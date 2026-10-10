// Where each workspace type lands after a switch.
export function homePathFor(workspace) {
  if (!workspace || workspace.type === 'PERSONAL') return '/app/home'
  if (workspace.type === 'CAMPUS_STUDENT') return `/app/campus/${workspace.organizationId}/home`
  if (workspace.type === 'CAMPUS_ADMIN') return `/campus/${workspace.organizationId}/overview`
  // PROD-READY Phase 9 (server-dark: PRISM_EMPLOYER_LND).
  if (workspace.type === 'EMPLOYER') return `/employer/${workspace.organizationId}/overview`
  return '/app/home'
}

export function workspaceLabel(workspace) {
  if (!workspace || workspace.type === 'PERSONAL') return 'Personal'
  const org = workspace.organizationName || workspace.name
  if (workspace.type === 'EMPLOYER') return `${org} (development)`
  return workspace.type === 'CAMPUS_ADMIN' ? `${org} (administration)` : org
}

// Who can see data in a workspace, in plain words (one source for the switcher,
// its options and screen readers). Personal never implies institutional ownership.
export function scopeText(workspace) {
  if (!workspace || workspace.type === 'PERSONAL') return 'Private to you'
  const org = workspace.organizationName || workspace.name
  if (workspace.type === 'EMPLOYER') return 'Employer development workspace'
  if (workspace.type === 'CAMPUS_STUDENT' && workspace.organizationType === 'EMPLOYER') return `${org} sees group summaries only`
  return workspace.type === 'CAMPUS_ADMIN' ? 'Institution administration' : `Visible to ${org}`
}