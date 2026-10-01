import { Link } from 'react-router-dom'
import { Card } from '../ui/Card.jsx'
import { Badge } from '../ui/Badge.jsx'
import { EvidenceSufficiencyBadge } from '../evidence/EvidenceSufficiencyBadge.jsx'
import { CapabilityLevelBadge } from './CapabilityLevelBadge.jsx'
import { reasonText } from '../../lib/copy/evidence.js'

// Capability list card: name, definition, level (only when evidence supports
// one), sufficiency, one evidence sentence from the server. When there is not
// enough evidence the card says so and why - it never shows a level or a
// placeholder number. Links to the capability detail page.
export function CapabilityCard({ cap, to, headingLevel = 2 }) {
  const H = `h${headingLevel}`
  const described = Boolean(cap.level)
  const reasons = [...new Set(cap.statusReasons.map(reasonText))]
  return (
    <Card as="article" className="flex h-full flex-col gap-3 p-5" aria-labelledby={`cap-${cap.id}`} data-testid="capability-card" data-described={described ? 'true' : 'false'}>
      <div className="flex flex-wrap items-center gap-2">
        <H id={`cap-${cap.id}`} className="text-base font-semibold text-prism-ink">{cap.name}</H>
        {cap.layer === 'CONTEXTUAL' && <Badge tone="neutral">Role-specific</Badge>}
        {cap.developmentPriority && <Badge tone="partial">Development priority</Badge>}
      </div>
      <p className="text-sm text-prism-ink-muted">{cap.definition}</p>
      <div className="flex flex-wrap gap-2">
        {described && <CapabilityLevelBadge level={cap.level} provisional={cap.status === 'PROVISIONAL'} />}
        <EvidenceSufficiencyBadge status={cap.status} reasons={cap.statusReasons} />
      </div>
      <p className="text-sm text-prism-ink">{cap.evidenceSummary.text}</p>
      {!described && reasons.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-prism-ink-muted">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      )}
      <Link to={to} className="mt-auto inline-flex min-h-6 items-center text-sm font-medium text-prism-accent-strong underline">
        View capability<span className="sr-only">: {cap.name}</span>
      </Link>
    </Card>
  )
}

export default CapabilityCard