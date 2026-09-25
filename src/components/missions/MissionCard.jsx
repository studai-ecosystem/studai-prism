import { Link } from 'react-router-dom'
import { Card } from '../ui/Card.jsx'
import { Badge } from '../ui/Badge.jsx'

// A practice mission in a list (spec §16.4). Practice is always labelled as
// such; no levels, points or "achieved" badges.
export function MissionCard({ mission, to, headingLevel = 3 }) {
  const H = `h${headingLevel}`
  return (
    <Card as="article" className="space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <H className="text-sm font-semibold text-prism-ink">{mission.title}</H>
        <Badge tone="neutral">Practice</Badge>
      </div>
      {mission.targetCapabilityName && <p className="text-sm text-prism-ink-muted">Focus: {mission.targetCapabilityName}</p>}
      {mission.estimatedMinutes && <p className="text-xs text-prism-ink-subtle">About {mission.estimatedMinutes} minutes</p>}
      {to && <Link to={to} className="text-sm font-medium text-prism-accent-strong underline">Open mission<span className="sr-only">: {mission.title}</span></Link>}
    </Card>
  )
}

export default MissionCard
