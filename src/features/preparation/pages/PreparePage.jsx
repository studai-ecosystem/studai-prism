// /app/prepare (P7). Personal, private preparation for a real situation:
// the learner's own preparations and the wizard to start one. Nothing here
// is a formal assessment and nothing changes a formal result. In a campus
// workspace the page explains the scope and points back to Personal: a
// sponsored practice experience is a separate, explicit choice.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Card } from '../../../components/ui/Card.jsx'
import { Badge, StatusChip } from '../../../components/ui/Badge.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { EmptyState } from '../../../components/states/index.js'
import { Callout } from '../../../components/ui/Notice.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { queryStateView, formatDate } from '../../student/QueryState.jsx'
import { PREPARATION_COPY } from '../../../lib/copy/student.js'
import { usePreparations, usePreparationActions } from '../hooks.js'
import { PreparationWizard } from '../components/PreparationWizard.jsx'

const STATE_COPY = {
  DRAFT: { label: 'Not confirmed', tone: 'neutral' },
  REHEARSING: { label: 'In progress', tone: 'partial' },
  COMPLETED: { label: 'Finished', tone: 'positive' },
  ABANDONED: { label: 'Stopped', tone: 'neutral' },
}

function PreparationCard({ item }) {
  const s = STATE_COPY[item.state] || STATE_COPY.DRAFT
  const open = item.state === 'DRAFT' || item.state === 'REHEARSING'
  const when = formatDate(item.completedAt || item.createdAt)
  const name = item.title || item.situationLabel || 'Preparation'
  return (
    <Card as="article" className="space-y-3" data-testid="preparation-item" data-state={item.state}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Badge tone="neutral">Private preparation</Badge>
          <h3 className="text-base font-semibold text-prism-ink">{name}</h3>
          {item.title && <p className="text-xs text-prism-ink-subtle">{item.situationLabel}</p>}
        </div>
        <StatusChip tone={s.tone} label={s.label} />
      </div>
      <p className="text-sm text-prism-ink-muted">{item.goal}</p>
      {item.practiceTargetLabel && <p className="text-xs text-prism-ink-subtle">Practising: {item.practiceTargetLabel}</p>}
      {when && <p className="text-xs text-prism-ink-subtle">{item.completedAt ? 'Finished' : 'Started'} {when}</p>}
      {item.reminderDue && <p className="text-sm text-prism-ink" data-testid="reminder-due">Reminder: you asked to record how the real conversation went.</p>}
      <LinkButton to={`/app/prepare/${encodeURIComponent(item.id)}`} variant={open ? 'primary' : 'secondary'}>
        {open ? 'Continue' : 'Open'}<span className="sr-only">: {name}</span>
      </LinkButton>
    </Card>
  )
}

export default function PreparePage() {
  const { active, workspaces, switchTo } = useWorkspace()
  const navigate = useNavigate()
  const query = usePreparations()
  const actions = usePreparationActions()
  const [wizardOpen, setWizardOpen] = useState(false)
  const hasCollegeMembership = workspaces.some((w) => w.type !== 'PERSONAL')
  const header = <PageHeader title="Prepare" description="Rehearse a real conversation privately and leave with a short card you can use." context={active} />
  if (active.type !== 'PERSONAL') {
    const personal = workspaces.find((w) => w.type === 'PERSONAL')
    return (
      <div className="space-y-6">
        {header}
        <Callout
          tone="info"
          title="Preparation is personal"
          action={personal ? <Button onClick={() => { switchTo(personal.id); navigate('/app/prepare') }}>Switch to my personal workspace</Button> : null}
        >
          Private preparation lives in your personal workspace only; {active.organizationName || 'your institution'} cannot see it. Practice you do in this campus workspace is sponsored and visible to the sponsor as its policy states — that is a separate, explicit choice.
        </Callout>
      </div>
    )
  }
  const state = queryStateView(query, { label: 'Loading your preparations' })
  if (state) return <div>{header}{state}</div>
  const items = query.data
  return (
    <div className="space-y-6">
      {header}
      {wizardOpen ? (
        <>
          <PreparationWizard actions={actions} hasCollegeMembership={hasCollegeMembership} onConfirmed={(attempt) => navigate(`/app/prepare/${encodeURIComponent(attempt.id)}`)} />
          <Button variant="ghost" onClick={() => setWizardOpen(false)}>Cancel</Button>
        </>
      ) : (
        <>
          <Callout tone="info" title={PREPARATION_COPY.privateLabel} action={<Button onClick={() => setWizardOpen(true)}>Prepare for a situation</Button>}>
            {PREPARATION_COPY.privateNote} {hasCollegeMembership && PREPARATION_COPY.contextBeforeDetails} {PREPARATION_COPY.allowanceNote}
          </Callout>
          {items.length === 0
            ? <EmptyState title="No preparations yet" description="Start with a situation you have coming up: explaining a recommendation, clarifying a brief, disagreeing with a colleague, negotiating a deadline, giving an update or making a handover." headingLevel={2} />
            : (
              <section aria-labelledby="preparations-heading" className="space-y-3">
                <h2 id="preparations-heading" className="text-lg font-semibold text-prism-ink">Your preparations</h2>
                <ul className="grid gap-4 lg:grid-cols-2">
                  {items.map((i) => <li key={i.id}><PreparationCard item={i} /></li>)}
                </ul>
              </section>
            )}
        </>
      )}
    </div>
  )
}
