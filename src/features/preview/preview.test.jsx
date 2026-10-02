// P8.3 / P8.6 — the free first experience and the checkout read only governed
// API data: the scene and observation come from the server, the token never
// appears in the page or a URL, saving is explicit, and the checkout shows the
// server amount, tax treatment and policy (or honest pending states).
import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp, mockFetch, jsonResponse, signIn } from '../../test/utils.jsx'
import TryPage from './pages/TryPage.jsx'
import Payment from '../../pages/Payment.jsx'

const TOKEN = '11111111-2222-4333-8444-555555555555.1790000000000.synthetic-signature-abc'
const scene = {
  data: {
    id: 'preview:draft-core-teamready-a-handover', mode: 'PRACTICE', contentStatus: 'DRAFT', title: 'Get the team ready: the final handover',
    briefing: {
      facts: ['Two colleagues have been preparing a short internal workshop for next week.', 'Two tasks have no owner.'],
      participants: [{ name: 'Dev', role: 'Co-organiser (leaving tomorrow)' }, { name: 'Nia', role: 'Co-organiser (staying)' }],
      board: { title: 'Workshop plan board', rows: [{ task: 'Confirm the room booking', owner: 'Nia', due: 'Monday' }, { task: 'Send the invitation list', owner: null, due: 'Tuesday' }] },
    },
    prompt: 'Say what you would tell Dev and Nia now.',
    limits: { attempts: 2, maxAnswerChars: 1500 },
    notice: 'This is a short practice scene, not a formal assessment. Your answer is kept for one hour unless you save it to an account.',
  },
}
const observed = { kind: 'OBSERVED', mode: 'PRACTICE', methodVersion: 'preview-deterministic-0.1', criterionId: 'STATES_HANDOVER', label: 'You said who does what by when', why: 'A handover the colleague who stays can act on names a person, a task and a time.', quote: 'Nia, can you take the invitation list by Tuesday?', nextBehaviour: 'Next time, also check what the person staying can realistically take on.', disclaimer: 'A practice observation from a deterministic check of your own words. It is not a capability level and does not appear in any formal report.' }
const notFound = { kind: 'NOT_FOUND', mode: 'PRACTICE', methodVersion: 'preview-deterministic-0.1', criterionId: null, label: 'We could not find a clear handover yet', why: 'A handover names a person, a task and a time.', quote: null, message: 'We could not find a sentence that names who does which task by when in your reply \u2014 try again.', nextBehaviour: 'Name one person, one task and one time in a single sentence.', disclaimer: 'A practice observation from a deterministic check of your own words. It is not a capability level and does not appear in any formal report.' }
const attempt = (observation, used) => ({ data: { previewToken: TOKEN, expiresAt: '2026-10-01T11:00:00.000Z', attemptsUsed: used, attemptsRemaining: 2 - used, observation, claimed: false } })

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear() })

const routes = (
  <Routes>
    <Route path="/try" element={<TryPage />} />
    <Route path="/register" element={<p>register landing</p>} />
    <Route path="/app/home" element={<p>home landing</p>} />
  </Routes>
)

