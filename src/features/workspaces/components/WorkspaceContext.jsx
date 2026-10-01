import { Lock } from 'lucide-react'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useFlag } from '../../../app/providers/FeatureFlagProvider.jsx'
import { PERSONAL_PRIVACY_NOTE } from '../../../lib/copy/privacy.js'
import { WorkspaceSwitcher } from './WorkspaceSwitcher.jsx'
import { scopeText, workspaceLabel } from '../workspacePaths.js'

// The ONE place the shell says where you are and who can see it. With campus
// off there is only the personal workspace, so it is a static label; with
// campus on it is the switcher. Replaces the separate badges.
export function WorkspaceContext() {
  const { active } = useWorkspace()
  const { enabled: campusEnabled } = useFlag('PRISM_CAMPUS_ENABLED')
  if (campusEnabled) return <WorkspaceSwitcher />
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm" title={PERSONAL_PRIVACY_NOTE}>
      <Lock size={14} aria-hidden="true" className="shrink-0 text-prism-ink-subtle" />
      <span className="truncate font-medium text-prism-ink">{workspaceLabel(active)}</span>
      <span className="hidden text-xs text-prism-ink-subtle sm:inline">{scopeText(active)}</span>
    </div>
  )
}

export default WorkspaceContext