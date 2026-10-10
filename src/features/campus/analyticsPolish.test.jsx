// PROD-READY Phase 8 (campus P3 UX follow-ups): each analytics view shows its
// own 403 / 402 / error state inside its tab (no "go home" link, the page
// and the other views stay usable), every view has an h2 under the page h1,
// and the filters sit behind a disclosure below lg.
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp, meBody, signIn, jsonResponse, preloadCampusCharts } from '../../test/utils.jsx'
import { WorkspaceGuard } from '../../app/guards/WorkspaceGuard.jsx'
import CampusAnalyticsPage from './pages/CampusAnalyticsPage.jsx'

const ORG = '11111111-1111-4111-8111-111111111111'
const COHORT = '22222222-2222-4222-8222-222222222222'
const flags = { PRISM_CAMPUS_ENABLED: true, PRISM_APP_SHELL_V3: true, PRISM_CAMPUS_ANALYTICS: true }
const labels = { INSUFFICIENT: 'Insufficient evidence', EARLY: 'Early evidence', DEVELOPING: 'Developing', DEMONSTRATED: 'Demonstrated', STRONG: 'Strongly demonstrated' }
const api = (p) => `/api/v1/organizations/${ORG}${p}`
// Campus copy ceiling for the view states, checked on the tab panel (the
// page's own "Prism does not rank students" note sits outside it).
const CEILING = /\brank(ed|ing|s)?\b|\bhir(e|ing)\b|\bpass(ed)?\b|\bfail(ed|s)?\b|\bshortlist/i

const capabilities = { data: {
  minGroupSize: 10, assessed: 12, underReview: 0, bucketLabels: labels, method: 'Method.', suppressed: false,
  capabilities: [{ capabilityId: 'CAP-A', name: 'Structured reasoning', suppressed: false, n: 12, buckets: { INSUFFICIENT: 2, EARLY: 2, DEVELOPING: 3, DEMONSTRATED: 3, STRONG: 2 }, provisional: 0 }],
  topNeeds: [{ capabilityId: 'CAP-A', name: 'Structured reasoning', needs: 7, of: 12 }],
} }
const error = (status, code, requestId = 'req-analytics-1') => () => jsonResponse(status, { error: { code, message: 'Refused.', requestId } })

function render(routes) {
  signIn()
  sessionStorage.setItem('prismActiveWorkspace', 'ws-admin')
  const adminWs = { id: 'ws-admin', type: 'CAMPUS_ADMIN', name: 'Synthetic University', organizationId: ORG, organizationName: 'Synthetic University', visibilityPolicy: 'OWNER_AND_SPONSOR', permissions: ['analytics.read'] }
  const calls = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
    const u = String(url)
    calls.push(u)
    const all = {
      ...routes,
      [api('/cohorts')]: { data: { items: [{ id: COHORT, name: 'Commerce 2027', status: 'ACTIVE', memberCount: 12 }] } },
      [api('/structure')]: { data: { campuses: [], departments: [], academicPrograms: [], batches: [] } },
      [api('/programs')]: { data: { items: [] } },
      '/api/v1/me': meBody({ flags, workspaces: [meBody().data.workspaces[0], adminWs] }),
    }
    for (const [prefix, handler] of Object.entries(all)) {
      if (u.startsWith(prefix)) return typeof handler === 'function' ? handler(u, init) : jsonResponse(200, handler)
    }
    throw new Error(`unexpected fetch ${u}`)
  })
  renderApp(<Routes><Route path="/campus/:organizationId/analytics" element={<WorkspaceGuard type="CAMPUS_ADMIN"><CampusAnalyticsPage /></WorkspaceGuard>} /></Routes>, { route: `/campus/${ORG}/analytics` })
  return calls
}

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear() })
beforeAll(() => preloadCampusCharts())

