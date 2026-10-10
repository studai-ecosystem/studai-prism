// Settings → Assessment support (PROD-READY Phase 4; dark unless
// PRISM_V3_SUPPORT_ROUTES). Lists the learner's human review requests and
// adjustment requests in the active workspace, lets them request an
// adjustment for an assessment that has not started, and points to the
// report page for the identity check.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel } from '../../../components/ui/Card.jsx'
import { Select } from '../../../components/ui/FormControls.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { Skeleton } from '../../../components/ui/Skeleton.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useStudentAssessments } from '../../student/hooks.js'
import { formatDate } from '../../student/QueryState.jsx'
import { useSupportRequests } from '../hooks.js'
import { AccommodationRequestPanel } from './AccommodationRequestPanel.jsx'
import { ACCOMMODATION_COPY, SUPPORT_SETTINGS_COPY as S } from '../../../lib/copy/support.js'

const reportPath = (active, sessionId) => (active.type === 'CAMPUS_STUDENT'
  ? `/app/campus/${active.organizationId}/reports/${encodeURIComponent(sessionId)}`
  : `/app/reports/${encodeURIComponent(sessionId)}`)

export function SupportSettingsSection() {
  const { active } = useWorkspace()
  const mine = useSupportRequests()
  const assessments = useStudentAssessments()
  const [chosen, setChosen] = useState('')
  const cards = assessments.data ? [...(assessments.data.active || []), ...(assessments.data.upcoming || [])] : []
  const titles = new Map(cards.concat(assessments.data?.completed || []).map((c) => [c.id, c.title]))
  const notStarted = cards.filter((c) => !c.sessionId && ['NOT_STARTED', 'UPCOMING'].includes(c.status))

  let list
  if (mine.isPending) list = <Skeleton label="Loading your requests" lines={2} />
  else if (mine.error) list = <Callout tone="partial" title="Your requests could not be loaded">{mine.error.message}</Callout>
  else {
    const { humanReviews, accommodations } = mine.data
    list = (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-prism-ink">{S.reviewsTitle}</h3>
          {humanReviews.length === 0 ? <p className="text-sm text-prism-ink-muted">{S.noReviews}</p> : (
            <ul className="mt-2 divide-y divide-prism-border" data-testid="support-reviews">
              {humanReviews.map((r) => (
                <li key={r.request.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusChip tone={r.request.state === 'OPEN' ? 'partial' : 'positive'} label={S.reviewState[r.request.state]} />
                    <span className="text-prism-ink-muted">{formatDate(r.request.createdAt)}</span>
                  </span>
                  <Link to={reportPath(active, r.sessionId)} className="font-medium text-prism-accent-strong underline">{S.openReport}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-prism-ink">{S.adjustmentsTitle}</h3>
          {accommodations.length === 0 ? <p className="text-sm text-prism-ink-muted">{S.noAdjustments}</p> : (
            <ul className="mt-2 divide-y divide-prism-border" data-testid="support-adjustments">
              {accommodations.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-prism-ink">{titles.get(a.assignmentId) || 'Assessment'}</span>
                  <StatusChip tone={a.status === 'APPROVED' ? 'positive' : a.status === 'REQUESTED' ? 'partial' : 'neutral'} label={ACCOMMODATION_COPY.statusLabel[a.status]} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  return (
    <Panel id="support" title={S.title} description={S.description} data-testid="support-settings">
      <div className="space-y-6">
        {list}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-prism-ink">{ACCOMMODATION_COPY.title}</h3>
          {assessments.isPending ? <Skeleton label="Loading your assessments" lines={1} /> : notStarted.length === 0 ? (
            <p className="text-sm text-prism-ink-muted">{ACCOMMODATION_COPY.noneUpcoming}</p>
          ) : (
            <>
              <Select
                id="support-assessment"
                label={ACCOMMODATION_COPY.chooseAssessment}
                placeholder={ACCOMMODATION_COPY.choosePlaceholder}
                value={chosen}
                onChange={(e) => setChosen(e.target.value)}
                options={notStarted.map((c) => ({ value: c.id, label: c.title }))}
              />
              {chosen && <AccommodationRequestPanel key={chosen} assignmentId={chosen} idPrefix="settings-adjustment" />}
            </>
          )}
        </div>
        <p className="text-sm text-prism-ink-muted">{S.identityNote}</p>
      </div>
    </Panel>
  )
}

export default SupportSettingsSection
