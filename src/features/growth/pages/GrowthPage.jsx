// /app/growth and /app/campus/:organizationId/growth (spec §17). Growth is
// shown only between formal assessments whose forms are APPROVED as
// comparable and only for capabilities with enough evidence in both; every
// other case says why no change is shown. Changes are level labels, never
// scores or percentages.
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Panel } from '../../../components/ui/Card.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { EmptyState } from '../../../components/states/index.js'
import { Callout } from '../../../components/ui/Notice.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useGrowth } from '../../student/hooks.js'
import { queryStateView, formatDateTime, formatDate } from '../../student/QueryState.jsx'
import { GROWTH_REASON_COPY, GROWTH_COPY } from '../../../lib/copy/student.js'
import { GrowthDeltaCard } from '../components/GrowthDeltaCard.jsx'
import { GrowthTimeline } from '../components/GrowthTimeline.jsx'
import { EvidenceSource } from '../../../components/evidence/EvidenceSource.jsx'
import { MyPrismSectionNav } from '../../../components/navigation/MyPrismSectionNav.jsx'
import { useStudentHistory } from '../../student/hooks.js'
import { useFlag } from '../../../app/providers/FeatureFlagProvider.jsx'
import { useCheckins, usePreparationActions } from '../../preparation/hooks.js'
import { CheckinForm } from '../../preparation/components/CheckinForm.jsx'
import { HISTORY_MODE_LABEL, PREPARATION_COPY } from '../../../lib/copy/student.js'
import { Badge } from '../../../components/ui/Badge.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { useState } from 'react'

