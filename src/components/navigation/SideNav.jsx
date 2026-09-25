import { NavLink } from 'react-router-dom'
import { cx } from '../../lib/cx.js'

// Vertical navigation list. NavLink sets aria-current="page" on the active item.
export function SideNav({ label, items, footerItems = [], onNavigate }) {
  const link = (item) => (
    <li key={item.id}>
      <NavLink
        to={item.to}
        onClick={onNavigate}
        className={({ isActive }) => cx(
          'flex items-center gap-3 rounded-[var(--prism-radius-md)] px-3 py-2 text-sm font-medium',
          isActive ? 'bg-prism-accent-soft text-prism-accent-strong' : 'text-prism-ink-muted hover:bg-prism-subtle hover:text-prism-ink',
        )}
      >
        {item.icon && <item.icon size={18} aria-hidden="true" />}
        <span>{item.label}</span>
      </NavLink>
    </li>
  )
  return (
    <nav aria-label={label} className="flex h-full flex-col">
      <ul className="flex flex-col gap-0.5">{items.map(link)}</ul>
      {footerItems.length > 0 && <ul className="mt-auto flex flex-col gap-0.5 border-t border-prism-border pt-3">{footerItems.map(link)}</ul>}
    </nav>
  )
}

export default SideNav
