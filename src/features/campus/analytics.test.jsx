// C10.05–C10.07 — campus analytics UI over mocked /api/v1 responses: counts
// with sample sizes (never percentages), a table equivalent for every chart,
// the §27.2 sentence for hidden groups, exports only with permission,
// reports generated on request, and the privacy threshold with its floor.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import { WorkspaceGuard } from '../../app/guards/WorkspaceGuard.jsx'
import CampusAnalyticsPage from './pages/CampusAnalyticsPage.jsx'
import CampusReportsPage from './pages/CampusReportsPage.jsx'
import CampusSettingsPage from './pages/CampusSettingsPage.jsx'

const ORG = '11111111-1111-4111-8111-111111111111'
const COHORT = '22222222-2222-4222-8222-222222222222'
const DEPT = '33333333-3333-4333-8333-333333333333'
const SENTENCE = 'Data hidden because this segment is too small for aggregate reporting.'
const flags = { PRISM_CAMPUS_ENABLED: true, PRISM_APP_SHELL_V3: true, PRISM_CAMPUS_ANALYTICS: true }
const labels = { INSUFFICIENT: 'Insufficient evidence', EARLY: 'Early evidence', DEVELOPING: 'Developing', DEMONSTRATED: 'Demonstrated', STRONG: 'Strongly demonstrated' }
const api = (p) => `/api/v1/organizations/${ORG}${p}`

function routeFetch(routes) {
  const calls = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
    const u = String(url)
    const method = (init.method || 'GET').toUpperCase()
    calls.push({ url: u, method, body: init.body ? JSON.parse(init.body) : undefined })
    for (const [k, handler] of Object.entries(routes)) {
      const [m, prefix] = k.includes(' ') ? k.split(' ') : ['GET', k]
      if (m === method && u.startsWith(prefix)) return typeof handler === 'function' ? handler(u, init) : jsonResponse(200, handler)
    }
    throw new Error(`unexpected fetch ${method} ${u}`)
  })
  return calls
}

const capabilities = { data: {
  minGroupSize: 10, assessed: 12, underReview: 1, bucketLabels: labels, method: 'A student counts as needing further evidence or development … below "Demonstrated".',
  suppressed: false,
  capabilities: [
    { capabilityId: 'CAP-A', name: 'Structured reasoning', suppressed: false, n: 12, buckets: { INSUFFICIENT: 2, EARLY: 2, DEVELOPING: 3, DEMONSTRATED: 3, STRONG: 2 }, provisional: 5 },
    { capabilityId: 'CAP-B', name: 'Stakeholder communication', suppressed: true, reason: 'SMALL_GROUP' },
  ],
  topNeeds: [{ capabilityId: 'CAP-A', name: 'Structured reasoning', needs: 7, of: 12 }],
} }
const comparison = (groupBy) => ({ data: {
  groupBy, minGroupSize: 10, capabilities: [{ capabilityId: 'CAP-A', name: 'Structured reasoning' }],
  groups: [
    { groupId: COHORT, name: 'Commerce 2027', suppressed: false, n: 12, capabilities: [capabilities.data.capabilities[0]] },
    { groupId: 'g2', name: 'Engineering 2027', suppressed: true, reason: 'SMALL_GROUP' },
  ],
} })

function render(element, path, routes, permissions) {
  signIn()
  sessionStorage.setItem('prismActiveWorkspace', 'ws-admin')
  const adminWs = { id: 'ws-admin', type: 'CAMPUS_ADMIN', name: 'Synthetic University', organizationId: ORG, organizationName: 'Synthetic University', visibilityPolicy: 'OWNER_AND_SPONSOR', permissions }
  const calls = routeFetch({
    ...routes,
    [api('/cohorts')]: { data: { items: [{ id: COHORT, name: 'Commerce 2027', status: 'ACTIVE', memberCount: 12 }] } },
    [api('/structure')]: { data: { campuses: [], departments: [{ id: DEPT, name: 'Commerce' }], academicPrograms: [], batches: [] } },
    [api('/programs')]: { data: { items: [] } },
    '/api/v1/me': meBody({ flags, workspaces: [meBody().data.workspaces[0], adminWs] }),
  })
  renderApp(<Routes><Route path={`/campus/:organizationId/${path}`} element={<WorkspaceGuard type="CAMPUS_ADMIN">{element}</WorkspaceGuard>} /></Routes>, { route: `/campus/${ORG}/${path}` })
  return calls
}

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear() })

