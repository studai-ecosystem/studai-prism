// Phase I: the campus experience as executive intelligence. The overview names
// the largest development opportunity and offers the next action; a cohort is
// seen through sections; an intervention shows baseline to change; the data
// boundary is stated; charts say what is empty or too small.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import { WorkspaceGuard } from '../../app/guards/WorkspaceGuard.jsx'
import CampusOverviewPage from './pages/CampusOverviewPage.jsx'
import CampusCohortDetailPage from './pages/CampusCohortDetailPage.jsx'
import CampusStudentsPage from './pages/CampusStudentsPage.jsx'
import { InterventionLoop } from './components/InterventionLoop.jsx'
import { DataBoundaryKey } from './components/DataBoundaryKey.jsx'
import { ChartFrame } from '../../components/charts/ChartFrame.jsx'
import { MemoryRouter } from 'react-router-dom'

const ORG = '11111111-1111-4111-8111-111111111111'
const COHORT = '22222222-2222-4222-8222-222222222222'
const flags = { PRISM_CAMPUS_ENABLED: true, PRISM_APP_SHELL_V3: true, PRISM_CAMPUS_ANALYTICS: true }
const labels = { INSUFFICIENT: 'Insufficient evidence', EARLY: 'Early evidence', DEVELOPING: 'Developing', DEMONSTRATED: 'Demonstrated', STRONG: 'Strongly demonstrated' }
const api = (p) => `/api/v1/organizations/${ORG}${p}`

function routeFetch(routes) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
    const u = String(url)
    const method = (init.method || 'GET').toUpperCase()
    for (const [k, handler] of Object.entries(routes)) {
      const [m, prefix] = k.includes(' ') ? k.split(' ') : ['GET', k]
      if (m === method && u.startsWith(prefix)) return typeof handler === 'function' ? handler(u, init) : jsonResponse(200, handler)
    }
    throw new Error(`unexpected fetch ${method} ${u}`)
  })
}

const capabilities = { data: {
  minGroupSize: 10, assessed: 12, underReview: 0, bucketLabels: labels, method: 'A student counts as needing further evidence or development when below "Demonstrated".', suppressed: false,
  capabilities: [{ capabilityId: 'CAP-A', name: 'Structured reasoning', suppressed: false, n: 12, buckets: { INSUFFICIENT: 2, EARLY: 2, DEVELOPING: 3, DEMONSTRATED: 3, STRONG: 2 }, provisional: 5 }],
  topNeeds: [{ capabilityId: 'CAP-A', name: 'Structured reasoning', needs: 7, of: 12 }],
} }
const overview = { data: { enrolled: 12, invited: 1, cohorts: 1, activePrograms: 1, activeAssignments: 1, completion: { assigned: 12, completed: 8 }, missionsActive: 0, reassessmentsDue: 0, scope: 'ALL' } }
const intervention = (over = {}) => ({
  id: 'i1', name: 'Reasoning sprint', status: 'ACTIVE', cohortId: COHORT, cohortName: 'Commerce 2027', startsOn: '2026-10-20', endsOn: '2026-11-17', reassessmentPlanned: true,
  targetCapability: { id: 'CAP-A', name: 'Structured reasoning' }, missions: [{ id: 'm1', title: 'Weigh two options', completed: 3 }], counts: { members: 12, started: 9, completedAll: 3 }, ...over,
})

function renderCampus(element, path, routes, permissions, { type = 'CAMPUS_ADMIN', route } = {}) {
  signIn()
  sessionStorage.setItem('prismActiveWorkspace', 'ws-admin')
  const adminWs = { id: 'ws-admin', type, name: 'Synthetic University', organizationId: ORG, organizationName: 'Synthetic University', visibilityPolicy: 'OWNER_AND_SPONSOR', permissions }
  routeFetch({
    ...routes,
    [api('/cohorts')]: { data: { items: [{ id: COHORT, name: 'Commerce 2027', status: 'ACTIVE', memberCount: 12 }] } },
    '/api/v1/me': meBody({ flags, workspaces: [meBody().data.workspaces[0], adminWs] }),
  })
  return renderApp(<Routes><Route path={`/campus/:organizationId/${path}`} element={<WorkspaceGuard type={type}>{element}</WorkspaceGuard>} /></Routes>, { route: route || `/campus/${ORG}/${path.replace(':cohortId', COHORT)}` })
}

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear() })

