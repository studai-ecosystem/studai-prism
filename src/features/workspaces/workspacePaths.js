// Where each workspace type lands after a switch.
export function homePathFor(workspace) {
  if (!workspace || workspace.type === 'PERSONAL') return '/app/home'
  if (workspace.type === 'CAMPUS_STUDENT') return `/app/campus/${workspace.organizationId}/home`
  if (workspace.type === 'CAMPUS_ADMIN') return `/campus/${workspace.organizationId}/overview`
  return '/app/home'
}

export function workspaceLabel(workspace) {
  if (!workspace || workspace.type === 'PERSONAL') return 'Personal'
  const org = workspace.organizationName || workspace.name
  return workspace.type === 'CAMPUS_ADMIN' ? `${org} (administration)` : org
}

// Who can see data in a workspace, in plain words (one source for the switcher,
// its options and screen readers). Personal never implies institutional ownership.
export function scopeText(workspace) {
  if (!workspace || workspace.type === 'PERSONAL') return 'Private to you'
  const org = workspace.organizationName || workspace.name
  return workspace.type === 'CAMPUS_ADMIN' ? 'Institution administration' : `Visible to ${org}`
}