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
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Understand how you work.')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Practise what matters next.')
    expect(screen.getByText('Work-readiness and capability intelligence', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Measure. Improve. Prove.' })).toBeInTheDocument()
    expect(screen.getByText(/Growth is shown only after a comparable reassessment/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Take the assessment/ }).length).toBeGreaterThan(0)
  })

  it('P8.1: the primary entry is the free short situation, the secondary explains how Prism works, and the campus inquiry stays separate', () => {
    mockFetch({ '/api/': notFound })
    renderApp(<LandingPage />)
    const hero = screen.getByRole('region', { name: /work-readiness and capability intelligence/i })
    expect(within(hero).getByRole('link', { name: /Try a short situation/ })).toHaveAttribute('href', '/try')
    expect(within(hero).getByRole('button', { name: 'See how Prism works' })).toBeInTheDocument()
    expect(within(hero).getByRole('link', { name: 'Bring Prism to your institution' }).getAttribute('href')).toMatch(/^mailto:/)
    expect(within(hero).getByRole('heading', { level: 1 })).toHaveTextContent(/Understand how you work\.\s*Practise what matters next\./)
    // The illustrative moment is labelled as such and carries no fabricated number.
    const illustration = within(hero).getByTestId('hero-illustration')
    expect(illustration).toHaveTextContent('Illustration, not a real result')
    expect(illustration.textContent).not.toMatch(/\b\d{2,3}\b/)
  })

  it('P8.1: the FAQ is a set of disclosure buttons with aria-expanded and aria-controls, keyboard operable, and answers carry no legacy score or marketplace claims', async () => {
    mockFetch({ '/api/': notFound })
    renderApp(<LandingPage />)
    const faq = document.getElementById('faq')
    const buttons = within(faq).getAllByRole('button', { expanded: false })
    expect(buttons.length).toBeGreaterThanOrEqual(6)
    const first = buttons[0]
    first.focus()
    await userEvent.keyboard('{Enter}')
    expect(first).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(first.getAttribute('aria-controls'))).toBeInTheDocument()
    for (const b of buttons.slice(1)) await userEvent.click(b)
    const text = faq.textContent
    expect(text).not.toMatch(/0.100|Prism Score|Hire Marketplace|filter candidates/i)
    expect(text).toMatch(/one hour unless you choose to save/)
    expect(text).toMatch(/cannot be bought while any of its included content is still under review/)
  })

  it('P8.6: when the server says the sprint is not purchasable, the offer table says so with the named reasons', async () => {
    const offer = { code: 'PERSONAL_DEVELOPMENT_SPRINT', version: '0.1', title: 'Personal development sprint', status: 'TEST_HYPOTHESIS_PENDING_APPROVAL', purchasable: false, priceStatus: 'PROPOSED', availability: { purchasable: false, priceStatus: 'PROPOSED', blockers: [{ code: 'PRICE_NOT_APPROVED', message: 'x' }, { code: 'CONTENT_NOT_REVIEWED', message: 'y' }] }, amount: 49900, currency: 'INR', taxTreatment: null, taxLabel: 'Tax: as configured by finance \u2014 not yet approved', testMode: true, windowDays: 30, included: { formalAssessments: 1, missionsSelectable: 4, attemptsPerMission: 2, freshChallenges: 1 }, limits: [], policy: { status: 'PROPOSED' }, policyVersion: 'offer-policy.v0.1-proposed' }
    mockFetch({ '/api/payment/config': { enabled: false, dummyMode: false, devSessionAvailable: true, offer, offers: [offer] }, '/api/': notFound })
    renderApp(<LandingPage />)
    const line = await screen.findByTestId('offer-sprint-availability')
    expect(line).toHaveTextContent('Not yet purchasable: price pending finance approval; included missions still under review')
  })

  it('P8.1: no unsupported employability, placement-guarantee or percentage pitch anywhere on the public page', () => {
    mockFetch({ '/api/': notFound })
    renderApp(<LandingPage />)
    const text = document.body.textContent
    expect(text).not.toMatch(/employab/i)
    expect(text).not.toMatch(/guaranteed? (placement|job)/i)
    expect(text).not.toMatch(/\d\s*%\s*(match|placement|employ|hired|job|of (students|graduates|candidates))/i)
    expect(text).not.toMatch(/job-ready|layoff/i)
    expect(text).not.toMatch(new RegExp(['verified' + ' skills', 'soft skills? score', 'subscription'].join('|'), 'i'))
  })

  it('P8.6: the offer table explains what you get, allowance, window, limits, provisional results and the proposed policy; the professional pack is not yet available', () => {
    mockFetch({ '/api/': notFound })
    renderApp(<LandingPage />)
    const pricing = document.getElementById('pricing')
    const table = within(pricing).getByRole('table')
    for (const header of ['What you get', 'Allowance', 'Window', 'Limits', 'Provisional results', 'Recovery / review']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument()
    }
    const sprint = within(pricing).getByTestId('offer-sprint')
    expect(sprint).toHaveTextContent('Test price, pending approval')
    expect(sprint).toHaveTextContent('30 days of activity')
    expect(sprint).toHaveTextContent('proposed, pending approval')
    expect(within(pricing).getByTestId('offer-free')).toHaveTextContent('One answer and one retry')
    expect(within(pricing).getByTestId('offer-professional')).toHaveTextContent('Not yet available')
    expect(within(pricing).getByRole('link', { name: 'Try a short situation' })).toHaveAttribute('href', '/try')
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
    mockFetch({ '/api/': notFound })
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

  it('a new account without an explicit purchase destination opens the supported account launcher', async () => {
    mockFetch({ '/api/auth/register': authReply })
    renderApp(where, { route: '/register' })
    await userEvent.type(screen.getByLabelText(/Full Name/), 'Synthetic Person')
    await userEvent.type(screen.getByLabelText(/Email/), 'p@test.local')
    await userEvent.type(screen.getByLabelText(/College/), 'Synthetic College')
    await userEvent.selectOptions(screen.getByLabelText(/Year of Study/), '4th Year')
    await userEvent.type(screen.getByLabelText(/Password/), 'a-long-passphrase-1')
    await userEvent.click(document.querySelector('input[type="checkbox"]'))
    await userEvent.click(document.querySelector('button[type="submit"]'))
    expect(await screen.findByText('app landing')).toBeInTheDocument()
    expect(screen.queryByText('checkout landing')).not.toBeInTheDocument()
  })

  it('an explicit purchase destination remains compatible with registration', async () => {
    mockFetch({ '/api/auth/register': authReply })
    renderApp(where, { route: '/register?next=%2Fpayment' })
    await userEvent.type(screen.getByLabelText(/Full Name/), 'Synthetic Person')
    await userEvent.type(screen.getByLabelText(/Email/), 'p@test.local')
    await userEvent.type(screen.getByLabelText(/College/), 'Synthetic College')
    await userEvent.selectOptions(screen.getByLabelText(/Year of Study/), '4th Year')
    await userEvent.type(screen.getByLabelText(/Password/), 'a-long-passphrase-1')
    await userEvent.click(document.querySelector('input[type="checkbox"]'))
    await userEvent.click(document.querySelector('button[type="submit"]'))
    expect(await screen.findByText('checkout landing')).toBeInTheDocument()
  })

  it('a malformed invitation destination shows a recoverable warning instead of throwing or fetching it', () => {
    const spy = mockFetch({})
    renderApp(where, { route: '/login?next=%2Fapp%2Fcampus-invite%2F%25' })
    expect(screen.getByText('This sign-in destination is unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in', exact: true })).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('an explicit next path still wins for a returning user', async () => {
    mockFetch({ '/api/auth/login': authReply })
    renderApp(<Routes><Route path="/login" element={<Auth />} /><Route path="/payment" element={<p>checkout landing</p>} /></Routes>, { route: '/login?next=%2Fpayment' })
    await userEvent.type(screen.getByLabelText(/Email/), 'p@test.local')
    await userEvent.type(screen.getByLabelText(/Password/), 'a-long-passphrase-1')
    await userEvent.click(document.querySelector('button[type="submit"]'))
    expect(await screen.findByText('checkout landing')).toBeInTheDocument()
  })

  it('an explicit invitation next wins over an older pending assessment invitation', async () => {
    sessionStorage.setItem('prismInviteToken', 'older-synthetic-invite')
    mockFetch({ '/api/auth/login': authReply, [`/api/v1/org-invites/${TOKEN}`]: { data: invite } })
    renderApp(
      <Routes><Route path="/login" element={<Auth />} /><Route path="/app/campus-invite/:token" element={<p>invitation landing</p>} /><Route path="/invite/:token" element={<p>older invitation landing</p>} /></Routes>,
      { route: `/login?next=${encodeURIComponent(`/app/campus-invite/${TOKEN}`)}` },
    )
    await userEvent.type(screen.getByLabelText(/Email/), 'p@test.local')
    await userEvent.type(screen.getByLabelText(/Password/), 'a-long-passphrase-1')
    await userEvent.click(document.querySelector('button[type="submit"]'))
    expect(await screen.findByText('invitation landing')).toBeInTheDocument()
    expect(screen.queryByText('older invitation landing')).not.toBeInTheDocument()
  })

  it('an already signed-in user keeps a deep-link fragment instead of an older invitation', async () => {
    localStorage.setItem('prism_token', 'test-token')
    localStorage.setItem('prism_user', JSON.stringify(authReply.user))
    sessionStorage.setItem('prismInviteToken', 'older-synthetic-invite')
    mockFetch({ '/api/v1/me': { data: { user: authReply.user, flags: {}, permissions: { global: [] }, workspaces: [] } } })
    renderApp(
      <Routes><Route path="/login" element={<Auth />} /><Route path="/app/settings" element={<p>profile landing</p>} /><Route path="/invite/:token" element={<p>older invitation landing</p>} /></Routes>,
      { route: '/login?next=%2Fapp%2Fsettings%23profile' },
    )
    expect(await screen.findByText('profile landing')).toBeInTheDocument()
    expect(screen.queryByText('older invitation landing')).not.toBeInTheDocument()
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