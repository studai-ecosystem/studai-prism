// A sponsored (or student-shared) report, read by authorized staff. The
// server authorizes and records every read; the view is read-only.
import { useParams, useSearchParams } from 'react-router-dom'
import { ReportView } from '../../reports/components/ReportView.jsx'
import { CampusPage, crumbs } from '../components/CampusPage.jsx'
import { useCampusOrg, useSponsorReport } from '../hooks.js'
import { REPORT_COPY } from '../../../lib/copy/report.js'
import { ErrorState } from '../../../components/states/index.js'

export default function CampusReportPage() {
  const { sessionId } = useParams()
  const [params] = useSearchParams()
  const { orgId, workspace } = useCampusOrg()
  const query = useSponsorReport(sessionId, { version: params.get('version') })
  const pendingCode = query.error?.code
  const notReady = pendingCode === 'REPORT_NOT_READY' || pendingCode === 'REPORT_UNDER_REVIEW'
  const d = query.data
  return (
    <CampusPage
      title={REPORT_COPY.sponsorTitle}
      breadcrumbs={crumbs(orgId, { label: 'Students', to: `/campus/${orgId}/students` }, { label: 'Report' })}
      query={notReady ? null : query}
    >
      {notReady && (
        <ErrorState
          title={pendingCode === 'REPORT_UNDER_REVIEW' ? REPORT_COPY.underReviewTitle : 'This report is not ready yet'}
          description={pendingCode === 'REPORT_UNDER_REVIEW' ? REPORT_COPY.underReviewBody : 'Reports appear after the student finishes the assessment and it is reviewed.'}
          onRetry={() => query.refetch()}
        />
      )}
      {d && (
        <ReportView
          audience="SPONSOR"
          report={d.report}
          versionNumber={d.version.number}
          visibilityText={d.privacy?.visibility === 'SHARED_BY_STUDENT'
            ? REPORT_COPY.visibility.SHARED_BY_STUDENT
            : `Sponsored by ${workspace.organizationName || 'your institution'}. The student can see this report too; their personal Prism results stay private.`}
        />
      )}
    </CampusPage>
  )
}
