import { CheckCircle2, XCircle } from 'lucide-react'
import { CAMPUS_CAN_SEE, CAMPUS_CANNOT_SEE } from '../../lib/copy/privacy.js'

// What an institution can and cannot see (spec §36). Used on the invite page
// before acceptance and in the sponsored workspace afterwards.
export function ConsentScopePanel({ organizationName, headingLevel = 2 }) {
  const H = `h${headingLevel}`
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section aria-labelledby="can-see" className="rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface p-4">
        <H id="can-see" className="text-sm font-semibold text-prism-ink">{organizationName} can see</H>
        <ul className="mt-2 space-y-2 text-sm text-prism-ink">
          {CAMPUS_CAN_SEE.map((item) => (
            <li key={item} className="flex gap-2">
              <CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-prism-positive" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="cannot-see" className="rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface p-4">
        <H id="cannot-see" className="text-sm font-semibold text-prism-ink">{organizationName} cannot see, unless you share it</H>
        <ul className="mt-2 space-y-2 text-sm text-prism-ink">
          {CAMPUS_CANNOT_SEE.map((item) => (
            <li key={item} className="flex gap-2">
              <XCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-prism-ink-muted" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default ConsentScopePanel
