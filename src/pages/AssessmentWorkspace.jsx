// src/pages/AssessmentWorkspace.jsx — conversation + work materials (legacy
// /workspace route). Fail closed (spec §12.2, §33, §34.3): the scenario comes
// only from the server's session payload; nothing is spoken on a participant's
// behalf; an unsent answer stays in the box; completion needs the server's
// acknowledgement.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { artifactStore, useArtifactStore } from '../lib/artifactStore.js'
import ArtifactRenderer from '../components/artifacts/ArtifactRenderer.jsx'
import { startAssessment, sendAssessmentMessage, submitAssessment, fetchSubmissionStatus } from '../api/assessment.js'
import { AssessmentShell } from '../layouts/AssessmentShell.jsx'
import { Button, Callout, InlineNotice, Skeleton, LinkButton } from '../components/ui/index.js'
import { ErrorState } from '../components/states/index.js'

const POLL_MS = 3000

function loadErrorView(error, sessionId, onRetry) {
  const briefing = `/briefing?session=${encodeURIComponent(sessionId)}`
  if (error.status === 409) {
    return <ErrorState title="This assessment is already complete" description="You can open its report." action={<LinkButton to={`/report/${encodeURIComponent(sessionId)}/v2`}>Open report</LinkButton>} />
  }
  if (error.code === 'CONSENT_REQUIRED' || error.code === 'AGE_CONFIRMATION_REQUIRED') {
    return <ErrorState title="A step is missing before you can start" description={error.message} action={<LinkButton to={briefing}>Go back to the briefing</LinkButton>} />
  }
  return <ErrorState title="This assessment could not be loaded" description={error.status === 402 ? error.message : 'Please try again. If this keeps happening, contact support.'} requestId={error.requestId} onRetry={onRetry} />
}

