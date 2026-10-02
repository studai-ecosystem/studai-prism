// P7 — private preparation UI over mocked /api/v1 responses: the wizard
// asks one thing per step, shows the server's sanitized text for
// confirmation, the rehearsal is labelled private and untimed with learner
// and counterpart turns kept apart, the card is labelled AI assistance (and
// its absence is an explicit, honest message), and a check-in is clearly
// self-reported. The nav item is live only when the flag is on.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import PreparePage from './pages/PreparePage.jsx'
import PreparationAttemptPage from './pages/PreparationAttemptPage.jsx'
import { studentNavFor, STUDENT_NAV } from '../../components/navigation/navConfig.js'

const ATT = '55555555-5555-4555-8555-555555555555'
const flags = { PRISM_APP_SHELL_V3: true, PRISM_PREPARATION_V1: true }

function routeFetch(routes) {
  const calls = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
    const u = String(url)
    const method = (init.method || 'GET').toUpperCase()
    calls.push({ url: u, method, headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : undefined })
    for (const [k, handler] of Object.entries(routes)) {
      const [m, prefix] = k.includes(' ') ? k.split(' ') : ['GET', k]
      if (m === method && u.startsWith(prefix)) return typeof handler === 'function' ? handler(u, init) : jsonResponse(200, handler)
    }
    throw new Error(`unexpected fetch ${method} ${u}`)
  })
  return calls
}

const intent = { situationType: 'NEGOTIATE_DEADLINE', audience: 'The project lead [email removed]', goal: 'Agree a later date without dropping the review.', constraints: 'Vendor starts Monday.' }
const attempt = (over = {}) => ({
  id: ATT, mode: 'PREPARATION', scope: 'PERSONAL', state: 'REHEARSING', sanitized: true, intent, situationLabel: 'Negotiate a deadline',
  turns: [{ id: 't0', actor: 'SYSTEM', text: 'Private preparation started.', createdAt: '2026-10-02T10:00:00.000Z' }],
  card: null, cardError: null, createdAt: '2026-10-02T10:00:00.000Z', completedAt: null, ...over,
})
const card = {
  situation: 'You are preparing to negotiate a deadline with your project lead.',
  plan: ['State the constraint.', 'Offer one alternative.', 'Agree ownership and the next check-in.'],
  keyMessage: 'I want a date we can both hold, so here is my constraint.',
  risks: ['They may ask for a detail you have not prepared.'],
  checkpoint: 'Ownership and the next check-in are agreed before the end.',
  generatedBy: 'AI_ASSISTANCE', createdAt: '2026-10-02T10:20:00.000Z',
}

function render(path, element, routes, route = path) {
  signIn()
  const calls = routeFetch({ ...routes, '/api/v1/me': meBody({ flags }) })
  const out = renderApp(
    <Routes>
      <Route path="/app/prepare" element={<PreparePage />} />
      <Route path="/app/prepare/:attemptId" element={<PreparationAttemptPage />} />
      <Route path={path} element={element} />
    </Routes>,
    { route },
  )
  return { ...out, calls }
}

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear() })

describe('Prepare navigation', () => {
  it('stays an honest disabled item unless PRISM_PREPARATION_V1 is on', () => {
    const off = studentNavFor({}).find((i) => i.id === 'prepare')
    expect(off.to).toBeNull()
    expect(off.unavailable).toMatch(/Not yet available/)
    const on = studentNavFor({ PRISM_PREPARATION_V1: true }).find((i) => i.id === 'prepare')
    expect(on.to).toBe('/app/prepare')
    expect(on.unavailable).toBeUndefined()
    expect(STUDENT_NAV.find((i) => i.id === 'prepare').to).toBeNull()
  })
})

