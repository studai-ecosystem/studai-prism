// C11.06 — campus billing + integrations UI over mocked /api/v1 responses:
// seats and usage as counts, prices hidden until approved, an audited usage
// download with validation, honest integration status, and the sponsored
// student card ("No payment required", never a price).
import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, within, waitFor, render as rtlRender } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route, MemoryRouter } from 'react-router-dom'
import { renderApp, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import { WorkspaceGuard } from '../../app/guards/WorkspaceGuard.jsx'
import CampusBillingPage from './pages/CampusBillingPage.jsx'
import CampusIntegrationsPage from './pages/CampusIntegrationsPage.jsx'
import { SponsoredByCard } from '../../components/campus/SponsoredByCard.jsx'

const ORG = '11111111-1111-4111-8111-111111111111'
const CONTRACT = '44444444-4444-4444-8444-444444444444'
const flags = { PRISM_CAMPUS_ENABLED: true, PRISM_APP_SHELL_V3: true }
const api = (p) => `/api/v1/organizations/${ORG}${p}`

function routeFetch(routes) {
  const calls = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
    const u = String(url)
    const method = (init.method || 'GET').toUpperCase()
    calls.push({ url: u, method, body: init.body ? JSON.parse(init.body) : undefined })
    const hits = Object.entries(routes).filter(([k]) => {
      const [m, prefix] = k.includes(' ') ? k.split(' ') : ['GET', k]
      return m === method && u.startsWith(prefix)
    }).sort((a, b) => b[0].length - a[0].length)
    if (hits.length) { const h = hits[0][1]; return typeof h === 'function' ? h(u, init) : jsonResponse(200, h) }
    throw new Error(`unexpected fetch ${method} ${u}`)
  })
  return calls
}

function render(element, path, routes, permissions) {
  signIn()
  sessionStorage.setItem('prismActiveWorkspace', 'ws-admin')
  const adminWs = { id: 'ws-admin', type: 'CAMPUS_ADMIN', name: 'Synthetic University', organizationId: ORG, organizationName: 'Synthetic University', visibilityPolicy: 'OWNER_AND_SPONSOR', permissions }
  const calls = routeFetch({ ...routes, '/api/v1/me': meBody({ flags, workspaces: [meBody().data.workspaces[0], adminWs] }) })
  renderApp(<Routes><Route path={`/campus/:organizationId/${path}`} element={<WorkspaceGuard type="CAMPUS_ADMIN">{element}</WorkspaceGuard>} /></Routes>, { route: `/campus/${ORG}/${path}` })
  return calls
}

const contract = (over = {}) => ({
  id: CONTRACT, name: 'Synthetic pilot 2026-27', status: 'ACTIVE', termStart: '2026-09-01', termEnd: '2027-03-31', billableEvent: 'ASSESSMENT_COMPLETED',
  components: { platformFee: true, perCompletedAssessment: true, customIntegrations: false },
  seats: { included: 250, inUse: 40, available: 210 }, usage: { started: 40, billable: 31, released: 2 }, pricingStatus: 'NOT_SET', pricing: null, ...over,
})
const summary = (over = {}) => ({ data: { contracts: [contract()], otherSponsorship: [], invoiceExports: [], billableEventLabels: {}, ...over } })
const usage = { data: { months: [{ period: '2026-10', started: 40, billable: 31, released: 2 }], totals: { started: 40, billable: 31, released: 2 }, note: 'Counts come from the sponsored-seat ledger. Months are in UTC.' } }

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear() })