describe('Try a short situation (P8.3)', () => {
  it('shows the scene without any rubric, takes one answer, shows the source-backed observation, allows one retry, then offers an explicit account link', async () => {
    let posts = 0
    const spy = mockFetch({
      '/api/v1/preview/scene': scene,
      '/api/v1/preview/attempts/retry': () => jsonResponse(200, attempt(observed, 2)),
      '/api/v1/preview/attempts': () => { posts += 1; return jsonResponse(201, attempt(notFound, 1)) },
      '/api/': () => jsonResponse(404, { error: 'not found' }),
    })
    renderApp(routes, { route: '/try' })
    expect(await screen.findByRole('heading', { level: 2, name: 'Get the team ready: the final handover' })).toBeInTheDocument()
    expect(screen.getByText(/Practice · draft content/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/rubric|OPP-|BEH-/)
    expect(screen.getByText('No owner')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Your answer'), 'Thanks everyone, good luck.')
    await userEvent.click(screen.getByRole('button', { name: /Send my answer/ }))
    const first = await screen.findByTestId('preview-observation')
    expect(within(first).getByText('Not found yet')).toBeInTheDocument()
    expect(within(first).getByTestId('preview-not-found')).toHaveTextContent('We could not find a sentence that names who does which task by when in your reply')
    expect(posts).toBe(1)
    // The token is a capability held in memory/session storage, never in the page or URL.
    expect(document.body.textContent).not.toContain(TOKEN)
    expect(window.location.href).not.toContain(TOKEN)

    await userEvent.type(screen.getByLabelText('Your revised answer'), 'Nia, can you take the invitation list by Tuesday?')
    await userEvent.click(screen.getByRole('button', { name: /Retry/ }))
    const second = await screen.findByText('You said who does what by when')
    expect(second).toBeInTheDocument()
    expect(screen.getByText(/Nia, can you take the invitation list by Tuesday\?/)).toBeInTheDocument()
    expect(screen.getByText(/not a capability level/)).toBeInTheDocument()
    const next = screen.getByTestId('preview-next')
    expect(within(next).getByRole('link', { name: 'Create an account to keep this' })).toHaveAttribute('href', '/register?next=%2Ftry')
    expect(within(next).getByRole('link', { name: 'See the full package' })).toHaveAttribute('href', '/#pricing')
    expect(within(next).getByText(/Saving is an explicit step/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/answer/i)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\d\s*%/)
    // The retry call carried the token in the body, not the URL.
    const retry = spy.mock.calls.find(([u]) => String(u).includes('/preview/attempts/retry'))
    expect(JSON.parse(retry[1].body).previewToken).toBe(TOKEN)
    expect(String(retry[0])).not.toContain(TOKEN)
  })

  it('a signed-in learner saves the preview explicitly; the claim is a POST with the token and leads to home', async () => {
    signIn()
    sessionStorage.setItem('prism_preview_token', TOKEN)
    const spy = mockFetch({
      '/api/v1/preview/scene': scene,
      '/api/v1/preview/claim': () => jsonResponse(200, { data: { attemptId: 'att-1', claimed: true, alreadyClaimed: false, observation: observed } }),
      '/api/v1/me': { data: { user: { id: 'u-test', email: 'synthetic@test.local', name: 'Synthetic Student' }, flags: {}, permissions: { global: [] }, workspaces: [] } },
      '/api/': () => jsonResponse(404, { error: 'not found' }),
    })
    renderApp(routes, { route: '/try' })
    const callout = await screen.findByText('You have an unsaved preview from earlier')
    expect(callout).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save it to my account' }))
    expect(await screen.findByText('Saved to your account')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Go to your home/ })).toHaveAttribute('href', '/app/home')
    const claim = spy.mock.calls.find(([u]) => String(u).includes('/preview/claim'))
    expect(claim[1].method).toBe('POST')
    expect(JSON.parse(claim[1].body)).toEqual({ previewToken: TOKEN })
    expect(sessionStorage.getItem('prism_preview_token')).toBeNull()
  })

  it('a failed scene load is an honest error with retry, not an empty page', async () => {
    mockFetch({ '/api/v1/preview/scene': () => jsonResponse(503, { error: { code: 'CAMPUS_STORE_UNAVAILABLE', message: 'The preview is temporarily unavailable.', requestId: 'r1' } }), '/api/': () => jsonResponse(404, {}) })
    renderApp(routes, { route: '/try' })
    expect(await screen.findByText('The scene could not be loaded', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('Checkout (P8.6)', () => {
  const offer = (over = {}) => ({
    enabled: false, keyId: null, amount: 49900, currency: 'INR', devSessionAvailable: true, dummyMode: false, skipVerification: false, proctoring: { phoneCam: false, gaze: false },
    offer: {
      code: 'PERSONAL_DEVELOPMENT_SPRINT', version: '0.1', title: 'Personal development sprint', status: 'TEST_HYPOTHESIS_PENDING_APPROVAL', purchasable: true, amount: 49900, currency: 'INR', taxTreatment: null, windowDays: 30,
      included: { formalAssessments: 1, missionsSelectable: 4, attemptsPerMission: 2, freshChallenges: 1, practiceScenes: 0 },
      limits: ['Four missions chosen from the reviewed library; the whole library is not included.'],
      policy: { recovery: 'technical failure releases the attempt', review: 'request a human review of a published report', refund: 'pending approval', status: 'PROPOSED' },
      policyVersion: 'offer-policy.v0.1-proposed',
      ...over,
    },
  })

  it('shows the amount, allowance, window, limits and policy from the server; a null tax treatment reads "to be confirmed"', async () => {
    signIn()
    mockFetch({ '/api/payment/config': offer(), '/api/': () => jsonResponse(404, {}) })
    renderApp(<Payment />, { route: '/payment' })
    expect(await screen.findByTestId('checkout-amount')).toHaveTextContent('\u20B9499')
    expect(screen.getByTestId('checkout-tax')).toHaveTextContent('Tax treatment to be confirmed')
    const terms = screen.getByTestId('checkout-terms')
    expect(terms).toHaveTextContent('Formal assessment ×1 · missions ×4 (2 attempts each) · fresh challenge ×1')
    expect(terms).toHaveTextContent('30 days; your report stays readable afterwards')
    expect(terms).toHaveTextContent('Policy proposed, pending approval')
    expect(terms).toHaveTextContent('whole library is not included')
    expect(screen.getByRole('button', { name: /Pay \u20B9499 & Continue/ })).toBeEnabled()
    // Every rupee amount on the page is the server's one amount (text nodes joined so adjacent numbers do not merge).
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const parts = []
    while (walker.nextNode()) parts.push(walker.currentNode.textContent)
    const amounts = parts.join(' ').match(/\u20B9\s?[\d,]+/g)
    expect(new Set(amounts)).toEqual(new Set(['\u20B9499']))
  })

  it('renders the finance-configured tax treatment verbatim and never a client-side rate', async () => {
    signIn()
    mockFetch({ '/api/payment/config': offer({ taxTreatment: 'Inclusive of applicable GST' }), '/api/': () => jsonResponse(404, {}) })
    renderApp(<Payment />, { route: '/payment' })
    expect(await screen.findByTestId('checkout-tax')).toHaveTextContent('Inclusive of applicable GST')
    expect(document.body.textContent).not.toMatch(/\d\s*%/)
  })

  it('disables purchase when the product is not purchasable and when the config cannot be loaded', async () => {
    signIn()
    mockFetch({ '/api/payment/config': offer({ purchasable: false, amount: null, status: 'UNAVAILABLE_PENDING_OWNER_QUOTA' }), '/api/': () => jsonResponse(404, {}) })
    const first = renderApp(<Payment />, { route: '/payment' })
    expect(await screen.findByTestId('checkout-unavailable')).toHaveTextContent('not available for purchase yet')
    expect(screen.getByRole('button', { name: /Checkout unavailable/ })).toBeDisabled()
    expect(screen.getByTestId('checkout-amount')).toHaveTextContent('Not available')
    first.unmount()
    vi.restoreAllMocks()
    mockFetch({ '/api/payment/config': () => jsonResponse(500, {}), '/api/': () => jsonResponse(404, {}) })
    renderApp(<Payment />, { route: '/payment' })
    await waitFor(() => expect(screen.getByText(/checkout is paused/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Checkout unavailable/ })).toBeDisabled()
  })
})
