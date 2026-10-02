import { Link, useLocation } from 'react-router-dom'
import { cx } from '../../lib/cx.js'

// Contextual sections under My Prism (P3.2): Capabilities | Evidence | Growth.
// Each is its own route (the legacy direct links keep working), so these are
// links with aria-current rather than ARIA tabs that swap content in place.
export const MY_PRISM_SECTIONS = [
  { id: 'capabilities', label: 'Capabilities', to: '/app/capabilities' },
  { id: 'evidence', label: 'Evidence', to: '/app/evidence' },
  { id: 'growth', label: 'Growth', to: '/app/growth' },
]

export function MyPrismSectionNav({ current }) {
  const { pathname } = useLocation()
  return (
    <nav aria-label="My Prism sections" className="mb-4 border-b border-prism-border">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {MY_PRISM_SECTIONS.map((s) => {
          const active = current ? current === s.id : pathname === s.to || pathname.startsWith(`${s.to}/`)
          return (
            <li key={s.id}>
              <Link
                to={s.to}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'inline-flex whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
                  active ? 'border-prism-accent text-prism-accent-strong' : 'border-transparent text-prism-ink-muted hover:text-prism-ink',
                )}
              >
                {s.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export default MyPrismSectionNav
