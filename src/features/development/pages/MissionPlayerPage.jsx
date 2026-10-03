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
  // `?attempt=<id>` opens an attempt that was just created elsewhere (replay
  // or fresh challenge); otherwise the mission's open attempt is resumed.
  const requestedAttempt = searchParams.get('attempt') && ORIGIN_ID.test(searchParams.get('attempt')) ? searchParams.get('attempt') : null
  const [attemptId, setAttemptId] = useState(requestedAttempt)
  const attemptQuery = useMissionAttempt(attemptId)
  const actions = useMissionActions(missionId)
  const [work, setWork] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error | conflict | closed
  const [closedMessage, setClosedMessage] = useState(null)
  const [hintsOpen, setHintsOpen] = useState(false)
  const [examplesOpen, setExamplesOpen] = useState(false)
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
  // A fresh challenge or replay may land on the SAME mission route with a
  // new ?attempt=; follow it instead of staying on the previous attempt.
  // Only a CHANGE of the requested id counts, so a retry started on this
  // page (which does not rewrite the URL) is never undone.
  const lastRequested = useRef(requestedAttempt)
  useEffect(() => {
    if (requestedAttempt && requestedAttempt !== lastRequested.current) {
      lastRequested.current = requestedAttempt
      setAttemptId(requestedAttempt)
      setDirty(false)
      setSaveState('idle')
      setWork(null)
      workRef.current = null
    }
  }, [requestedAttempt])
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
  const uncoached = attempt?.assistance?.mode === 'UNCOACHED'
  // The scene this attempt runs: a fresh challenge may use the mission's
  // unfamiliar-setting version, so the attempt's scene wins over the base.
  const scene = attempt?.scene || { setting: mission.scenario.setting, objective: mission.scenario.objective, constraints: mission.constraints, situationFacts: mission.situationFacts || [] }
  const transfer = attempt?.variant === 'TRANSFER'
  const examplesAvailable = attempt ? (attempt.examplesAvailable || 0) : (mission.examplesAvailable || 0)
  const allowance = missionQuery.data.allowance || { kind: 'UNLIMITED' }
  const saveText = { idle: dirty ? 'Unsaved changes' : '', saving: 'Saving…', saved: 'All changes saved', error: 'Not saved — check your connection. Your work is kept on this page.', conflict: '', closed: '' }[saveState]
  const campusName = active.type === 'CAMPUS_STUDENT' ? (active.organizationName || 'Your institution') : null
  const originKind = origin?.kind || attempt?.origin?.kind || null
  const showExamples = () => {
    setExamplesOpen(true)
    if (attempt && (attempt.examples || []).length === 0 && examplesAvailable > 0 && !actions.examples.isPending) actions.examples.mutate({ attemptId: attempt.id })
  }

  return (
    <div className="space-y-6">
      {header}
      <PracticeLabel variant="band" />
      {originKind === 'ASSESSMENT_MOMENT' && (
        <p className="text-sm text-prism-ink-muted" data-testid="practice-origin">
          {copy.originNote} <Link to={historyPath} className="font-semibold underline">{copy.backToHistory}</Link>
        </p>
      )}
      {uncoached && (
        <div data-testid="uncoached-note"><InlineNotice tone="neutral">{copy.uncoachedNote}</InlineNotice></div>
      )}
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-prism-ink-muted" data-testid="first-view-facts">
        {mission.targetCapability.name && <div><dt className="sr-only">{copy.firstView.target}</dt><dd>Focus: {mission.targetCapability.name}</dd></div>}
        <div><dt className="sr-only">Duration</dt><dd>{copy.firstView.duration(mission.estimatedMinutes)}</dd></div>
        {mission.mode?.label && <div><dt className="sr-only">Mode</dt><dd>{mission.mode.label}</dd></div>}
        <div><dt className="sr-only">Allowance</dt><dd data-testid="first-view-allowance">{allowance.kind === 'BOUNDED' ? DEVELOPMENT_COPY.missions.allowanceRemaining(allowance.remaining, allowance.total) : copy.firstView.allowanceUnlimited}</dd></div>
        {intervention && <div><dt className="sr-only">Intervention</dt><dd>Part of {intervention.name}{intervention.endsOn ? `, until ${formatDate(intervention.endsOn)}` : ''}</dd></div>}
      </dl>
      {campusName && <p className="text-sm text-prism-ink-muted">{DEVELOPMENT_COPY.missions.campusPrivacy(campusName)}</p>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Panel title={copy.firstView.scene}>
          {transfer && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-prism-ink-muted" data-testid="transfer-note">{copy.transferNote}</p>}
          <p className="text-sm text-prism-ink" data-testid="scene-setting">{scene.setting}</p>
          {attempt?.stimulus?.source === 'ASSESSMENT_MOMENT' && (
            <div className="mt-4 rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-subtle p-3" data-testid="replay-stimulus">
              <h3 className="text-sm font-semibold text-prism-ink">{copy.stimulusTitle}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-prism-ink">{attempt.stimulus.text}</p>
              <p className="mt-2 text-xs text-prism-ink-subtle">{copy.stimulusNote}</p>
            </div>
          )}
          <h3 className="mt-4 text-sm font-semibold text-prism-ink">{copy.firstView.task}</h3>
          <p className="mt-1 text-sm text-prism-ink" data-testid="scene-objective">{scene.objective}</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-prism-ink-muted">{mission.instructions.map((i) => <li key={i}>{i}</li>)}</ol>
          {(scene.situationFacts?.length || scene.constraints.length) > 0 && (
            <>
              <h3 className="mt-4 text-sm font-semibold text-prism-ink">{copy.firstView.facts}</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-prism-ink-muted">{(scene.situationFacts?.length ? scene.situationFacts : scene.constraints).map((c) => <li key={c}>{c}</li>)}</ul>
            </>
          )}
          {mission.whyItMatters && (
            <>
              <h3 className="mt-4 text-sm font-semibold text-prism-ink">{copy.whyItMatters}</h3>
              <p className="mt-1 text-sm text-prism-ink-muted">{mission.whyItMatters}</p>
            </>
          )}
          <details className="mt-4" data-testid="what-is-checked">
            <summary className="cursor-pointer text-sm font-semibold text-prism-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-prism-accent">{copy.whatIsChecked}</summary>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-prism-ink-muted">{mission.whatIsChecked.map((c) => <li key={c.criterionId}>{c.description}</li>)}</ul>
          </details>
        </Panel>

        <section aria-labelledby="mission-work-title" className="min-w-0 space-y-4">
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
                  {mission.hintCount > 0 && !uncoached && <Button variant="secondary" onClick={() => setHintsOpen(true)}>Hints ({attempt.hints.length} of {mission.hintCount} shown)</Button>}
                  {examplesAvailable > 0 && !uncoached && <Button variant="secondary" onClick={showExamples} data-testid="examples-action">{copy.examplesAction}</Button>}
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
                    reflectionPrompt={mission.reflectionPrompt || null}
                    capability={mission.targetCapability}
                    uncoached={uncoached}
                    devPath={devPath}
                  />
                  {actions.start.error && <div role="alert" className="mt-3"><InlineNotice tone="blocked">{actions.start.error.message}</InlineNotice></div>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => start(true)} loading={actions.start.isPending}>{copy.retry}</Button>
                    {examplesAvailable > 0 && !uncoached && <Button variant="secondary" onClick={showExamples} data-testid="examples-action">{copy.examplesAction}</Button>}
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

      <Drawer open={examplesOpen} onClose={() => setExamplesOpen(false)} title={copy.examplesTitle}>
        {attempt && (
          <div className="space-y-3" data-testid="examples-drawer">
            <p className="text-sm text-prism-ink-muted">{copy.examplesNote}</p>
            {actions.examples.isPending && <p className="text-sm text-prism-ink-muted" role="status">Loading examples…</p>}
            {actions.examples.error && <div role="alert"><InlineNotice tone="blocked">{actions.examples.error.message}</InlineNotice></div>}
            <ul className="space-y-3">
              {(attempt.examples || []).map((e) => (
                <li key={e.id} className="rounded-[var(--prism-radius-md)] border border-prism-border p-3" data-testid="example-item" data-kind={e.kind}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-prism-ink-muted">{copy.exampleKind[e.kind]}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-prism-ink">{e.text}</p>
                  <p className="mt-1 text-xs text-prism-ink-subtle">{e.note}</p>
                </li>
              ))}
            </ul>
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
