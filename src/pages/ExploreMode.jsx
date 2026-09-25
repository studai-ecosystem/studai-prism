// src/pages/ExploreMode.jsx — role exploration from SELF-REPORTED interests
// (legacy /explore route). Fail closed (spec §18, §33): nothing is
// pre-filled, nothing runs until the candidate answers, and every reason is
// labelled by its source. No percentages, scores or "match" language.
import { useState } from 'react'
import { exploreRoles } from '../api/development.js'
import { PageHeader, Card, Button, Select, Callout, LinkButton, Badge } from '../components/ui/index.js'
import { ErrorState } from '../components/states/index.js'

const DIMENSIONS = [
  { key: 'E', name: 'Enterprising', description: 'Leading, persuading and making commercial decisions.' },
  { key: 'I', name: 'Investigative', description: 'Analysing information and testing ideas.' },
  { key: 'A', name: 'Artistic', description: 'Creating, designing and communicating ideas.' },
  { key: 'S', name: 'Social', description: 'Helping, teaching and working with people.' },
  { key: 'C', name: 'Conventional', description: 'Organising information, processes and detail.' },
  { key: 'R', name: 'Realistic', description: 'Hands-on, practical and technical work.' },
]

const ANSWERS = [
  { value: '0', label: 'Not for me' },
  { value: '0.5', label: 'Somewhat' },
  { value: '1', label: 'Very much' },
]

const REASON_SOURCE = {
  SELF_REPORTED_INTEREST: 'Self-reported',
  DEMONSTRATED_CAPABILITY: 'From assessment evidence',
}

export default function ExploreMode() {
  const [answers, setAnswers] = useState({})
  const [state, setState] = useState({ loading: false, roles: null, error: null })

  const interests = Object.fromEntries(
    Object.entries(answers).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]),
  )
  const canExplore = Object.values(interests).some((v) => v > 0)

  const run = async () => {
    if (!canExplore) return
    setState({ loading: true, roles: null, error: null })
    try {
      const data = await exploreRoles({ candidateInterests: interests })
      setState({ loading: false, roles: data?.recommendations || [], error: null })
    } catch (error) {
      setState({ loading: false, roles: null, error })
    }
  }

  const shown = (state.roles || []).filter((r) => (r.whyShown || []).length > 0)

  return (
    <div className="prism-app min-h-screen">
      <main id="main" className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <PageHeader
          title="Explore roles"
          description="Tell us what kind of work you enjoy. We show roles linked to your answers and say clearly what is not yet known. This is not an assessment."
          actions={<LinkButton to="/register" size="sm">Start an assessment</LinkButton>}
        />
        <div className="grid gap-8 lg:grid-cols-12">
          <Card as="section" aria-labelledby="interests-heading" className="space-y-4 p-5 lg:col-span-5">
            <div>
              <h2 id="interests-heading" className="text-lg font-semibold text-prism-ink">Self-reported interests</h2>
              <p className="text-sm text-prism-ink-muted">Answer any that apply. Unanswered items are left out.</p>
            </div>
            {DIMENSIONS.map((d) => (
              <Select
                key={d.key}
                id={`interest-${d.key}`}
                label={d.name}
                hint={d.description}
                placeholder="Not answered"
                options={ANSWERS}
                value={answers[d.key] ?? ''}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [d.key]: e.target.value }))}
              />
            ))}
            <Button block onClick={run} disabled={!canExplore} loading={state.loading} loadingLabel="Finding roles…">
              Show roles
            </Button>
            {!canExplore && <p className="text-xs text-prism-ink-muted">Choose &ldquo;Somewhat&rdquo; or &ldquo;Very much&rdquo; for at least one kind of work.</p>}
          </Card>

          <section aria-labelledby="roles-heading" aria-live="polite" className="space-y-4 lg:col-span-7">
            <h2 id="roles-heading" className="text-lg font-semibold text-prism-ink">Roles to explore</h2>
            {state.error && <ErrorState title="Roles could not be loaded" description={state.error.message} requestId={state.error.requestId} onRetry={run} />}
            {!state.error && state.roles === null && (
              <p className="text-sm text-prism-ink-muted">Roles appear here after you answer and choose &ldquo;Show roles&rdquo;.</p>
            )}
            {state.roles !== null && shown.length === 0 && (
              <Callout tone="insufficient" title="No roles linked to your answers yet">
                None of the roles we currently cover are linked to the interests you chose.
              </Callout>
            )}
            {shown.map((r) => (
              <Card key={r.roleId} className="space-y-3 p-5" data-testid="role-card">
                <h3 className="text-base font-semibold text-prism-ink">{r.title}</h3>
                <div>
                  <p className="text-sm font-medium text-prism-ink">Why this role is shown</p>
                  <ul className="mt-1 space-y-1 text-sm text-prism-ink">
                    {r.whyShown.map((w) => (
                      <li key={w.statement} className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">{REASON_SOURCE[w.type] || 'Other'}</Badge>
                        <span>{w.statement}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {(r.unknowns || []).length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-prism-ink">Not yet known</p>
                    <p className="text-sm text-prism-ink-muted">We have no assessment evidence yet for {r.unknowns.map((u) => u.name).join(', ')}.</p>
                  </div>
                )}
                {r.nextStep?.label && <p className="text-sm text-prism-ink-muted">Next step: {r.nextStep.label}</p>}
              </Card>
            ))}
          </section>
        </div>
      </main>
    </div>
  )
}
