// /app/assessments/:assignmentId/system-check (spec §11 item 9): device and
// connection checks, then the start (or resume) step the server allows.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Checkbox } from '../../../components/ui/FormControls.jsx'
import { newIdempotencyKey } from '../../../api/client.js'
import { startAssignment } from '../api/assessmentSessionApi.js'
import { ASSESSMENT_CONSENT_ITEMS, CONSENT_VERSION } from '../../../lib/copy/assessmentConsent.js'
import { track } from '../../../lib/telemetry.js'
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Card } from '../../../components/ui/Card.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useAssignmentBriefing } from '../../student/hooks.js'
import { queryStateView } from '../../student/QueryState.jsx'
import { checkApiHealth } from '../../../api/system.js'
import { checkBrowser, checkScreen, checkConnection, checkMediaSupport, testMicrophone, summarise } from '../../../lib/deviceCheck.js'
import { START_REASON_COPY } from '../../../lib/copy/student.js'
import { assignmentBase, assignmentsListPath } from './BriefingPage.jsx'

const TONE = { PASS: 'positive', WARN: 'partial', FAIL: 'blocked' }
const STATUS_LABEL = { PASS: 'Ready', WARN: 'Check', FAIL: 'Needs attention' }

const START_ERROR_COPY = {
  AGE_CONFIRMATION_REQUIRED: 'Please confirm you are 18 or older in your profile before you start.',
  CONSENT_REQUIRED: 'Please accept every consent item to continue.',
  ENTITLEMENT_REQUIRED: 'No place is available for this assessment.',
  ENTITLEMENT_EXPIRED: 'Access to this assessment has ended.',
  ACKNOWLEDGEMENT_REQUIRED: 'Go back to the briefing and confirm who can see this assessment.',
  ASSESSMENT_COMPLETED: 'You have already completed this assessment.',
  ASSESSMENT_NOT_OPEN: 'This assessment is not open.',
  NETWORK_ERROR: 'You appear to be offline. Nothing has started yet — try again when you reconnect.',
  SCENARIO_NOT_FOUND: 'This assessment is not available right now. Nothing has started.',
}

// Formal consent (identical to the legacy briefing, same version), then an
// idempotent start: a double click or a retry returns the same session.
function V3Start({ assignmentId, blocked }) {
  const navigate = useNavigate()
  const [consent, setConsent] = useState({})
  const [state, setState] = useState({ busy: false, error: null })
  const keyRef = useRef(null)
  const all = ASSESSMENT_CONSENT_ITEMS.every((c) => consent[c.scope])
  const begin = async () => {
    if (!all || blocked || state.busy) return
    setState({ busy: true, error: null })
    keyRef.current ||= newIdempotencyKey('start')
    try {
      const out = await startAssignment(assignmentId, {
        consent: { scopes: ASSESSMENT_CONSENT_ITEMS.map((c) => c.scope), consentVersion: CONSENT_VERSION },
        idempotencyKey: keyRef.current,
      })
      if (!out.resumed) track('assessment_started', { assignmentId, sessionId: out.sessionId })
      navigate(out.to)
    } catch (error) {
      setState({ busy: false, error })
    }
  }
  return (
    <Card id="begin" className="scroll-mt-4 space-y-4 p-6">
      <fieldset className="space-y-3">
        <legend className="text-base font-semibold text-prism-ink">Before you begin</legend>
        <p className="text-sm text-prism-ink-muted">Please read and accept each item. All are needed to take a formal assessment.</p>
        {ASSESSMENT_CONSENT_ITEMS.map((c) => (
          <Checkbox key={c.scope} id={`consent-${c.scope}`} label={c.label} checked={Boolean(consent[c.scope])} onChange={() => setConsent((p) => ({ ...p, [c.scope]: !p[c.scope] }))} />
        ))}
      </fieldset>
      {state.error && (
        <Callout tone="blocked" role="alert" title="Your assessment did not start">
          {START_ERROR_COPY[state.error.code] || 'Something went wrong on our side. Nothing has started yet — try again in a moment.'}
          {!START_ERROR_COPY[state.error.code] && state.error.requestId && <span className="mt-1 block text-xs">Reference: {state.error.requestId}</span>}
        </Callout>
      )}
      <Button onClick={begin} disabled={!all || blocked} loading={state.busy} loadingLabel="Starting…">Begin assessment</Button>
    </Card>
  )
}