export default function AssessmentWorkspace() {
  const { sessionId } = useParams()
  const [params] = useSearchParams()
  const assessmentId = params.get('assessment')
  const navigate = useNavigate()
  // Actions come from the store singleton: the hook's wrappers are recreated
  // every render and would re-trigger the load effect.
  const { artifacts, activeArtifactId } = useArtifactStore()

  const [load, setLoad] = useState({ loading: true, error: null, scenario: null })
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [noReply, setNoReply] = useState(false)
  const [showBriefing, setShowBriefing] = useState(false)
  const [finish, setFinish] = useState({ state: 'idle', error: null })
  const feedRef = useRef(null)
  const pollRef = useRef(null)

  const start = useCallback(async () => {
    setLoad({ loading: true, error: null, scenario: null })
    try {
      const data = await startAssessment({ sessionId, assessmentId })
      if (!data?.scenario?.title) {
        setLoad({ loading: false, error: { status: 0, message: 'missing scenario' }, scenario: null })
        return
      }
      artifactStore.setSession(sessionId, data.interactiveArtifacts || data.scenario.interactiveArtifacts || [], data.scenario.title)
      setMessages(Array.isArray(data.messages) ? data.messages : [])
      setLoad({ loading: false, error: null, scenario: data.scenario })
    } catch (error) {
      setLoad({ loading: false, error, scenario: null })
    }
  }, [sessionId, assessmentId])

  useEffect(() => { if (sessionId) start() }, [sessionId, start])
  useEffect(() => () => clearTimeout(pollRef.current), [])
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [messages])

  const send = async (e) => {
    e?.preventDefault()
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setSendError(null)
    setNoReply(false)
    try {
      const data = await sendAssessmentMessage({ sessionId, text })
      const replies = Array.isArray(data?.messages) ? data.messages : []
      setMessages((curr) => [...curr, { speaker: 'You', content: text, isUser: true }, ...replies])
      setDraft('')
      if (replies.length === 0) setNoReply(true)
    } catch (error) {
      setSendError(error)
    } finally {
      setSending(false)
    }
  }

  const poll = useCallback(async () => {
    try {
      const { state } = await fetchSubmissionStatus(sessionId)
      if (state === 'complete') return navigate(`/report/${encodeURIComponent(sessionId)}/v2`)
      if (state === 'failed') return setFinish({ state: 'idle', error: { message: 'Scoring did not finish.' } })
      if (state === 'idle') {
        const again = await submitAssessment(sessionId)
        if (again.state === 'complete') return navigate(`/report/${encodeURIComponent(sessionId)}/v2`)
      }
      pollRef.current = setTimeout(poll, POLL_MS)
    } catch (error) {
      setFinish({ state: 'idle', error })
    }
  }, [sessionId, navigate])

  const submit = async () => {
    setFinish({ state: 'submitting', error: null })
    try {
      const { state } = await submitAssessment(sessionId)
      if (state === 'complete') return navigate(`/report/${encodeURIComponent(sessionId)}/v2`)
      setFinish({ state: 'scoring', error: null })
      pollRef.current = setTimeout(poll, POLL_MS)
    } catch (error) {
      setFinish({ state: 'idle', error })
    }
  }

  const scenario = load.scenario
  const header = (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-prism-border bg-prism-surface px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-prism-ink-muted">Assessment</p>
        <h1 className="truncate text-base font-semibold text-prism-ink">{scenario?.title || 'Assessment'}</h1>
      </div>
      {scenario && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" aria-expanded={showBriefing} aria-controls="briefing" onClick={() => setShowBriefing((v) => !v)}>
            {showBriefing ? 'Hide briefing' : 'Briefing'}
          </Button>
          <Button size="sm" onClick={submit} loading={finish.state !== 'idle'} loadingLabel={finish.state === 'scoring' ? 'Scoring…' : 'Submitting…'}>
            Finish assessment
          </Button>
        </div>
      )}
    </header>
  )

  if (load.loading) {
    return <AssessmentShell header={header}><div className="p-6"><Skeleton label="Loading your assessment" lines={5} /></div></AssessmentShell>
  }
  if (load.error) {
    return <AssessmentShell header={header}><div className="p-6">{loadErrorView(load.error, sessionId, start)}</div></AssessmentShell>
  }

  const active = artifacts.find((a) => a.artifactId === activeArtifactId) || artifacts[0] || null

  return (
    <AssessmentShell header={header}>
      {showBriefing && (
        <section id="briefing" aria-label="Briefing" className="grid gap-4 border-b border-prism-border bg-prism-surface p-4 text-sm md:grid-cols-3">
          {scenario.context && <div><h2 className="font-semibold text-prism-ink">Context</h2><p className="mt-1 text-prism-ink-muted">{scenario.context}</p></div>}
          {scenario.yourRole && <div><h2 className="font-semibold text-prism-ink">Your role</h2><p className="mt-1 text-prism-ink-muted">{scenario.yourRole}</p></div>}
          {(scenario.participants || []).length > 0 && (
            <div>
              <h2 className="font-semibold text-prism-ink">People in this conversation</h2>
              <ul className="mt-1 text-prism-ink-muted">{scenario.participants.map((p) => <li key={p.name}>{p.name}{p.role ? `, ${p.role}` : ''}</li>)}</ul>
            </div>
          )}
        </section>
      )}
      {finish.error && (
        <div className="p-4">
          <Callout tone="blocked" role="alert" title="Your assessment was not submitted" action={<Button variant="secondary" size="sm" onClick={submit}>Try again</Button>}>
            {finish.error.message} Your answers are saved; nothing has been scored yet.
          </Callout>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section aria-label="Conversation" className="flex min-h-[50vh] flex-col border-b border-prism-border lg:w-[45%] lg:border-b-0 lg:border-r">
          <div ref={feedRef} className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
            {messages.length === 0 && <p className="text-sm text-prism-ink-muted">The conversation has not started yet.</p>}
            {messages.map((msg, i) => (
              <div key={i} className={msg.isUser ? 'flex flex-col items-end' : 'flex flex-col items-start'}>
                <span className="mb-1 px-1 text-xs font-medium text-prism-ink-muted">{msg.speaker}{msg.role && !msg.isUser ? `, ${msg.role}` : ''}</span>
                <p className={msg.isUser
                  ? 'max-w-[85%] whitespace-pre-wrap rounded-[var(--prism-radius-lg)] bg-prism-accent px-4 py-3 text-sm text-prism-accent-ink'
                  : 'max-w-[85%] whitespace-pre-wrap rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface px-4 py-3 text-sm text-prism-ink'}
                >
                  {msg.content}
                </p>
              </div>
            ))}
            {sending && <p className="text-sm text-prism-ink-muted">Sending…</p>}
          </div>
          <form onSubmit={send} className="space-y-2 border-t border-prism-border p-3">
            {sendError && (
              <InlineNotice tone="blocked">
                Not sent — retry. {sendError.status === 410 ? sendError.message : 'Your answer is still in the box below.'}
              </InlineNotice>
            )}
            {noReply && <InlineNotice tone="insufficient">No reply was received. You can continue or finish the assessment.</InlineNotice>}
            <label htmlFor="answer" className="sr-only">Your answer</label>
            <div className="flex gap-2">
              <textarea
                id="answer"
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                placeholder="Type your answer"
                className="flex-1 resize-none rounded-[var(--prism-radius-md)] border border-prism-border-strong bg-prism-surface px-3 py-2 text-sm text-prism-ink"
              />
              <Button type="submit" disabled={!draft.trim()} loading={sending} loadingLabel="Sending…">
                {sendError ? 'Retry' : 'Send'}
              </Button>
            </div>
          </form>
        </section>
        <section aria-label="Work materials" className="flex min-h-[50vh] flex-1 flex-col">
          {artifacts.length === 0 ? (
            <p className="p-6 text-sm text-prism-ink-muted">This assessment has no work materials. Everything happens in the conversation.</p>
          ) : (
            <>
              <div role="tablist" aria-label="Work materials" className="flex gap-2 overflow-x-auto border-b border-prism-border p-2">
                {artifacts.map((art) => (
                  <button
                    key={art.artifactId}
                    type="button"
                    role="tab"
                    aria-selected={active?.artifactId === art.artifactId}
                    onClick={() => artifactStore.setActiveArtifact(art.artifactId)}
                    className={active?.artifactId === art.artifactId
                      ? 'shrink-0 rounded-[var(--prism-radius-md)] bg-prism-accent px-3 py-1.5 text-sm font-medium text-prism-accent-ink'
                      : 'shrink-0 rounded-[var(--prism-radius-md)] bg-prism-subtle px-3 py-1.5 text-sm font-medium text-prism-ink'}
                  >
                    {art.title || art.artifactId}
                  </button>
                ))}
              </div>
              <div role="tabpanel" className="flex-1 overflow-y-auto p-6">
                {active && <ArtifactRenderer key={active.artifactId} artifact={active} sessionId={sessionId} />}
              </div>
            </>
          )}
        </section>
      </div>
    </AssessmentShell>
  )
}
