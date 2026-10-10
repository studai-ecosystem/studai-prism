// Shared building blocks for the employer development workspace (PROD-READY
// Phase 9): a page frame that always renders the h1 + workspace context and
// the standard loading / unauthorized / offline / error states, and the panel
// that states how the workspace may be used (served by the server, DRAFT).
import { ShieldAlert } from 'lucide-react'
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { queryStateView } from '../../student/QueryState.jsx'
import { ASSESSMENT_STATUS_LABELS, ASSESSMENT_STATUS_TONES } from '../../../lib/copy/campus.js'
import { EMPLOYER_PAGE_COPY } from '../../../lib/copy/employerPages.js'
import { useEmployerOrg, useEmployerSummary } from '../hooks.js'

export function EmployerPage({ title, description, breadcrumbs, actions, query, loadingLabel, children }) {
  const { workspace, orgId } = useEmployerOrg()
  const state = query ? queryStateView(query, { label: loadingLabel || `Loading ${String(title).toLowerCase()}`, homeTo: `/employer/${orgId}/overview` }) : null
  return (
    <div>
      <PageHeader title={title} description={description} context={workspace} breadcrumbs={breadcrumbs} actions={state ? null : actions} />
      {state || children}
    </div>
  )
}

export const employerCrumbs = (orgId, ...items) => [{ label: 'Overview', to: `/employer/${orgId}/overview` }, ...items]

export function ParticipationStatus({ status }) {
  return <StatusChip tone={ASSESSMENT_STATUS_TONES[status] || 'neutral'} label={ASSESSMENT_STATUS_LABELS[status] || status} />
}

// How this workspace may be used: the server's prohibited-use lines for this
// employer (PROHIBITED_USES_POLICY_v1, DRAFT pending HA-004 / HA-005).
export function UsageRulesPanel({ headingLevel = 2 }) {
  const summary = useEmployerSummary()
  const H = `h${headingLevel}`
  if (!summary.data) return null
  return (
    <section aria-labelledby="employer-usage" data-testid="employer-usage-rules" className="rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface p-4">
      <H id="employer-usage" className="text-sm font-semibold text-prism-ink">{EMPLOYER_PAGE_COPY.overview.rulesTitle}</H>
      <p className="mt-1 text-sm text-prism-ink-muted">{summary.data.copy.purpose}</p>
      <ul className="mt-2 space-y-2 text-sm text-prism-ink">
        {summary.data.prohibitedUses.map((line) => (
          <li key={line} className="flex gap-2">
            <ShieldAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-prism-ink-muted" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-prism-ink-subtle">{EMPLOYER_PAGE_COPY.draftNotice}</p>
    </section>
  )
}
