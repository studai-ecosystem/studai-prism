import { Link, useNavigate } from 'react-router-dom'
import { useDevelopmentPlan, useGrowth } from '../../student/hooks.js'
import { usePracticeStarters } from '../hooks.js'
import { ReassessmentEntry } from '../../growth/components/ReassessmentEntry.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { InlineNotice } from '../../../components/ui/Notice.jsx'
import { DEVELOPMENT_COPY } from '../../../lib/copy/student.js'

// After practice feedback (P6.5): a calm reflection prompt, the criteria that
// were observed in this attempt (with the learner's own words), then one next
// action — another mission, a fresh uncoached challenge, or back to history.
// No points, levels, streaks or celebration.
export function MissionNextSteps({ result, missionId, missionPath, assessmentsPath, reflectionPrompt = null, capability = null, uncoached = false, devPath = null }) {
  const plan = useDevelopmentPlan()
  const growth = useGrowth()
  const starters = usePracticeStarters()
  const navigate = useNavigate()
  const copy = DEVELOPMENT_COPY.player
  const next = plan.data
    ? [...plan.data.missions, ...plan.data.catalogue].find((m) => m.id !== missionId && m.latestAttempt?.status !== 'EVALUATED')
    : null
  const evaluated = result.status === 'EVALUATED'
  const observed = result.criteria.filter((c) => c.result === 'OBSERVED')
  const partial = evaluated && result.counts.demonstrated < result.counts.total
  const allowance = plan.data?.allowance || { kind: 'UNLIMITED' }
  const exhausted = allowance.kind === 'BOUNDED' && allowance.remaining <= 0
  const freshChallenge = () => starters.challenge.mutate({ capabilityId: capability.id }, {
    onSuccess: ({ attempt, missionId: mid }) => navigate(`${devPath}/missions/${mid}?attempt=${encodeURIComponent(attempt.id)}`),
  })
  return (
    <section aria-labelledby="mission-next-title" className="mt-4 space-y-4 border-t border-prism-border pt-4" data-testid="mission-next-steps">
      <h3 id="mission-next-title" className="text-base font-semibold text-prism-ink">What to do next</h3>
      {reflectionPrompt && (
        <div data-testid="reflection-prompt">
          <p className="text-sm font-semibold text-prism-ink">{copy.reflect}</p>
          <p className="text-sm text-prism-ink-muted">{reflectionPrompt}</p>
        </div>
      )}
      <div data-testid="observed-criteria">
        <p className="text-sm text-prism-ink">
          <span className="font-semibold">{copy.observedTitle}:</span>
          {evaluated ? <> {result.counts.demonstrated} of {result.counts.total} {result.counts.total === 1 ? 'behaviour' : 'behaviours'} in this attempt{uncoached ? ', in a fresh situation without hints' : ''}.</> : <> {copy.unavailable}</>}
        </p>
        {observed.length > 0 ? (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-prism-ink">
            {observed.map((c) => <li key={c.criterionId}>{c.description}{c.quote ? <> — <q className="text-prism-ink-muted">{c.quote}</q></> : null}</li>)}
          </ul>
        ) : (evaluated && <p className="text-sm text-prism-ink-muted">Nothing was observed in this attempt yet. That is where the next attempt starts.</p>)}
        {partial && <p className="mt-1 text-sm text-prism-ink-muted">Reflect: pick one behaviour that was not observed and decide what you would change.</p>}
      </div>
      <div className="space-y-2" data-testid="next-action">
        <p className="text-sm font-semibold text-prism-ink">{copy.nextTitle}</p>
        <p className="text-sm text-prism-ink">
          Try again, or move on.
          {next && <> A mission you have not completed: <Link to={missionPath(next.id)} className="font-medium text-prism-accent-strong underline">{next.title}</Link>.</>}
        </p>
        {capability?.id && devPath && !uncoached && (
          <div className="space-y-2">
            <Button variant="secondary" size="sm" onClick={freshChallenge} loading={starters.challenge.isPending} disabled={exhausted}>{copy.freshChallengeNext}</Button>
            <p className="text-xs text-prism-ink-subtle">{DEVELOPMENT_COPY.missions.freshChallengeHelp}</p>
            {starters.challenge.error && <div role="alert"><InlineNotice tone="blocked">{starters.challenge.error.message}</InlineNotice></div>}
          </div>
        )}
      </div>
      <ReassessmentEntry reassessments={growth.data?.reassessments} assessmentsPath={assessmentsPath} />
    </section>
  )
}

export default MissionNextSteps
