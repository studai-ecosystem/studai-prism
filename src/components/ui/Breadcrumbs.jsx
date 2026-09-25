import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

export function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 text-sm">
      <ol className="flex flex-wrap items-center gap-1 text-prism-ink-muted">
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1">
              {last || !item.to ? (
                <span aria-current={last ? 'page' : undefined} className={last ? 'font-medium text-prism-ink' : undefined}>{item.label}</span>
              ) : (
                <Link to={item.to} className="hover:text-prism-ink hover:underline">{item.label}</Link>
              )}
              {!last && <ChevronRight size={14} aria-hidden="true" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default Breadcrumbs
