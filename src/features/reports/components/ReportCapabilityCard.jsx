import { Card } from '../../../components/ui/Card.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { EvidenceSufficiencyBadge } from '../../../components/evidence/EvidenceSufficiencyBadge.jsx'
import { CapabilityLevelBadge } from '../../../components/capability/CapabilityLevelBadge.jsx'
import { reasonText } from '../../../lib/copy/evidence.js'
import { REPORT_COPY } from '../../../lib/copy/report.js'

// Report V3 capability card (spec §14.1): observed level, evidence status and
// what was observed — a validated claim — or why nothing is described.
export function ReportCapabilityCard({ cap, onSeeEvidence, evidenceCount = 0, headingLevel = 3, audience = 'OWNER' }) {
  const H = `h${headingLevel}`
  const described = Boolean(cap.level)
  const reasons = [...new Set((cap.statusReasons || []).map((r) => reasonText(r, { audience })))]
  return (
    <Card className="space-y-3 p-5" data-testid="report-capability">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <H className="text-base font-semibold text-prism-ink">{cap.name}</H>
          {cap.definition && <p className="mt-1 text-sm text-prism-ink-muted">{cap.definition}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-prism-ink-muted">
          {described && <span className="inline-flex items-center gap-1">Observed level <CapabilityLevelBadge level={cap.level} provisional={cap.status === 'PROVISIONAL'} /></span>}
          <span className="inline-flex items-center gap-1">Evidence <EvidenceSufficiencyBadge status={cap.status} reasons={cap.statusReasons} /></span>
        </div>
      </div>
      {described ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium text-prism-ink">What we observed</p>
          <p className="text-prism-ink">{cap.summary.text}</p>
          {cap.levelDescriptor && <p className="text-prism-ink-muted"><span className="font-medium text-prism-ink">What this level describes: </span>{cap.levelDescriptor}</p>}
          {onSeeEvidence && evidenceCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => onSeeEvidence(cap.id)} aria-label={`${REPORT_COPY.seeEvidence} for ${cap.name}`}>
              {REPORT_COPY.seeEvidence} <span aria-hidden="true">→</span>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2 text-sm text-prism-ink-muted">
          <p>{cap.summary.text}</p>
          {reasons.length > 0 && <ul className="list-disc space-y-1 pl-5">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
        </div>
      )}
    </Card>
  )
}

export default ReportCapabilityCard
