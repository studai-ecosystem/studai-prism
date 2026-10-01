// Team (spec §29): staff members and their roles, invitations, role changes
// and removal. The server enforces who may do what; every change is audited.
import { useState } from 'react'
import { DataTable } from '../../../components/ui/DataTable.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Modal } from '../../../components/ui/Modal.jsx'
import { Select, Textarea } from '../../../components/ui/FormControls.jsx'
import { Panel } from '../../../components/ui/Card.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { formatDate } from '../../student/QueryState.jsx'
import { ROLE_LABELS } from '../../../lib/copy/privacy.js'
import { MEMBER_STATUS_LABELS } from '../../../lib/copy/campus.js'
import { CampusPage, ConfirmDialog, MutationError, focusFirstInvalid, focusPageTitle } from '../components/CampusPage.jsx'
import { useMembers, useChangeRole, useRemoveMember, useInvite, useResendInvite, useCohorts, useStructure } from '../hooks.js'

const STAFF_ROLES = ['ORG_OWNER', 'PLACEMENT_DIRECTOR', 'PLACEMENT_OFFICER', 'DEPARTMENT_COORDINATOR', 'FACULTY_MENTOR']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const roleOptions = STAFF_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))

function InviteStaffDialog({ open, onClose, limited }) {
  const invite = useInvite()
  const cohorts = useCohorts()
  const toast = useToast()
  const [emails, setEmails] = useState('')
  const [role, setRole] = useState(limited ? 'FACULTY_MENTOR' : 'PLACEMENT_OFFICER')
  const options = limited ? roleOptions.filter((o) => o.value === 'FACULTY_MENTOR') : roleOptions
  const [cohortId, setCohortId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const structure = useStructure()
  const [error, setError] = useState(null)
  const needsCohort = role === 'PLACEMENT_OFFICER' || role === 'FACULTY_MENTOR'
  function submit(e) {
    e.preventDefault()
    const list = [...new Set(emails.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))]
    if (!list.length || list.some((x) => !EMAIL.test(x))) { setError('Enter valid email addresses, separated by commas.'); return focusFirstInvalid() }
    setError(null)
    return invite.mutate({ role, emails: list, ...(needsCohort && cohortId ? { cohortId } : {}), ...(role === 'DEPARTMENT_COORDINATOR' && departmentId ? { departmentId } : {}) }, {
      onSuccess: (r) => { toast.show(`${r.length} ${r.length === 1 ? 'invitation' : 'invitations'} created.`, { tone: 'positive' }); setEmails(''); onClose() },
    })
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite team members"
      description="Each person gets a private link and signs in with this email to accept."
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="invite-staff" loading={invite.isPending}>Send invitations</Button>
        </>
      )}
    >
      <form id="invite-staff" className="space-y-3" onSubmit={submit} noValidate>
        <Textarea label="Email addresses" value={emails} onChange={(e) => setEmails(e.target.value)} rows={3} error={error} required />
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)} options={options} hint={limited ? 'Your role can invite faculty mentors.' : undefined} />
        {needsCohort && (
          <Select label="Cohort they work with" value={cohortId} onChange={(e) => setCohortId(e.target.value)} placeholder="Choose later" options={(cohorts.data || []).filter((c) => c.status === 'ACTIVE').map((c) => ({ value: c.id, label: c.name }))} hint="Officers and mentors only see students in their cohorts." />
        )}
        {role === 'DEPARTMENT_COORDINATOR' && (
          <Select label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} placeholder="Choose a department" options={(structure.data?.departments || []).map((x) => ({ value: x.id, label: x.name }))} hint="Coordinators only see students in their department." />
        )}
        <MutationError error={invite.error} />
      </form>
    </Modal>
  )
}

