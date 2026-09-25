// Where each workspace type lands after a switch (spec §6.2–§6.4).
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
