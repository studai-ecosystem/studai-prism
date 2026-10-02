import { Link } from 'react-router-dom'
import { Card } from '../ui/Card.jsx'
import { Badge } from '../ui/Badge.jsx'
import { PracticeLabel } from './PracticeLabel.jsx'

// A practice mission in a list (spec §16.4). Practice is always labelled as
// such; no levels, points or "achieved" badges. P6: DRAFT content carries a
// visible "Draft content" label and the assistance mode is named.
export function MissionCard({ mission, to, headingLevel = 3 }) {
  const H = `h${headingLevel}`
  const draft = mission.status === 'DRAFT'
  const guided = !mission.modes || mission.modes.includes('GUIDED')
  return (
    <Card as="article" className="space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <H className="text-sm font-semibold text-prism-ink">{mission.displayCode ? <span className="mr-1 font-mono text-xs text-prism-ink-subtle">{mission.displayCode}</span> : null}{mission.title}</H>
        <span className="flex flex-wrap items-center gap-1.5">
          {draft && <Badge tone="partial" data-testid="draft-label">Draft content</Badge>}
          {guided && <Badge tone="neutral" data-testid="mode-badge">Guided</Badge>}
          <PracticeLabel />
        </span>
      </div>
      {mission.targetCapabilityName && <p className="text-sm text-prism-ink-muted">Focus: {mission.targetCapabilityName}</p>}
      {mission.estimatedMinutes && <p className="text-xs text-prism-ink-subtle">About {mission.estimatedMinutes} minutes</p>}
      {to && <Link to={to} className="text-sm font-medium text-prism-accent-strong underline">Open mission<span className="sr-only">: {mission.title}</span></Link>}
    </Card>
  )
}

export default MissionCard