describe('Campus analytics: view-level states', () => {
  it('a 403 view says so inside its own tab, with no home link, and the other views still work', async () => {
    render({
      [api('/analytics/capabilities')]: error(403, 'FORBIDDEN'),
      [api('/analytics/sufficiency')]: { data: { minGroupSize: 10, suppressed: false, capabilities: [] } },
    })
    const panel = await screen.findByRole('tabpanel')
    const state = await within(panel).findByTestId('analytics-view-state')
    expect(state).toHaveAttribute('data-state', 'forbidden')
    expect(within(panel).getByRole('heading', { level: 3, name: 'You don’t have access to this view' })).toBeInTheDocument()
    expect(within(panel).getByText(/other views on this page may still be available/)).toBeInTheDocument()
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText('This page is not available')).not.toBeInTheDocument()
    // The page and its filters stay; another view loads normally.
    expect(screen.getByRole('heading', { level: 1, name: 'Analytics' })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Filters' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Evidence' }))
    expect(await screen.findByText('Nothing to show yet')).toBeInTheDocument()
    expect(screen.queryByTestId('analytics-view-state')).not.toBeInTheDocument()
    expect(screen.getByRole('tabpanel').textContent).not.toMatch(CEILING)
  })

  it('a 402 view explains that the plan or sponsorship does not include it', async () => {
    render({ [api('/analytics/capabilities')]: error(402, 'ENTITLEMENT_REQUIRED') })
    const panel = await screen.findByRole('tabpanel')
    const state = await within(panel).findByTestId('analytics-view-state')
    expect(state).toHaveAttribute('data-state', 'plan')
    expect(within(panel).getByRole('heading', { level: 3, name: 'This view is not included in your organization’s plan' })).toBeInTheDocument()
    expect(within(panel).getByText(/active campus plan or sponsorship/)).toBeInTheDocument()
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(screen.getByRole('tabpanel').textContent).not.toMatch(CEILING)
  })

  it('a 500 view offers a retry with its reference, and retrying loads the view in place', async () => {
    let n = 0
    const calls = render({
      [api('/analytics/capabilities')]: () => {
        n += 1
        return n === 1 ? jsonResponse(500, { error: { code: 'INTERNAL', message: 'Boom.', requestId: 'req-500' } }) : jsonResponse(200, capabilities)
      },
    })
    const panel = await screen.findByRole('tabpanel')
    const state = await within(panel).findByTestId('analytics-view-state')
    expect(state).toHaveAttribute('data-state', 'error')
    expect(within(panel).getByRole('heading', { level: 3, name: 'This view could not load' })).toBeInTheDocument()
    expect(within(panel).getByText('Reference: req-500')).toBeInTheDocument()
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('button', { name: 'Try again' }))
    expect(await within(panel).findByTestId('top-needs')).toHaveTextContent('Structured reasoning')
    expect(calls.filter((u) => u.includes('/analytics/capabilities')).length).toBe(2)
    expect(screen.getByRole('heading', { level: 1, name: 'Analytics' })).toBeInTheDocument()
  })
})

describe('Campus analytics: heading hierarchy', () => {
  it('every view has an h2 under the page h1, and the headings inside it start at h3', async () => {
    render({
      [api('/analytics/capabilities')]: capabilities,
      [api('/analytics/sufficiency')]: { data: { minGroupSize: 10, suppressed: false, capabilities: [] } },
      [api('/analytics/comparison')]: { data: { groupBy: 'cohort', minGroupSize: 10, capabilities: [], groups: [] } },
      [api('/analytics/completion')]: { data: { assignments: 1, funnel: { assigned: 3, acknowledged: 2, started: 1, completed: 0 }, notCompleted: { expired: 0, withdrawn: 0 } } },
      [api('/analytics/interventions')]: { data: { minGroupSize: 10, interventions: [], reassessments: [] } },
    })
    const expected = { Capabilities: 'Capability levels', Evidence: 'Evidence sufficiency', Comparison: 'Comparison by cohort or department', Completion: 'Assessment completion', Interventions: 'Intervention outcomes' }
    await screen.findByTestId('top-needs')
    for (const [tab, title] of Object.entries(expected)) {
      await userEvent.click(screen.getByRole('tab', { name: tab }))
      const panel = screen.getByRole('tabpanel')
      expect(await within(panel).findByRole('heading', { level: 2, name: title })).toBeInTheDocument()
      // No heading inside the view skips a level below its h2.
      await waitFor(() => expect(within(panel).queryAllByRole('status')).toHaveLength(0))
      const levels = within(panel).getAllByRole('heading').map((h) => Number(h.tagName.slice(1)))
      expect(levels[0]).toBe(2)
      for (let i = 1; i < levels.length; i += 1) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1)
    }
  })
})

describe('Campus analytics: filter disclosure', () => {
  it('the filters toggle is a disclosure (aria-expanded, aria-controls) that opens and closes the filter form', async () => {
    render({ [api('/analytics/capabilities')]: capabilities })
    await screen.findByTestId('top-needs')
    const toggle = screen.getByRole('button', { name: 'Filters' })
    const form = screen.getByRole('form', { name: 'Filters' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', form.id)
    // Collapsed below lg (hidden), always shown from lg up; the toggle itself is lg:hidden.
    expect(form.className).toMatch(/(^|\s)hidden(\s|$)/)
    expect(form.className).toMatch(/lg:grid(\s|$)/)
    expect(toggle.className).toMatch(/lg:hidden/)
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(form.className).not.toMatch(/(^|\s)hidden(\s|$)/)
    expect(form).toHaveAttribute('data-open', 'true')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(form).toHaveAttribute('data-open', 'false')
  })

  it('applied filters are counted on the collapsed toggle', async () => {
    const calls = render({ [api('/analytics/capabilities')]: capabilities })
    await screen.findByTestId('top-needs')
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    await userEvent.selectOptions(screen.getByLabelText('Cohort'), COHORT)
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(calls.some((u) => u.includes('/analytics/capabilities') && u.includes(COHORT))).toBe(true))
    expect(screen.getByRole('button', { name: 'Filters (1 applied)' })).toHaveAttribute('aria-expanded', 'true')
  })
})