export default function SystemCheckPage() {
  const { assignmentId } = useParams()
  const { active } = useWorkspace()
  const briefing = useAssignmentBriefing(assignmentId)
  const [results, setResults] = useState(null)
  const [mic, setMic] = useState(null)
  const hasArtifacts = briefing.data?.definition.hasArtifacts
  const proctored = briefing.data?.assignment.integrityMode === 'PROCTORED'

  const run = useCallback(async () => {
    setResults(null)
    const reachable = await checkApiHealth()
    setResults([
      checkBrowser(),
      checkConnection(navigator.onLine !== false, reachable),
      checkScreen(window.innerWidth, { needsLargeScreen: Boolean(hasArtifacts) }),
      ...checkMediaSupport(navigator.mediaDevices, { needsCamera: proctored }),
    ])
  }, [hasArtifacts, proctored])

  useEffect(() => {
    if (briefing.data) run()
  }, [briefing.data, run])

  const state = queryStateView(briefing, { label: 'Loading', homeTo: assignmentsListPath(active) })
  if (state) {
    return (
      <div>
        <PageHeader title="System check" context={active} breadcrumbs={[{ label: 'Assessments', to: assignmentsListPath(active) }, { label: 'System check' }]} />
        {state}
      </div>
    )
  }
  const { definition: d, start } = briefing.data
  const overall = results ? summarise(results) : null
  const base = assignmentBase(active, assignmentId)
  const resume = start.reason === 'RESUME'

  return (
    <div className="space-y-6">
      <PageHeader
        title="System check"
        description={d.title}
        context={active}
        breadcrumbs={[{ label: 'Assessments', to: assignmentsListPath(active) }, { label: 'Briefing', to: `${base}/briefing` }, { label: 'System check' }]}
      />
      {start.allowed && start.mode === 'V3' && !resume && (
        <a href="#begin" className="inline-block text-sm font-medium text-prism-accent underline underline-offset-2">Go to consent and start</a>
      )}
      <Card className="space-y-4 p-6">
        {!results ? (
          <p role="status" className="text-sm text-prism-ink-muted">Checking your device…</p>
        ) : (
          <ul className="space-y-3" aria-live="polite">
            {results.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-prism-border pb-3 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-prism-ink">{r.label}</p>
                  <p className="text-sm text-prism-ink-muted">{r.id === 'microphone' && mic ? mic.message : r.message}</p>
                </div>
                <StatusChip tone={TONE[r.id === 'microphone' && mic ? mic.status : r.status]} label={STATUS_LABEL[r.id === 'microphone' && mic ? mic.status : r.status]} />
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={run}>Run the check again</Button>
          <Button variant="ghost" onClick={async () => setMic(await testMicrophone(navigator.mediaDevices))}>Test microphone</Button>
        </div>
      </Card>

      {overall === 'FAIL' && (
        <Callout tone="blocked" role="alert" title="Fix the items marked “Needs attention” before you start">Your progress is not affected.</Callout>
      )}
      {start.allowed && start.mode === 'V3' && !resume ? (
        <V3Start assignmentId={assignmentId} blocked={overall === 'FAIL'} />
      ) : start.allowed && start.to ? (
        <LinkButton to={start.to} variant="primary" aria-disabled={overall === 'FAIL' ? 'true' : undefined} onClick={(e) => { if (overall === 'FAIL') e.preventDefault() }}>
          {resume ? 'Resume assessment' : 'Begin assessment'}
        </LinkButton>
      ) : (
        <p role="status" className="text-sm text-prism-ink-muted">{START_REASON_COPY[start.reason] || 'This assessment cannot be started right now.'}</p>
      )}
    </div>
  )
}
