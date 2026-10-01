import { Card } from '../../../components/ui/Card.jsx'
import { CapabilityLevelBadge } from '../../../components/capability/CapabilityLevelBadge.jsx'
import { REPORT_COPY } from '../../../lib/copy/report.js'

// One development priority (spec §14.3): the behaviour to build, why it
// matters and the evidence behind it. Missions, practice time and a
// reassessment window are shown as not yet available — never invented.
export function DevelopmentPriorityCard({ priority, index, headingLevel = 3 }) {
  const H = `h${headingLevel}`
  return (
    <Card className="space-y-3 p-5" data-testid="development-priority">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <H className="text-base font-semibold text-prism-ink">
          <span className="sr-only">Priority {index + 1}: </span>{priority.name}
        </H>
        <CapabilityLevelBadge level={priority.currentLevel} provisional />
      </div>
      <p className="text-sm text-prism-ink">{priority.claim}</p>
      {priority.behaviorToImprove && (
        <p className="text-sm text-prism-ink"><span className="font-medium">What the next step looks like: </span>{priority.behaviorToImprove}</p>
      )}
      {priority.whyItMatters && (
        <p className="text-sm text-prism-ink-muted"><span className="font-medium text-prism-ink">Why it matters: </span>{priority.whyItMatters}</p>
      )}
      <ul className="space-y-1 text-sm text-prism-ink-muted">
        <li>{REPORT_COPY.missionsLater}</li>
        <li>{REPORT_COPY.reassessmentLater}</li>
      </ul>
      <p className="text-xs text-prism-ink-subtle">Based on {priority.evidenceIds.length} piece{priority.evidenceIds.length === 1 ? '' : 's'} of evidence from this assessment.</p>
    </Card>
  )
}

export default DevelopmentPriorityCard
