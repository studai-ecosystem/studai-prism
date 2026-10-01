import { Link } from 'react-router-dom'
import { useDevelopmentPlan, useGrowth } from '../../student/hooks.js'
import { ReassessmentEntry } from '../../growth/components/ReassessmentEntry.jsx'

// After practice feedback: what was observed, one thing to reflect on, and the
// next actions. Calm and plain: no points, levels, streaks or celebration.
export function MissionNextSteps({ result, missionId, missionPath, assessmentsPath }) {
  const plan = useDevelopmentPlan()
  const growth = useGrowth()
  const next = plan.data
    ? [...plan.data.missions, ...plan.data.catalogue].find((m) => m.id !== missionId && m.latestAttempt?.status !== 'EVALUATED')
    : null
  const evaluated = result.status === 'EVALUATED'
  const partial = evaluated && result.counts.demonstrated < result.counts.total
  return (
    <section aria-labelledby="mission-next-title" className="mt-4 space-y-3 border-t border-prism-border pt-4" data-testid="mission-next-steps">
      <h3 id="mission-next-title" className="text-base font-semibold text-prism-ink">What to do next</h3>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-prism-ink">
        {evaluated && <li>What was observed: {result.counts.demonstrated} of {result.counts.total} {result.counts.total === 1 ? 'behaviour' : 'behaviours'} in this attempt.</li>}
        {partial && <li className="text-prism-ink-muted">Reflect: pick one behaviour that was not observed and decide what you would change.</li>}
        <li>
          Then try again, or move on.
          {next && <> A mission you have not completed: <Link to={missionPath(next.id)} className="font-medium text-prism-accent-strong underline">{next.title}</Link>.</>}
        </li>
      </ol>
      <ReassessmentEntry reassessments={growth.data?.reassessments} assessmentsPath={assessmentsPath} />
    </section>
  )
}

export default MissionNextSteps