// /app/assessments/:assignmentId/system-check (spec §11 item 9): device and
// connection checks, then the start (or resume) step the server allows.
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
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
      {start.allowed && start.to ? (
        <LinkButton to={start.to} variant="primary" aria-disabled={overall === 'FAIL' ? 'true' : undefined} onClick={(e) => { if (overall === 'FAIL') e.preventDefault() }}>
          {resume ? 'Resume assessment' : 'Begin assessment'}
        </LinkButton>
      ) : (
        <p role="status" className="text-sm text-prism-ink-muted">{START_REASON_COPY[start.reason] || 'This assessment cannot be started right now.'}</p>
      )}
    </div>
  )
}
