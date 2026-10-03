// /app/assessment/:sessionId — Assessment Workspace V3 (spec §12). Everything
// comes from the server contract: scenario, people, work materials, the next
// prompt and the clock. Answers and work are saved idempotently; a refresh or
// a dropped connection resumes from the server; nothing is ever generated on
// the client (spec §12.2, §40 — no fallback dialogue).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { WifiOff } from 'lucide-react'
import { AssessmentShell } from '../../../layouts/AssessmentShell.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useFeatureFlags } from '../../../app/providers/FeatureFlagProvider.jsx'
import { newIdempotencyKey } from '../../../api/client.js'
import { Skeleton } from '../../../components/ui/Skeleton.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { Callout, InlineNotice } from '../../../components/ui/Notice.jsx'
import { SegmentedControl } from '../../../components/ui/SegmentedControl.jsx'
import { DocumentTitle } from '../../../components/ui/DocumentTitle.jsx'
import { ErrorState, UnauthorizedState } from '../../../components/states/index.js'
import { track } from '../../../lib/telemetry.js'
import { useAssessmentSession } from '../hooks/useAssessmentSession.js'
import { useAssessmentClock, warningsForPolicy } from '../hooks/useAssessmentClock.js'
import { useAssessmentAutosave } from '../hooks/useAssessmentAutosave.js'
import { createArtifactStore } from '../state/artifactStore.js'
import { sendSessionMessage, saveSessionArtifact, finishSession, beginSession } from '../api/assessmentSessionApi.js'
import { ScenarioIntroDialog } from '../components/ScenarioIntroDialog.jsx'
import { AssessmentHeader } from '../components/AssessmentHeader.jsx'
import { ConversationPane } from '../components/ConversationPane.jsx'
import { ResponseComposer } from '../components/ResponseComposer.jsx'
import { ArtifactPane, materialMissing } from '../components/ArtifactPane.jsx'
import { AssessmentExitDialog } from '../components/AssessmentExitDialog.jsx'
import { SubmissionProgress } from '../components/SubmissionProgress.jsx'
import { overallSaveState } from '../components/SessionSaveStatus.jsx'
import { PLAYER_COPY } from '../../../lib/copy/player.js'
import { assignmentsListPath } from './BriefingPage.jsx'

const RECONNECT_MS = 3000

function useMedia(query, fallback = true) {
  const [match, setMatch] = useState(() => (typeof window === 'undefined' || !window.matchMedia ? fallback : window.matchMedia(query).matches))
  useEffect(() => {
    if (!window.matchMedia) return undefined
    const m = window.matchMedia(query)
    const on = () => setMatch(m.matches)
    on()
    m.addEventListener?.('change', on)
    return () => m.removeEventListener?.('change', on)
  }, [query])
  return match
}

const storageKey = (kind, sessionId) => `prism.${kind}.${sessionId}`
const readPending = (sessionId) => {
  try {
    const p = JSON.parse(sessionStorage.getItem(storageKey('pending', sessionId)) || 'null')
    return p && p.clientEventId && p.text ? { ...p, status: 'FAILED', retryable: true, message: PLAYER_COPY.pendingAfterRefresh } : null
  } catch {
    return null
  }
}

function errorMessage(err) {
  if (err?.code === 'NETWORK_ERROR') return PLAYER_COPY.notSentOffline
  if (err?.code === 'SESSION_TIME_LIMIT') return PLAYER_COPY.timeUp
  if (err?.code === 'ASSESSMENT_COMPLETED') return PLAYER_COPY.alreadyComplete
  return PLAYER_COPY.notSentRetry
}

function finalMessage(err) {
  if (err?.code === 'SESSION_TIME_LIMIT') return PLAYER_COPY.timeUp
  if (err?.code === 'ASSESSMENT_COMPLETED') return PLAYER_COPY.alreadyComplete
  return PLAYER_COPY.notSentFinal
}

