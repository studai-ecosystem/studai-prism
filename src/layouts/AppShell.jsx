import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { SkipLink } from '../components/navigation/SkipLink.jsx'
import { SideNav } from '../components/navigation/SideNav.jsx'
import { BottomNav } from '../components/navigation/BottomNav.jsx'
import { TopBar } from '../components/navigation/TopBar.jsx'
import { Drawer } from '../components/ui/Drawer.jsx'
import { OfflineReconnectBanner } from '../components/states/OfflineReconnectBanner.jsx'

// After client-side navigation, move focus to the new page's <h1> so screen
// readers announce the page change (the heading renders after lazy loading).
// Only the very first shell mount of the page load is skipped: some V3 routes
// mount their own shell instance, and those navigations must still move focus.
let initialShellMountDone = false

const SIDEBAR_KEY = 'prism-sidebar-collapsed'

// Sidebar width preference (icons only when collapsed); a UI preference, not data.
function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === '1' } catch { return false }
  })
  const toggle = () => setCollapsed((c) => {
    const next = !c
    try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0') } catch { /* preference only */ }
    return next
  })
  return [collapsed, toggle]
}

export function useRouteFocus(pathname) {
  useEffect(() => {
    if (!initialShellMountDone) {
      initialShellMountDone = true
      return undefined
    }
    let tries = 0
    let raf = 0
    const attempt = () => {
      const h = document.getElementById('page-title')
      if (h) h.focus({ preventScroll: false })
      else if (tries++ < 40) raf = requestAnimationFrame(attempt)
    }
    raf = requestAnimationFrame(attempt)
    return () => cancelAnimationFrame(raf)
  }, [pathname])
}

// Shared authenticated shell (spec §7). Desktop: left nav + top bar.
// Mobile: top bar + either a bottom nav (students) or a nav drawer (campus).
// The shell owns <main id="main"> so the skip link always has a target.
export function AppShell({ navLabel, items, footerItems = [], bottomItems, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, toggleCollapsed] = useSidebarCollapsed()
  const { pathname } = useLocation()
  useEffect(() => setDrawerOpen(false), [pathname])
  useRouteFocus(pathname)

  const drawerItems = bottomItems ? items.filter((i) => !bottomItems.some((b) => b.id === i.id)) : items

  return (
    <div className="prism-app flex min-h-screen flex-col">
      <SkipLink />
      <TopBar onOpenNav={bottomItems ? undefined : () => setDrawerOpen(true)} />
      <OfflineReconnectBanner message="Reconnecting… Nothing you have already saved is lost." />
      <div className="flex flex-1">
        <aside
          className="hidden shrink-0 border-r border-prism-border bg-prism-surface p-3 transition-[width] duration-200 motion-reduce:transition-none md:block"
          style={{ width: collapsed ? 'var(--layout-sidebar-collapsed)' : 'var(--layout-sidebar-width)' }}
        >
          <div className="sticky top-[4.25rem] flex h-[calc(100vh-5rem)] flex-col">
            <div className="min-h-0 flex-1">
              <SideNav label={navLabel} items={items} footerItems={footerItems} collapsed={collapsed} />
            </div>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              className="mt-2 flex h-10 items-center justify-center gap-2 rounded-[var(--prism-radius-md)] text-sm text-prism-ink-subtle hover:bg-prism-subtle hover:text-prism-ink"
            >
              {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
              {!collapsed && <span>Collapse</span>}
            </button>
          </div>
        </aside>
        <main id="main" tabIndex={-1} className={`min-w-0 flex-1 focus:outline-none ${bottomItems ? 'pb-20 md:pb-0' : ''}`}>
          <div className="mx-auto w-full max-w-[var(--layout-content-max)] px-4 py-6 md:px-8">
            {children || <Outlet />}
          </div>
        </main>
      </div>
      {bottomItems && <BottomNav items={bottomItems} onMore={() => setDrawerOpen(true)} moreOpen={drawerOpen} />}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={bottomItems ? 'More' : 'Navigation'} side={bottomItems ? 'right' : 'left'}>
        <SideNav label={`${navLabel} (menu)`} items={drawerItems} footerItems={footerItems} onNavigate={() => setDrawerOpen(false)} />
      </Drawer>
    </div>
  )
}

export default AppShell
