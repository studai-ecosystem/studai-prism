import { NavLink } from 'react-router-dom'
import { cx } from '../../lib/cx.js'
import { NAV_GROUP_LABELS } from './navConfig.js'

// Consecutive items with the same `group` form one section.
function sectionsOf(items) {
  const out = []
  for (const item of items) {
    const key = item.group || ''
    const last = out[out.length - 1]
    if (last && last.key === key) last.items.push(item)
    else out.push({ key, items: [item] })
  }
  return out
}

// Vertical navigation. NavLink sets aria-current="page"; the active item also
// gets a green rule, so the current page is never shown by colour alone.
// `collapsed` keeps the accessible names and shows icons only.
export function SideNav({ label, items, footerItems = [], onNavigate, collapsed = false }) {
  const link = (item) => (
    <li key={item.id}>
      <NavLink
        to={item.to}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        className={({ isActive }) => cx(
          'flex items-center gap-3 rounded-[var(--prism-radius-md)] py-2 text-sm font-medium',
          collapsed ? 'justify-center px-0' : 'px-3',
          isActive
            ? 'bg-prism-accent-soft text-prism-accent-strong shadow-[inset_3px_0_0_0_var(--brand-green)]'
            : 'text-prism-ink-muted hover:bg-prism-subtle hover:text-prism-ink',
        )}
      >
        {item.icon && <item.icon size={18} aria-hidden="true" />}
        <span className={collapsed ? 'sr-only' : undefined}>{item.label}</span>
      </NavLink>
    </li>
  )
  return (
    <nav aria-label={label} className="flex h-full flex-col">
      <div className="flex flex-col overflow-y-auto">
        {sectionsOf(items).map((section, i) => {
          const heading = section.key ? NAV_GROUP_LABELS[section.key] : null
          return (
            <div
              key={`${section.key}-${i}`}
              role={heading ? 'group' : undefined}
              aria-label={heading || undefined}
              className={cx(i > 0 && 'mt-3 border-t border-prism-border pt-3')}
            >
              {heading && !collapsed && (
                <p aria-hidden="true" className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-prism-ink-subtle">{heading}</p>
              )}
              <ul className="flex flex-col gap-0.5">{section.items.map(link)}</ul>
            </div>
          )
        })}
      </div>
      {footerItems.length > 0 && <ul className="mt-auto flex flex-col gap-0.5 border-t border-prism-border pt-3">{footerItems.map(link)}</ul>}
    </nav>
  )
}

export default SideNav