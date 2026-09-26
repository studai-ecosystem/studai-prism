// C9.06 — Growth V2 UI over mocked /api/v1 responses: a change is shown only
// for an approved comparable pair (level labels, no scores, no margin), every
// other case says why; the timeline orders assessments, interventions and
// reassessments; the campus reassessments page validates the schedule form,
// sends only what it holds, tells staff whether forms are comparable and
// shows outcomes with small groups hidden.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import { WorkspaceGuard } from '../../app/guards/WorkspaceGuard.jsx'
import GrowthPage from './pages/GrowthPage.jsx'
import CampusReassessmentsPage from '../campus/pages/CampusReassessmentsPage.jsx'

const ORG = '11111111-1111-4111-8111-111111111111'
const COHORT = '22222222-2222-4222-8222-222222222222'
const CYCLE = '33333333-3333-4333-8333-333333333333'
const flags = { PRISM_APP_SHELL_V3: true, PRISM_GROWTH_ENABLED: true, PRISM_CAMPUS_ENABLED: true }

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

const ref = (sessionId, completedAt, version) => ({ sessionId, title: 'Prism Workplace Simulation', completedAt, form: { id: `core:${sessionId}:${version}`, version } })
const growthBody = (over = {}) => ({ data: {
  comparable: true, reason: null,
  assessments: [ref('s2', '2026-12-02T10:00:00.000Z', '1.0.0'), ref('s1', '2026-10-11T10:00:00.000Z', '1.0.0')],
  comparison: { baseline: ref('s1', '2026-10-11T10:00:00.000Z', '1.0.0'), reassessment: ref('s2', '2026-12-02T10:00:00.000Z', '1.0.0'), formPair: { status: 'APPROVED', evidenceRef: 'equating-run-9', decidedAt: '2026-11-01T00:00:00.000Z' } },
  changes: [
    { capabilityId: 'CAP-A', name: 'Structured reasoning', comparable: true, from: { band: 'DEVELOPING', label: 'Developing' }, to: { band: 'DEMONSTRATED', label: 'Demonstrated' }, direction: 'HIGHER', uncertainty: null, uncertaintyStatus: 'NOT_VALIDATED' },
    { capabilityId: 'CAP-B', name: 'Stakeholder communication', comparable: false, reason: 'EVIDENCE_NOT_SUFFICIENT_IN_BOTH' },
  ],
  reassessments: [], interventions: [{ id: 'i1', name: 'Experimentation sprint', startsOn: '2026-10-20', endsOn: '2026-11-17', status: 'COMPLETED' }],
  growthEnabled: true,
  ...over,
} })

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear() })