describe('Campus overview insight', () => {
  it('names the largest development opportunity and offers the next action only to someone who may take it', async () => {
    const a = renderCampus(<CampusOverviewPage />, 'overview', { [api('/overview')]: overview, [api('/analytics/capabilities')]: capabilities }, ['analytics.read', 'interventions.write'])
    const insight = await screen.findByTestId('campus-insight')
    expect(insight).toHaveTextContent('Structured reasoning is the largest development opportunity among assessed students.')
    expect(within(insight).getByRole('link', { name: 'Create development intervention' })).toHaveAttribute('href', `/campus/${ORG}/development?capability=CAP-A`)
    a.unmount()
    renderCampus(<CampusOverviewPage />, 'overview', { [api('/overview')]: overview, [api('/analytics/capabilities')]: capabilities }, ['analytics.read'])
    const readOnly = await screen.findByTestId('campus-insight')
    expect(within(readOnly).queryByRole('link', { name: 'Create development intervention' })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\d\s*%|average score|leaderboard|top performer/i)
  }, 20_000)

  it('a hidden segment produces no insight at all', async () => {
    renderCampus(<CampusOverviewPage />, 'overview', { [api('/overview')]: overview, [api('/analytics/capabilities')]: { data: { ...capabilities.data, suppressed: true, reason: 'SMALL_GROUP', capabilities: [], topNeeds: [] } } }, ['analytics.read', 'interventions.write'])
    expect((await screen.findAllByText('Data hidden because this segment is too small for aggregate reporting.')).length).toBeGreaterThan(0)
    expect(screen.queryByTestId('campus-insight')).not.toBeInTheDocument()
  }, 20_000)
})

