import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Panel } from '../../../components/ui/Card.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { useAuth } from '../../../app/providers/AuthProvider.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'

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
    <div>
      <PageHeader title="Settings" description="Your profile and account." context={active} />
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
    </div>
  )
}
