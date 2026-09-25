import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useWorkspace } from '../providers/WorkspaceProvider.jsx'
import { useFeatureFlags } from '../providers/FeatureFlagProvider.jsx'
import { UnauthorizedState } from '../../components/states/UnauthorizedState.jsx'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { DocumentTitle } from '../../components/ui/DocumentTitle.jsx'

// Validates the route's organization param against the caller's workspaces
// (as returned by the server) and activates the matching one. UX only.
export function WorkspaceGuard({ param = 'organizationId', type, children }) {
  const params = useParams()
  const { workspaces, active, switchTo } = useWorkspace()
  const { loading } = useFeatureFlags()
  const orgId = params[param]
  const match = workspaces.find((w) => w.organizationId === orgId && (!type || w.type === type))

  useEffect(() => {
    if (match && match.id !== active.id) switchTo(match.id)
  }, [match, active.id, switchTo])

  if (loading) return <Skeleton variant="page" label="Loading workspace" />
  if (!match) return <><DocumentTitle title="Not available" /><UnauthorizedState /></>
  if (match.id !== active.id) return <Skeleton variant="page" label="Switching workspace" />
  return children
}

export default WorkspaceGuard