describe('Growth page (V2)', () => {
  function renderGrowth(body) {
    signIn()
    routeFetch({ '/api/v1/me/growth': body, '/api/v1/me': meBody({ flags }) })
    return renderApp(<Routes><Route path="/app/growth" element={<GrowthPage />} /></Routes>, { route: '/app/growth' })
  }

  it('shows a level-label change for an approved comparable pair, with what was compared and no margin', async () => {
    renderGrowth(growthBody())
    const card = await screen.findByTestId('growth-change')
    expect(card).toHaveTextContent('Structured reasoning')
    expect(card).toHaveTextContent('Higher level than before')
    expect(card).toHaveTextContent(/Level changed from\s*Developing\s*→?\s*to\s*Demonstrated/)
    expect(card).toHaveTextContent('How precise this change is has not been validated yet')
    expect(screen.getByTestId('growth-comparability')).toHaveTextContent('approved as comparable')
    expect(screen.getByText('Baseline')).toBeInTheDocument()
    expect(screen.getAllByText('Form version 1.0.0').length).toBe(2)
    expect(screen.getByText(/Stakeholder communication: Not enough evidence in both assessments/)).toBeInTheDocument()
    const timeline = screen.getByTestId('growth-timeline')
    const titles = within(timeline).getAllByRole('listitem').map((li) => li.querySelector('p').textContent)
    expect(titles).toEqual(['Prism Workplace Simulation', 'Experimentation sprint', 'Prism Workplace Simulation'])
    expect(document.body.textContent).not.toMatch(/\d+\s*%|score|points|±/i)
  })

  it('an unapproved pair shows the spec sentence and no change at all', async () => {
    renderGrowth(growthBody({ comparable: false, reason: 'FORMS_NOT_VALIDATED_FOR_COMPARISON', comparison: null, changes: [] }))
    expect(await screen.findByText('A later assessment exists, but these forms are not yet validated for direct growth comparison.')).toBeInTheDocument()
    expect(screen.queryByTestId('growth-change')).not.toBeInTheDocument()
    expect(screen.queryByText('What is compared')).not.toBeInTheDocument()
  })

  it('an approved pair without enough evidence says so and shows no change', async () => {
    renderGrowth(growthBody({ comparable: false, reason: 'EVIDENCE_NOT_SUFFICIENT_FOR_COMPARISON', changes: [{ capabilityId: 'CAP-B', name: 'Stakeholder communication', comparable: false, reason: 'EVIDENCE_NOT_SUFFICIENT_IN_BOTH' }] }))
    expect(await screen.findByText('Not enough evidence to show a change yet')).toBeInTheDocument()
    expect(screen.queryByTestId('growth-change')).not.toBeInTheDocument()
    expect(screen.getByText('What is compared')).toBeInTheDocument()
  })

  it('campus: an open reassessment links to campus assignments and says when it cannot show a change', async () => {
    signIn()
    const campusWs = { id: 'ws-campus', type: 'CAMPUS_STUDENT', name: 'Synthetic University', organizationId: ORG, organizationName: 'Synthetic University', visibilityPolicy: 'OWNER_AND_SPONSOR' }
    sessionStorage.setItem('prismActiveWorkspace', 'ws-campus')
    routeFetch({
      '/api/v1/me/growth': growthBody({
        comparable: false, reason: 'NEEDS_COMPARABLE_REASSESSMENT', comparison: null, changes: [], assessments: [], interventions: [],
        reassessments: [{ id: CYCLE, name: 'December reassessment', windowStart: '2026-12-01T08:00:00.000Z', windowEnd: '2026-12-15T18:00:00.000Z', status: 'ACTIVE', assignmentId: 'a-2', rosterStatus: 'ASSIGNED', endedAt: null, comparability: 'PENDING' }],
      }),
      '/api/v1/me': meBody({ flags, workspaces: [meBody().data.workspaces[0], campusWs] }),
    })
    renderApp(<Routes><Route path="/app/campus/:organizationId/growth" element={<WorkspaceGuard type="CAMPUS_STUDENT"><GrowthPage /></WorkspaceGuard>} /></Routes>, { route: `/app/campus/${ORG}/growth` })
    expect(await screen.findByRole('link', { name: 'Go to your assessments' })).toHaveAttribute('href', `/app/campus/${ORG}/assignments`)
    expect(screen.getAllByText(/will not show a change yet: its assessment forms are not yet approved as comparable/).length).toBe(2)
    expect(within(screen.getByTestId('growth-timeline')).getByText(/Reassessment · open until/)).toBeInTheDocument()
  })
})

