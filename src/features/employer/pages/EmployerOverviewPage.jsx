// Employer overview (PROD-READY Phase 9): participation counts only, the
// number of reports people chose to share, and how the workspace may be used.
import { StatCard } from '../../../components/ui/Card.jsx'
import { EMPLOYER_PAGE_COPY } from '../../../lib/copy/employerPages.js'
import { EmployerPage, UsageRulesPanel } from '../components/EmployerPage.jsx'
import { useEmployerOverview } from '../hooks.js'

export default function EmployerOverviewPage() {
  const query = useEmployerOverview()
  const C = EMPLOYER_PAGE_COPY.overview
  const d = query.data
  return (
    <EmployerPage title={C.title} description={C.description} query={query}>
      {d && (
        <div className="space-y-6">
          <p className="max-w-3xl text-sm text-prism-ink">{d.purpose}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label={C.enrolled} value={d.enrolled} />
            <StatCard label={C.invited} value={d.invited} />
            <StatCard label={C.cohorts} value={d.cohorts} />
            <StatCard label={C.activeAssignments} value={d.activeAssignments} provenance={C.completed(d.completion.completed, d.completion.assigned)} />
            <StatCard label={C.shared} value={d.sharedReports} />
          </div>
          <UsageRulesPanel />
        </div>
      )}
    </EmployerPage>
  )
}
