// /app/settings: one place for everything about the person and the account.
// Sections: Profile, Account, Workspaces, Privacy, Sharing, Assessment
// preferences, Accessibility, Security. No internal fields are shown.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Panel } from '../../../components/ui/Card.jsx'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { Input, Select, Switch, Checkbox } from '../../../components/ui/FormControls.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { Callout, InlineNotice } from '../../../components/ui/Notice.jsx'
import { Skeleton } from '../../../components/ui/Skeleton.jsx'
import { Modal } from '../../../components/ui/Modal.jsx'
import { useAuth } from '../../../app/providers/AuthProvider.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useFeatureFlags } from '../../../app/providers/FeatureFlagProvider.jsx'
import { usePreferences, useSavePreferences, useStudentAssessments } from '../../student/hooks.js'
import { updateProfile, setToken, clearUser } from '../../../lib/session.js'
import { fetchLicence, changePassword, deleteCandidateData, confirmAccountAge } from '../../../api/account.js'
import { homePathFor, workspaceLabel, scopeText } from '../../workspaces/workspacePaths.js'
import { CAMPUS_CAN_SEE, CAMPUS_CANNOT_SEE, PERSONAL_PRIVACY_NOTE } from '../../../lib/copy/privacy.js'
import { BRIEFING_COPY } from '../../../lib/copy/student.js'
import { assignmentsListPath } from '../../assessments/pages/BriefingPage.jsx'
import { AGE_DECLARATION_TEXT } from '../../../../server/lib/sharedConstants.js'

const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Graduated', 'Working Professional'].map((y) => ({ value: y, label: y }))

const SECTIONS = [
  ['profile', 'Profile'],
  ['account', 'Account'],
  ['workspaces', 'Workspaces'],
  ['privacy', 'Privacy'],
  ['sharing', 'Sharing'],
  ['assessment', 'Assessment preferences'],
  ['accessibility', 'Accessibility'],
  ['security', 'Security'],
]

function Row({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-prism-ink-subtle">{label}</dt>
      <dd className="text-sm text-prism-ink">{children}</dd>
    </div>
  )
}

function AgeDeclaration() {
  const { me, loading, error: readError, refetch } = useFeatureFlags()
  const [checked, setChecked] = useState(false)
  const [state, setState] = useState({ busy: false, recorded: false, error: null })
  const confirm = async () => {
    if (!checked || state.busy) return
    setState({ busy: true, recorded: false, error: null })
    try {
      await confirmAccountAge()
      setState({ busy: false, recorded: true, error: null })
      await refetch()
    } catch (error) {
      setState({ busy: false, recorded: false, error })
    }
  }
  if (loading) return <p role="status" className="mt-4 text-sm text-prism-ink-muted">Loading age declaration...</p>
  if (state.recorded) return (
    <div className="mt-4">
      <p role="status" className="text-sm text-prism-ink-muted">Age declaration recorded.</p>
      {readError && <InlineNotice tone="partial" className="mt-2">The declaration was recorded, but the account status could not be refreshed.</InlineNotice>}
    </div>
  )
  if (readError || typeof me?.user.ageConfirmed !== 'boolean') {
    return (
      <Callout tone="info" title="Age declaration status is unavailable" className="mt-4">
        <p>Check again before starting an assessment. No declaration is assumed.</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>Check declaration status</Button>
      </Callout>
    )
  }
  if (me.user.ageConfirmed) return <p role="status" className="mt-4 text-sm text-prism-ink-muted">Age declaration recorded.</p>
  return (
    <Callout tone="info" title="Age declaration before assessment" className="mt-4">
      <p>Prism is currently available to adult candidates. No date of birth is collected.</p>
      <div className="mt-3">
        <Checkbox label={AGE_DECLARATION_TEXT} checked={checked} onChange={(e) => setChecked(e.target.checked)} disabled={state.busy} />
      </div>
      {state.error && <div className="mt-3" role="alert"><InlineNotice tone="blocked">{state.error.message || 'Your age declaration could not be recorded.'}</InlineNotice></div>}
      <Button className="mt-3" size="sm" onClick={confirm} disabled={!checked} loading={state.busy} loadingLabel="Recording...">Record declaration</Button>
    </Callout>
  )
}

