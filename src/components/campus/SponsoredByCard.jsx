import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { ConsentScopePanel } from './ConsentScopePanel.jsx'
import { SPONSORED_PRIVACY_NOTE } from '../../lib/copy/privacy.js'

// Shown at the top of every sponsored (campus student) page: who sponsors this
// workspace, that no payment is required, and what the institution can see.
export function SponsoredByCard({ organizationName }) {
  const [open, setOpen] = useState(false)
  return (
    <section aria-labelledby="sponsored-by" className="mb-6 rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <Building2 size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-prism-accent-strong" />
          <div className="min-w-0">
            <p id="sponsored-by" className="text-sm font-semibold text-prism-ink">Sponsored by {organizationName}</p>
            <p className="text-sm text-prism-ink-muted">No payment required. {SPONSORED_PRIVACY_NOTE(organizationName)}</p>
          </div>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="sponsored-scope"
          onClick={() => setOpen((v) => !v)}
          className="text-sm font-medium text-prism-accent-strong underline"
        >
          {open ? 'Hide details' : 'What can they see?'}
        </button>
      </div>
      {open && <div id="sponsored-scope" className="mt-4"><ConsentScopePanel organizationName={organizationName} headingLevel={3} /></div>}
    </section>
  )
}

export default SponsoredByCard