describe('Campus reassessments', () => {
  const adminWs = { id: 'ws-admin', type: 'CAMPUS_ADMIN', name: 'Synthetic University', organizationId: ORG, organizationName: 'Synthetic University', visibilityPolicy: 'OWNER_AND_SPONSOR', permissions: ['reassessments.read', 'reassessments.write', 'analytics.read', 'assignments.read'] }
  const cycle = {
    id: CYCLE, name: 'December reassessment', status: 'SCHEDULED', windowStart: '2026-12-01T08:00:00.000Z', windowEnd: '2026-12-15T18:00:00.000Z', programId: null, interventionId: null, cohortIds: [COHORT],
    baseline: { assignmentId: 'a-1', title: 'Prism Workplace Simulation', windowStart: '2026-10-10T08:00:00.000Z', windowEnd: '2026-10-20T18:00:00.000Z', completed: 11, rostered: 12 },
    reassessment: { assignmentId: 'a-2', title: 'Prism Workplace Simulation', completed: 0, rostered: 12 },
    comparability: 'PENDING', rostered: 12,
  }
  const assignment = { id: 'a-1', definitionId: 'prism-workplace-core', title: 'Prism Workplace Simulation', status: 'CLOSED', windowStart: '2026-10-10T08:00:00.000Z', windowEnd: '2026-10-20T18:00:00.000Z', integrityPolicy: 'STANDARD', programId: null, cohortIds: [COHORT], counts: { total: 12, COMPLETED: 11 } }

  it('validates the schedule form, sends only its fields, and shows comparability and suppressed outcomes', async () => {
    signIn()
    sessionStorage.setItem('prismActiveWorkspace', 'ws-admin')
    let list = []
    const calls = routeFetch({
      '/api/v1/me': meBody({ flags, workspaces: [meBody().data.workspaces[0], adminWs] }),
      [`POST /api/v1/organizations/${ORG}/reassessments`]: () => { list = [cycle]; return jsonResponse(201, { data: cycle }) },
      [`/api/v1/organizations/${ORG}/reassessments`]: () => jsonResponse(200, { data: { items: list } }),
      [`/api/v1/organizations/${ORG}/assignments`]: { data: { items: [assignment] } },
      [`/api/v1/organizations/${ORG}/analytics/growth`]: { data: { items: [{
        cycle: { id: CYCLE, name: cycle.name, status: 'SCHEDULED', comparability: 'PENDING' },
        counts: { completedBoth: 3, comparable: 3, formsNotApproved: 0, underReviewOrMissing: 0 },
        capabilities: [{ capabilityId: 'CAP-A', name: 'Structured reasoning', suppressed: true, reason: 'SMALL_GROUP' }],
        minGroupSize: 10, method: 'Level-label change counted only for approved comparable forms.',
      }] } },
    })
    renderApp(<Routes><Route path="/campus/:organizationId/reassessments" element={<WorkspaceGuard type="CAMPUS_ADMIN"><CampusReassessmentsPage /></WorkspaceGuard>} /></Routes>, { route: `/campus/${ORG}/reassessments` })
    expect(await screen.findByText('No reassessments yet')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Schedule reassessment' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Schedule a reassessment' })
    await within(dialog).findByRole('option', { name: /Prism Workplace Simulation/ })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Schedule reassessment' }))
    expect(await within(dialog).findByText('Give the reassessment a name.')).toBeInTheDocument()
    expect(within(dialog).getByText('Choose the earlier assessment to repeat.')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'December reassessment')
    await userEvent.selectOptions(within(dialog).getByLabelText(/Baseline assessment/), 'a-1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Schedule reassessment' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    const body = calls.find((c) => c.method === 'POST').body
    expect(Object.keys(body).sort()).toEqual(['baselineAssignmentId', 'name', 'windowEnd', 'windowStart'])
    expect(body).toMatchObject({ name: 'December reassessment', baselineAssignmentId: 'a-1' })
    expect(new Date(body.windowEnd) > new Date(body.windowStart)).toBe(true)

    const table = await screen.findByRole('table', { name: 'Reassessments' })
    expect(within(table).getByText('Not yet approved')).toBeInTheDocument()
    expect(within(table).getByText('0 of 12')).toBeInTheDocument()
    await userEvent.click(within(table).getByRole('button', { name: 'December reassessment' }))
    const detail = await screen.findByRole('dialog', { name: 'December reassessment' })
    expect(within(detail).getByText(/no growth change will be shown until a psychometric review approves the forms/)).toBeInTheDocument()
    expect(await within(detail).findByText('Hidden')).toBeInTheDocument()
    expect(within(detail).getByText(/Data hidden because this segment is too small for aggregate reporting\./)).toBeInTheDocument()
    expect(detail.textContent).not.toMatch(/\d+\s*%|rank|score/i)
  })
})
