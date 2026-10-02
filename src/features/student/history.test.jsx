// P1.2 — the History tab of /app/assessments in every state: loading, error
// with retry, empty, a formal + legacy + practice mix with honest statuses,
// and a record whose date was never stored.
import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp, mockFetch, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import { studentRoutes } from '../../test/studentFixtures.js'
import AssessmentsPage from '../assessments/pages/AssessmentsPage.jsx'

const PERSONAL_WS = { id: 'personal', type: 'PERSONAL', name: 'Personal', organizationId: null, organizationName: null, visibilityPolicy: 'OWNER_ONLY' }

function item(over = {}) {
  return {
    id: 'FORMAL_SESSION:s1', sourceType: 'FORMAL_SESSION', sourceId: 's1', mode: 'FORMAL', title: 'Synthetic Simulation',
    startedAt: '2026-09-01T09:00:00.000Z', completedAt: '2026-09-01T10:00:00.000Z', issuedAt: '2026-09-01T10:00:00.000Z',
    scope: 'PERSONAL', sponsorOrganizationId: null, status: 'COMPLETED', reportFormat: 'V3',
    permittedAction: { kind: 'VIEW_REPORT', to: '/app/reports/s1' }, recoveryState: 'NONE',
    ...over,
  }
}

async function render(history) {
  signIn()
  const spy = mockFetch({ ...studentRoutes({ '/api/v1/me/history': history }), '/api/v1/me': meBody({ flags: { PRISM_APP_SHELL_V3: true }, workspaces: [PERSONAL_WS] }) })
  const out = renderApp(<Routes><Route path="/app/assessments" element={<AssessmentsPage />} /></Routes>, { route: '/app/assessments' })
  const user = userEvent.setup()
  await user.click(await screen.findByRole('tab', { name: 'History' }))
  return { ...out, spy, user }
}

const noPercent = () => expect(document.body.textContent).not.toMatch(/\d\s*%/)

