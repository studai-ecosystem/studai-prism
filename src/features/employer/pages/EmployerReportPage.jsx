// A report an employee shared with the employer (PROD-READY Phase 9). The
// server opens it only through the employee's active share grant, records the
// read, and attaches how it may be used. Read-only.
import { useParams } from 'react-router-dom'
import { ReportView } from '../../reports/components/ReportView.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { ErrorState } from '../../../components/states/index.js'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { EMPLOYER_SHARED_VISIBILITY } from '../../../lib/copy/employer.js'
import { EMPLOYER_PAGE_COPY } from '../../../lib/copy/employerPages.js'
import { EmployerPage, employerCrumbs } from '../components/EmployerPage.jsx'
import { useEmployerOrg, useSharedReport } from '../hooks.js'

export default function EmployerReportPage() {
  const { sessionId } = useParams()
  const { orgId } = useEmployerOrg()
  const query = useSharedReport(sessionId)
  const C = EMPLOYER_PAGE_COPY.report
  const gone = query.error && (query.error.status === 404 || query.error.code === 'NOT_FOUND')
  const d = query.data
  return (
    <EmployerPage
      title={C.title}
      breadcrumbs={employerCrumbs(orgId, { label: EMPLOYER_PAGE_COPY.sharedReports.title, to: `/employer/${orgId}/shared-reports` }, { label: C.title })}
      query={gone ? null : query}
    >
      {gone && (
        <ErrorState
          title={C.gone}
          description={C.goneBody}
          action={<LinkButton to={`/employer/${orgId}/shared-reports`} variant="secondary">{EMPLOYER_PAGE_COPY.sharedReports.title}</LinkButton>}
        />
      )}
      {d && (
        <div className="space-y-4">
          <Callout tone="info" title={d.notice}>
            <ul className="list-disc space-y-1 pl-5" data-testid="employer-prohibited-uses">
              {d.prohibitedUses.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </Callout>
          <ReportView audience="SPONSOR" report={d.report} versionNumber={d.version.number} visibilityText={EMPLOYER_SHARED_VISIBILITY} />
        </div>
      )}
    </EmployerPage>
  )
}
