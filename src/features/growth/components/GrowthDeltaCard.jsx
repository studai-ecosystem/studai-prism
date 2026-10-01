// One capability's change between two comparable assessments (spec §17): a
// level-label change only — no score, no percentage, and no margin until a
// validated method exists.
import { Card } from '../../../components/ui/Card.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { GROWTH_COPY } from '../../../lib/copy/student.js'

// Direction is carried by the words; LOWER is not styled as "insufficient evidence".
const TONE = { HIGHER: 'positive', SAME: 'neutral', LOWER: 'neutral' }

export function GrowthDeltaCard({ change, headingLevel = 3 }) {
  const H = `h${headingLevel}`
  return (
    <Card as="article" className="space-y-2 p-4" data-testid="growth-change">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <H className="text-sm font-semibold text-prism-ink">{change.name || 'Capability'}</H>
        <StatusChip tone={TONE[change.direction]} label={GROWTH_COPY.directions[change.direction]} />
      </div>
      <p className="text-sm text-prism-ink">
        <span className="sr-only">Level changed from </span>{change.from.label}
        <span aria-hidden="true"> → </span><span className="sr-only"> to </span>{change.to.label}
      </p>
      <p className="text-xs text-prism-ink-subtle">{GROWTH_COPY.uncertainty}</p>
    </Card>
  )
}

export default GrowthDeltaCard
