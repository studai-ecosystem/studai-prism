// Reports people chose to share with the employer (PROD-READY Phase 9). A
// report is listed only while its owner shares it; nothing here orders people
// by anything in their reports.
import { Link } from 'react-router-dom'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { EmptyState } from '../../../components/states/EmptyState.jsx'
import { EMPLOYER_PAGE_COPY } from '../../../lib/copy/employerPages.js'
import { formatDate } from '../../student/QueryState.jsx'
import { EmployerPage } from '../components/EmployerPage.jsx'
import { useEmployerOrg, useSharedReports } from '../hooks.js'

export default function EmployerSharedReportsPage() {
  const C = EMPLOYER_PAGE_COPY.sharedReports
  const { orgId } = useEmployerOrg()
  const query = useSharedReports()
  const d = query.data
  return (
    <EmployerPage title={C.title} description={C.description} query={query}>
      {d && (
        <div className="space-y-3">
          <p className="text-sm text-prism-ink-muted">{d.note}</p>
          {d.items.length === 0 ? <EmptyState title={C.none} description={C.noneBody} /> : (
            <DataTable
              caption={C.title}
              rows={d.items}
              rowKey={(r) => r.sessionId}
              columns={[
                { key: 'person', header: C.person, render: (r) => r.person.name || '—' },
                { key: 'disclosure', header: C.disclosure, render: (r) => (r.disclosureLevel === 'FULL' ? C.full : C.summary) },
                { key: 'until', header: C.until, render: (r) => formatDate(r.expiresAt) },
                { key: 'open', header: C.open, render: (r) => <Link className="font-medium text-prism-accent-strong hover:underline" to={`/employer/${orgId}/shared-reports/${encodeURIComponent(r.sessionId)}`}>{C.open}<span className="sr-only">: {r.person.name || ''}</span></Link> },
              ]}
            />
          )}
        </div>
      )}
    </EmployerPage>
  )
}
