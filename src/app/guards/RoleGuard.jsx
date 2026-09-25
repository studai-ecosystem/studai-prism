import { useWorkspace } from '../providers/WorkspaceProvider.jsx'
import { useFeatureFlags } from '../providers/FeatureFlagProvider.jsx'
import { UnauthorizedState } from '../../components/states/UnauthorizedState.jsx'

// Hides UI the caller cannot use, based on permissions the SERVER returned for
// the active workspace. The server still re-checks every request.
export function hasPermission({ active, me }, permission) {
  const scoped = active?.permissions || []
  const global = me?.permissions?.global || []
  return scoped.includes(permission) || global.includes(permission)
}

export function RoleGuard({ permission, children, fallback }) {
  const { active } = useWorkspace()
  const { me } = useFeatureFlags()
  if (!hasPermission({ active, me }, permission)) return fallback === undefined ? <UnauthorizedState /> : fallback
  return children
}

export default RoleGuard
