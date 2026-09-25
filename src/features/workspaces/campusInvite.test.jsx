import { describe, it, expect } from 'vitest'
import { screen, waitFor, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route, useLocation, MemoryRouter } from 'react-router-dom'
import { renderApp, mockFetch, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import CampusInvitePage from './pages/CampusInvitePage.jsx'
import { SponsoredByCard } from '../../components/campus/SponsoredByCard.jsx'
import { PrivacyScopeBadge } from '../../components/campus/PrivacyScopeBadge.jsx'
import { ConsentScopePanel } from '../../components/campus/ConsentScopePanel.jsx'
import { CAMPUS_CAN_SEE, CAMPUS_CANNOT_SEE } from '../../lib/copy/privacy.js'

const TOKEN = 'synthetic-token-0001-abcdefghij'
const personal = meBody().data.workspaces[0]
const campusStudent = { id: 'ws-cs', type: 'CAMPUS_STUDENT', name: 'Synthetic University', organizationId: 'org-1', organizationName: 'Synthetic University', permissions: [] }
const invite = { organizationId: 'org-1', organizationName: 'Synthetic University', role: 'STUDENT', status: 'PENDING', expired: false, expiresAt: '2026-12-01T00:00:00.000Z', emailHint: 's*****@test.local', disclosureVersion: 'campus-disclosure.v1-draft' }

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

const page = (
  <Routes>
    <Route path="/app/campus-invite/:token" element={<CampusInvitePage />} />
    <Route path="*" element={<Where />} />
  </Routes>
)

describe('CampusInvitePage', () => {
  it('shows what the institution can and cannot see and needs an explicit acknowledgement', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody({ workspaces: [personal] }), [`/api/v1/org-invites/${TOKEN}`]: { data: invite } })
    renderApp(page, { route: `/app/campus-invite/${TOKEN}` })
    expect(await screen.findByRole('heading', { name: 'Join Synthetic University on Prism' })).toBeInTheDocument()
    expect(screen.getByText(/no new account is created/)).toBeInTheDocument()
    for (const item of [...CAMPUS_CAN_SEE, ...CAMPUS_CANNOT_SEE]) expect(screen.getByText(item)).toBeInTheDocument()
    const accept = screen.getByRole('button', { name: 'Accept and join' })
    expect(accept).toBeDisabled()
    await userEvent.click(screen.getByLabelText('I have read what Synthetic University can and cannot see'))
    expect(accept).toBeEnabled()
  })

  it('accepting refreshes the workspaces, switches to the campus workspace and lands on its home', async () => {
    signIn()
    let accepted = false
    mockFetch({
      '/api/v1/me': () => jsonResponse(200, meBody({ flags: { PRISM_CAMPUS_ENABLED: true }, workspaces: accepted ? [personal, campusStudent] : [personal] })),
      [`/api/v1/org-invites/${TOKEN}/accept`]: () => { accepted = true; return jsonResponse(200, { data: { workspaceId: 'ws-cs', workspaceType: 'CAMPUS_STUDENT', organizationId: 'org-1', role: 'STUDENT', alreadyAccepted: false } }) },
      [`/api/v1/org-invites/${TOKEN}`]: { data: invite },
    })
    renderApp(page, { route: `/app/campus-invite/${TOKEN}` })
    await userEvent.click(await screen.findByLabelText('I have read what Synthetic University can and cannot see'))
    await userEvent.click(screen.getByRole('button', { name: 'Accept and join' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/app/campus/org-1/home'))
    expect(sessionStorage.getItem('prismActiveWorkspace')).toBe('ws-cs')
    expect(await screen.findByText('Now viewing: Synthetic University')).toBeInTheDocument()
  })

  it('a mismatched account sees the server message and nothing is joined', async () => {
    signIn()
    mockFetch({
      '/api/v1/me': meBody({ workspaces: [personal] }),
      [`/api/v1/org-invites/${TOKEN}/accept`]: () => jsonResponse(403, { error: { code: 'INVITE_EMAIL_MISMATCH', message: 'This invitation was sent to a different email address. Sign in with that account to accept it.', requestId: 'r1' } }),
      [`/api/v1/org-invites/${TOKEN}`]: { data: invite },
    })
    renderApp(page, { route: `/app/campus-invite/${TOKEN}` })
    await userEvent.click(await screen.findByLabelText('I have read what Synthetic University can and cannot see'))
    await userEvent.click(screen.getByRole('button', { name: 'Accept and join' }))
    expect(await screen.findByText(/sent to a different email address/)).toBeInTheDocument()
    expect(screen.queryByTestId('where')).not.toBeInTheDocument()
  })

  it('invalid and expired invitations say so', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody(), [`/api/v1/org-invites/${TOKEN}`]: () => jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'This invitation is not valid.', requestId: 'r' } }) })
    const { unmount } = renderApp(page, { route: `/app/campus-invite/${TOKEN}` })
    expect(await screen.findByRole('heading', { name: 'This invitation is not valid' })).toBeInTheDocument()
    unmount()
    mockFetch({ '/api/v1/me': meBody(), [`/api/v1/org-invites/${TOKEN}`]: { data: { ...invite, expired: true } } })
    renderApp(page, { route: `/app/campus-invite/${TOKEN}` })
    expect(await screen.findByText('This invitation has expired')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept and join' })).not.toBeInTheDocument()
  })

  it('declining shares nothing', async () => {
    signIn()
    mockFetch({
      '/api/v1/me': meBody(),
      [`/api/v1/org-invites/${TOKEN}/decline`]: { data: { declined: true } },
      [`/api/v1/org-invites/${TOKEN}`]: { data: invite },
    })
    renderApp(page, { route: `/app/campus-invite/${TOKEN}` })
    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }))
    expect(await screen.findByText('Invitation declined')).toBeInTheDocument()
  })
})

describe('campus privacy components', () => {
  it('PrivacyScopeBadge names who can see the workspace, with text not colour alone', () => {
    render(<><PrivacyScopeBadge workspace={personal} /><PrivacyScopeBadge workspace={campusStudent} /></>)
    expect(screen.getByText('Private to you')).toBeInTheDocument()
    expect(screen.getByText('Visible to Synthetic University')).toBeInTheDocument()
  })

  it('SponsoredByCard states sponsorship, no payment, and expands the full scope', async () => {
    render(<MemoryRouter><SponsoredByCard organizationName="Synthetic University" /></MemoryRouter>)
    expect(screen.getByText('Sponsored by Synthetic University')).toBeInTheDocument()
    expect(screen.getByText(/No payment required/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'What can they see?' }))
    expect(screen.getByRole('heading', { name: 'Synthetic University cannot see, unless you share it' })).toBeInTheDocument()
  })

  it('ConsentScopePanel lists both sides', () => {
    render(<ConsentScopePanel organizationName="Synthetic University" />)
    expect(screen.getByRole('heading', { name: 'Synthetic University can see' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(CAMPUS_CAN_SEE.length + CAMPUS_CANNOT_SEE.length)
  })
})
