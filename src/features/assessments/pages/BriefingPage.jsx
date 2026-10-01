// /app/assessments/:assignmentId/briefing (spec §11): the ten briefing
// sections, the sponsored disclosure with an explicit acknowledgement stored
// server-side as a consent record, then the system check.
import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { FunnelSteps } from '../components/FunnelSteps.jsx'
import { Card } from '../../../components/ui/Card.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { Checkbox } from '../../../components/ui/FormControls.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useAssignmentBriefing, useAcknowledgeAssignment } from '../../student/hooks.js'
import { queryStateView } from '../../student/QueryState.jsx'
import { track } from '../../../lib/telemetry.js'
import {
  BRIEFING_COPY, INTEGRITY_COPY, NOT_MEASURED_COPY, SCOPE_LABEL, SPONSORED_DISCLOSURE, SPONSORED_DISCLOSURE_VERSION, START_REASON_COPY,
} from '../../../lib/copy/student.js'

export function assignmentBase(active, assignmentId) {
  return active.type === 'CAMPUS_STUDENT'
    ? `/app/campus/${active.organizationId}/assignments/${assignmentId}`
    : `/app/assessments/${assignmentId}`
}
export function assignmentsListPath(active) {
  return active.type === 'CAMPUS_STUDENT' ? `/app/campus/${active.organizationId}/assignments` : '/app/assessments'
}

function Section({ n, title, children }) {
  return (
    <section aria-labelledby={`brief-${n}`} className="space-y-2">
      <h2 id={`brief-${n}`} className="text-base font-semibold text-prism-ink"><span aria-hidden="true">{n}. </span>{title}</h2>
      <div className="text-sm text-prism-ink-muted">{children}</div>
    </section>
  )
}

