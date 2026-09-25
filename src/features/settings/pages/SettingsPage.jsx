// /app/settings (C4.11): profile, how privacy works across workspaces, and
// accessibility preferences saved to the account.
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Panel } from '../../../components/ui/Card.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { Switch } from '../../../components/ui/FormControls.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { Skeleton } from '../../../components/ui/Skeleton.jsx'
import { useAuth } from '../../../app/providers/AuthProvider.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { usePreferences, useSavePreferences } from '../../student/hooks.js'
import { CAMPUS_CAN_SEE, CAMPUS_CANNOT_SEE, PERSONAL_PRIVACY_NOTE } from '../../../lib/copy/privacy.js'

function AccessibilityPanel() {
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
        <p className="text-xs text-prism-ink-subtle" role="status">{save.isPending ? 'Saving…' : save.isSuccess ? 'Saved to your account.' : 'Saved to your account, on every device.'}</p>
        {save.error && <Callout tone="blocked" role="alert" title="Your preferences could not be saved">{save.error.message}</Callout>}
      </div>
    )
  }
  return <Panel title="Accessibility">{body}</Panel>
}

export default function SettingsPage() {
  const { user } = useAuth()
  const { active } = useWorkspace()
  const rows = [
    ['Name', user?.name || 'Not provided'],
    ['Email', user?.email || 'Not provided'],
    ['College', user?.college || 'Not provided'],
    ['Year', user?.year || 'Not provided'],
  ]
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your profile, privacy and accessibility." context={active} />
      <Panel title="Profile" actions={<LinkButton to="/profile" size="sm">Edit profile or password</LinkButton>}>
        <dl className="grid gap-3 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-medium uppercase tracking-wide text-prism-ink-subtle">{k}</dt>
              <dd className="text-sm text-prism-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <Panel title="Privacy" description="One account, separate workspaces.">
        <div className="space-y-3 text-sm text-prism-ink-muted">
          <p>{PERSONAL_PRIVACY_NOTE} Your personal workspace holds assessments you bought or were given yourself.</p>
          <p>If you join an institution, it gets its own workspace. In that workspace, when authorised, the institution can see:</p>
          <ul className="list-disc space-y-1 pl-5">{CAMPUS_CAN_SEE.map((t) => <li key={t}>{t}</li>)}</ul>
          <p>It cannot see, unless you share it:</p>
          <ul className="list-disc space-y-1 pl-5">{CAMPUS_CANNOT_SEE.map((t) => <li key={t}>{t}</li>)}</ul>
          <LinkButton to="/app/sharing" size="sm">Review what you have shared</LinkButton>
        </div>
      </Panel>
      <AccessibilityPanel />
    </div>
  )
}
