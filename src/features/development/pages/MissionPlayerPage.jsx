// Mission player (spec §16.4): concise scenario, clear deliverable, artifact
// workspace, optional hint drawer, autosave, submit review, criterion
// feedback and retry. Practice only — no levels, points or badges.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Panel } from '../../../components/ui/Card.jsx'
import { PracticeLabel } from '../../../components/missions/PracticeLabel.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { Drawer } from '../../../components/ui/Drawer.jsx'
import { Modal } from '../../../components/ui/Modal.jsx'
import { InlineNotice } from '../../../components/ui/Notice.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { queryStateView, formatDate } from '../../student/QueryState.jsx'
import { DEVELOPMENT_COPY } from '../../../lib/copy/student.js'
import { useMission, useMissionAttempt, useMissionActions } from '../hooks.js'
import { MissionArtifactEditor } from '../components/MissionArtifactEditor.jsx'
import { MissionFeedback } from '../components/MissionFeedback.jsx'
import { MissionNextSteps } from '../components/MissionNextSteps.jsx'

const SAVE_DELAY_MS = 1200
const ORIGIN_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/

// Why this practice was started (P2.8). `?source=<sessionId>&moment=<id>`
// names one approved assessment moment by id; anything else is the learner's
// own goal (the server default, so nothing is sent). The attempt receives
// these identifiers only.
function originFrom(params) {
  const sessionId = params.get('source') || ''
  const opportunityId = params.get('moment') || ''
  if (ORIGIN_ID.test(sessionId) && ORIGIN_ID.test(opportunityId)) return { kind: 'ASSESSMENT_MOMENT', sessionId, opportunityId }
  return null
}