describe('Cohort sections', () => {
  const cohortRoutes = {
    [api(`/cohorts/${COHORT}`)]: { data: { cohort: { id: COHORT, name: 'Commerce 2027', status: 'ACTIVE', memberCount: 12 }, members: [{ id: 'u1', name: 'Synthetic Student', email: 's@example.test', addedAt: '2026-09-01T00:00:00.000Z' }], pendingInvites: [] } },
    [api('/analytics/capabilities')]: capabilities,
    [api('/interventions')]: { data: { items: [intervention(), intervention({ id: 'i2', name: 'Other cohort', cohortId: 'other' })] } },
    [api('/reassessments')]: { data: { items: [] } },
  }
  const perms = ['students.read', 'students.manage', 'analytics.read', 'interventions.write', 'reassessments.read']

  it('opens on an overview and offers students, capability distribution, development needs, interventions, cycles and reports', async () => {
    renderCampus(<CampusCohortDetailPage />, 'cohorts/:cohortId', cohortRoutes, perms)
    expect(await screen.findByRole('heading', { level: 1, name: 'Commerce 2027' })).toBeInTheDocument()
    expect(await screen.findByRole('tab', { name: 'Overview', selected: true })).toBeInTheDocument()
    for (const name of ['Students', 'Capability distribution', 'Development needs', 'Interventions', 'Assessment cycles and growth', 'Reports']) expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Students' }))
    expect(await screen.findByRole('table', { name: 'Students in Commerce 2027' })).toBeInTheDocument()
  }, 20_000)

  it('development needs link to a prefilled intervention for this cohort; interventions show only this cohort with the loop', async () => {
    renderCampus(<CampusCohortDetailPage />, 'cohorts/:cohortId', cohortRoutes, perms)
    await userEvent.click(await screen.findByRole('tab', { name: 'Development needs' }))
    expect(await screen.findByRole('link', { name: 'Create development intervention' })).toHaveAttribute('href', `/campus/${ORG}/development?capability=CAP-A&cohort=${COHORT}`)
    await userEvent.click(screen.getByRole('tab', { name: 'Interventions' }))
    expect(await screen.findByText('Reasoning sprint')).toBeInTheDocument()
    expect(screen.queryByText('Other cohort')).not.toBeInTheDocument()
    expect(screen.getByTestId('intervention-loop')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Assessment cycles and growth' }))
    expect(await screen.findByText('No reassessment is scheduled for this cohort.')).toBeInTheDocument()
  }, 20_000)

  it('without analytics permission the analytic sections are not offered', async () => {
    renderCampus(<CampusCohortDetailPage />, 'cohorts/:cohortId', cohortRoutes, ['students.read'])
    await screen.findByRole('tab', { name: 'Overview' })
    expect(screen.queryByRole('tab', { name: 'Capability distribution' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Reports' })).not.toBeInTheDocument()
  }, 20_000)
})

describe('Intervention loop', () => {
  const wrap = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)
  it('shows baseline, development, reassessment and change, and never implies a result', () => {
    wrap(<InterventionLoop intervention={intervention()} orgId={ORG} canReassess canAnalytics />)
    const stages = within(screen.getByTestId('intervention-loop')).getAllByRole('listitem')
    expect(stages).toHaveLength(4)
    expect(stages[0]).toHaveTextContent('Baseline')
    expect(stages[1]).toHaveTextContent('9 of 12 students started')
    expect(stages[2]).toHaveTextContent('Planned after this intervention.')
    expect(within(stages[2]).getByRole('link', { name: 'Open reassessments' })).toHaveAttribute('href', `/campus/${ORG}/reassessments`)
    expect(stages[3]).toHaveTextContent('Shown only after a comparable reassessment.')
    expect(document.body.textContent).not.toMatch(/\d\s*%|improved|success/i)
  })
  it('a completed intervention without a planned reassessment says so; links need permission', () => {
    wrap(<InterventionLoop intervention={intervention({ status: 'COMPLETED', reassessmentPlanned: false })} orgId={ORG} />)
    const stages = within(screen.getByTestId('intervention-loop')).getAllByRole('listitem')
    expect(stages[1]).toHaveTextContent('Finished')
    expect(stages[2]).toHaveTextContent('Not planned.')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('Data boundary', () => {
  it('names institution-sponsored, shared by the student and personal-private data', () => {
    rtlRender(<DataBoundaryKey />)
    const key = screen.getByTestId('data-boundary')
    expect(key).toHaveTextContent('Institution-sponsored')
    expect(key).toHaveTextContent('Shared by the student')
    expect(key).toHaveTextContent('Personal-private')
    expect(key).toHaveTextContent('Never shown here.')
  })
  it('is on the students list', async () => {
    renderCampus(<CampusStudentsPage />, 'students', { [api('/students')]: { data: { items: [], total: 0, page: 1, pageSize: 25 } } }, ['students.read'])
    expect(await screen.findByTestId('data-boundary')).toBeInTheDocument()
  }, 20_000)
})

describe('ChartFrame', () => {
  it('says how many students it rests on, and states empty and too-small cases instead of drawing', () => {
    const { rerender } = rtlRender(<ChartFrame title="Levels" description="Counts of students." n={12}><svg role="img" aria-label="bars" /></ChartFrame>)
    expect(screen.getByText('Based on 12 students')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'bars' })).toBeInTheDocument()
    rerender(<ChartFrame title="Levels" status="empty" emptyText="Nothing to chart yet."><svg role="img" aria-label="bars" /></ChartFrame>)
    expect(screen.getByRole('status')).toHaveTextContent('Nothing to chart yet.')
    expect(screen.queryByRole('img', { name: 'bars' })).not.toBeInTheDocument()
    rerender(<ChartFrame title="Levels" status="insufficient"><svg role="img" aria-label="bars" /></ChartFrame>)
    expect(screen.getByRole('status')).toHaveTextContent('too few students')
  })
})