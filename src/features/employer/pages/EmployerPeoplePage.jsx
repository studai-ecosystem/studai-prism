// Employer people (PROD-READY Phase 9): groups of new colleagues, invitations
// and the roster. Participation only — name, group, membership and whether an
// assigned assessment was finished. Fixed name order: there is no sorting,
// filtering or ranking by result (the server refuses such requests), and no
// bulk selection or export of people.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DataTable, Pagination } from '../../../components/ui/DataTable.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Input, Select, Textarea } from '../../../components/ui/FormControls.jsx'
import { Panel } from '../../../components/ui/Card.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { EmptyState } from '../../../components/states/EmptyState.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { MEMBER_STATUS_LABELS } from '../../../lib/copy/campus.js'
import { EMPLOYER_ROLE_LABELS } from '../../../lib/copy/employer.js'
import { EMPLOYER_PAGE_COPY } from '../../../lib/copy/employerPages.js'
import { MutationError } from '../../campus/components/CampusPage.jsx'
import { EmployerPage, ParticipationStatus } from '../components/EmployerPage.jsx'
import { useEmployerOrg, useEmployerCohorts, useEmployerPeople, useCreateEmployerCohort, useEmployerInvite, useEmployerSummary } from '../hooks.js'

function GroupsPanel({ cohorts, manage }) {
  const G = EMPLOYER_PAGE_COPY.groups
  const summary = useEmployerSummary()
  const create = useCreateEmployerCohort()
  const toast = useToast()
  const [name, setName] = useState('')
  const [family, setFamily] = useState('')
  const [touched, setTouched] = useState(false)
  const nameError = touched && !name.trim() ? 'Give the group a name.' : null
  const submit = (e) => {
    e.preventDefault()
    setTouched(true)
    if (!name.trim()) return
    create.mutate({ name: name.trim(), ...(family ? { jobFamily: family } : {}) }, {
      onSuccess: () => { toast.show(G.created, { tone: 'positive' }); setName(''); setFamily(''); setTouched(false) },
    })
  }
  const families = summary.data?.jobFamilyScope.families || []
  return (
    <Panel title={G.title}>
      {cohorts.length === 0 ? <p className="text-sm text-prism-ink-muted">{G.none}</p> : (
        <ul className="space-y-1 text-sm text-prism-ink" aria-label={G.title}>
          {cohorts.map((c) => (
            <li key={c.id}>
              <span className="font-medium">{c.name}</span>
              {c.memberCount !== null && <span className="text-prism-ink-muted"> · {c.memberCount} {c.memberCount === 1 ? 'person' : 'people'}</span>}
              {c.jobFamily && <span className="text-prism-ink-muted"> · {c.jobFamily.name}</span>}
            </li>
          ))}
        </ul>
      )}
      {manage && (
        <form className="mt-4 grid gap-3 md:grid-cols-[2fr_2fr_auto] md:items-end" onSubmit={submit} noValidate aria-label={G.create}>
          <Input label={G.name} value={name} onChange={(e) => setName(e.target.value)} required error={nameError} maxLength={160} />
          <Select label={G.family} hint={G.familyHint} value={family} onChange={(e) => setFamily(e.target.value)} placeholder={G.familyNone} options={families.map((f) => ({ value: f.id, label: f.name }))} />
          <Button type="submit" loading={create.isPending}>{G.create}</Button>
          <div className="md:col-span-3"><MutationError error={create.error} /></div>
        </form>
      )}
    </Panel>
  )
}

