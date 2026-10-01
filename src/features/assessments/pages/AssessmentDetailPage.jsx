// /app/assessments/:assignmentId and /app/campus/:organizationId/assignments/:assignmentId
// (spec 10): one assessment - scope, status, progress, what it measures, what
// it does not measure, and the single next step. Facts come from the server;
// nothing about scoring or the assessment content is shown here.
import { useParams } from 'react-router-dom'
import { Clock, ShieldCheck } from 'lucide-react'
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Card } from '../../../components/ui/Card.jsx'
import { Badge, StatusChip } from '../../../components/ui/Badge.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useAssignmentBriefing } from '../../student/hooks.js'
import { queryStateView, formatDate } from '../../student/QueryState.jsx'
import { AssessmentStatusTimeline } from '../components/AssessmentStatusTimeline.jsx'
import { assignmentsListPath } from './BriefingPage.jsx'
import { ASSESSMENT_STATUS_COPY, CTA_COPY, INTEGRITY_COPY, NOT_MEASURED_COPY, SCOPE_LABEL, START_REASON_COPY } from '../../../lib/copy/student.js'

function Section({ id, title, children }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="text-base font-semibold text-prism-ink">{title}</h2>
      <div className="text-sm text-prism-ink-muted">{children}</div>
    </section>
  )
}

export default function AssessmentDetailPage() {
  const { assignmentId } = useParams()
  const { active } = useWorkspace()
  const query = useAssignmentBriefing(assignmentId)
  const listPath = assignmentsListPath(active)
  const crumbs = (label) => [{ label: 'Assessments', to: listPath }, { label }]
  const state = queryStateView(query, { label: 'Loading this assessment', homeTo: listPath })
  if (state) return <div><PageHeader title="Assessment" context={active} breadcrumbs={crumbs('Assessment')} />{state}</div>
  const { assignment: a, definition: d, sponsorship: s, start } = query.data
  const status = ASSESSMENT_STATUS_COPY[a.status] || ASSESSMENT_STATUS_COPY.NOT_STARTED
  const scope = s.scope === 'SPONSORED' ? SCOPE_LABEL.SPONSORED(s.sponsorName) : SCOPE_LABEL.PERSONAL
  const integrity = INTEGRITY_COPY[a.integrityMode]?.label || 'Standard'
  const due = formatDate(a.dueAt)
  const opens = formatDate(a.opensAt)
  const cta = a.cta.to && CTA_COPY[a.cta.kind]
  const blocked = !start.allowed && START_REASON_COPY[start.reason]

  return (
    <div className="space-y-6">
      <PageHeader title={a.title} description={d.description || undefined} context={active} breadcrumbs={crumbs(a.title)} />
      <Card className="space-y-4 p-6" data-testid="assessment-detail">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={s.scope === 'SPONSORED' ? 'accent' : 'neutral'}>{scope}</Badge>
          <StatusChip tone={status.tone} label={status.label} />
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-prism-ink-muted">
          <li className="flex items-center gap-1"><Clock size={14} aria-hidden="true" /> About {a.durationMinutes} minutes</li>
          <li className="flex items-center gap-1"><ShieldCheck size={14} aria-hidden="true" /> {integrity} integrity</li>
          {due && <li>Due {due}</li>}
          {a.status === 'UPCOMING' && opens && <li>Opens {opens}</li>}
        </ul>
        <AssessmentStatusTimeline assignment={a} />
        {a.underReview && <Callout tone="info" title="Under review">This result is not included in your capabilities until the review is finished.</Callout>}
        {blocked && a.status !== 'COMPLETED' && <p className="text-sm text-prism-ink-muted">{blocked}</p>}
        {cta && (
          <LinkButton to={a.cta.to} variant={a.cta.kind === 'VIEW_REPORT' ? 'secondary' : 'primary'}>
            {cta}<span className="sr-only">: {a.title}</span>
          </LinkButton>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <Section id="assess-measures" title="What this assessment looks at">
            {d.measures.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5">{d.measures.map((m) => <li key={m.id}>{m.name}</li>)}</ul>
            ) : (
              <p>The capabilities this assessment looks at are not listed yet.</p>
            )}
          </Section>
        </Card>
        <Card className="p-5">
          <Section id="assess-not" title="What it does not measure">
            {d.notMeasured.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5">{d.notMeasured.map((k) => <li key={k}>{NOT_MEASURED_COPY[k] || k}</li>)}</ul>
            ) : (
              <p>Nothing further is listed.</p>
            )}
          </Section>
        </Card>
      </div>
    </div>
  )
}