function ProfileSection({ user }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', college: '', year: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  const open = () => { setForm({ name: user?.name || '', college: user?.college || '', year: user?.year || '' }); setError(null); setSaved(false); setEditing(true) }
  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Please enter your name.'); return }
    setSaving(true); setError(null)
    try {
      await updateProfile({ name: form.name.trim(), college: form.college.trim(), year: form.year })
      setEditing(false); setSaved(true)
    } catch (err) {
      setError(err.message || 'Your profile could not be saved.')
    } finally { setSaving(false) }
  }

  return (
    <Panel id="profile" title="Profile" actions={!editing && <Button size="sm" variant="secondary" onClick={open}>Edit profile</Button>}>
      {editing ? (
        <form onSubmit={save} className="grid max-w-md gap-4">
          <Input label="Full name" value={form.name} onChange={update('name')} autoComplete="name" required />
          <Input label="College" value={form.college} onChange={update('college')} autoComplete="organization" />
          <Select label="Year of study" value={form.year} onChange={update('year')} options={YEARS} placeholder="Select year" />
          {error && <div role="alert"><InlineNotice tone="blocked">{error}</InlineNotice></div>}
          <div className="flex gap-2">
            <Button type="submit" loading={saving} loadingLabel="Saving...">Save details</Button>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
          </div>
        </form>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            <Row label="Name">{user?.name || 'Not provided'}</Row>
            <Row label="College">{user?.college || 'Not provided'}</Row>
            <Row label="Year of study">{user?.year || 'Not provided'}</Row>
          </dl>
          {saved && <p role="status" className="mt-3 text-xs text-prism-ink-subtle">Profile saved.</p>}
        </>
      )}
      <AgeDeclaration key={user?.email} />
    </Panel>
  )
}

function AccountSection({ user }) {
  const licence = useQuery({ queryKey: ['licence'], queryFn: fetchLicence, retry: false })
  const assessments = useStudentAssessments()
  const { active } = useWorkspace()
  const pending = licence.data?.pendingSessionId
  const current = assessments.data?.active.find((a) => a.sessionId === pending)
  const resume = current?.cta.kind === 'RESUME' && current.cta.to
  return (
    <Panel id="account" title="Account" description="The email you sign in with.">
      <dl className="grid gap-3 sm:grid-cols-2">
        <Row label="Email">{user?.email || 'Not provided'}</Row>
      </dl>
      {licence.error && (
        <Callout tone="blocked" title="Assessment status could not be checked" className="mt-4">
          <Button variant="secondary" size="sm" onClick={() => licence.refetch()} loading={licence.isFetching}>Retry assessment status</Button>
        </Callout>
      )}
      {pending && (
        <Callout tone="info" title="You have an assessment to return to" className="mt-4" action={<LinkButton to={resume || assignmentsListPath(active)} variant="primary" size="sm">{resume ? 'Resume' : 'Open assessments'}</LinkButton>}>
          Find its current status in Assessments. Personal and sponsored assessments stay in their own workspaces.
          {assessments.error && <div className="mt-3" role="alert"><InlineNotice tone="blocked">The matching assessment could not be loaded. Open Assessments to retry or choose the matching workspace.</InlineNotice></div>}
        </Callout>
      )}
    </Panel>
  )
}