describe('Campus analytics', () => {
  it('capabilities: top needs as counts with the method, a table equivalent, hidden rows with the spec sentence', async () => {
    render(<CampusAnalyticsPage />, 'analytics', { [api('/analytics/capabilities')]: capabilities }, ['analytics.read'])
    expect(await screen.findByTestId('top-needs')).toHaveTextContent('Structured reasoning — 7 of 12 assessed students need further evidence or development')
    expect(screen.getByText(/below "Demonstrated"/)).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Students by capability level' })
    expect(within(table).getByRole('columnheader', { name: 'Insufficient evidence' })).toBeInTheDocument()
    expect(within(table).getByText('Hidden')).toBeInTheDocument()
    expect(screen.getByText(SENTENCE)).toBeInTheDocument()
    expect(screen.getByText(/1 assessment is under review and not counted/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument()
    // A hidden row opens the table by default so the reason is visible.
    expect(screen.getByRole('button', { name: 'Hide table' })).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Hide table' }))
    expect(screen.getByRole('button', { name: 'Show as table' })).toHaveAttribute('aria-expanded', 'false')
    expect(document.body.textContent).not.toMatch(/\d\s*%|average score|leaderboard|top performer/i)
  }, 20_000)

  it('a whole view below the minimum size shows only the spec sentence, with no counts', async () => {
    const rest = { ...capabilities.data }
    delete rest.assessed
    delete rest.underReview
    render(<CampusAnalyticsPage />, 'analytics', { [api('/analytics/capabilities')]: { data: { ...rest, suppressed: true, reason: 'SMALL_GROUP', capabilities: [], topNeeds: [] } } }, ['analytics.read'])
    expect(await screen.findByText(SENTENCE)).toBeInTheDocument()
    expect(screen.queryByTestId('top-needs')).not.toBeInTheDocument()
    expect(screen.queryByText(/assessed student/)).not.toBeInTheDocument()
    expect(screen.queryByText(/under review/)).not.toBeInTheDocument()
  })

  it('comparison: heatmap cells are "X of N"; switching to departments refetches; export sends the view', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const calls = render(<CampusAnalyticsPage />, 'analytics', {
      [api('/analytics/capabilities')]: capabilities,
      [api('/analytics/comparison')]: (u) => jsonResponse(200, comparison(new URL(u, 'http://x').searchParams.get('groupBy'))),
      [`POST ${api('/analytics/exports')}`]: { data: { fileName: 'prism-analytics-comparison.csv', contentType: 'text/csv', csv: 'Cohort\r\n' } },
    }, ['analytics.read', 'exports.cohort'])
    await screen.findByTestId('top-needs')
    await userEvent.click(screen.getByRole('tab', { name: 'Comparison' }))
    const table = await screen.findByRole('table', { name: /by cohort/ })
    expect(within(table).getByText('7 of 12')).toBeInTheDocument()
    expect(within(table).getAllByText('Hidden').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('radio', { name: 'By department' }))
    await waitFor(() => expect(calls.some((c) => c.url.includes('groupBy=department'))).toBe(true))
    await userEvent.click(await screen.findByRole('button', { name: 'Export CSV' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ view: 'comparison', groupBy: 'department' }))
  })
})

describe('Campus reports', () => {
  const report = { data: {
    kind: 'EXECUTIVE', generatedAt: '2026-10-20T09:00:00.000Z', minGroupSize: 10,
    participation: { assignments: 1, funnel: { assigned: 16, acknowledged: 16, started: 16, completed: 16 }, notCompleted: { expired: 0, withdrawn: 0 } },
    capabilities: { suppressed: false, assessed: 12, underReview: 0, items: capabilities.data.capabilities, bucketLabels: labels },
    majorGaps: capabilities.data.topNeeds,
    interventions: [], reassessments: [],
    recommendedActions: [{ kind: 'DEVELOPMENT', capabilityId: 'CAP-A', text: 'Structured reasoning: 7 of 12 assessed students need further evidence or development. Consider a practice intervention.' }],
    method: 'Method.', privacy: 'Aggregate only. No personal Prism data, no student names and no ranking.',
  } }

  it('validates the target, generates on request and shows every section', async () => {
    const calls = render(<CampusReportsPage />, 'reports', { [`POST ${api('/reports/cohort')}`]: report }, ['reports.read'])
    await userEvent.click(await screen.findByRole('radio', { name: 'Cohort report' }))
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))
    expect(await screen.findByText('Choose a cohort.')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
    await userEvent.click(screen.getByRole('radio', { name: 'Executive cohort report' }))
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))
    const r = await screen.findByTestId('campus-report')
    expect(calls.find((c) => c.method === 'POST').body).toEqual({})
    for (const h of ['Participation', 'Capability distributions', 'Major gaps', 'Intervention activity', 'Reassessment status', 'Recommended next actions']) expect(within(r).getByRole('heading', { name: h })).toBeInTheDocument()
    expect(within(r).getByText(/Consider a practice intervention/)).toBeInTheDocument()
    expect(within(r).getByRole('button', { name: 'Download PDF' })).toBeInTheDocument()
    expect(r.textContent).not.toMatch(/\d\s*%|rank(ed|ing)? students? (by|on)/i)
  })
})

describe('Analytics privacy threshold', () => {
  it('refuses values below the floor and saves a valid one', async () => {
    const calls = render(<CampusSettingsPage />, 'settings', {
      [api('/settings/analytics')]: { data: { minAggregateGroupSize: 10, default: 10, floor: 5, updatedAt: null, canChange: true } },
      [`PATCH ${api('/settings/analytics')}`]: { data: { minAggregateGroupSize: 12, default: 10, floor: 5, updatedAt: '2026-10-20T09:00:00Z', canChange: true } },
      [api('/audit')]: { data: { items: [], nextBefore: null } },
    }, ['org.manage', 'org.settings.read'])
    await userEvent.click(await screen.findByRole('tab', { name: 'Analytics privacy' }))
    const input = await screen.findByLabelText('Minimum students per group')
    await userEvent.clear(input)
    await userEvent.type(input, '4')
    expect(screen.getByText('Enter a whole number from 5 to 1000.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.clear(input)
    await userEvent.type(input, '12')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ minAggregateGroupSize: 12 }))
  })

  it('is read-only for staff who cannot change it (server decides)', async () => {
    render(<CampusSettingsPage />, 'settings', {
      [api('/settings/analytics')]: { data: { minAggregateGroupSize: 10, default: 10, floor: 5, updatedAt: null, canChange: false } },
      [api('/audit')]: { data: { items: [], nextBefore: null } },
    }, ['org.manage', 'org.settings.read'])
    await userEvent.click(await screen.findByRole('tab', { name: 'Analytics privacy' }))
    expect(await screen.findByLabelText('Minimum students per group')).toBeDisabled()
    expect(screen.getByText('Only organization owners can change privacy thresholds.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })
})
