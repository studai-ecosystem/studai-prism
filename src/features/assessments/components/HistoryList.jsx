// History (P1.2): every owned record in the active workspace, grouped by
// mode (formal assessments first, then practice), newest first. Statuses,
// dates and actions come from the server; an unknown date is said to be
// unknown, a failed run offers recovery, a legacy report opens as written.
import { Link, useNavigate } from 'react-router-dom'
import { Card } from '../../../components/ui/Card.jsx'
import { Badge, StatusChip } from '../../../components/ui/Badge.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { EmptyState, ErrorState } from '../../../components/states/index.js'
import { Skeleton } from '../../../components/ui/Skeleton.jsx'
import { InlineNotice } from '../../../components/ui/Notice.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useStudentHistory } from '../../student/hooks.js'
import { usePracticeStarters } from '../../development/hooks.js'
import { formatDate } from '../../student/QueryState.jsx'
import {
  DEVELOPMENT_COPY, HISTORY_ACTION_COPY, HISTORY_DATE_UNKNOWN, HISTORY_EMPTY, HISTORY_LEGACY_ACTION, HISTORY_MODE_LABEL, HISTORY_STATUS_COPY, SCOPE_LABEL,
  HISTORY_PRIVATE_SCOPE_LABEL, HISTORY_PRIVATE_STATUS,
} from '../../../lib/copy/student.js'

const UNTITLED = { FORMAL: 'Assessment', PRACTICE: 'Practice mission', PREPARATION: 'Preparation', SELF_REPORT: 'Your own note' }
const MODE_TONE = { FORMAL: 'neutral', PRACTICE: 'accent', PREPARATION: 'neutral', SELF_REPORT: 'insufficient' }
const DONE_VERB = { FORMAL: 'Completed', PRACTICE: 'Submitted', PREPARATION: 'Finished', SELF_REPORT: 'Noted' }

// P6.7: a fresh, uncoached challenge for the same capability is reachable
// from a finished practice record. Practice only; never from a formal item.
function FreshChallenge({ item }) {
  const { active } = useWorkspace()
  const starters = usePracticeStarters()
  const navigate = useNavigate()
  const devPath = active.type === 'CAMPUS_STUDENT' ? `/app/campus/${active.organizationId}/development` : '/app/development'
  const start = () => starters.challenge.mutate({ capabilityId: item.practice.capabilityId }, {
    onSuccess: ({ attempt, missionId }) => navigate(`${devPath}/missions/${missionId}?attempt=${encodeURIComponent(attempt.id)}`),
  })
  return (
    <div className="space-y-1">
      <Button variant="secondary" size="sm" onClick={start} loading={starters.challenge.isPending} data-testid="history-fresh-challenge">{DEVELOPMENT_COPY.player.freshChallengeNext}</Button>
      {starters.challenge.error && <div role="alert"><InlineNotice tone="blocked">{starters.challenge.error.message}</InlineNotice></div>}
    </div>
  )
}

function dateLine(item) {
  const when = formatDate(item.completedAt || item.issuedAt)
  if (when) return `${item.status === 'ACTIVE' ? 'Started' : DONE_VERB[item.mode] || 'Completed'} ${when}`
  const started = formatDate(item.startedAt)
  if (started) return `Started ${started}`
  return HISTORY_DATE_UNKNOWN
}