export default function AssessmentPlayerPage() {
  const { sessionId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const wsParam = params.get('ws')
  const { workspaces, active, switchTo } = useWorkspace()
  const listPath = assignmentsListPath(active)
  const { loading: meLoading } = useFeatureFlags()
  const target = wsParam ? workspaces.find((w) => w.id === wsParam && w.type === 'CAMPUS_STUDENT') : null
  useEffect(() => {
    if (target && target.id !== active.id) switchTo(target.id)
  }, [target, active.id, switchTo])
  const aligned = !wsParam || Boolean(target && active.id === target.id)

  const session = useAssessmentSession(sessionId, { enabled: aligned && !meLoading })
  const contract = session.data
  const remainingMs = useAssessmentClock(contract?.timing, contract?.clockReceivedAt)
  const accessError = session.error && (session.error.status === 404 || ['FORBIDDEN', 'ENTITLEMENT_REQUIRED', 'ENTITLEMENT_EXPIRED'].includes(session.error.code))

  const store = useMemo(() => createArtifactStore({ save: (artifactId, args) => saveSessionArtifact(sessionId, artifactId, args) }), [sessionId])
  useEffect(() => { if (contract) store.load(contract.artifacts) }, [contract, store])
  const artifactState = useAssessmentAutosave(store)
  const [activeArtifact, setActiveArtifact] = useState(null)

  const [draft, setDraftState] = useState(() => sessionStorage.getItem(storageKey('draft', sessionId)) || '')
  const setDraft = useCallback((v) => {
    setDraftState(v)
    if (v) sessionStorage.setItem(storageKey('draft', sessionId), v)
    else sessionStorage.removeItem(storageKey('draft', sessionId))
  }, [sessionId])
  const [pending, setPendingState] = useState(() => readPending(sessionId))
  const setPending = useCallback((p) => {
    setPendingState(p)
    if (p) sessionStorage.setItem(storageKey('pending', sessionId), JSON.stringify({ clientEventId: p.clientEventId, text: p.text }))
    else sessionStorage.removeItem(storageKey('pending', sessionId))
  }, [sessionId])

  const [connection, setConnection] = useState('ONLINE')
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  const [briefingOpen, setBriefingOpen] = useState(false)
  // P3.7: reopening the Briefing during the timed phase shows the same pinned
  // facts; the clock keeps running. Closing returns focus to the toggle.
  const openBriefing = useCallback(() => {
    setBriefingOpen(true)
    requestAnimationFrame(() => {
      const a = document.activeElement
      if (!a || a === document.body || a.id === 'briefing-toggle') document.getElementById('player-briefing')?.focus()
    })
  }, [])
  const closeBriefing = useCallback(() => {
    setBriefingOpen(false)
    // The toggle stays mounted in the header: return focus to it now, not on
    // a later frame that could steal focus the learner has since moved.
    document.getElementById('briefing-toggle')?.focus()
  }, [])
  // P3.7: the intro is modal until the server records a timed begin. One key per
  // mount so a double click or a retry returns the original timestamps.
  const beginKey = useRef(null)
  const [begin, setBegin] = useState({ busy: false, error: null })
  const notBegun = Boolean(contract) && contract.timing?.begun === false && contract.status !== 'COMPLETED'
  const onBegin = async () => {
    if (begin.busy) return
    beginKey.current ||= newIdempotencyKey('begin')
    setBegin({ busy: true, error: null })
    try {
      await beginSession(sessionId, { idempotencyKey: beginKey.current })
      await session.refetch()
      setBegin({ busy: false, error: null })
      track('assessment_begun', { sessionId })
    } catch (error) {
      setBegin({ busy: false, error })
    }
  }
  const [exit, setExit] = useState({ open: false, submitting: false, error: null, scoring: false })
  const [pane, setPane] = useState('conversation')
  const [smallOk, setSmallOk] = useState(false)
  // Two panes from 1024px; below 768px work-heavy assessments show a notice.
  const wide = useMedia('(min-width: 1024px)')
  const small = !useMedia('(min-width: 768px)')
  const trackedResume = useRef(false)
  const answerRef = useRef(null)
  const [timeNotice, setTimeNotice] = useState('')
  const warned = useRef(new Set())

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  const deliver = useCallback(async (p) => {
    setPending({ ...p, status: 'SENDING' })
    try {
      const result = await sendSessionMessage(sessionId, { clientEventId: p.clientEventId, text: p.text })
      await session.applyTurn(p.text, result)
      setPending(null)
      setConnection('ONLINE')
      // Keyboard focus returns to the answer box for the next turn.
      requestAnimationFrame(() => answerRef.current?.focus())
    } catch (err) {
      const transient = err?.code === 'NETWORK_ERROR' || err?.status >= 500
      const retryable = transient || err?.status === 429
      // Time limit / already complete: editing cannot help — the next step is
      // Finish (or the report), so no edit action is offered.
      const terminal = err?.code === 'SESSION_TIME_LIMIT' || err?.code === 'ASSESSMENT_COMPLETED'
      if (err?.code === 'NETWORK_ERROR') setConnection('INTERRUPTED')
      setPending({ ...p, status: 'FAILED', retryable, editable: !retryable && !terminal, message: retryable ? errorMessage(err) : finalMessage(err) })
      if (terminal) session.refresh()
      requestAnimationFrame(() => (document.getElementById('retry-answer') || document.getElementById('edit-answer') || document.getElementById('finish-assessment') || answerRef.current)?.focus())
    }
  }, [sessionId, session, setPending])

  // A failure that retrying cannot fix: the answer goes back into the box so
  // the candidate can change it or finish; nothing is sent on their behalf.
  const editPending = useCallback(() => {
    if (!pending) return
    setDraft(pending.text)
    setPending(null)
    requestAnimationFrame(() => {
      const box = answerRef.current
      if (!box) return
      box.focus()
      box.setSelectionRange(box.value.length, box.value.length)
    })
  }, [pending, setDraft, setPending])

  const timeUpNow = contract?.status === 'IN_PROGRESS' && !accessError && remainingMs === 0
  useEffect(() => {
    if (!timeUpNow) return
    setTimeNotice(`${PLAYER_COPY.timeUpTitle}. ${PLAYER_COPY.timeUp}`)
    requestAnimationFrame(() => document.getElementById('finish-assessment')?.focus())
  }, [timeUpNow])

  // Screen-reader time warnings (the visible timer is a role="timer").
  const remainingForWarnings = contract?.status === 'IN_PROGRESS' && !accessError ? remainingMs : null
  const policyDurationMs = contract?.timing?.policyDurationMs ?? (contract?.timing?.deadlineAt && contract?.timing?.startedAt ? Date.parse(contract.timing.deadlineAt) - Date.parse(contract.timing.startedAt) : null)
  useEffect(() => {
    if (remainingForWarnings == null) return
    const applicable = warningsForPolicy(policyDurationMs)
    const due = applicable.filter((w) => remainingForWarnings <= w.ms && remainingForWarnings > 0 && !warned.current.has(w.ms))
    if (!due.length) return
    for (const w of applicable) if (remainingForWarnings <= w.ms) warned.current.add(w.ms)
    setTimeNotice(due[due.length - 1].text)
  }, [remainingForWarnings, policyDurationMs])

  // While the connection is interrupted, re-read the session; when it answers,
  // resend the pending answer with the SAME client event id (the server
  // recognises a duplicate and returns the original reply). The loop reads the
  // latest values through a ref so per-second clock renders never reset it.
  const latest = useRef({})
  latest.current = { session, pending, deliver, store }
  useEffect(() => {
    if (connection !== 'INTERRUPTED') return undefined
    let busy = false
    const t = setInterval(async () => {
      if (busy) return
      busy = true
      try {
        const cur = latest.current
        const r = await cur.session.refetch()
        if (!r.error) {
          setConnection('ONLINE')
          const p = latest.current.pending
          if (p?.status === 'FAILED' && p.retryable) latest.current.deliver(p)
          latest.current.store.flushAll()
        }
      } finally {
        busy = false
      }
    }, RECONNECT_MS)
    return () => clearInterval(t)
  }, [connection])

  useEffect(() => {
    if (artifactState.items.some((i) => i.status === 'ERROR' && i.error?.code === 'NETWORK_ERROR')) setConnection('INTERRUPTED')
  }, [artifactState])

  useEffect(() => {
    if (!contract || trackedResume.current) return
    trackedResume.current = true
    if (contract.status === 'IN_PROGRESS' && contract.messages.some((m) => m.isUser)) track('assessment_resumed', { sessionId, scope: contract.scope })
  }, [contract, sessionId])

  useEffect(() => {
    if (exit.scoring && contract?.status === 'COMPLETED' && contract.reportPath) navigate(contract.reportPath)
  }, [exit.scoring, contract, navigate])

  const onSend = () => {
    const text = draft.trim()
    if (!text) return
    setPane('conversation')
    setDraft('')
    deliver({ clientEventId: newIdempotencyKey('evt'), text })
  }

  const finish = async ({ early }) => {
    setExit((e) => ({ ...e, submitting: true, error: null }))
    await store.flushAll()
    if (store.hasUnsaved()) {
      setExit((e) => ({ ...e, submitting: false, error: { message: PLAYER_COPY.unsavedBeforeFinish } }))
      return
    }
    try {
      const { state } = await finishSession(sessionId, { early })
      if (state === 'COMPLETE') track('assessment_completed', { sessionId, scope: contract.scope, outcome: early ? 'EARLY' : 'COMPLETE' })
      setExit({ open: false, submitting: false, error: null, scoring: true })
      await session.refresh()
    } catch (err) {
      setExit((e) => ({ ...e, submitting: false, error: { message: err?.message || PLAYER_COPY.notSubmitted, requestId: err?.requestId || null } }))
    }
  }

  const scopeLabel = contract?.scope === 'SPONSORED' ? `Sponsored by ${contract.sponsorName || 'your institution'}` : 'Personal assessment'
  const inProgress = (contract?.status === 'IN_PROGRESS' || contract?.status === 'ALLOCATED') && !accessError && !notBegun
  const saveState = overallSaveState({ items: artifactState.items, pendingMessage: pending, online: online && connection === 'ONLINE' })
  const header = (
    <AssessmentHeader
      title={contract?.scenario.title || 'Assessment'}
      scopeLabel={contract ? scopeLabel : null}
      contextLine={contract?.scenario.yourRole ? `Your role: ${contract.scenario.yourRole}` : null}
      remainingMs={inProgress ? remainingMs : null}
      saveState={inProgress ? saveState : null}
      briefingOpen={briefingOpen}
      onToggleBriefing={inProgress ? () => (briefingOpen ? closeBriefing() : openBriefing()) : null}
      onFinish={inProgress ? () => setExit((e) => ({ ...e, open: true, error: null })) : null}
      finishing={exit.submitting || exit.scoring}
    />
  )
  const frame = (body, { fill = false } = {}) => <AssessmentShell header={header} fill={fill}><DocumentTitle title={contract?.scenario.title || 'Assessment'} />{body}</AssessmentShell>

  if (wsParam && !meLoading && !target) return frame(<div className="p-6"><UnauthorizedState title={PLAYER_COPY.notAvailable} homeTo={listPath} homeLabel="Back to assessments" /></div>)
  if (!aligned || session.isPending) {
    if (session.fetchStatus === 'paused') return frame(<div className="p-6"><ErrorState title={PLAYER_COPY.offlineTitle} description={PLAYER_COPY.offlineBody} onRetry={() => session.refetch()} /></div>)
    return frame(<div className="p-6"><Skeleton label="Loading your assessment" lines={5} /></div>)
  }
  if (session.error && (!contract || accessError)) {
    const e = session.error
    // A legacy entry link (/workspace/:id?assessment=…) for a session that was
    // never started: start it from the V3 briefing instead of guessing.
    if (e.status === 404 && params.get('assessment')) {
      return frame(
        <div className="mx-auto max-w-xl p-6">
          <Callout tone="info" title={PLAYER_COPY.notStartedTitle}>
            <p>{PLAYER_COPY.notStartedBody}</p>
            <LinkButton className="mt-3" to={listPath} variant="primary">Go to your assessments</LinkButton>
          </Callout>
        </div>,
      )
    }
    if (e.status === 404 || e.code === 'FORBIDDEN') return frame(<div className="p-6"><UnauthorizedState title={PLAYER_COPY.notAvailable} homeTo={listPath} homeLabel="Back to assessments" /></div>)
    if (e.code === 'ENTITLEMENT_REQUIRED' || e.code === 'ENTITLEMENT_EXPIRED') return frame(<div className="p-6"><UnauthorizedState title={PLAYER_COPY.accessEnded} homeTo={listPath} homeLabel="Back to assessments" /></div>)
    if (e.code === 'SCENARIO_NOT_FOUND') {
      return frame(
        <div className="mx-auto max-w-xl p-6">
          <Callout tone="blocked" title={PLAYER_COPY.notAvailable}>
            <p>{PLAYER_COPY.scenarioMissing}</p>
            {e.requestId && <p className="mt-1 text-xs">Reference: {e.requestId}</p>}
            <LinkButton className="mt-3" to={listPath} variant="secondary">Back to assessments</LinkButton>
          </Callout>
        </div>,
      )
    }
    if (e.code === 'NETWORK_ERROR') return frame(<div className="p-6"><ErrorState title={PLAYER_COPY.offlineTitle} description={PLAYER_COPY.offlineBody} onRetry={() => session.refetch()} /></div>)
    return frame(<div className="p-6"><ErrorState title={PLAYER_COPY.loadFailed} requestId={e.requestId} onRetry={() => session.refetch()} /></div>)
  }

  if (contract.status === 'COMPLETED' || contract.status === 'SCORING' || contract.status === 'SCORING_FAILED') {
    return frame(
      <div className="mx-auto w-full max-w-2xl p-6">
        <SubmissionProgress stage={contract.status === 'SCORING_FAILED' ? 'FAILED' : contract.status === 'COMPLETED' && contract.reportPath ? 'REPORT' : 'REVIEW'} />
        {contract.status === 'COMPLETED' && (
          <Callout tone="positive" title={PLAYER_COPY.completeTitle}>
            <p>{PLAYER_COPY.completeBody}</p>
            {contract.reportPath
              ? <LinkButton className="mt-3" to={contract.reportPath} variant="primary">Open your report</LinkButton>
              : <><p className="mt-1">{PLAYER_COPY.reportPending}</p><LinkButton className="mt-3" to={listPath} variant="secondary">Back to assessments</LinkButton></>}
          </Callout>
        )}
        {contract.status === 'SCORING' && (
          <Callout tone="info" title={PLAYER_COPY.scoringTitle}>
            <p role="status">{contract.processing?.acceptedActions ? PLAYER_COPY.savedReviewContinuing(contract.processing.acceptedActions) : PLAYER_COPY.scoringBody}</p>
            {session.error && (
              <div className="mt-3" role="alert">
                <InlineNotice tone="blocked">{PLAYER_COPY.statusRefreshFailed}</InlineNotice>
                {session.error.requestId && <p className="mt-2 text-xs">Reference: {session.error.requestId}</p>}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => session.refetch()} loading={session.isFetching} loadingLabel="Checking...">Check status</Button>
              <LinkButton to={listPath} variant="secondary">Back to assessments</LinkButton>
              <LinkButton to="/contact" variant="ghost">Contact support</LinkButton>
            </div>
          </Callout>
        )}
        {contract.status === 'SCORING_FAILED' && (
          <Callout tone="blocked" title={PLAYER_COPY.scoringFailedTitle}>
            <p>{contract.processing?.state === 'FAILED' ? PLAYER_COPY.technicalFailedBody : PLAYER_COPY.scoringFailedBody}</p>
            {exit.error && (
              <div className="mt-3" role="alert">
                <InlineNotice tone="blocked">{exit.error.message}</InlineNotice>
                {exit.error.requestId && <p className="mt-2 text-xs">Reference: {exit.error.requestId}</p>}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => finish({ early: true })} loading={exit.submitting}>Try again</Button>
              <LinkButton to={listPath} variant="secondary">Back to assessments</LinkButton>
              <LinkButton to="/contact" variant="ghost">Contact support</LinkButton>
            </div>
          </Callout>
        )}
      </div>,
    )
  }

  const timeUp = remainingMs === 0 && !notBegun
  if (notBegun) {
    return frame(
      <>
        <div className="p-6" aria-hidden="true"><Skeleton label="Waiting to begin" lines={4} /></div>
        <ScenarioIntroDialog open contract={contract} onBegin={onBegin} onNotYet={() => navigate(listPath)} notYetTo={listPath} beginning={begin.busy} error={begin.error} onRetry={() => session.refetch()} retrying={session.isFetching} />
      </>,
    )
  }
  const interrupted = connection === 'INTERRUPTED' && online
  const hasWork = contract.artifacts.length > 0
  const needsLarge = contract.device.requiresLargeScreen && small && !smallOk
  const workNeedsAttention = artifactState.items.some((i) => i.status === 'ERROR' || i.status === 'CONFLICT' || materialMissing(i))
  const conversation = (
    <section aria-label="Conversation" className={hasWork && wide ? 'flex min-h-0 w-[45%] min-w-0 shrink-0 flex-col overflow-hidden border-r border-prism-border' : 'mx-auto flex min-h-0 w-full min-w-0 max-w-4xl flex-col overflow-hidden'}>
      <ConversationPane messages={contract.messages} pending={pending} onRetry={() => pending && deliver(pending)} onEdit={editPending} />
    </section>
  )
  const workspace = (
    <section aria-label="Work materials" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ArtifactPane items={artifactState.items} activeId={activeArtifact} onSelect={setActiveArtifact} store={store} onRetryLoad={() => session.refetch()} retrying={session.isFetching} />
    </section>
  )

  return frame(
    <>
      <p className="sr-only" role="status" aria-live="polite">{timeNotice}</p>
      {contract.stages?.length > 0 && (
        <ol aria-label="Stages of this assessment" className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 border-b border-prism-border bg-prism-surface px-4 py-1.5 text-xs" data-testid="stage-strip">
          {contract.stages.map((s) => (
            <li key={s.id} aria-current={s.state === 'CURRENT' ? 'step' : undefined} className={s.state === 'UPCOMING' ? 'text-prism-ink-muted' : 'text-prism-ink'}>
              {s.label}{s.state === 'CURRENT' ? ' (now)' : s.state === 'DONE' ? ' (done)' : ''}
            </li>
          ))}
        </ol>
      )}
      {interrupted && (
        <div role="status" aria-live="polite" className="flex shrink-0 items-center gap-2 border-b border-prism-partial-soft bg-prism-partial-soft px-4 py-2 text-sm text-prism-ink" data-testid="reconnect-banner">
          <WifiOff size={16} aria-hidden="true" className="shrink-0 text-prism-partial" />
          <span><strong className="font-semibold">Connection interrupted.</strong> Your latest saved work is safe. Reconnecting…</span>
        </div>
      )}
      {briefingOpen && (
        <section id="player-briefing" aria-label="Briefing" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); closeBriefing() } }} className="grid max-h-[40dvh] shrink-0 gap-4 overflow-y-auto overscroll-contain border-b border-prism-border bg-prism-surface p-4 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-prism-accent md:grid-cols-3">
          <div className="flex flex-wrap items-start justify-between gap-2 md:col-span-3">
            <p className="font-medium text-prism-ink" data-testid="briefing-clock-note">The clock keeps running while you read the briefing. It does not pause or restart.</p>
            <Button size="sm" variant="secondary" onClick={closeBriefing}>Close briefing</Button>
          </div>
          {contract.scenario.context && <div><h2 className="font-semibold text-prism-ink">Context</h2><p className="mt-1 text-prism-ink-muted">{contract.scenario.context}</p></div>}
          {contract.scenario.yourRole && <div><h2 className="font-semibold text-prism-ink">Your role</h2><p className="mt-1 text-prism-ink-muted">{contract.scenario.yourRole}</p></div>}
          {contract.scenario.participants.length > 0 && (
            <div>
              <h2 className="font-semibold text-prism-ink">People in this conversation</h2>
              <ul className="mt-1 text-prism-ink-muted">{contract.scenario.participants.map((p) => <li key={p.name}>{p.name}{p.role ? `, ${p.role}` : ''}</li>)}</ul>
            </div>
          )}
          <div className="md:col-span-3">
            <h2 className="font-semibold text-prism-ink">Who can see the result</h2>
            <p className="mt-1 text-prism-ink-muted">
              {contract.scope === 'SPONSORED'
                ? PLAYER_COPY.sponsoredVisibility(contract.sponsorName || 'Your institution')
                : PLAYER_COPY.personalVisibility}
            </p>
          </div>
        </section>
      )}
      {needsLarge ? (
        <div className="mx-auto min-h-0 max-w-xl overflow-y-auto p-6">
          <Callout tone="partial" title={PLAYER_COPY.largeScreenTitle}>
            <p>{PLAYER_COPY.largeScreenBody}</p>
            {contract.device.allowSmallScreen && (
              <Button className="mt-3" variant="secondary" onClick={() => { setSmallOk(true); requestAnimationFrame(() => answerRef.current?.focus()) }}>Continue on this device</Button>
            )}
          </Callout>
        </div>
      ) : wide || !hasWork ? (
        <div className="flex min-h-0 flex-1 flex-row overflow-hidden" data-layout={hasWork ? 'split' : 'conversation'}>{conversation}{hasWork && workspace}</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-layout="switchable">
          <div className="shrink-0 border-b border-prism-border p-2">
            <SegmentedControl label="Show" value={pane} onChange={setPane} options={[{ value: 'conversation', label: 'Conversation' }, { value: 'workspace', label: workNeedsAttention ? 'Workspace (needs attention)' : 'Workspace' }]} />
          </div>
          {pane === 'workspace' ? workspace : conversation}
        </div>
      )}
      {!needsLarge && (
        <div className={hasWork ? 'min-w-0 shrink-0' : 'mx-auto w-full min-w-0 max-w-4xl shrink-0'}>
          {timeUp && <div className="px-3"><Callout tone="partial" title={PLAYER_COPY.timeUpTitle}>{PLAYER_COPY.timeUp}</Callout></div>}
          <ResponseComposer ref={answerRef} draft={draft} onDraft={setDraft} onSend={onSend} disabled={timeUp} readOnly={Boolean(pending)} busy={pending?.status === 'SENDING'} lockedNote={timeUp && draft.trim() ? PLAYER_COPY.draftNotSubmitted : null} />
        </div>
      )}
      <AssessmentExitDialog
        open={exit.open}
        onClose={() => setExit((e) => ({ ...e, open: false }))}
        onConfirm={finish}
        exchanges={contract.progress.exchanges}
        requiredExchanges={contract.progress.requiredExchanges}
        unsaved={saveState === 'ERROR' || saveState === 'CONFLICT'}
        submitting={exit.submitting}
        error={exit.error}
      />
    </>,
    { fill: true },
  )
}
