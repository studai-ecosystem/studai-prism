// One person in the employer workspace (PROD-READY Phase 9): groups, the
// status of assigned assessments, and only the reports they chose to share.
import { useParams } from 'react-router-dom'
import { Panel } from '../../../components/ui/Card.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { EMPLOYER_PAGE_COPY } from '../../../lib/copy/employerPages.js'
import { formatDate } from '../../student/QueryState.jsx'
import { EmployerPage, ParticipationStatus, employerCrumbs } from '../components/EmployerPage.jsx'
import { useEmployerOrg, useEmployerPerson } from '../hooks.js'

export default function EmployerPersonPage() {
  const { userId } = useParams()
  const { orgId } = useEmployerOrg()
  const query = useEmployerPerson(userId)
  const C = EMPLOYER_PAGE_COPY.person
  const d = query.data
  return (
    <EmployerPage
      title={d?.person.name || C.title}
      description={d?.person.email || null}
      breadcrumbs={employerCrumbs(orgId, { label: EMPLOYER_PAGE_COPY.people.title, to: `/employer/${orgId}/people` }, { label: d?.person.name || C.title })}
      query={query}
    >
      {d && (
        <div className="space-y-6">
          <p className="text-sm text-prism-ink-muted">{d.cohorts.map((c) => c.name).join(', ')}</p>
          <Panel title={C.assignments}>
            {d.assignments.length === 0 ? <p className="text-sm text-prism-ink-muted">—</p> : (
              <ul className="space-y-2 text-sm">
                {d.assignments.map((a) => (
                  <li key={a.assignmentId} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-prism-ink">{a.title || a.assignmentId}</span>
                    <ParticipationStatus status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title={C.sharedReports} description={d.note}>
            {d.sharedReports.length === 0 ? <p className="text-sm text-prism-ink-muted">{C.noShared}</p> : (
              <ul className="space-y-3 text-sm">
                {d.sharedReports.map((s) => (
                  <li key={s.sessionId} className="flex flex-wrap items-center gap-3">
                    <span className="text-prism-ink-muted">{C.until(formatDate(s.expiresAt))}</span>
                    <LinkButton size="sm" variant="secondary" to={`/employer/${orgId}/shared-reports/${encodeURIComponent(s.sessionId)}`}>{C.openReport}</LinkButton>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </EmployerPage>
  )
}
