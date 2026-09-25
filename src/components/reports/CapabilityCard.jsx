import { Card } from '../ui/Card.jsx'
import { EvidenceSufficiencyBadge } from '../evidence/EvidenceSufficiencyBadge.jsx'
import { CapabilityLevelBadge } from '../capability/CapabilityLevelBadge.jsx'
import { reasonText } from '../../lib/copy/evidence.js'

// One capability as the server decided it (spec §33). A level, descriptor or
// quote appears only for PROVISIONAL / SUFFICIENT capabilities; otherwise the
// card explains why nothing is described.
export function CapabilityCard({ cap, headingLevel = 3 }) {
  const H = `h${headingLevel}`
  const described = (cap.status === 'PROVISIONAL' || cap.status === 'SUFFICIENT') && Boolean(cap.level)
  const reasons = [...new Set((cap.statusReasons || []).map(reasonText))]
  return (
    <Card className="space-y-3 p-5" data-testid="capability-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <H className="text-base font-semibold text-prism-ink">{cap.name}</H>
          {cap.definition && <p className="mt-1 text-sm text-prism-ink-muted">{cap.definition}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EvidenceSufficiencyBadge status={cap.status} reasons={cap.statusReasons} />
          <CapabilityLevelBadge level={described ? cap.level : null} provisional={cap.status === 'PROVISIONAL'} />
        </div>
      </div>
      {described && cap.levelDescriptor && (
        <p className="text-sm text-prism-ink">
          <span className="font-medium">What this level describes: </span>{cap.levelDescriptor}
        </p>
      )}
      {described && cap.observedEvidence?.quote && (
        <figure className="rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-subtle p-3 text-sm">
          <blockquote className="text-prism-ink">&ldquo;{cap.observedEvidence.quote}&rdquo;</blockquote>
          {cap.observedEvidence.context && <figcaption className="mt-1 text-xs text-prism-ink-muted">Your words. {cap.observedEvidence.context}</figcaption>}
        </figure>
      )}
      {!described && reasons.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-prism-ink-muted">
          {reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
    </Card>
  )
}

export default CapabilityCard