export default function MissionPlayerPage() {
  const { missionId } = useParams()
  const [searchParams] = useSearchParams()
  const origin = useMemo(() => originFrom(searchParams), [searchParams])
  const { active } = useWorkspace()
  const copy = DEVELOPMENT_COPY.player
  const devPath = active.type === 'CAMPUS_STUDENT' ? `/app/campus/${active.organizationId}/development` : '/app/development'
  const assessmentsPath = active.type === 'CAMPUS_STUDENT' ? `/app/campus/${active.organizationId}/assignments` : '/app/assessments'
  const historyPath = `${assessmentsPath}?tab=history`
  const missionQuery = useMission(missionId)
  const [attemptId, setAttemptId] = useState(null)
  const attemptQuery = useMissionAttempt(attemptId)
  const actions = useMissionActions(missionId)
  const [work, setWork] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error | conflict | closed
  const [closedMessage, setClosedMessage] = useState(null)
  const [hintsOpen, setHintsOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [notSubmitted, setNotSubmitted] = useState(false)
  const feedbackRef = useRef(null)
  const hintsRef = useRef(null)
  const workRef = useRef(null)
  const editSeq = useRef(0)
  const attempt = attemptQuery.data

  useEffect(() => {
    if (missionQuery.data?.openAttemptId && !attemptId) setAttemptId(missionQuery.data.openAttemptId)
  }, [missionQuery.data, attemptId])
  // Adopt the server copy when an attempt loads (never over unsaved edits).
  useEffect(() => {
    if (attempt && !dirty) { setWork(attempt.work); workRef.current = attempt.work }
  }, [attempt, dirty])

  const save = useCallback(async () => {
    if (!attempt || attempt.status !== 'IN_PROGRESS') return true
    setSaveState('saving')
    const seq = editSeq.current
    try {
      await actions.save.mutateAsync({ attemptId: attempt.id, version: attempt.version, work: workRef.current })
      // Edits typed while saving stay dirty and are saved next.
      if (editSeq.current === seq) setDirty(false)
      setSaveState('saved')
      return true
    } catch (err) {
      // A version conflict carries the saved copy; any other conflict means
      // the attempt can no longer change (for example, the intervention ended).
      if (err.code === 'CONFLICT' && !err.details?.current) { setClosedMessage(err.message); setSaveState('closed'); return 'closed' }
      setSaveState(err.code === 'CONFLICT' ? 'conflict' : 'error')
      return false
    }
  }, [attempt, actions.save])

  useEffect(() => {
    if (!dirty || saveState === 'saving' || saveState === 'conflict' || saveState === 'closed') return undefined
    const t = setTimeout(() => { save() }, SAVE_DELAY_MS)
    return () => clearTimeout(t)
  }, [dirty, work, save, saveState])

  function change(artifactId, value) {
    const next = { ...workRef.current, [artifactId]: value }
    workRef.current = next
    editSeq.current += 1
    setWork(next)
    setDirty(true)
    if (saveState === 'saved' || saveState === 'error') setSaveState('idle')
  }

  async function start(retry = false) {
    const a = await actions.start.mutateAsync({ retry, origin }).catch(() => null)
    if (!a) return // the error is shown next to the button that was pressed
    setDirty(false)
    setSaveState('idle')
    setNotSubmitted(false)
    setWork(a.work)
    workRef.current = a.work
    setAttemptId(a.id)
    requestAnimationFrame(() => document.getElementById('mission-work-title')?.focus())
  }

  async function submit() {
    setNotSubmitted(false)
    const saved = dirty ? await save() : true
    if (saved !== true) { setConfirmOpen(false); if (saved !== 'closed') setNotSubmitted(true); return }
    await actions.submit.mutateAsync(attempt.id).catch(() => null)
    setConfirmOpen(false)
    requestAnimationFrame(() => feedbackRef.current?.focus())
  }

  // A new hint takes focus, so keyboard and screen-reader users land on it.
  function showHint() {
    actions.hint.mutate({ attemptId: attempt.id, version: attempt.version }, {
      onSuccess: () => requestAnimationFrame(() => hintsRef.current?.lastElementChild?.focus()),
    })
  }

  async function reloadSaved() {
    setDirty(false)
    setSaveState('idle')
    const r = await attemptQuery.refetch()
    if (r.data) { setWork(r.data.work); workRef.current = r.data.work }
  }

  const title = missionQuery.data?.mission.title || 'Practice mission'
  const header = (
    <PageHeader
      title={title}
      description={missionQuery.data ? `${copy.practiceLabel} · about ${missionQuery.data.mission.estimatedMinutes} minutes` : undefined}
      context={active}
      breadcrumbs={[{ label: 'Development', to: devPath }, { label: title }]}
    />
  )
  const state = queryStateView(missionQuery, {
    label: 'Loading the mission',
    homeTo: devPath,
    notFound: { title: 'Mission not available', description: 'This mission does not exist or is not assigned in this workspace.', homeLabel: 'Back to development' },
  })
  if (state) return <div>{header}{state}</div>
  const { mission, intervention } = missionQuery.data
  const pastAttempts = missionQuery.data.pastAttempts.filter((p) => p.id !== attempt?.id)
  const inProgress = attempt?.status === 'IN_PROGRESS' && saveState !== 'closed'
  const saveText = { idle: dirty ? 'Unsaved changes' : '', saving: 'Saving…', saved: 'All changes saved', error: 'Not saved — check your connection. Your work is kept on this page.', conflict: '', closed: '' }[saveState]
  const campusName = active.type === 'CAMPUS_STUDENT' ? (active.organizationName || 'Your institution') : null

  return (
    <div className="space-y-6">
      {header}
      <PracticeLabel variant="band" />
      {origin?.kind === 'ASSESSMENT_MOMENT' && (
        <p className="text-sm text-prism-ink-muted" data-testid="practice-origin">
          {copy.originNote} <Link to={historyPath} className="font-semibold underline">{copy.backToHistory}</Link>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {mission.targetCapability.name && <span className="text-sm text-prism-ink-muted">Focus: {mission.targetCapability.name}</span>}
        {intervention && <span className="text-sm text-prism-ink-muted">· Part of {intervention.name}{intervention.endsOn ? `, until ${formatDate(intervention.endsOn)}` : ''}</span>}
      </div>
      {campusName && <p className="text-sm text-prism-ink-muted">{DEVELOPMENT_COPY.missions.campusPrivacy(campusName)}</p>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Panel title="The situation">
          <p className="text-sm text-prism-ink">{mission.scenario.setting}</p>
          <h3 className="mt-4 text-sm font-semibold text-prism-ink">Your task</h3>
          <p className="mt-1 text-sm text-prism-ink">{mission.scenario.objective}</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-prism-ink-muted">{mission.instructions.map((i) => <li key={i}>{i}</li>)}</ol>
          {mission.constraints.length > 0 && (
            <>
              <h3 className="mt-4 text-sm font-semibold text-prism-ink">Constraints</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-prism-ink-muted">{mission.constraints.map((c) => <li key={c}>{c}</li>)}</ul>
            </>
          )}
          <h3 className="mt-4 text-sm font-semibold text-prism-ink">{copy.whatIsChecked}</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-prism-ink-muted">{mission.whatIsChecked.map((c) => <li key={c.criterionId}>{c.description}</li>)}</ul>
        </Panel>

        <section aria-labelledby="mission-work-title" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="mission-work-title" tabIndex={-1} className="text-lg font-semibold text-prism-ink focus:outline-none">Your work</h2>
            {inProgress && <span role="status" aria-live="polite" className="text-sm text-prism-ink-muted">{saveText}</span>}
          </div>
          {!attempt ? (
            <Panel>
              <p className="text-sm text-prism-ink-muted">{DEVELOPMENT_COPY.missions.practiceNote}</p>
              {actions.start.error && <div role="alert" className="mt-3"><InlineNotice tone="blocked">{actions.start.error.message}</InlineNotice></div>}
              <Button className="mt-4" onClick={() => start(false)} loading={actions.start.isPending || (attemptQuery.isFetching && Boolean(attemptId))}>
                {pastAttempts.length ? 'Start a new attempt' : 'Start mission'}
              </Button>
            </Panel>
          ) : (
            <>
              {mission.artifacts.map((a) => (
                <Panel key={a.id}>
                  <MissionArtifactEditor artifact={a} value={work?.[a.id]} disabled={!inProgress} onChange={(v) => change(a.id, v)} />
                </Panel>
              ))}
              {saveState === 'closed' && <div role="alert"><InlineNotice tone="partial">{closedMessage}</InlineNotice></div>}
              {saveState === 'conflict' && (
                <InlineNotice tone="partial">
                  This attempt was changed in another tab or device. <button type="button" className="font-semibold underline" onClick={reloadSaved}>Load the saved version</button>
                </InlineNotice>
              )}
              {inProgress && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => setConfirmOpen(true)} disabled={actions.submit.isPending}>Submit for feedback</Button>
                  {mission.hintCount > 0 && <Button variant="secondary" onClick={() => setHintsOpen(true)}>Hints ({attempt.hints.length} of {mission.hintCount} shown)</Button>}
                </div>
              )}
              <div role="alert">
                {notSubmitted && <InlineNotice tone="blocked">Not submitted — your latest changes could not be saved. Check your connection and try again.</InlineNotice>}
                {actions.submit.error && <InlineNotice tone="blocked">Not submitted — {actions.submit.error.message}</InlineNotice>}
              </div>
              {attempt.result && (
                <Panel>
                  <MissionFeedback ref={feedbackRef} result={attempt.result} />
                  <MissionNextSteps
                    result={attempt.result}
                    missionId={missionId}
                    missionPath={(id) => `${devPath}/missions/${id}`}
                    assessmentsPath={assessmentsPath}
                  />
                  {actions.start.error && <div role="alert" className="mt-3"><InlineNotice tone="blocked">{actions.start.error.message}</InlineNotice></div>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => start(true)} loading={actions.start.isPending}>{copy.retry}</Button>
                    <LinkButton to={devPath}>Back to development</LinkButton>
                    <LinkButton to={historyPath} variant="secondary">{copy.backToHistory}</LinkButton>
                  </div>
                </Panel>
              )}
            </>
          )}
          {pastAttempts.length > 0 && (
            <Panel title="Earlier attempts" headingLevel={3}>
              <ul className="space-y-1 text-sm">
                {pastAttempts.map((p) => <li key={p.id}>{formatDate(p.submittedAt) || 'Submitted'}: {p.summary || 'Feedback not available'}</li>)}
              </ul>
            </Panel>
          )}
        </section>
      </div>

      <Drawer open={hintsOpen} onClose={() => setHintsOpen(false)} title="Hints">
        {attempt && (
          <div className="space-y-3">
            <p className="text-sm text-prism-ink-muted">Hints are optional. Using them does not change your feedback.</p>
            {attempt.hints.length === 0 && <p className="text-sm text-prism-ink-muted">No hints shown yet.</p>}
            <ol ref={hintsRef} className="list-decimal space-y-2 pl-5 text-sm text-prism-ink" aria-live="polite">{attempt.hints.map((h) => <li key={h} tabIndex={-1} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-prism-accent">{h}</li>)}</ol>
            {attempt.hintsRemaining > 0 && (
              <Button variant="secondary" loading={actions.hint.isPending} onClick={showHint}>Show a hint</Button>
            )}
            {actions.hint.error && <div role="alert"><InlineNotice tone="blocked">{actions.hint.error.message}</InlineNotice></div>}
          </div>
        )}
      </Drawer>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={copy.submitConfirmTitle}
        description={copy.submitConfirmBody}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Keep working</Button>
            <Button onClick={submit} loading={actions.submit.isPending || saveState === 'saving'} loadingLabel="Checking…">Submit</Button>
          </>
        )}
      />
    </div>
  )
}
