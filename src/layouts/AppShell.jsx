import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
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
        <aside className="hidden w-60 shrink-0 border-r border-prism-border bg-prism-surface p-3 md:block">
          <div className="sticky top-[4.25rem] h-[calc(100vh-5rem)]">
            <SideNav label={navLabel} items={items} footerItems={footerItems} />
          </div>
        </aside>
        <main id="main" tabIndex={-1} className={`min-w-0 flex-1 focus:outline-none ${bottomItems ? 'pb-20 md:pb-0' : ''}`}>
          <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
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