describe('Campus billing', () => {
  it('shows seats, usage and the billable event as counts; hides prices that are not approved', async () => {
    render(<CampusBillingPage />, 'billing', { [api('/billing/usage')]: usage, [api('/billing')]: summary() }, ['billing.read'])
    expect(await screen.findByRole('heading', { name: 'Synthetic pilot 2026-27' })).toBeInTheDocument()
    expect(screen.getByText('Included seats').closest('div')).toHaveTextContent('250')
    expect(screen.getByText('Seats available').closest('div')).toHaveTextContent('210')
    expect(screen.getByText(/billable when a student completes it/)).toBeInTheDocument()
    expect(screen.getByText('Included in this contract: Platform access, Per completed assessment.')).toBeInTheDocument()
    expect(screen.getByText(/not shown here until StudAI finance confirms them/)).toBeInTheDocument()
    expect(screen.queryByTestId('approved-pricing')).not.toBeInTheDocument()
    const table = await screen.findByRole('table', { name: 'Sponsored assessments by month' })
    expect(within(table).getByText('31')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/₹|INR|\d\s*%/)
  })

  it('shows a price only once it is approved', async () => {
    render(<CampusBillingPage />, 'billing', {
      [api('/billing/usage')]: usage,
      [api('/billing')]: summary({ contracts: [contract({ pricingStatus: 'APPROVED', pricing: { perAssessmentRate: 1, platformFee: null, reassessmentRate: null, currency: 'XXX', approvedAt: '2026-10-01T00:00:00Z' } })] }),
    }, ['billing.read'])
    expect(await screen.findByTestId('approved-pricing')).toHaveTextContent('Rate per billable assessment1 XXX')
  })

  it('an organization without seats gets an honest empty state', async () => {
    render(<CampusBillingPage />, 'billing', { [api('/billing')]: summary({ contracts: [] }) }, ['billing.read'])
    expect(await screen.findByText('No sponsored seats yet')).toBeInTheDocument()
    expect(screen.getByText(/contact your StudAI account team/)).toBeInTheDocument()
  })

  it('usage download validates the period and sends the contract and dates', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const calls = render(<CampusBillingPage />, 'billing', {
      [api('/billing/usage')]: usage,
      [api('/billing')]: summary(),
      [`POST ${api('/billing/invoice-exports')}`]: { data: { fileName: 'prism-usage.csv', contentType: 'text/csv', csv: 'Contract\r\n', export: { id: 'x', billableCount: 31 } } },
    }, ['billing.read'])
    const button = await screen.findByRole('button', { name: 'Download usage CSV' })
    await userEvent.click(button)
    expect(screen.getByText('Choose a contract and both dates.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Period start'), '2026-10-31')
    await userEvent.type(screen.getByLabelText('Period end'), '2026-10-01')
    await userEvent.click(button)
    expect(screen.getByText('The end date must be on or after the start date.')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
    await userEvent.clear(screen.getByLabelText('Period end'))
    await userEvent.type(screen.getByLabelText('Period end'), '2026-11-30')
    await userEvent.click(button)
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ contractId: CONTRACT, periodStart: '2026-10-31', periodEnd: '2026-11-30' }))
    expect(await screen.findByText(/31 billable assessments/)).toBeInTheDocument()
  })
})

describe('Campus integrations', () => {
  const integrations = { data: {
    items: [
      { id: 'sis-csv', kind: 'ROSTER', name: 'Student roster (CSV file)', status: 'AVAILABLE' },
      { id: 'sis-direct', kind: 'ROSTER', name: 'Student information system', status: 'NOT_CONNECTED' },
      { id: 'sso', kind: 'SIGN_IN', name: 'Single sign-on', status: 'NOT_CONNECTED' },
    ],
    signIn: [{ id: 'password', name: 'Email and password' }],
  } }

  it('shows what is available and what is not connected, with a contact route and no pretend status', async () => {
    render(<CampusIntegrationsPage />, 'integrations', { [api('/integrations')]: integrations }, ['integrations.read', 'students.manage'])
    const sso = (await screen.findByRole('heading', { name: 'Single sign-on' })).closest('section')
    expect(within(sso).getByText('Not connected')).toBeInTheDocument()
    expect(within(sso).getByRole('link', { name: 'Contact StudAI to discuss a connection' })).toHaveAttribute('href', '/contact')
    const csv = screen.getByRole('heading', { name: 'Student roster (CSV file)' }).closest('section')
    expect(within(csv).getByText('Available')).toBeInTheDocument()
    expect(within(csv).getByRole('link', { name: 'Import students' })).toHaveAttribute('href', `/campus/${ORG}/cohorts/import`)
    expect(screen.getByText('People sign in with: Email and password.')).toBeInTheDocument()
    expect(screen.queryByText('Connected')).not.toBeInTheDocument()
  })

  it('hides the import action without permission to manage students', async () => {
    render(<CampusIntegrationsPage />, 'integrations', { [api('/integrations')]: integrations }, ['integrations.read'])
    await screen.findByRole('heading', { name: 'Single sign-on' })
    expect(screen.queryByRole('link', { name: 'Import students' })).not.toBeInTheDocument()
  })
})

describe('Sponsored student card', () => {
  it('says "No payment required" and never shows a price', () => {
    rtlRender(<MemoryRouter><SponsoredByCard organizationName="Synthetic University" /></MemoryRouter>)
    expect(screen.getByText('Sponsored by Synthetic University')).toBeInTheDocument()
    expect(screen.getByText(/No payment required\./)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/₹|INR|price|\bfee\b|\d{3}/i)
  })
})