export default function BriefingPage() {
  const { assignmentId } = useParams()
  const { active } = useWorkspace()
  const briefing = useAssignmentBriefing(assignmentId)
  const acknowledge = useAcknowledgeAssignment(assignmentId)
  const [checked, setChecked] = useState(false)
  const tracked = useRef(false)
  const confirmedRef = useRef(null)

  // After confirming, the button is replaced: move focus to the confirmation
  // so keyboard and screen-reader users are not dropped on <body>.
  useEffect(() => {
    if (acknowledge.isSuccess && briefing.data?.sponsorship.acknowledged) confirmedRef.current?.focus()
  }, [acknowledge.isSuccess, briefing.data])

  useEffect(() => {
    if (!briefing.data || tracked.current) return
    tracked.current = true
    track('briefing_opened', { assignmentId, scope: briefing.data.assignment.scope, surface: 'BRIEFING' })
  }, [briefing.data, assignmentId])

  const state = queryStateView(briefing, { label: 'Loading the briefing', homeTo: assignmentsListPath(active) })
  if (state) {
    return (
      <div>
        <PageHeader title="Assessment briefing" context={active} breadcrumbs={[{ label: 'Assessments', to: assignmentsListPath(active) }, { label: 'Briefing' }]} />
        {state}
      </div>
    )
  }
  const { assignment: a, definition: d, sponsorship: s, start } = briefing.data
  const sponsored = s.scope === 'SPONSORED'
  const sponsorName = s.sponsorName || 'your institution'
  const integrity = INTEGRITY_COPY[a.integrityMode] || INTEGRITY_COPY.STANDARD
  const copyMismatch = sponsored && s.disclosureCopyVersion !== SPONSORED_DISCLOSURE_VERSION
  const base = assignmentBase(active, assignmentId)

  return (
    <div className="space-y-6">
      <PageHeader
        title={d.title}
        description="Read this before you start. It takes about two minutes."
        context={active}
        breadcrumbs={[{ label: 'Assessments', to: assignmentsListPath(active) }, { label: 'Briefing' }]}
      />
      <FunnelSteps current="briefing" className="!mb-0" />
      <Badge tone={sponsored ? 'accent' : 'neutral'}>{sponsored ? SCOPE_LABEL.SPONSORED(sponsorName) : SCOPE_LABEL.PERSONAL}</Badge>

      <Card className="space-y-6 p-6">
        <Section n={1} title="What this assessment measures">
          <ul className="list-disc space-y-1 pl-5">{d.measures.map((m) => <li key={m.id}>{m.name}</li>)}</ul>
          <p className="mt-2">Prism describes a capability only when there is enough evidence. Otherwise it says so.</p>
        </Section>
        <Section n={2} title="What it does not measure">
          <ul className="list-disc space-y-1 pl-5">{d.notMeasured.map((k) => <li key={k}>{NOT_MEASURED_COPY[k] || k}</li>)}</ul>
        </Section>
        <Section n={3} title="How the simulation works">
          <p>{BRIEFING_COPY.howItWorks}</p>
          {d.hasArtifacts && <p className="mt-2">{BRIEFING_COPY.howItWorksArtifacts}</p>}
        </Section>
        <Section n={4} title="Estimated duration">
          <p>About {d.durationMinutes} minutes. You can take a short break; your progress is saved.</p>
        </Section>
        <Section n={5} title="Allowed tools and resources">
          <p className="font-medium text-prism-ink">Allowed</p>
          <ul className="list-disc space-y-1 pl-5">{BRIEFING_COPY.allowedTools.map((t) => <li key={t}>{t}</li>)}</ul>
          <p className="mt-2 font-medium text-prism-ink">Not allowed</p>
          <ul className="list-disc space-y-1 pl-5">{BRIEFING_COPY.notAllowed.map((t) => <li key={t}>{t}</li>)}</ul>
        </Section>
        <Section n={6} title={`Integrity requirements (${integrity.label})`}>
          <ul className="list-disc space-y-1 pl-5">{integrity.requirements.map((t) => <li key={t}>{t}</li>)}</ul>
        </Section>
        <Section n={7} title="Accessibility and adjustments">
          <p>{BRIEFING_COPY.accommodations}</p>
          <Link to="/contact" className="mt-2 inline-flex min-h-6 items-center font-medium text-prism-accent-strong underline">Contact us about an adjustment</Link>
        </Section>
        <Section n={8} title="Who can see the result">
          {sponsored ? (
            <div className="space-y-3">
              <div className="rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-subtle p-4 text-prism-ink" data-testid="sponsored-disclosure">
                {SPONSORED_DISCLOSURE(sponsorName).map((line) => <p key={line}>{line}</p>)}
              </div>
              {copyMismatch ? (
                <Callout tone="partial" title="This disclosure was updated">Reload the page to read the latest version before you continue.</Callout>
              ) : s.acknowledged ? (
                <p ref={confirmedRef} tabIndex={-1} role="status" className="text-prism-ink focus:outline-none">You confirmed you have read this.</p>
              ) : (
                <div className="space-y-3">
                  <Checkbox
                    id="sponsored-ack"
                    label={`I understand what ${sponsorName} can and cannot see`}
                    checked={checked}
                    onChange={(e) => setChecked(e.target.checked)}
                  />
                  {acknowledge.error && (
                    <Callout tone="blocked" role="alert" title="We could not record your confirmation">{acknowledge.error.message}</Callout>
                  )}
                  <Button variant="secondary" disabled={!checked || acknowledge.isPending} onClick={() => acknowledge.mutate(s.disclosureCopyVersion)}>
                    {acknowledge.isPending ? 'Saving…' : 'Confirm'}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p>{BRIEFING_COPY.personalScope}</p>
          )}
        </Section>
        <Section n={9} title="Technical check">
          <p>{BRIEFING_COPY.systemCheckIntro}</p>
        </Section>
        <Section n={10} title="Start">
          {start.allowed ? (
            <LinkButton to={`${base}/system-check`} variant="primary">Continue to system check</LinkButton>
          ) : (
            <div className="space-y-3">
              <p role="status">{START_REASON_COPY[start.reason] || 'This assessment cannot be started right now.'}</p>
              {start.reason === 'SPONSORED_START_UNAVAILABLE' && (
                <LinkButton to={`${base}/system-check`} variant="secondary">Check your device now</LinkButton>
              )}
            </div>
          )}
        </Section>
      </Card>
    </div>
  )
}