export function HistoryItemCard({ item, headingLevel = 3 }) {
  const H = `h${headingLevel}`
  const { active } = useWorkspace()
  const privateMode = item.mode === 'PREPARATION' || item.mode === 'SELF_REPORT'
  const status = (privateMode && item.status === 'COMPLETED' && HISTORY_PRIVATE_STATUS[item.mode]) || HISTORY_STATUS_COPY[item.status] || HISTORY_STATUS_COPY.COMPLETED
  const title = item.title || UNTITLED[item.mode]
  const action = item.permittedAction
  const legacyReport = action.kind === 'VIEW_REPORT' && item.reportFormat === 'LEGACY_V2'
  const actionLabel = legacyReport ? HISTORY_LEGACY_ACTION : HISTORY_ACTION_COPY[action.kind]
  const scope = privateMode ? HISTORY_PRIVATE_SCOPE_LABEL : item.scope === 'SPONSORED' ? SCOPE_LABEL.SPONSORED(active.organizationName) : SCOPE_LABEL.PERSONAL
  return (
    <Card as="article" className="space-y-3 p-5" data-testid="history-item" data-mode={item.mode} data-status={item.status}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap gap-1">
            <Badge tone={MODE_TONE[item.mode] || 'neutral'}>{HISTORY_MODE_LABEL[item.mode]}</Badge>
            <Badge tone="neutral">{scope}</Badge>
          </div>
          <H className="text-base font-semibold text-prism-ink">{title}</H>
        </div>
        <StatusChip tone={status.tone} label={status.label} />
      </div>
      <p className="text-sm text-prism-ink-muted">{dateLine(item)}</p>
      {status.note && <p className="text-sm text-prism-ink-muted">{status.note}</p>}
      {item.status === 'TECHNICAL_FAILED' && action.kind !== 'RECOVER' && (
        <p className="text-sm text-prism-ink-muted">This cannot be recovered from here. <Link to="/contact" className="font-medium text-prism-accent-strong underline">Contact support</Link> and quote the reference {item.sourceId}.</p>
      )}
      {action.to && actionLabel && (
        <LinkButton to={action.to} variant={action.kind === 'VIEW_REPORT' ? 'secondary' : 'primary'}>
          {actionLabel}<span className="sr-only">: {title}</span>
        </LinkButton>
      )}
      {item.mode === 'PRACTICE' && item.status === 'COMPLETED' && item.practice?.capabilityId && (
        <>
          {item.practice.assistanceMode === 'UNCOACHED' && <p className="text-xs text-prism-ink-subtle" data-testid="history-uncoached">Fresh challenge: completed uncoached, in an unfamiliar setting.</p>}
          <FreshChallenge item={item} />
        </>
      )}
    </Card>
  )
}

function Group({ label, items, headingLevel }) {
  if (items.length === 0) return null
  const H = `h${headingLevel}`
  return (
    <section aria-labelledby={`history-group-${label}`} className="space-y-3">
      <H id={`history-group-${label}`} className="text-sm font-semibold uppercase tracking-wide text-prism-ink-muted">{HISTORY_MODE_LABEL[label]}</H>
      <ul className="grid gap-4 lg:grid-cols-2">
        {items.map((i) => <li key={i.id}><HistoryItemCard item={i} headingLevel={headingLevel + 1} /></li>)}
      </ul>
    </section>
  )
}

export function HistoryList({ headingLevel = 2 }) {
  const query = useStudentHistory()
  if (query.isPending && query.fetchStatus === 'paused') {
    return <ErrorState title="You appear to be offline" description="Your history will load when your connection is back. Nothing has been removed." onRetry={() => query.refetch()} />
  }
  if (query.isPending) return <Skeleton label="Loading history" lines={6} />
  if (query.error) {
    const err = query.error
    return <ErrorState title="We could not load your history" description="Your records are still kept. Please try again." requestId={err.requestId} onRetry={() => query.refetch()} />
  }
  const items = query.data.pages.flatMap((p) => p.items)
  if (items.length === 0) return <EmptyState title={HISTORY_EMPTY.title} description={HISTORY_EMPTY.description} headingLevel={headingLevel} />
  return (
    <div className="space-y-6" data-testid="history-list">
      <Group label="FORMAL" items={items.filter((i) => i.mode === 'FORMAL')} headingLevel={headingLevel} />
      <Group label="PRACTICE" items={items.filter((i) => i.mode === 'PRACTICE')} headingLevel={headingLevel} />
      <Group label="PREPARATION" items={items.filter((i) => i.mode === 'PREPARATION')} headingLevel={headingLevel} />
      <Group label="SELF_REPORT" items={items.filter((i) => i.mode === 'SELF_REPORT')} headingLevel={headingLevel} />
      {query.hasNextPage && (
        <Button variant="secondary" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage} loadingLabel="Loading more…">Show more</Button>
      )}
    </div>
  )
}

export default HistoryList
