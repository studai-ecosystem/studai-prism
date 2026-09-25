import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, Menu } from 'lucide-react'
import PrismLogo from '../ui/PrismLogo.jsx'
import { Avatar } from '../ui/Avatar.jsx'
import { Badge } from '../ui/Badge.jsx'
import { DropdownMenu } from '../ui/DropdownMenu.jsx'
import { IconButton } from '../ui/Button.jsx'
import { useAuth } from '../../app/providers/AuthProvider.jsx'
import { useWorkspace } from '../../app/providers/WorkspaceProvider.jsx'
import { useFlag } from '../../app/providers/FeatureFlagProvider.jsx'
import { WorkspaceSwitcher } from '../../features/workspaces/components/WorkspaceSwitcher.jsx'
import { workspaceLabel } from '../../features/workspaces/workspacePaths.js'
import { PrivacyScopeBadge } from '../campus/PrivacyScopeBadge.jsx'

// Top bar (spec §7.1): workspace selector, context badge, profile menu.
// Notifications arrive with Phase 7 (no placeholder control until then).
export function TopBar({ onOpenNav, navLabel = 'Open navigation' }) {
  const { user, signOut } = useAuth()
  const { active } = useWorkspace()
  const { enabled: campusEnabled } = useFlag('PRISM_CAMPUS_ENABLED')
  const navigate = useNavigate()
  const personal = active.type === 'PERSONAL'

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-prism-border bg-prism-surface px-3 md:px-5">
      {onOpenNav && (
        <IconButton label={navLabel} onClick={onOpenNav} className="md:hidden">
          <Menu size={20} />
        </IconButton>
      )}
      <Link to="/app" className="shrink-0" aria-label="Prism home">
        <PrismLogo size={24} subtitle={null} wordmarkColor="var(--prism-ink)" />
      </Link>
      <div className="ml-2 flex min-w-0 items-center gap-2">
        {campusEnabled && <WorkspaceSwitcher />}
        <Badge tone={personal ? 'neutral' : 'accent'} className="hidden sm:inline-flex" aria-label={`Current context: ${workspaceLabel(active)}`}>
          {workspaceLabel(active)}
        </Badge>
        <span className="hidden lg:inline-flex"><PrivacyScopeBadge workspace={active} /></span>
      </div>
      <div className="ml-auto">
        <DropdownMenu
          label="Account menu"
          trigger={(
            <>
              <Avatar name={user?.name || user?.email || 'You'} size="sm" decorative />
              <span className="hidden max-w-[10rem] truncate text-sm md:inline">{user?.name || user?.email}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </>
          )}
          items={[
            { id: 'settings', label: 'Settings', onSelect: () => navigate('/app/settings') },
            { id: 'profile', label: 'Profile & password', onSelect: () => navigate('/profile') },
            { id: 'signout', label: 'Sign out', onSelect: () => { signOut(); navigate('/') } },
          ]}
        />
      </div>
    </header>
  )
}

export default TopBar
