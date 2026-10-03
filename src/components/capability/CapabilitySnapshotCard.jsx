import { Link } from 'react-router-dom'
import { Card } from '../ui/Card.jsx'
import { EvidenceSufficiencyBadge } from '../evidence/EvidenceSufficiencyBadge.jsx'
import { CapabilityLevelBadge } from './CapabilityLevelBadge.jsx'

// Home capability snapshot (spec §9.3): name, observed level, sufficiency,
// change (only across comparable assessments — never shown until approved)
// and one evidence sentence from the server. No numbers, no percentages.
export function CapabilitySnapshotCard({ cap, detailsTo = null, headingLevel = 3 }) {
  const H = `h${headingLevel}`
  return (
    <Card as="article" className="flex h-full flex-col gap-3 p-4" data-testid="capability-snapshot">
      <H className="text-sm font-semibold text-prism-ink">{cap.name}</H>
      <div className="flex flex-wrap gap-2">
        {cap.level && <CapabilityLevelBadge level={cap.level} provisional={cap.status === 'PROVISIONAL'} />}
        <EvidenceSufficiencyBadge status={cap.status} reasons={cap.statusReasons} />
      </div>
      <p className="text-sm text-prism-ink-muted">{cap.evidenceSummary}</p>
      <p className="text-xs text-prism-ink-subtle">Change over time: shown only between comparable assessments.</p>
      {detailsTo && (
        <Link to={detailsTo} className="mt-auto inline-flex min-h-6 items-center text-sm font-medium text-prism-accent-strong underline">
          See details<span className="sr-only"> for {cap.name}</span>
        </Link>
      )}
    </Card>
  )
}

export default CapabilitySnapshotCard
