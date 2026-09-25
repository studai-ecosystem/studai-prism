// /app/growth and /app/campus/:organizationId/growth (spec §17). Growth is
// shown only between comparable formal assessments; until forms are approved
// as comparable, the page lists the assessments and says why no change is shown.
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Card } from '../../../components/ui/Card.jsx'
import { EmptyState } from '../../../components/states/index.js'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useGrowth } from '../../student/hooks.js'
import { queryStateView, formatDate } from '../../student/QueryState.jsx'
import { GROWTH_REASON_COPY } from '../../../lib/copy/student.js'

export default function GrowthPage() {
  const { active } = useWorkspace()
  const query = useGrowth()
  const header = <PageHeader title="Growth" description="Change between assessments, shown only when the assessments can be fairly compared." context={active} />
  const state = queryStateView(query, { label: 'Loading growth' })
  if (state) return <div>{header}{state}</div>
  const g = query.data
  const copy = GROWTH_REASON_COPY[g.reason] || GROWTH_REASON_COPY.NEEDS_COMPARABLE_REASSESSMENT
  return (
    <div className="space-y-6">
      {header}
      {!g.comparable && <EmptyState title={copy.title} description={copy.description} headingLevel={2} />}
      {g.assessments.length > 0 && (
        <section aria-labelledby="growth-history" className="space-y-3">
          <h2 id="growth-history" className="text-lg font-semibold text-prism-ink">Your completed assessments</h2>
          <ol className="space-y-2">
            {g.assessments.map((a) => (
              <li key={a.sessionId}>
                <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <span className="text-sm font-semibold text-prism-ink">{a.title || 'Assessment'}</span>
                  <span className="text-sm text-prism-ink-muted">{formatDate(a.completedAt) || 'Date not recorded'}</span>
                </Card>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
