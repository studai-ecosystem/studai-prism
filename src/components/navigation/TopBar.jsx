import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, Menu } from 'lucide-react'
import PrismLogo from '../ui/PrismLogo.jsx'
import { Avatar } from '../ui/Avatar.jsx'
import { DropdownMenu } from '../ui/DropdownMenu.jsx'
import { IconButton } from '../ui/Button.jsx'
import { useAuth } from '../../app/providers/AuthProvider.jsx'
import { WorkspaceContext } from '../../features/workspaces/components/WorkspaceContext.jsx'

// Top bar: brand, the single workspace-context control, account menu. The
// icon mark shows on small screens, the no-tagline lockup from sm up (the
// tagline lockup is for marketing, not navigation).
export function TopBar({ onOpenNav, navLabel = 'Open navigation' }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-prism-border bg-prism-surface px-3 md:px-5">
      {onOpenNav && (
        <IconButton label={navLabel} onClick={onOpenNav} className="md:hidden">
          <Menu size={20} />
        </IconButton>
      )}
      <Link to="/app" className="shrink-0" aria-label="Prism home">
        <PrismLogo variant="icon" width={32} decorative className="sm:hidden" />
        <PrismLogo variant="lockup" size={24} decorative className="hidden sm:inline-block" />
      </Link>
      <div className="ml-1 min-w-0 md:ml-3">
        <WorkspaceContext />
      </div>
      <div className="ml-auto shrink-0">
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