function WorkspacesSection() {
  const { workspaces, active, switchTo } = useWorkspace()
  const navigate = useNavigate()
  return (
    <Panel id="workspaces" title="Workspaces" description="One account, separate workspaces. Each one says who can see what is inside it.">
      <ul className="divide-y divide-prism-border">
        {workspaces.map((w) => {
          const current = w.id === active.id
          return (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-prism-ink">{workspaceLabel(w)}</p>
                <p className="text-xs text-prism-ink-muted">{scopeText(w)}</p>
              </div>
              {current
                ? <Badge tone="accent">Current</Badge>
                : <Button size="sm" variant="secondary" onClick={() => { const next = switchTo(w.id); navigate(homePathFor(next || w)) }}>Switch to {workspaceLabel(w)}</Button>}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

function PrivacySection() {
  return (
    <Panel id="privacy" title="Privacy" description="One account, separate workspaces.">
      <div className="space-y-3 text-sm text-prism-ink-muted">
        <p>{PERSONAL_PRIVACY_NOTE} Your personal workspace holds assessments you bought or were given yourself.</p>
        <p>If you join an institution, it gets its own workspace. In that workspace, when authorised, the institution can see:</p>
        <ul className="list-disc space-y-1 pl-5">{CAMPUS_CAN_SEE.map((t) => <li key={t}>{t}</li>)}</ul>
        <p>It cannot see, unless you share it:</p>
        <ul className="list-disc space-y-1 pl-5">{CAMPUS_CANNOT_SEE.map((t) => <li key={t}>{t}</li>)}</ul>
      </div>
    </Panel>
  )
}

function SharingSection() {
  return (
    <Panel id="sharing" title="Sharing" description="You decide who sees a report, and you can take that back.">
      <p className="mb-3 text-sm text-prism-ink-muted">See who has access to what, and revoke access at any time.</p>
      <LinkButton to="/app/sharing" size="sm">Review what you have shared</LinkButton>
    </Panel>
  )
}

function AssessmentSection() {
  return (
    <Panel id="assessment" title="Assessment preferences" description="Adjustments are arranged before an assessment starts, never during it.">
      <p className="text-sm text-prism-ink-muted">{BRIEFING_COPY.accommodations}</p>
      <p className="mt-3 text-sm text-prism-ink-muted">
        Your accessibility settings below also apply while you take an assessment, and they do not change how your answers are judged.
      </p>
    </Panel>
  )
}

function AccessibilitySection() {
  const prefs = usePreferences()
  const save = useSavePreferences()
  let body
  if (prefs.isPending) body = <Skeleton label="Loading preferences" lines={2} />
  else if (prefs.error) {
    body = <Callout tone="partial" title="Preferences are not available right now">Your device settings still apply. Please try again later.</Callout>
  } else {
    const current = save.isPending && save.variables ? save.variables : prefs.data
    const update = (patch) => save.mutate({ reducedMotion: current.reducedMotion, largerText: current.largerText, ...patch })
    body = (
      <div className="space-y-4">
        <Switch id="pref-motion" label="Reduce motion" description="Turn off animations and transitions." checked={current.reducedMotion} disabled={save.isPending} onChange={(v) => update({ reducedMotion: v })} />
        <Switch id="pref-text" label="Larger text" description="Make text across Prism larger." checked={current.largerText} disabled={save.isPending} onChange={(v) => update({ largerText: v })} />
        <p className="text-xs text-prism-ink-subtle" role="status">{save.isPending ? 'Saving...' : save.isSuccess ? 'Saved to your account.' : 'Saved to your account, on every device.'}</p>
        {save.error && <Callout tone="blocked" role="alert" title="Your preferences could not be saved">{save.error.message}</Callout>}
      </div>
    )
  }
  return <Panel id="accessibility" title="Accessibility">{body}</Panel>
}

function PasswordForm() {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ current: '', next: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }))
  const submit = async (e) => {
    e.preventDefault()
    if (f.next !== f.confirm) { setMsg({ ok: false, text: 'The new passwords do not match.' }); return }
    setBusy(true); setMsg(null)
    try {
      const data = await changePassword({ currentPassword: f.current, newPassword: f.next })
      if (data?.token) setToken(data.token)
      setF({ current: '', next: '', confirm: '' }); setOpen(false)
      setMsg({ ok: true, text: 'Password changed. Other signed-in devices were signed out.' })
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally { setBusy(false) }
  }
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-prism-ink-muted">Change the password you sign in with.</p>
        {!open && <Button size="sm" variant="secondary" onClick={() => { setOpen(true); setMsg(null) }}>Change password</Button>}
      </div>
      {open && (
        <form onSubmit={submit} className="mt-4 grid max-w-md gap-4">
          <Input label="Current password" type="password" value={f.current} onChange={set('current')} autoComplete="current-password" required />
          <Input label="New password" hint="At least 6 characters." type="password" value={f.next} onChange={set('next')} autoComplete="new-password" minLength={6} required />
          <Input label="Confirm new password" type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" minLength={6} required />
          <div className="flex gap-2">
            <Button type="submit" loading={busy} loadingLabel="Updating...">Update password</Button>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Close</Button>
          </div>
        </form>
      )}
      {msg && <div role={msg.ok ? 'status' : 'alert'} className="mt-3"><InlineNotice tone={msg.ok ? 'positive' : 'blocked'}>{msg.text}</InlineNotice></div>}
    </div>
  )
}

function DeleteData() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const close = () => { if (!busy) { setOpen(false); setText(''); setError(null) } }
  const erase = async () => {
    setBusy(true); setError(null)
    try {
      await deleteCandidateData()
      clearUser()
      navigate('/', { replace: true })
    } catch (err) { setError(err.message); setBusy(false) }
  }
  return (
    <div className="mt-6 rounded-[var(--prism-radius-lg)] border border-prism-blocked-soft p-4">
      <h3 className="text-sm font-semibold text-prism-ink">Delete my assessment data</h3>
      <p className="mt-1 text-sm text-prism-ink-muted">
        Permanently erase your assessments, reports, credentials and associated telemetry. Issued credentials stop verifying. This cannot be undone.
      </p>
      <Button className="mt-3" variant="danger" size="sm" onClick={() => setOpen(true)}>Delete my assessment data</Button>
      <Modal
        open={open}
        onClose={close}
        title="Delete all of your assessment data?"
        description="This cannot be undone."
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
            <Button variant="danger" onClick={erase} disabled={text !== 'DELETE'} loading={busy} loadingLabel="Erasing...">Erase everything</Button>
          </>
        )}
      >
        <Input label="Type DELETE to confirm" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        {error && <div role="alert" className="mt-3"><InlineNotice tone="blocked">{error}</InlineNotice></div>}
      </Modal>
    </div>
  )
}

function SecuritySection() {
  return (
    <Panel id="security" title="Security" description="Your password and your data.">
      <PasswordForm />
      <DeleteData />
    </Panel>
  )
}

export default function SettingsPage() {
  const { user } = useAuth()
  const { active } = useWorkspace()
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your profile, account, privacy and accessibility." context={active} />
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-4 lg:self-start">
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-[var(--prism-radius-md)] px-3 py-1.5 text-sm text-prism-ink-muted hover:bg-prism-subtle hover:text-prism-ink">{label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">
          <ProfileSection user={user} />
          <AccountSection user={user} />
          <WorkspacesSection />
          <PrivacySection />
          <SharingSection />
          <AssessmentSection />
          <AccessibilitySection />
          <SecuritySection />
        </div>
      </div>
    </div>
  )
}