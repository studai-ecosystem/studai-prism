import { useEffect } from 'react'
import { Breadcrumbs } from './Breadcrumbs.jsx'
import { Badge } from './Badge.jsx'

// Page title block. `context` (the active workspace) is always shown so the
// user knows whose data this page belongs to (spec §4.3, §7.1). It also sets
// the document title so every route is announced distinctly (WCAG 2.4.2).
export function PageHeader({ id = 'page-title', title, description, context, breadcrumbs, actions }) {
  useEffect(() => {
    if (typeof title === 'string' && title) document.title = `${title} · Prism`
  }, [title])
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
        <div className="flex flex-wrap items-center gap-2">
          <h1 id={id} tabIndex={-1} className="text-2xl font-semibold text-prism-ink focus:outline-none">{title}</h1>
          {context && (
            <Badge tone={context.type === 'PERSONAL' ? 'neutral' : 'accent'}>
              {context.type === 'PERSONAL' ? 'Personal' : context.organizationName || context.name}
            </Badge>
          )}
        </div>
        {description && <p className="mt-1 max-w-2xl text-sm text-prism-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export default PageHeader
