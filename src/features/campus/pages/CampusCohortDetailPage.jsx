// Cohort detail (spec §23): members, pending invitations, invite by email,
// remove a student, archive.
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Panel } from '../../../components/ui/Card.jsx'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { Textarea } from '../../../components/ui/FormControls.jsx'
import { Tabs } from '../../../components/ui/Tabs.jsx'
import { useFlag } from '../../../app/providers/FeatureFlagProvider.jsx'
import { CohortOverview, CohortCapabilities, CohortNeeds, CohortInterventions, CohortCycles, CohortReports } from '../components/CohortInsights.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { formatDate } from '../../student/QueryState.jsx'
import { CampusPage, ConfirmDialog, MutationError, crumbs, focusFirstInvalid } from '../components/CampusPage.jsx'
import { useCampusOrg, useCohort, useInvite, useRemoveFromCohort, useUpdateCohort, useResendInvite } from '../hooks.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function CampusCohortDetailPage() {
  const { cohortId } = useParams()
  const { orgId, can } = useCampusOrg()
  const toast = useToast()
  const query = useCohort(cohortId)
  const invite = useInvite()
  const remove = useRemoveFromCohort(cohortId)
  const update = useUpdateCohort(cohortId)
  const resend = useResendInvite()
  const [emails, setEmails] = useState('')
  const [emailError, setEmailError] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [archiving, setArchiving] = useState(false)
  const [tab, setTab] = useState('overview')
  const { enabled: analyticsOn } = useFlag('PRISM_CAMPUS_ANALYTICS')
  const showAnalytics = analyticsOn && can('analytics.read')
  const manage = can('students.manage')
  const d = query.data
  const name = d?.cohort.name || 'Cohort'

  function onInvite(e) {
    e.preventDefault()
    const list = [...new Set(emails.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))]
    const bad = list.filter((x) => !EMAIL.test(x))
    const fail = (msg) => { setEmailError(msg); focusFirstInvalid() }
    if (!list.length) return fail('Enter at least one email address.')
    if (bad.length) return fail(`These are not valid email addresses: ${bad.slice(0, 5).join(', ')}`)
    if (list.length > 200) return fail('Invite up to 200 students at a time, or import a CSV file.')
    setEmailError(null)
    return invite.mutate({ role: 'STUDENT', emails: list, cohortId }, {
      onSuccess: (r) => {
        setEmails('')
        toast.show(`${r.length} ${r.length === 1 ? 'invitation' : 'invitations'} created.`, { tone: 'positive' })
      },
    })
  }

  return (
    <CampusPage
      title={name}
      description={d ? `${d.cohort.memberCount} ${d.cohort.memberCount === 1 ? 'student' : 'students'}${d.cohort.semester ? ` · ${d.cohort.semester}` : ''}${d.cohort.status === 'ARCHIVED' ? ' · Archived' : ''}` : undefined}
      breadcrumbs={crumbs(orgId, { label: 'Cohorts', to: `/campus/${orgId}/cohorts` }, { label: name })}
      query={query}
      actions={manage && d?.cohort.status === 'ACTIVE' && (
        <>
          <LinkButton to={`/campus/${orgId}/cohorts/import?cohort=${cohortId}`}>Import students</LinkButton>
          <Button variant="secondary" onClick={() => setArchiving(true)}>Archive cohort</Button>
        </>
      )}
    >
      {d && (
        <Tabs
          label="Cohort sections"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: 'Overview', content: <CohortOverview d={d} onOpen={setTab} /> },
            { id: 'students', label: 'Students', content: (
              <div className="space-y-6">
          <Panel title="Students">
            <DataTable
              caption={`Students in ${name}`}
              rows={d.members}
              emptyMessage="No students in this cohort yet."
              columns={[
                { key: 'name', header: 'Student', render: (m) => (can('students.read') ? <Link className="text-prism-accent-strong hover:underline" to={`/campus/${orgId}/students/${encodeURIComponent(m.id)}`}>{m.name || m.email || 'Student'}</Link> : (m.name || m.email)) },
                { key: 'email', header: 'Email' },
                { key: 'addedAt', header: 'Added', render: (m) => formatDate(m.addedAt) || '—' },
                ...(manage ? [{ key: 'actions', header: <span className="sr-only">Actions</span>, render: (m) => <Button size="sm" variant="ghost" onClick={() => setRemoving(m)}>Remove<span className="sr-only"> {m.name || m.email}</span></Button> }] : []),
              ]}
            />
          </Panel>
          <Panel title="Invitations waiting" description="Students who were invited but have not accepted yet.">
            <DataTable
              caption="Invitations waiting"
              rows={d.pendingInvites}
              emptyMessage="No invitations waiting."
              columns={[
                { key: 'email', header: 'Email' },
                { key: 'expiresAt', header: 'Expires', render: (i) => formatDate(i.expiresAt) },
                ...(manage ? [{ key: 'actions', header: <span className="sr-only">Actions</span>, render: (i) => <Button size="sm" variant="ghost" loading={resend.isPending && resend.variables === i.id} onClick={() => resend.mutate(i.id, { onSuccess: () => toast.show(`Invitation sent again to ${i.email}.`, { tone: 'positive' }) })}>Resend<span className="sr-only"> to {i.email}</span></Button> }] : []),
              ]}
            />
          </Panel>
          {manage && d.cohort.status === 'ACTIVE' && (
            <Panel title="Invite students" description="Each student gets a private link. They sign in with this email to accept.">
              <form onSubmit={onInvite} className="space-y-3" noValidate>
                <Textarea label="Email addresses" value={emails} onChange={(e) => setEmails(e.target.value)} rows={3} hint="Separate addresses with commas or new lines." error={emailError} />
                <MutationError error={invite.error} />
                <Button type="submit" loading={invite.isPending}>Send invitations</Button>
              </form>
            </Panel>
          )}
              </div>
            ) },
            ...(showAnalytics ? [
              { id: 'capabilities', label: 'Capability distribution', content: <CohortCapabilities cohortId={cohortId} /> },
              { id: 'needs', label: 'Development needs', content: <CohortNeeds cohortId={cohortId} /> },
            ] : []),
            { id: 'interventions', label: 'Interventions', content: <CohortInterventions cohortId={cohortId} /> },
            { id: 'cycles', label: 'Assessment cycles and growth', content: <CohortCycles cohortId={cohortId} /> },
            ...(showAnalytics ? [{ id: 'reports', label: 'Reports', content: <CohortReports /> }] : []),
          ]}
        />
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove from cohort?"
        description={removing ? `${removing.name || removing.email} will no longer be in ${name}. Their enrolment and past results are not changed.` : ''}
        confirmLabel="Remove"
        tone="danger"
        pending={remove.isPending}
        error={remove.error}
        onClose={() => setRemoving(null)}
        onConfirm={() => remove.mutate(removing.id, { onSuccess: () => { toast.show('Removed from the cohort.', { tone: 'positive' }); setRemoving(null) } })}
      />
      <ConfirmDialog
        open={archiving}
        title="Archive this cohort?"
        description="Archived cohorts cannot receive new assessments. Students and past results are kept."
        confirmLabel="Archive"
        pending={update.isPending}
        error={update.error}
        onClose={() => setArchiving(false)}
        onConfirm={() => update.mutate({ status: 'ARCHIVED' }, { onSuccess: () => { toast.show('Cohort archived.', { tone: 'positive' }); setArchiving(false) } })}
      />
    </CampusPage>
  )
}
