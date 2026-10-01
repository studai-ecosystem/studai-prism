// /app/explore — Explore Roles V2 (spec §18). Two clearly separate inputs:
// what you say you enjoy (self-reported) and what formal Prism evidence
// shows. Nothing is evaluated until you choose your interests. No
// percentages, no match scores, no invented defaults.
import { useState } from 'react'
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Panel } from '../../../components/ui/Card.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Checkbox } from '../../../components/ui/FormControls.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { Badge } from '../../../components/ui/Badge.jsx'
import { CapabilityLevelBadge } from '../../../components/capability/CapabilityLevelBadge.jsx'
import { RoleExplorationCard } from '../../../components/capability/RoleExplorationCard.jsx'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useStudentCapabilities, useRoleExploration } from '../../student/hooks.js'
import { queryStateView } from '../../student/QueryState.jsx'
import { RIASEC_COPY } from '../../../lib/copy/student.js'

const KEYS = ['R', 'I', 'A', 'S', 'E', 'C']
const MAX_CHOICES = 3

export default function ExplorePage() {
  const { active } = useWorkspace()
  const caps = useStudentCapabilities()
  const explore = useRoleExploration()
  const [chosen, setChosen] = useState([])

  const header = <PageHeader title="Explore Roles" description="See which roles connect to what you enjoy and what Prism has observed. This is private to you." context={active} />
  const state = queryStateView(caps, { label: 'Loading' })
  if (state) return <div>{header}{state}</div>
  const demonstrated = caps.data.items.filter((c) => c.level)

  const toggle = (k) => setChosen((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : cur.length < MAX_CHOICES ? [...cur, k] : cur))
  const submit = () => explore.mutate(Object.fromEntries(chosen.map((k) => [k, 1])))
  const results = explore.data
  const campus = active.type === 'CAMPUS_STUDENT'
  const assessmentsPath = campus ? `/app/campus/${active.organizationId}/assignments` : '/app/assessments'
  const developmentPath = campus ? `/app/campus/${active.organizationId}/development` : '/app/development'

  return (
    <div className="space-y-6">
      {header}
      <Callout tone="info" title="Interest and capability are different things">
        Enjoying a kind of work is not evidence that you can do it, and the other way round. They are shown separately here. Nothing is assumed about your interests: roles appear only after you choose.
      </Callout>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="What you enjoy" actions={<Badge tone="neutral">Self-reported</Badge>} description="Choose up to three.">
          <fieldset className="space-y-3">
            <legend className="sr-only">Kinds of work you enjoy</legend>
            {KEYS.map((k) => (
              <Checkbox
                key={k}
                id={`interest-${k}`}
                label={RIASEC_COPY[k].label}
                description={RIASEC_COPY[k].hint}
                checked={chosen.includes(k)}
                disabled={!chosen.includes(k) && chosen.length >= MAX_CHOICES}
                onChange={() => toggle(k)}
              />
            ))}
          </fieldset>
          <Button className="mt-4" variant="primary" disabled={chosen.length === 0 || explore.isPending} onClick={submit}>
            {explore.isPending ? 'Finding roles…' : 'Show roles'}
          </Button>
        </Panel>
        <Panel title="What Prism observed" actions={<Badge tone="accent">Formal evidence</Badge>} description="From completed formal assessments only.">
          {demonstrated.length === 0 ? (
            <p className="text-sm text-prism-ink-muted">No capability has enough formal evidence yet. Roles will be explained from your interests only.</p>
          ) : (
            <ul className="space-y-2">
              {demonstrated.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-prism-ink">{c.name}</span>
                  <CapabilityLevelBadge level={c.level} provisional={c.status === 'PROVISIONAL'} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {explore.error && <Callout tone="blocked" role="alert" title="Roles could not be loaded">{explore.error.message}</Callout>}
      {results && (
        <section aria-labelledby="roles-title" className="space-y-3">
          <h2 id="roles-title" className="text-lg font-semibold text-prism-ink">Roles to explore</h2>
          {results.recommendations.length === 0 ? (
            <p className="text-sm text-prism-ink-muted">No roles connect to these interests yet. Try different choices.</p>
          ) : (
            <ul className="grid gap-4">
              {results.recommendations.map((r) => <li key={r.roleId}><RoleExplorationCard role={r} assessmentsPath={assessmentsPath} developmentPath={developmentPath} /></li>)}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
