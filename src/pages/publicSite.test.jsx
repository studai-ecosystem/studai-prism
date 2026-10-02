// Phase J: the public site tells the evidence-first story without inventing a
// claim or a price, and sign-in keeps an institution invitation and one identity.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp, mockFetch, jsonResponse } from '../test/utils.jsx'
import LandingPage from './LandingPage.jsx'
import Auth from './Auth.jsx'
import InviteRedeem from './InviteRedeem.jsx'
import Pricing from '../components/Pricing.jsx'

const TOKEN = 'synthetic-token-0001-abcdefghij'
const invite = { organizationId: 'org-1', organizationName: 'Vels University', role: 'STUDENT', status: 'PENDING', expired: false, expiresAt: '2026-12-01T00:00:00.000Z', emailHint: 's*****@vels.test', disclosureVersion: 'campus-disclosure.v1-draft' }
const notFound = () => jsonResponse(404, { error: 'not found' })

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear() })

describe('Landing page', () => {
  it('leads with work-readiness and capability intelligence and closes the loop: measure, improve, prove', () => {
    mockFetch({ '/api/': notFound })
    renderApp(<LandingPage />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('One conversation.')
    expect(screen.getByText('Work-readiness and capability intelligence', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Measure. Improve. Prove.' })).toBeInTheDocument()
    expect(screen.getByText(/Growth is shown only after a comparable reassessment/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Take the assessment/ }).length).toBeGreaterThan(0)
  })

  it('uses no conflicting verification wording', () => {
    mockFetch({ '/api/': notFound })
    renderApp(<LandingPage />)
    const text = document.body.textContent
    const banned = new RegExp(['verified prism score', 'verified' + ' skills', 'independently verified', 'cert' + 'if'].join('|'), 'i')
    expect(text).not.toMatch(banned)
  })

  it('shows one price, the one already in the product, and states that campus pricing is agreed', () => {
    mockFetch({ '/api/': notFound })
    renderApp(<LandingPage />)
    const pricing = document.getElementById('pricing')
    const amounts = pricing.textContent.match(/\u20B9\s?[\d,]+/g)
    expect(amounts).toEqual(['\u20B9499'])
    expect(within(pricing).getByText('Custom')).toBeInTheDocument()
    expect(within(pricing).getByText('Personal')).toBeInTheDocument()
    expect(within(pricing).getByText('Campus')).toBeInTheDocument()
    expect(within(pricing).getByText('Growth tracking across comparable reassessments')).toBeInTheDocument()
    expect(within(pricing).getByText(/Campus pricing is agreed with your institution/)).toBeInTheDocument()
  })

  it('the footer carries the full wordmark and the pilot notice, with in-app links', () => {
    mockFetch({ '/api/': notFound })
    renderApp(<LandingPage />)
    const footer = document.querySelector('footer')
    expect(within(footer).getByAltText('StudAI Prism').getAttribute('src')).toContain('logo-full')
    expect(within(footer).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
    expect(within(footer).getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/#pricing')
  })
})

describe('Pricing', () => {
  it('each plan has an action that does something', async () => {
    const onGetAssessed = vi.fn()
    const onContactSales = vi.fn()
    renderApp(<Pricing onGetAssessed={onGetAssessed} onContactSales={onContactSales} />)
    await userEvent.click(screen.getByRole('button', { name: 'Take the assessment' }))
    await userEvent.click(screen.getByRole('button', { name: 'Talk to us' }))
    expect(onGetAssessed).toHaveBeenCalledTimes(1)
    expect(onContactSales).toHaveBeenCalledTimes(1)
  })
})

describe('Sign in and registration', () => {
  const routes = <Routes><Route path="/login" element={<Auth />} /><Route path="/register" element={<Auth />} /></Routes>
  const nextParam = `/app/campus-invite/${TOKEN}`

  it('a campus invitation shows who invited you and points to the existing account, never a second one', async () => {
    mockFetch({ [`/api/v1/org-invites/${TOKEN}`]: { data: invite } })
    renderApp(routes, { route: `/login?next=${encodeURIComponent(nextParam)}` })
    expect(await screen.findByText('Vels University has invited you to Prism')).toBeInTheDocument()
    expect(screen.getByText(/Use the email address this was sent to \(s\*\*\*\*\*@vels\.test\)/)).toBeInTheDocument()
    expect(screen.getByText(/if you already have one, sign in instead of creating another/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(TOKEN)
  })

  it('switching between Login and Register keeps the invitation', async () => {
    mockFetch({ [`/api/v1/org-invites/${TOKEN}`]: { data: invite } })
    renderApp(routes, { route: `/login?next=${encodeURIComponent(nextParam)}` })
    await screen.findByText('Vels University has invited you to Prism')
    const hrefs = screen.getAllByRole('link', { name: 'Register' }).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain(`/register?next=${encodeURIComponent(nextParam)}`)
  })

  it('an expired invitation says so and offers no instructions to use it', async () => {
    mockFetch({ [`/api/v1/org-invites/${TOKEN}`]: { data: { ...invite, expired: true } } })
    renderApp(routes, { route: `/login?next=${encodeURIComponent(nextParam)}` })
    expect(await screen.findByText('This invitation is no longer open. Ask your institution to send a new one.')).toBeInTheDocument()
  })

  it('without an invitation there is no institution banner and the form is unchanged', async () => {
    const spy = mockFetch({ '/api/': notFound })
    renderApp(routes, { route: '/register' })
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument()
    for (const label of ['Full Name', 'Email', 'College', 'Year of Study', 'Password']) expect(screen.getByLabelText(new RegExp(label))).toBeInTheDocument()
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(1)
    expect(document.querySelectorAll('button[type="submit"]')).toHaveLength(1)
    expect(screen.queryByText(/has invited you to Prism/)).not.toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('asks for the age confirmation before it registers anyone', async () => {
    const spy = mockFetch({ '/api/': notFound })
    renderApp(routes, { route: '/register' })
    await userEvent.type(screen.getByLabelText(/Full Name/), 'Synthetic Person')
    await userEvent.type(screen.getByLabelText(/Email/), 'p@test.local')
    await userEvent.type(screen.getByLabelText(/College/), 'Synthetic College')
    await userEvent.selectOptions(screen.getByLabelText(/Year of Study/), '4th Year')
    await userEvent.type(screen.getByLabelText(/Password/), 'a-long-passphrase-1')
    await userEvent.click(document.querySelector('button[type="submit"]'))
    expect(await screen.findByText(/Please confirm that you are 18 or older/)).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('Where sign-in lands', () => {
  const where = (
    <Routes>
      <Route path="/login" element={<Auth />} />
      <Route path="/register" element={<Auth />} />
      <Route path="/app" element={<p>app landing</p>} />
      <Route path="/payment" element={<p>checkout landing</p>} />
    </Routes>
  )
  const authReply = { token: 'test-token', user: { id: 'u-1', name: 'Synthetic Person', email: 'p@test.local', college: 'C', year: '4th Year' } }

  it('a returning user signs in to the app, not to checkout', async () => {
    mockFetch({ '/api/auth/login': authReply })
    renderApp(where, { route: '/login' })
    await userEvent.type(screen.getByLabelText(/Email/), 'p@test.local')
    await userEvent.type(screen.getByLabelText(/Password/), 'a-long-passphrase-1')
    await userEvent.click(document.querySelector('button[type="submit"]'))
    expect(await screen.findByText('app landing')).toBeInTheDocument()
    expect(screen.queryByText('checkout landing')).not.toBeInTheDocument()
  })

  it('a new account still continues to checkout', async () => {
    mockFetch({ '/api/auth/register': authReply })
    renderApp(where, { route: '/register' })
    await userEvent.type(screen.getByLabelText(/Full Name/), 'Synthetic Person')
    await userEvent.type(screen.getByLabelText(/Email/), 'p@test.local')
    await userEvent.type(screen.getByLabelText(/College/), 'Synthetic College')
    await userEvent.selectOptions(screen.getByLabelText(/Year of Study/), '4th Year')
    await userEvent.type(screen.getByLabelText(/Password/), 'a-long-passphrase-1')
    await userEvent.click(document.querySelector('input[type="checkbox"]'))
    await userEvent.click(document.querySelector('button[type="submit"]'))
    expect(await screen.findByText('checkout landing')).toBeInTheDocument()
  })

  it('an explicit next path still wins for a returning user', async () => {
    mockFetch({ '/api/auth/login': authReply })
    renderApp(<Routes><Route path="/login" element={<Auth />} /><Route path="/payment" element={<p>checkout landing</p>} /></Routes>, { route: '/login?next=%2Fpayment' })
    await userEvent.type(screen.getByLabelText(/Email/), 'p@test.local')
    await userEvent.type(screen.getByLabelText(/Password/), 'a-long-passphrase-1')
    await userEvent.click(document.querySelector('button[type="submit"]'))
    expect(await screen.findByText('checkout landing')).toBeInTheDocument()
  })

  it('someone already signed in who opens /login goes straight to the app', async () => {
    localStorage.setItem('prism_token', 'test-token')
    localStorage.setItem('prism_user', JSON.stringify(authReply.user))
    mockFetch({ '/api/': notFound })
    renderApp(where, { route: '/login' })
    expect(await screen.findByText('app landing')).toBeInTheDocument()
  })
})

describe('Assessment invitation', () => {
  it('signed out, offers to create an account or sign in and says one account is enough', async () => {
    mockFetch({ '/api/': notFound })
    renderApp(<Routes><Route path="/invite/:token" element={<InviteRedeem />} /></Routes>, { route: `/invite/${TOKEN}` })
    expect(screen.getByRole('heading', { name: 'Assessment invitation' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create an account to continue' })).toHaveAttribute('href', '/register')
    expect(screen.getByRole('link', { name: 'I already have an account' })).toHaveAttribute('href', '/login')
    expect(screen.getByText(/sign in rather than creating a second one/)).toBeInTheDocument()
    await waitFor(() => expect(sessionStorage.getItem('prismInviteToken')).toBe(TOKEN))
  })
})