export default function CampusMembersPage() {
  const toast = useToast()
  const query = useMembers()
  const change = useChangeRole()
  const remove = useRemoveMember()
  const resend = useResendInvite()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [pendingRole, setPendingRole] = useState(null)
  const [removing, setRemoving] = useState(null)
  const d = query.data
  const manage = Boolean(d?.viewer.canManageRoles)
  const canInvite = Boolean(d?.viewer.canInvite)
  return (
    <CampusPage
      title="Team"
      description="Staff who can use Prism Campus for your institution, and what each role can see."
      query={query}
      actions={canInvite && <Button onClick={() => setInviteOpen(true)}>Invite team members</Button>}
    >
      {d && (
        <div className="space-y-6">
          <DataTable
            caption="Team members"
            rows={d.members}
            rowKey={(m) => m.membershipId}
            emptyMessage="No team members yet."
            columns={[
              { key: 'name', header: 'Name', render: (m) => m.name || m.email || 'Team member' },
              { key: 'email', header: 'Email' },
              {
                key: 'role',
                header: 'Role',
                render: (m) => (manage && !m.isSelf
                  ? <Select label={<span className="sr-only">Role for {m.name || m.email}</span>} value={m.role} options={roleOptions} onChange={(e) => setPendingRole({ member: m, role: e.target.value })} className="min-w-[12rem]" />
                  : <span>{ROLE_LABELS[m.role] || m.role}{m.isSelf && <span className="text-prism-ink-muted"> (you)</span>}</span>),
              },
              { key: 'status', header: 'Status', render: (m) => (m.status === 'ACTIVE' ? 'Active' : MEMBER_STATUS_LABELS[m.status] || m.status) },
              { key: 'joinedAt', header: 'Joined', render: (m) => formatDate(m.joinedAt) || '—' },
              ...(manage ? [{ key: 'actions', header: <span className="sr-only">Actions</span>, render: (m) => (m.isSelf ? null : <Button size="sm" variant="ghost" onClick={() => setRemoving(m)}>Remove<span className="sr-only"> {m.name || m.email}</span></Button>) }] : []),
            ]}
          />
          <Panel title="Invitations waiting">
            <DataTable
              caption="Staff invitations waiting"
              rows={d.pendingInvites}
              emptyMessage="No invitations waiting."
              columns={[
                { key: 'email', header: 'Email' },
                { key: 'role', header: 'Role', render: (i) => ROLE_LABELS[i.role] || i.role },
                { key: 'expiresAt', header: 'Expires', render: (i) => formatDate(i.expiresAt) },
                ...(canInvite ? [{ key: 'actions', header: <span className="sr-only">Actions</span>, render: (i) => <Button size="sm" variant="ghost" loading={resend.isPending && resend.variables === i.id} onClick={() => resend.mutate(i.id, { onSuccess: () => toast.show(`Invitation sent again to ${i.email}.`, { tone: 'positive' }) })}>Resend<span className="sr-only"> to {i.email}</span></Button> }] : []),
              ]}
            />
          </Panel>
        </div>
      )}
      {canInvite && <InviteStaffDialog open={inviteOpen} onClose={() => setInviteOpen(false)} limited={!manage} />}
      <ConfirmDialog
        open={Boolean(pendingRole)}
        title="Change role?"
        description={pendingRole ? `${pendingRole.member.name || pendingRole.member.email} will become ${ROLE_LABELS[pendingRole.role]}. What they can see changes immediately.` : ''}
        confirmLabel="Change role"
        pending={change.isPending}
        error={change.error}
        onClose={() => { change.reset(); setPendingRole(null) }}
        onConfirm={() => change.mutate({ membershipId: pendingRole.member.membershipId, role: pendingRole.role }, { onSuccess: () => { toast.show('Role changed.', { tone: 'positive' }); setPendingRole(null); focusPageTitle() } })}
      />
      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove from the team?"
        description={removing ? `${removing.name || removing.email} will lose access to Prism Campus for this institution.` : ''}
        confirmLabel="Remove"
        tone="danger"
        pending={remove.isPending}
        error={remove.error}
        onClose={() => { remove.reset(); setRemoving(null) }}
        onConfirm={() => remove.mutate(removing.membershipId, { onSuccess: () => { toast.show('Removed from the team.', { tone: 'positive' }); setRemoving(null); focusPageTitle() } })}
      />
    </CampusPage>
  )
}
