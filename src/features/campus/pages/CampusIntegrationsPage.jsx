// Campus integrations (spec §19.1, §50 P11; C11.06). Honest status only:
// the CSV roster import is available; no student information system or
// single sign-on connection exists until StudAI sets one up.
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Panel } from '../../../components/ui/Card.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { billingApi } from '../../../api/billing.js'
import { INTEGRATION_COPY } from '../../../lib/copy/campus.js'
import { CampusPage } from '../components/CampusPage.jsx'
import { useCampusOrg } from '../hooks.js'

export default function CampusIntegrationsPage() {
  const { orgId, key, can } = useCampusOrg()
  const query = useQuery({ queryKey: key('integrations'), queryFn: () => billingApi.integrations(orgId) })
  const d = query.data
  return (
    <CampusPage title="Integrations" description="How students and staff reach Prism from your systems." query={query}>
      {d && (
        <div className="space-y-4">
          <ul className="space-y-4">
            {d.items.map((i) => (
              <li key={i.id}>
                <Panel
                  title={i.name}
                  headingLevel={2}
                  actions={<StatusChip tone={INTEGRATION_COPY.tone[i.status]} label={INTEGRATION_COPY.status[i.status]} />}
                >
                  <p className="text-sm text-prism-ink-muted">{INTEGRATION_COPY.detail[i.id] || ''}</p>
                  <div className="mt-3">
                    {i.status === 'AVAILABLE' && i.id === 'sis-csv' && can('students.manage') && (
                      <LinkButton to={`/campus/${orgId}/cohorts/import`} variant="secondary" size="sm">Import students</LinkButton>
                    )}
                    {i.status === 'NOT_CONNECTED' && <Link to="/contact" className="text-sm font-medium text-prism-accent-strong underline underline-offset-2">{INTEGRATION_COPY.contact}</Link>}
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
          <p className="text-sm text-prism-ink-muted">People sign in with: {d.signIn.map((p) => p.name).join(', ')}.</p>
        </div>
      )}
    </CampusPage>
  )
}