describe('Assessment history (P1.2)', () => {
  it('announces loading without inventing records', async () => {
    await render(() => new Promise(() => {}))
    expect(await screen.findByText('Loading history…')).toBeInTheDocument()
    expect(screen.queryByTestId('history-item')).not.toBeInTheDocument()
  })

  it('an error keeps the records implied as kept and offers retry', async () => {
    let ok = false
    const { user } = await render(() => (ok
      ? jsonResponse(200, { data: { items: [item()], nextCursor: null } })
      : jsonResponse(500, { error: { code: 'INTERNAL', message: 'x', requestId: 'req-h500' } })))
    expect(await screen.findByText('Reference: req-h500', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByText(/Your records are still kept/)).toBeInTheDocument()
    expect(screen.queryByText(/deleted/i)).not.toBeInTheDocument()
    ok = true
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Synthetic Simulation')).toBeInTheDocument()
  })

  it('an empty history says nothing was removed', async () => {
    await render({ data: { items: [], nextCursor: null } })
    expect(await screen.findByRole('heading', { name: 'No history yet' })).toBeInTheDocument()
    expect(screen.getByText(/Nothing has been removed/)).toBeInTheDocument()
  })

  it('groups formal and practice records and renders every status honestly', async () => {
    await render({ data: { nextCursor: null, items: [
      item(),
      item({ id: 'FORMAL_SESSION:p', sourceId: 'p', title: 'Processing One', status: 'PROCESSING', completedAt: '2026-09-20T10:00:00.000Z', issuedAt: null, reportFormat: null, permittedAction: { kind: 'NONE', to: null }, recoveryState: 'AWAITING_REPORT' }),
      item({ id: 'FORMAL_SESSION:f', sourceId: 'f', title: 'Failed One', status: 'TECHNICAL_FAILED', completedAt: '2026-09-10T10:00:00.000Z', issuedAt: null, reportFormat: null, permittedAction: { kind: 'RECOVER', to: '/app/assessment/f' }, recoveryState: 'RECOVERABLE' }),
      item({ id: 'FORMAL_SESSION:h', sourceId: 'h', title: 'Held One', status: 'UNDER_REVIEW', permittedAction: { kind: 'NONE', to: null }, recoveryState: 'HELD' }),
      item({ id: 'LEGACY_REPORT:l', sourceType: 'LEGACY_REPORT', sourceId: 'l', title: 'Legacy One', status: 'LEGACY', reportFormat: 'LEGACY_V2', startedAt: null, completedAt: '2025-03-04T10:00:00.000Z', issuedAt: '2025-03-04T10:00:00.000Z', permittedAction: { kind: 'VIEW_REPORT', to: '/score?session=l' } }),
      item({ id: 'PRACTICE_ATTEMPT:a1', sourceType: 'PRACTICE_ATTEMPT', sourceId: 'a1', mode: 'PRACTICE', title: 'Practice Mission', status: 'ACTIVE', completedAt: null, issuedAt: null, reportFormat: null, permittedAction: { kind: 'RESUME', to: '/app/development/missions/m1' }, recoveryState: 'RESUMABLE' }),
    ] } })
    const formal = await screen.findByRole('region', { name: 'Formal assessment' })
    const practice = screen.getByRole('region', { name: 'Practice' })
    expect(within(formal).getAllByTestId('history-item')).toHaveLength(5)
    expect(within(practice).getAllByTestId('history-item')).toHaveLength(1)
    expect(within(practice).getByRole('link', { name: /^Resume\s*:\s*Practice Mission$/ })).toHaveAttribute('href', '/app/development/missions/m1')
    expect(within(practice).getByText(/^Started /)).toBeInTheDocument()

    expect(within(formal).getByRole('link', { name: /^View report\s*:\s*Synthetic Simulation$/ })).toHaveAttribute('href', '/app/reports/s1')
    expect(within(formal).getByText('Processing')).toBeInTheDocument()
    expect(within(formal).getByText(/report is being prepared/)).toBeInTheDocument()
    expect(within(formal).getByText('Review did not finish')).toBeInTheDocument()
    expect(within(formal).getByRole('link', { name: /^Recover\s*:\s*Failed One$/ })).toHaveAttribute('href', '/app/assessment/f')
    expect(within(formal).getByText('Under review')).toBeInTheDocument()
    expect(within(formal).queryByRole('link', { name: /Held One/ })).not.toBeInTheDocument()
    expect(within(formal).getByText('Legacy report')).toBeInTheDocument()
    expect(within(formal).getByRole('link', { name: /^Original report\s*:\s*Legacy One$/ })).toHaveAttribute('href', '/score?session=l')
    expect(screen.queryByText('Date not recorded')).not.toBeInTheDocument()
    noPercent()
  })

  it('a record without a stored date says so instead of showing today', async () => {
    await render({ data: { nextCursor: null, items: [
      item({ id: 'LEGACY_REPORT:nd', sourceType: 'LEGACY_REPORT', sourceId: 'nd', title: null, status: 'LEGACY', reportFormat: 'LEGACY_V2', startedAt: null, completedAt: null, issuedAt: null, permittedAction: { kind: 'VIEW_REPORT', to: '/score?session=nd' } }),
    ] } })
    const card = await screen.findByTestId('history-item')
    expect(within(card).getByText('Date not recorded')).toBeInTheDocument()
    expect(within(card).getByRole('heading', { name: 'Assessment' })).toBeInTheDocument()
    const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    expect(card.textContent).not.toContain(today)
  })

  it('loads the next page only when the server offers a cursor', async () => {
    const pages = {
      first: { data: { items: [item()], nextCursor: 'Mg' } },
      second: { data: { items: [item({ id: 'FORMAL_SESSION:s2', sourceId: 's2', title: 'Second Simulation', completedAt: '2026-08-01T10:00:00.000Z', issuedAt: '2026-08-01T10:00:00.000Z' })], nextCursor: null } },
    }
    const { user } = await render((url) => jsonResponse(200, url.includes('cursor=Mg') ? pages.second : pages.first))
    await screen.findByText('Synthetic Simulation')
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    expect(await screen.findByText('Second Simulation')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument())
  })
})
