import { CheckCircle2, XCircle, ShieldAlert } from 'lucide-react'
import { CAMPUS_CAN_SEE, CAMPUS_CANNOT_SEE } from '../../lib/copy/privacy.js'
import { EMPLOYER_CAN_SEE, EMPLOYER_CANNOT_SEE, employerProhibitedUses } from '../../lib/copy/employer.js'

// What an institution can and cannot see (spec §36). Used on the invite page
// before acceptance and in the sponsored workspace afterwards. PROD-READY
// Phase 9: an employer (organizationType EMPLOYER) shows the employer lists
// and how the employer may use Prism — the server's disclosure when passed.
export function ConsentScopePanel({ organizationName, headingLevel = 2, organizationType = null, disclosure = null }) {
  const H = `h${headingLevel}`
  const employer = organizationType === 'EMPLOYER' || Boolean(disclosure)
  const canSee = disclosure?.canSee || (employer ? EMPLOYER_CAN_SEE : CAMPUS_CAN_SEE)
  const cannotSee = disclosure?.cannotSee || (employer ? EMPLOYER_CANNOT_SEE : CAMPUS_CANNOT_SEE)
  const rules = employer ? (disclosure?.prohibitedUses || employerProhibitedUses(organizationName)) : null
  const grid = (
    <div className="grid gap-4 md:grid-cols-2">
      <section aria-labelledby="can-see" className="rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface p-4">
        <H id="can-see" className="text-sm font-semibold text-prism-ink">{organizationName} can see</H>
        <ul className="mt-2 space-y-2 text-sm text-prism-ink">
          {canSee.map((item) => (
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
          {cannotSee.map((item) => (
            <li key={item} className="flex gap-2">
              <XCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-prism-ink-muted" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
  if (!rules) return grid
  return (
    <div className="space-y-4">
      {grid}
      <section aria-labelledby="employer-rules" data-testid="employer-prohibited-uses" className="rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface p-4">
        <H id="employer-rules" className="text-sm font-semibold text-prism-ink">How {organizationName} may use Prism</H>
        <ul className="mt-2 space-y-2 text-sm text-prism-ink">
          {rules.map((item) => (
            <li key={item} className="flex gap-2">
              <ShieldAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-prism-ink-muted" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default ConsentScopePanel
