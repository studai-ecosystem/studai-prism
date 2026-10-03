import { Link } from 'react-router-dom'
import { Card } from '../ui/Card.jsx'
import { Badge } from '../ui/Badge.jsx'
import { PracticeLabel } from './PracticeLabel.jsx'
import { DEVELOPMENT_COPY } from '../../lib/copy/student.js'

// A practice mission in a list (spec §16.4; P6.1). Practice is always
// labelled as such; no levels, points or "achieved" badges. The card states
// the facts a learner needs before starting: target behaviour / family, the
// situation in one line, suggested minutes (untimed), supported mode and
// language, publication availability (Reviewed / Draft) and the start action.
// The remaining allowance is shown once above the catalogue, exactly, when
// it is bounded (DevelopmentPage).
export function MissionCard({ mission, to, headingLevel = 3 }) {
  const H = `h${headingLevel}`
  const copy = DEVELOPMENT_COPY.missions
  const availability = mission.availability || (mission.status === 'DRAFT' ? 'DRAFT' : mission.status === 'PUBLISHED' ? 'REVIEWED' : null)
  const guided = !mission.modes || mission.modes.includes('GUIDED')
  const behaviours = (mission.behaviourIds || []).map((b) => b.toLowerCase().replace(/_/g, ' '))
  return (
    <Card as="article" className="space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <H className="text-sm font-semibold text-prism-ink">{mission.displayCode ? <span className="mr-1 font-mono text-xs text-prism-ink-subtle">{mission.displayCode}</span> : null}{mission.title}</H>
        <span className="flex flex-wrap items-center gap-1.5">
          {availability === 'DRAFT' && <Badge tone="partial" data-testid="draft-label">{copy.draftLabel}</Badge>}
          {availability === 'REVIEWED' && <Badge tone="positive" data-testid="reviewed-label">{copy.availability.REVIEWED}</Badge>}
          {guided && <Badge tone="neutral" data-testid="mode-badge">{copy.guided}</Badge>}
          <PracticeLabel />
        </span>
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
        {mission.targetCapabilityName && (
          <>
            <dt className="text-prism-ink-subtle">{copy.behavioursLabel}</dt>
            <dd className="text-prism-ink" data-testid="card-target">{mission.targetCapabilityName}{behaviours.length ? <span className="text-prism-ink-muted"> · {behaviours.join(', ')}</span> : null}</dd>
          </>
        )}
        {mission.situation && (
          <>
            <dt className="text-prism-ink-subtle">{copy.situationLabel}</dt>
            <dd className="text-prism-ink-muted" data-testid="card-situation">{mission.situation}</dd>
          </>
        )}
      </dl>
      <p className="text-xs text-prism-ink-subtle" data-testid="card-facts">
        {mission.estimatedMinutes ? <>About {mission.estimatedMinutes} minutes{mission.untimed === false ? '' : `, ${copy.untimedNote}`}</> : null}
        {mission.mode?.label ? <> · {mission.mode.label}</> : null}
        {mission.hasTransfer ? <> · {copy.freshSetting}</> : null}
      </p>
      {to && <Link to={to} className="text-sm font-medium text-prism-accent-strong underline">{copy.startAction}<span className="sr-only">: {mission.title}</span></Link>}
    </Card>
  )
}

export default MissionCard