describe('Prepare page and wizard', () => {
  it('lists preparations privately and walks situation → audience → goal → constraints → sanitized review → confirm', async () => {
    const user = userEvent.setup()
    const { calls } = render('/app/prepare', <PreparePage />, {
      'POST /api/v1/preparation': (u) => {
        if (u.endsWith('/confirm')) return jsonResponse(200, { data: attempt() })
        return jsonResponse(201, { data: { attemptId: ATT, sanitizedIntent: intent, sanitizedChanged: true, needsConfirmation: true, state: 'DRAFT' } })
      },
      '/api/v1/preparation': (u) => {
        if (u.endsWith(`/preparation/${ATT}`)) return jsonResponse(200, { data: attempt() })
        return jsonResponse(200, { data: { items: [{ id: ATT, mode: 'PREPARATION', scope: 'PERSONAL', state: 'COMPLETED', situationType: 'GIVE_UPDATE', situationLabel: 'Give an update', goal: 'Keep it short.', createdAt: '2026-09-30T10:00:00.000Z', completedAt: '2026-09-30T10:30:00.000Z' }] } })
      },
    })
    expect(await screen.findByRole('heading', { name: 'Prepare' })).toBeInTheDocument()
    expect(await screen.findByText('Personal preparation, private to you', {}, { timeout: 4000 })).toBeInTheDocument()
    const item = screen.getByTestId('preparation-item')
    expect(item).toHaveTextContent('Give an update')
    expect(item).toHaveTextContent('Private preparation')

    await user.click(screen.getByRole('button', { name: 'Prepare for a situation' }))
    const wizard = screen.getByTestId('preparation-wizard')
    expect(wizard).toHaveAttribute('data-step', 'situation')
    expect(wizard).toHaveTextContent(/Leave out names/)
    // Only the six bounded situations are offered.
    expect(within(wizard).getAllByRole('radio')).toHaveLength(6)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(within(wizard).getByText('Choose a situation.')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Negotiate a deadline' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(wizard).toHaveAttribute('data-step', 'audience')
    await user.type(screen.getByLabelText('Counterpart'), 'The project lead, lead@example.com')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(wizard).toHaveAttribute('data-step', 'goal')
    await user.type(screen.getByLabelText('Your goal'), 'Agree a later date without dropping the review.')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(wizard).toHaveAttribute('data-step', 'constraints')
    await user.type(screen.getByLabelText('Constraints'), 'Vendor starts Monday.')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    // Review shows the server's sanitized text, not what was typed.
    const review = await screen.findByTestId('preparation-review')
    expect(review).toHaveTextContent(/We removed emails, phone numbers or links/)
    expect(screen.getByLabelText('Counterpart')).toHaveValue('The project lead [email removed]')
    expect(screen.getByLabelText('Counterpart')).not.toHaveValue(expect.stringContaining('@'))
    expect(review).toHaveTextContent('Mode: private preparation')
    expect(review).toHaveTextContent('Scope: personal')
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v1/preparation'))
    expect(post.body).toEqual({ situationType: 'NEGOTIATE_DEADLINE', audience: 'The project lead, lead@example.com', goal: 'Agree a later date without dropping the review.', constraints: 'Vendor starts Monday.' })
    expect(post.body.mode).toBeUndefined()

    await user.click(screen.getByRole('button', { name: 'Confirm and start rehearsal' }))
    const confirm = await waitFor(() => calls.find((c) => c.url.endsWith('/confirm')))
    expect(confirm.body).toEqual({})
    expect(await screen.findByTestId('rehearsal')).toBeInTheDocument()
  })

  it('tells a campus-student workspace that preparation is personal and makes no preparation call', async () => {
    signIn()
    const campusWs = { id: '66666666-6666-4666-8666-666666666666', type: 'CAMPUS_STUDENT', name: 'Synthetic University', organizationId: '11111111-1111-4111-8111-111111111111', organizationName: 'Synthetic University', visibilityPolicy: 'OWNER_AND_SPONSOR' }
    sessionStorage.setItem('prismActiveWorkspace', campusWs.id)
    const calls = routeFetch({ '/api/v1/me': meBody({ flags: { ...flags, PRISM_CAMPUS_ENABLED: true }, workspaces: [{ id: 'personal', type: 'PERSONAL', name: 'Personal', organizationId: null, organizationName: null, visibilityPolicy: 'OWNER_ONLY' }, campusWs] }) })
    renderApp(<Routes><Route path="/app/prepare" element={<PreparePage />} /></Routes>, { route: '/app/prepare' })
    expect(await screen.findByText('Preparation is personal')).toBeInTheDocument()
    expect(calls.some((c) => c.url.includes('/api/v1/preparation'))).toBe(false)
  })
})

describe('Rehearsal and action card', () => {
  it('labels the rehearsal private and untimed, keeps learner and counterpart turns apart, and shows a reply failure honestly', async () => {
    const user = userEvent.setup()
    let state = attempt()
    const { calls } = render('/app/prepare/:attemptId', <PreparationAttemptPage />, {
      [`POST /api/v1/preparation/${ATT}/turns`]: (u, init) => {
        const { text } = JSON.parse(init.body)
        state = { ...state, turns: [...state.turns, { id: `c${state.turns.length}`, actor: 'CANDIDATE', text, createdAt: null }, { id: `p${state.turns.length}`, actor: 'AI_PARTICIPANT', text: 'Who owns the next step?', createdAt: null }], replyError: null }
        return jsonResponse(201, { data: state })
      },
      [`/api/v1/preparation/${ATT}`]: () => jsonResponse(200, { data: state }),
    }, `/app/prepare/${ATT}`)
    const view = await screen.findByTestId('rehearsal')
    expect(view).toHaveTextContent('Private preparation — not a formal assessment')
    expect(view).toHaveTextContent('Untimed')
    expect(view).toHaveTextContent('Agree a later date without dropping the review.')
    expect(screen.queryByText(/\d+:\d\d/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Your answer'), 'I need to move the date because the review cannot be skipped.')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    const log = await screen.findByRole('log')
    await waitFor(() => expect(log.querySelector('[data-role="participant"]')).toBeInTheDocument())
    const roles = [...log.querySelectorAll('[data-role]')].map((n) => n.getAttribute('data-role'))
    expect(roles).toEqual(['candidate', 'participant'])
    expect(within(log).getByText('Who owns the next step?')).toBeInTheDocument()
    expect(within(log).getByText(/Counterpart/)).toBeInTheDocument()
    const sent = calls.find((c) => c.url.endsWith('/turns'))
    expect(sent.body).toEqual({ text: 'I need to move the date because the review cannot be skipped.' })
    expect(document.body.textContent).not.toMatch(/score|level|\d+\s*%/i)
  })

  it('finishing shows the card as AI assistance with a self-reported check-in', async () => {
    const user = userEvent.setup()
    let state = attempt({ turns: [...attempt().turns, { id: 'c1', actor: 'CANDIDATE', text: 'I need to move the date.', createdAt: null }] })
    const { calls } = render('/app/prepare/:attemptId', <PreparationAttemptPage />, {
      [`POST /api/v1/preparation/${ATT}/finish`]: () => { state = { ...state, state: 'COMPLETED', card, completedAt: '2026-10-02T10:20:00.000Z' }; return jsonResponse(200, { data: state }) },
      [`/api/v1/preparation/${ATT}`]: () => jsonResponse(200, { data: state }),
      'POST /api/v1/checkins': (u, init) => jsonResponse(201, { data: { id: 'ck1', mode: 'SELF_REPORT', scope: 'PERSONAL', ...JSON.parse(init.body), createdAt: null } }),
    }, `/app/prepare/${ATT}`)
    await screen.findByTestId('rehearsal')
    await user.click(screen.getByRole('button', { name: 'Finish and get my card' }))
    const view = await screen.findByTestId('action-card')
    expect(view).toHaveTextContent('AI assistance')
    expect(view).toHaveTextContent('State the constraint.')
    expect(view).toHaveTextContent(card.keyMessage)
    expect(view).toHaveTextContent(card.checkpoint)
    expect(view).toHaveTextContent(/saving a plan is not a measure/)
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/app/prepare')

    await user.click(screen.getByRole('button', { name: 'Save a check-in later' }))
    const form = screen.getByTestId('checkin-form')
    expect(form).toHaveTextContent('Self-reported')
    expect(form).toHaveTextContent(/cannot change a formal result/)
    await user.type(screen.getByLabelText('What did you try?'), 'Named the constraint first.')
    await user.type(screen.getByLabelText('What happened?'), 'We agreed a date.')
    await user.click(screen.getByRole('button', { name: 'Save check-in' }))
    expect(await screen.findByTestId('checkin-saved')).toHaveTextContent('saved as self-reported')
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v1/checkins'))
    expect(post.body).toEqual({ sourceType: 'PREPARATION', sourceId: ATT, whatTried: 'Named the constraint first.', outcome: 'We agreed a date.' })
    expect(post.body.mode).toBeUndefined()
  })

  it('a missing card is an explicit message, never a generic stand-in', async () => {
    render('/app/prepare/:attemptId', <PreparationAttemptPage />, {
      [`/api/v1/preparation/${ATT}`]: { data: attempt({ state: 'COMPLETED', card: null, cardError: 'PROVIDER_ERROR', completedAt: '2026-10-02T10:20:00.000Z' }) },
    }, `/app/prepare/${ATT}`)
    const view = await screen.findByTestId('action-card')
    expect(view).toHaveTextContent('No card was written')
    expect(view).toHaveTextContent(/technical problem. Your rehearsal is kept/)
    expect(view).not.toHaveTextContent('Plan')
  })

  it('a DRAFT shows the sanitized situation and asks for confirmation; a stopped one says so', async () => {
    render('/app/prepare/:attemptId', <PreparationAttemptPage />, {
      [`/api/v1/preparation/${ATT}`]: { data: attempt({ state: 'DRAFT', turns: [] }) },
    }, `/app/prepare/${ATT}`)
    expect(await screen.findByText('Confirm the situation first')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm and start rehearsal' })).toBeInTheDocument()
    expect(screen.getByText('The project lead [email removed]')).toBeInTheDocument()
  })
})