// CH-36: practice and self-reported notes sit in their own sections, apart
// from the formal comparison. They list what happened and when; no change,
// delta or trend is derived from them.
function PracticeHistorySection() {
  const history = useStudentHistory()
  const items = history.data ? history.data.pages.flatMap((p) => p.items).filter((i) => i.mode === 'PRACTICE' || i.mode === 'PREPARATION') : []
  return (
    <section aria-labelledby="growth-practice-history" className="space-y-3" data-testid="growth-practice-history">
      <h2 id="growth-practice-history" className="text-lg font-semibold text-prism-ink">Practice history</h2>
      <p className="text-sm text-prism-ink-muted">Practice missions and private preparation you did, kept separate from formal assessments. They are not part of any comparison.</p>
      {history.isPending && <p className="text-sm text-prism-ink-muted">Loading practice history…</p>}
      {history.error && <p className="text-sm text-prism-ink-muted">Practice history could not be loaded right now.</p>}
      {history.data && items.length === 0 && <p className="text-sm text-prism-ink-muted">No practice yet.</p>}
      {items.length > 0 && (
        <ul className="divide-y divide-prism-border rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm" data-mode={i.mode}>
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={i.mode === 'PRACTICE' ? 'accent' : 'neutral'}>{HISTORY_MODE_LABEL[i.mode]}</Badge>
                <span className="font-medium text-prism-ink">{i.title || (i.mode === 'PRACTICE' ? 'Practice mission' : 'Preparation')}</span>
              </span>
              <span className="text-prism-ink-muted">{formatDate(i.completedAt || i.startedAt) || 'Date not recorded'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SelfReportSection() {
  const checkins = useCheckins()
  const { checkin } = usePreparationActions()
  const [open, setOpen] = useState(false)
  return (
    <section aria-labelledby="growth-self-report" className="space-y-3" data-testid="growth-self-report">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="growth-self-report" className="text-lg font-semibold text-prism-ink">Your own notes (self-reported)</h2>
        <Badge tone="insufficient">{PREPARATION_COPY.selfReportLabel}</Badge>
      </div>
      <p className="text-sm text-prism-ink-muted">{PREPARATION_COPY.selfReportNote}</p>
      {checkins.isPending && <p className="text-sm text-prism-ink-muted">Loading your notes…</p>}
      {checkins.error && <p className="text-sm text-prism-ink-muted">Your notes could not be loaded right now.</p>}
      {checkins.data && checkins.data.length === 0 && <p className="text-sm text-prism-ink-muted">No notes yet.</p>}
      {checkins.data && checkins.data.length > 0 && (
        <ul className="space-y-2">
          {checkins.data.map((c) => (
            <li key={c.id} className="rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface px-4 py-3 text-sm" data-testid="self-report-item">
              <p className="text-xs text-prism-ink-subtle">{formatDate(c.createdAt) || 'Date not recorded'}</p>
              <p className="mt-1 text-prism-ink"><span className="font-medium">Tried:</span> {c.whatTried}</p>
              <p className="mt-1 text-prism-ink"><span className="font-medium">Happened:</span> {c.outcome}</p>
            </li>
          ))}
        </ul>
      )}
      {open
        ? (
          <Panel title={PREPARATION_COPY.checkinPrompt} headingLevel={3}>
            <CheckinForm sourceType="REPORT" onSubmit={(body) => checkin.mutate(body)} submitting={checkin.isPending} error={checkin.error} saved={checkin.isSuccess} onDone={() => { checkin.reset(); setOpen(false) }} />
          </Panel>
        )
        : <Button variant="secondary" onClick={() => setOpen(true)}>Add a note</Button>}
    </section>
  )
}

function SessionLine({ label, s }) {
  return (
    <div>
      <dt className="text-prism-ink-muted">{label}</dt>
      <dd className="mt-1 font-medium text-prism-ink">
        <EvidenceSource title={s.title} date={s.completedAt} emptyDate="Date not recorded" />
        {s.form && <span className="block text-xs font-normal text-prism-ink-subtle">Form version {s.form.version}</span>}
      </dd>
    </div>
  )
}

export default function GrowthPage() {
  const { active } = useWorkspace()
  const query = useGrowth()
  const preparationOn = useFlag('PRISM_PREPARATION_V1').enabled && active.type === 'PERSONAL'
  const header = (
    <>
      <PageHeader title="Growth" description="Change between assessments, shown only when the assessments can be fairly compared." context={active} />
      {active.type === 'PERSONAL' && <MyPrismSectionNav current="growth" />}
    </>
  )
  const state = queryStateView(query, { label: 'Loading growth' })
  if (state) return <div>{header}{state}</div>
  const g = query.data
  const copy = GROWTH_REASON_COPY[g.reason] || GROWTH_REASON_COPY.NEEDS_COMPARABLE_REASSESSMENT
  const compared = g.changes.filter((c) => c.comparable)
  const notCompared = g.changes.filter((c) => !c.comparable)
  const assessmentsPath = active.type === 'CAMPUS_STUDENT' ? `/app/campus/${active.organizationId}/assignments` : '/app/assessments'
  const openReassessment = g.reassessments.find((r) => r.status === 'ACTIVE' && r.rosterStatus !== 'COMPLETED')
  return (
    <div className="space-y-6">
      {header}
      {openReassessment && (
        <Panel title="Reassessment open">
          <p className="text-sm text-prism-ink">{openReassessment.name} is open until {formatDateTime(openReassessment.windowEnd)}.</p>
          {openReassessment.comparability !== 'APPROVED' && <p className="mt-2 text-sm text-prism-ink-muted">{GROWTH_COPY.reassessmentNotComparable}</p>}
          <LinkButton className="mt-3" to={assessmentsPath}>Go to your assessments</LinkButton>
        </Panel>
      )}
      {!g.comparable && (g.assessments.length >= 2
        ? <div data-testid="growth-not-comparable"><Callout tone="partial" title={copy.title}>{copy.description}</Callout></div>
        : <EmptyState title={copy.title} description={copy.description} headingLevel={2} />)}
      {g.comparison && (
        <section aria-labelledby="growth-comparison" className="space-y-3">
          <h2 id="growth-comparison" className="text-lg font-semibold text-prism-ink">What is compared</h2>
          <Panel>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <SessionLine label="Baseline" s={g.comparison.baseline} />
              <SessionLine label="Reassessment" s={g.comparison.reassessment} />
            </dl>
            <p className="mt-3 text-sm text-prism-ink-muted" data-testid="growth-comparability">{GROWTH_COPY.formApproved}</p>
          </Panel>
        </section>
      )}
      {compared.length > 0 && (
        <section aria-labelledby="growth-changes" className="space-y-3">
          <h2 id="growth-changes" className="text-lg font-semibold text-prism-ink">Capability changes</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {compared.map((c) => <li key={c.capabilityId}><GrowthDeltaCard change={c} /></li>)}
          </ul>
        </section>
      )}
      {g.comparison && notCompared.length > 0 && (
        <section aria-labelledby="growth-not-compared" className="space-y-2">
          <h2 id="growth-not-compared" className="text-base font-semibold text-prism-ink">Not compared</h2>
          <ul className="space-y-1 text-sm text-prism-ink-muted">
            {notCompared.map((c) => <li key={c.capabilityId}>{c.name || 'Capability'}: {GROWTH_COPY.notCompared[c.reason] || 'Not comparable'}</li>)}
          </ul>
        </section>
      )}
      <GrowthTimeline assessments={g.assessments} interventions={g.interventions} reassessments={g.reassessments} comparison={g.comparison} />
      {preparationOn && (
        <>
          <PracticeHistorySection />
          <SelfReportSection />
        </>
      )}
    </div>
  )
}