function InvitePanel({ cohorts }) {
  const I = EMPLOYER_PAGE_COPY.invite
  const summary = useEmployerSummary()
  const invite = useEmployerInvite()
  const toast = useToast()
  const [role, setRole] = useState('STUDENT')
  const [emails, setEmails] = useState('')
  const [cohortId, setCohortId] = useState('')
  const [error, setError] = useState(null)
  const submit = (e) => {
    e.preventDefault()
    const list = emails.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)
    if (!list.length) { setError(I.emailsRequired); return }
    setError(null)
    invite.mutate({ role, emails: list, ...(cohortId ? { cohortId } : {}) }, {
      onSuccess: (out) => { toast.show(I.sent(out.length), { tone: 'positive' }); setEmails('') },
    })
  }
  const roles = summary.data?.invitableRoles || Object.entries(EMPLOYER_ROLE_LABELS).map(([r, label]) => ({ role: r, label }))
  return (
    <Panel title={I.title}>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={submit} noValidate aria-label={I.title}>
        <Select label={I.role} value={role} onChange={(e) => setRole(e.target.value)} options={roles.map((r) => ({ value: r.role, label: r.label }))} />
        <Select label={I.group} value={cohortId} onChange={(e) => setCohortId(e.target.value)} placeholder={I.noGroup} options={cohorts.map((c) => ({ value: c.id, label: c.name }))} />
        <Textarea className="md:col-span-2" label={I.emails} hint={I.emailsHint} value={emails} onChange={(e) => setEmails(e.target.value)} error={error} rows={3} />
        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <Button type="submit" loading={invite.isPending}>{I.send}</Button>
        </div>
        <div className="md:col-span-2"><MutationError error={invite.error} /></div>
      </form>
    </Panel>
  )
}

export default function EmployerPeoplePage() {
  const P = EMPLOYER_PAGE_COPY.people
  const { orgId, can } = useEmployerOrg()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [cohortId, setCohortId] = useState('')
  const people = useEmployerPeople({ page, q, cohortId })
  const cohorts = useEmployerCohorts()
  const groupList = cohorts.data?.items || []
  const d = people.data
  return (
    <EmployerPage title={P.title} description={P.description} query={people.data ? null : people}>
      <div className="space-y-6">
        {can('cohorts.read') && <GroupsPanel cohorts={groupList} manage={can('students.manage')} />}
        {can('students.manage') && <InvitePanel cohorts={groupList} />}
        <section aria-labelledby="people-list" className="space-y-3">
          <h2 id="people-list" className="text-base font-semibold text-prism-ink">{P.title}</h2>
          <p className="text-sm text-prism-ink-muted">{d?.note}</p>
          <form className="grid gap-3 md:grid-cols-2" role="search" aria-label={P.search} onSubmit={(e) => e.preventDefault()}>
            <Input label={P.search} value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} maxLength={120} />
            <Select label={P.group} value={cohortId} onChange={(e) => { setCohortId(e.target.value); setPage(1) }} placeholder={P.allGroups} options={groupList.map((c) => ({ value: c.id, label: c.name }))} />
          </form>
          {d && d.items.length === 0 ? <EmptyState title={P.none} description={P.noneBody} /> : d && (
            <>
              <DataTable
                caption={P.title}
                rows={d.items}
                rowKey={(r) => r.userId || `invite:${r.email}`}
                columns={[
                  { key: 'name', header: P.name, render: (r) => (r.kind === 'MEMBER' ? <Link className="font-medium text-prism-accent-strong hover:underline" to={`/employer/${orgId}/people/${encodeURIComponent(r.userId)}`}>{r.name || r.email}</Link> : <span className="text-prism-ink-muted">{P.invitedRow}</span>) },
                  { key: 'email', header: P.email, render: (r) => r.email || '—' },
                  { key: 'group', header: P.group, render: (r) => r.cohorts.map((c) => c.name).join(', ') || '—' },
                  { key: 'status', header: P.status, render: (r) => <StatusChip tone={r.status === 'ACTIVE' ? 'positive' : 'neutral'} label={MEMBER_STATUS_LABELS[r.status] || r.status} /> },
                  { key: 'assessment', header: P.assessment, render: (r) => <ParticipationStatus status={r.assessmentStatus} /> },
                ]}
              />
              <Pagination
                hasPrevious={page > 1}
                hasNext={page * d.pageSize < d.total}
                onPrevious={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => p + 1)}
                summary={`${d.total} ${d.total === 1 ? 'person' : 'people'}`}
              />
            </>
          )}
        </section>
      </div>
    </EmployerPage>
  )
}
