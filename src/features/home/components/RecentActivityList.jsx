// Recent activity on Home (P3.3): the three newest records from the same
// history projection that backs History - stored dates, Formal / Practice
// mode labels, server-permitted actions. No second store, nothing derived.
import { Link } from 'react-router-dom'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { ErrorState } from '../../../components/states/index.js'
import { Skeleton } from '../../../components/ui/Skeleton.jsx'
import { useStudentHistory } from '../../student/hooks.js'
import { HistoryItemCard } from '../../assessments/components/HistoryList.jsx'

const RECENT_LIMIT = 3
const sortKey = (i) => i.completedAt || i.issuedAt || i.startedAt || ''

export function RecentActivityList({ historyTo }) {
  const query = useStudentHistory()
  let body
  if (query.isPending) body = <Skeleton label="Loading recent activity" lines={3} />
  else if (query.error) {
    body = <ErrorState title="We could not load your recent activity" description="Your records are still kept. Please try again." requestId={query.error.requestId} onRetry={() => query.refetch()} headingLevel={3} />
  } else {
    const items = query.data.pages.flatMap((p) => p.items).slice().sort((a, b) => sortKey(b).localeCompare(sortKey(a))).slice(0, RECENT_LIMIT)
    body = items.length > 0 ? (
      <ul className="grid gap-4 lg:grid-cols-3" data-testid="recent-activity">
        {items.map((item) => <li key={item.id}><HistoryItemCard item={item} headingLevel={3} /></li>)}
      </ul>
    ) : (
      <p className="text-sm text-prism-ink-muted">No assessments or practice are linked to this workspace yet. If you have an earlier report that is missing, <Link to="/contact" className="font-medium text-prism-accent-strong underline">contact support</Link>.</p>
    )
  }
  return (
    <section aria-labelledby="recent-activity-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="recent-activity-title" className="text-lg font-semibold text-prism-ink">Recent activity</h2>
        <LinkButton to={historyTo} variant="secondary" size="sm">View all history</LinkButton>
      </div>
      {body}
    </section>
  )
}

export default RecentActivityList
