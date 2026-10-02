import { Link, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { cx } from '../../lib/cx.js'
import { isNavItemActive } from './navConfig.js'

// Student mobile bottom navigation (spec §7.3), shown below the md breakpoint.
export function BottomNav({ items, onMore, moreOpen = false }) {
  const location = useLocation()
  const base = 'flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium'
  return (
    <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-prism-border bg-prism-surface md:hidden">
      <ul className="flex">
        {items.filter((item) => item.to).map((item) => {
          const active = isNavItemActive(item, location)
          return (
            <li key={item.id} className="flex min-w-0 flex-1">
              <Link to={item.to} aria-current={active ? 'page' : undefined} className={cx(base, 'border-t-2', active ? 'border-prism-accent font-semibold text-prism-accent-strong' : 'border-transparent text-prism-ink-muted')}>
                {item.icon && <item.icon size={20} aria-hidden="true" />}
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          )
        })}
        <li className="flex min-w-0 flex-1">
          <button type="button" onClick={onMore} aria-expanded={moreOpen} aria-haspopup="dialog" className={cx(base, 'border-t-2 border-transparent text-prism-ink-muted')}>
            <Menu size={20} aria-hidden="true" />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}

export default BottomNav
