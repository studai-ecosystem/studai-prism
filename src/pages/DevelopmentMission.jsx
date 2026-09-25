// src/pages/DevelopmentMission.jsx — practice mission (legacy /missions
// route). Practice only (spec §16, §33): the server reports exactly which
// deterministic checks ran; there is no rubric level and practice never
// changes formal results.
import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchMission, fetchMissions, submitMissionPractice } from '../api/development.js'
import { PageHeader, Card, Button, Textarea, Callout, Skeleton, LinkButton, StatusChip } from '../components/ui/index.js'
import { ErrorState, EmptyState } from '../components/states/index.js'

const PRACTICE_NOTE = 'Practice only. This never changes your formal assessment results.'

function MissionList() {
  const [state, setState] = useState({ loading: true, missions: [], error: null })
  const load = useCallback(async () => {
    setState({ loading: true, missions: [], error: null })
    try {
      setState({ loading: false, missions: await fetchMissions(), error: null })
    } catch (error) {
      setState({ loading: false, missions: [], error })
    }
  }, [])
  useEffect(() => { load() }, [load])

  if (state.loading) return <Skeleton label="Loading practice missions" />
  if (state.error) return <ErrorState title="Practice missions could not be loaded" description={state.error.message} requestId={state.error.requestId} onRetry={load} />
  if (state.missions.length === 0) return <EmptyState title="No practice missions yet" description="Practice missions appear here when they are available." />
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {state.missions.map((m) => (
        <li key={m.mission_id}>
          <Card className="p-4">
            <h2 className="font-semibold text-prism-ink">
              <Link className="hover:underline" to={`/missions/${encodeURIComponent(m.mission_id)}`}>{m.title}</Link>
            </h2>
            {m.estimated_duration_minutes && <p className="mt-1 text-sm text-prism-ink-muted">About {m.estimated_duration_minutes} minutes</p>}
          </Card>
        </li>
      ))}
    </ul>
  )
}

function PracticeResult({ result, onRetry }) {
  const criteria = result.criteria || []
  return (
    <Card as="section" aria-labelledby="result-heading" className="space-y-4 p-5">
      <h2 id="result-heading" className="text-lg font-semibold text-prism-ink">Your practice was received</h2>
      <Callout tone="insufficient" title={result.status === 'INSUFFICIENT_EVIDENCE' ? 'Nothing could be checked yet' : 'Full practice feedback is not available yet'}>
        {result.summary} {PRACTICE_NOTE}
      </Callout>
      {criteria.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-prism-ink">What was checked</h3>
          <ul className="mt-2 space-y-2">
            {criteria.map((c) => (
              <li key={c.criterionId} className="flex flex-wrap items-center justify-between gap-2 text-sm text-prism-ink">
                <span>{c.description}</span>
                <StatusChip tone={c.observed ? 'positive' : 'insufficient'} label={c.observed ? 'Present' : 'Not found'} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={onRetry}>Practise again</Button>
        <LinkButton to="/missions" variant="ghost">All practice missions</LinkButton>
      </div>
    </Card>
  )
}

function MissionPlayer({ missionId }) {
  const [state, setState] = useState({ loading: true, mission: null, error: null })
  const [response, setResponse] = useState('')
  const [submit, setSubmit] = useState({ busy: false, result: null, error: null })

  const load = useCallback(async () => {
    setState({ loading: true, mission: null, error: null })
    try {
      setState({ loading: false, mission: await fetchMission(missionId), error: null })
    } catch (error) {
      setState({ loading: false, mission: null, error })
    }
  }, [missionId])
  useEffect(() => { load() }, [load])

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!response.trim()) return
    setSubmit({ busy: true, result: null, error: null })
    try {
      const result = await submitMissionPractice(missionId, { hypothesis: response })
      setSubmit({ busy: false, result, error: null })
    } catch (error) {
      setSubmit({ busy: false, result: null, error })
    }
  }

  if (state.loading) return <Skeleton label="Loading the practice mission" />
  if (state.error) {
    return state.error.status === 404
      ? <ErrorState title="Mission not found" description="This practice mission does not exist or is no longer available." action={<LinkButton to="/missions">All practice missions</LinkButton>} />
      : <ErrorState title="This mission could not be loaded" description={state.error.message} requestId={state.error.requestId} onRetry={load} />
  }
  const m = state.mission
  if (!m) return <ErrorState title="Mission not found" action={<LinkButton to="/missions">All practice missions</LinkButton>} />
  const briefing = m.challenge_briefing || {}
  const focus = m.success_criteria?.required_observable_behaviors || []

  return (
    <div className="space-y-6">
      <PageHeader title={m.title} description={m.estimated_duration_minutes ? `About ${m.estimated_duration_minutes} minutes. ${PRACTICE_NOTE}` : PRACTICE_NOTE} />
      {submit.result ? (
        <PracticeResult result={submit.result} onRetry={() => setSubmit({ busy: false, result: null, error: null })} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card as="section" aria-labelledby="brief-heading" className="space-y-3 p-5 lg:col-span-1">
            <h2 id="brief-heading" className="text-lg font-semibold text-prism-ink">Brief</h2>
            {briefing.context && <p className="text-sm text-prism-ink">{briefing.context}</p>}
            {briefing.objective && <p className="text-sm text-prism-ink-muted"><span className="font-medium text-prism-ink">Your task: </span>{briefing.objective}</p>}
            {focus.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-prism-ink">What to practise</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-prism-ink-muted">
                  {focus.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </div>
            )}
          </Card>
          <Card as="form" onSubmit={onSubmit} aria-labelledby="work-heading" className="space-y-4 p-5 lg:col-span-2">
            <h2 id="work-heading" className="text-lg font-semibold text-prism-ink">Your response</h2>
            <Textarea
              id="mission-response"
              label="Your hypothesis or plan"
              hint="For example: If we change …, then … will happen, because …"
              rows={6}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
            />
            {submit.error && (
              <Callout tone="blocked" role="alert" title="Not sent">
                {submit.error.message} Your response is still here — try again.
              </Callout>
            )}
            <Button type="submit" disabled={!response.trim()} loading={submit.busy} loadingLabel="Sending…">Submit practice</Button>
          </Card>
        </div>
      )}
    </div>
  )
}

export default function DevelopmentMission() {
  const { missionId } = useParams()
  return (
    <div className="prism-app min-h-screen">
      <main id="main" className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        {missionId ? (
          <MissionPlayer missionId={missionId} />
        ) : (
          <>
            <PageHeader title="Practice missions" description={PRACTICE_NOTE} />
            <MissionList />
          </>
        )}
      </main>
    </div>
  )
}
