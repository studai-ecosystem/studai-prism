// P7 — private preparation UI over mocked /api/v1 responses: the wizard
// asks one thing per step across the six bounded situations, shows the
// server's sanitized summary and assumptions for confirmation (editable),
// the rehearsal is labelled private and untimed with learner, counterpart
// and assistant text kept apart (T44), the card is labelled AI assistance,
// editable and discardable (and its absence is an explicit message), the
// application suggestion can be edited or dismissed, and a check-in is
// clearly SELF_REPORT (T45). Rename and delete are available; a refusal is
// bounded. The nav item is live only when the flag is on.
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

const intent = {
  situationType: 'NEGOTIATE_DEADLINE', audience: 'The project lead [email removed]', goal: 'Agree a later date without dropping the review.', constraints: 'Vendor starts Monday.',
  practiceTarget: 'CLARIFY_CONSTRAINT', assumptions: ['The counterpart owns the deadline.', 'The review step cannot be skipped.'],
}
const summary = 'You will negotiate a deadline with the project lead. You want to agree a later date without dropping the review. Constraint: vendor starts Monday.'
const limits = { preparations: 'UNLIMITED', turns: { used: 0, max: 40 }, assistance: { used: 0, max: 5 } }
const sys = { id: 't0', actor: 'SYSTEM', authorship: 'SYSTEM', text: 'Private preparation started.', createdAt: '2026-10-02T10:00:00.000Z' }
const attempt = (over = {}) => ({
  id: ATT, mode: 'PREPARATION', scope: 'PERSONAL', state: 'REHEARSING', title: null, sanitized: true, intent, summary, limitation: null,
  situationLabel: 'Negotiate a deadline', practiceTargetLabel: 'Name a constraint clearly',
  turns: [sys], limits, card: null, cardError: null, observations: [], application: null,
  createdAt: '2026-10-02T10:00:00.000Z', completedAt: null, ...over,
})
const card = {
  situation: 'You are preparing to negotiate a deadline with your project lead.',
  plan: ['State the constraint.', 'Offer one alternative.', 'Agree ownership and the next check-in.'],
  opening: 'I want a date we can both hold, so here is my constraint.',
  questions: ['What is driving the current date?'],
  tradeoffs: ['A later date keeps the review but delays the vendor start.'],
  boundary: 'If the date cannot move, I will ask which step we drop and who signs that off.',
  selfCheck: 'Ownership and the next check-in are agreed before the end.',
  generatedBy: 'AI_ASSISTANCE', editedByLearner: false, createdAt: '2026-10-02T10:20:00.000Z',
}
const observation = { behaviour: 'CLARIFY_CONSTRAINT', label: 'Named a constraint clearly', quote: 'I need to move the date because the review cannot be skipped.', authorship: 'LEARNER' }
const application = { text: 'Confirm who owns the next step before the conversation ends.', source: 'PRACTICE_TARGET', editedByLearner: false, dismissed: false, reminderOptIn: false, checkedIn: false }

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

const noFormalVocabulary = () => expect(document.body.textContent).not.toMatch(/\bscore|\blevel\b|\d+\s*%|percentile|rank|\bverified\b/i)

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
  it('lists preparations privately and walks situation → counterpart → outcome → constraints → target → sanitized summary → confirm with edited assumptions', async () => {
    const user = userEvent.setup()
    const { calls } = render('/app/prepare', <PreparePage />, {
      'POST /api/v1/preparation': (u) => {
        if (u.endsWith('/confirm')) return jsonResponse(200, { data: attempt() })
        return jsonResponse(201, { data: { attemptId: ATT, sanitizedIntent: intent, summary, limitation: null, sanitizedChanged: true, needsConfirmation: true, state: 'DRAFT' } })
      },
      '/api/v1/preparation': (u) => {
        if (u.endsWith(`/preparation/${ATT}`)) return jsonResponse(200, { data: attempt() })
        return jsonResponse(200, { data: { items: [{ id: ATT, mode: 'PREPARATION', scope: 'PERSONAL', state: 'COMPLETED', title: 'Thursday with the lead', situationType: 'GIVE_UPDATE', situationLabel: 'Give an update', practiceTargetLabel: 'Confirm ownership and the next check-in', goal: 'Keep it short.', reminderDue: true, createdAt: '2026-09-30T10:00:00.000Z', completedAt: '2026-09-30T10:30:00.000Z' }] } })
      },
    })
    expect(await screen.findByRole('heading', { name: 'Prepare' })).toBeInTheDocument()
    expect(await screen.findByText('Personal preparation · Private to you', {}, { timeout: 4000 })).toBeInTheDocument()
    const item = screen.getByTestId('preparation-item')
    expect(item).toHaveTextContent('Thursday with the lead')
    expect(item).toHaveTextContent('Give an update')
    expect(item).toHaveTextContent('Private preparation')
    expect(within(item).getByTestId('reminder-due')).toHaveTextContent(/record how the real conversation went/)
    expect(within(item).getByRole('link', { name: /Open/ })).toHaveAttribute('href', `/app/prepare/${ATT}`)

    await user.click(screen.getByRole('button', { name: 'Prepare for a situation' }))
    const wizard = screen.getByTestId('preparation-wizard')
    expect(wizard).toHaveAttribute('data-step', 'situation')
    expect(wizard).toHaveTextContent(/Leave out names/)
    expect(wizard).toHaveTextContent('Step 1 of 6')
    // Only the six bounded situations are offered.
    const radios = within(wizard).getAllByRole('radio')
    expect(radios).toHaveLength(6)
    for (const label of ['Explain a recommendation', 'Clarify a brief', 'Disagree with a colleague', 'Negotiate a deadline', 'Give an update', 'Make a handover']) {
      expect(within(wizard).getByRole('radio', { name: label })).toBeInTheDocument()
    }
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(within(wizard).getByText('Choose a situation.')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Negotiate a deadline' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(wizard).toHaveAttribute('data-step', 'audience')
    await user.type(screen.getByLabelText('Counterpart (role, not name)'), 'The project lead, lead@example.com')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(wizard).toHaveAttribute('data-step', 'goal')
    await user.type(screen.getByLabelText('Desired outcome'), 'Agree a later date without dropping the review.')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(wizard).toHaveAttribute('data-step', 'constraints')
    await user.type(screen.getByLabelText('Constraints'), 'Vendor starts Monday.')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(wizard).toHaveAttribute('data-step', 'target')
    expect(within(wizard).getAllByRole('radio')).toHaveLength(5)
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(within(wizard).getByText('Choose what to practise.')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Name a constraint clearly' }))
    await user.click(screen.getByRole('button', { name: 'Review' }))

    // Review shows the server's sanitized text and summary, not what was typed.
    const review = await screen.findByTestId('preparation-review')
    expect(review).toHaveTextContent(/We removed emails, phone numbers or links/)
    expect(within(review).getByTestId('preparation-summary')).toHaveTextContent(summary)
    expect(screen.getByLabelText('Counterpart')).toHaveValue('The project lead [email removed]')
    expect(screen.getByLabelText('Counterpart')).not.toHaveValue(expect.stringContaining('@'))
    expect(review).toHaveTextContent('Mode: private preparation')
    expect(review).toHaveTextContent('Scope: personal')
    const assumptions = within(review).getByTestId('preparation-assumptions')
    expect(assumptions).toHaveTextContent(/nothing here is a judgement about you/)
    expect(within(assumptions).getByLabelText('Assumption 1')).toHaveValue('The counterpart owns the deadline.')
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v1/preparation'))
    expect(post.body).toEqual({ situationType: 'NEGOTIATE_DEADLINE', audience: 'The project lead, lead@example.com', goal: 'Agree a later date without dropping the review.', constraints: 'Vendor starts Monday.', practiceTarget: 'CLARIFY_CONSTRAINT' })
    expect(post.body.mode).toBeUndefined()
    expect(post.body.scope).toBeUndefined()

    // Removing a wrong assumption is an edit the server receives explicitly.
    await user.click(within(assumptions).getByRole('button', { name: 'Remove assumption 2' }))
    expect(within(assumptions).queryByLabelText('Assumption 2')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm and start rehearsal' }))
    const confirm = await waitFor(() => calls.find((c) => c.url.endsWith('/confirm')))
    expect(confirm.body).toEqual({ edits: { audience: intent.audience, goal: intent.goal, constraints: intent.constraints, practiceTarget: 'CLARIFY_CONSTRAINT', assumptions: ['The counterpart owns the deadline.'] } })
    expect(confirm.body.edits.mode).toBeUndefined()
    expect(await screen.findByTestId('rehearsal')).toBeInTheDocument()
    noFormalVocabulary()
  })

  it('confirming without edits sends an empty body; a refused situation is a bounded message and the text stays', async () => {
    const user = userEvent.setup()
    let refuse = true
    const { calls } = render('/app/prepare', <PreparePage />, {
      'POST /api/v1/preparation': (u) => {
        if (u.endsWith('/confirm')) return jsonResponse(200, { data: attempt() })
        if (refuse) return jsonResponse(422, { error: { code: 'PREPARATION_OUT_OF_SCOPE', message: 'Prism does not rehearse ways to humiliate, intimidate or harass another person. It can help you prepare a firm, respectful conversation about the same problem.' } })
        return jsonResponse(201, { data: { attemptId: ATT, sanitizedIntent: intent, summary, limitation: { category: 'LEGAL', message: 'This touches a legal matter. The rehearsal practises the conversation only; it is not legal advice.' }, sanitizedChanged: false, needsConfirmation: true, state: 'DRAFT' } })
      },
      '/api/v1/preparation': (u) => (u.endsWith(`/preparation/${ATT}`) ? jsonResponse(200, { data: attempt() }) : jsonResponse(200, { data: { items: [] } })),
    })
    expect(await screen.findByText('No preparations yet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Prepare for a situation' }))
    await user.click(screen.getByRole('radio', { name: 'Disagree with a colleague' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.type(screen.getByLabelText('Counterpart (role, not name)'), 'A colleague on the same team')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.type(screen.getByLabelText('Desired outcome'), 'Push back firmly on the estimate.')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('radio', { name: 'Hold a realistic boundary' }))
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const refusal = await screen.findByTestId('preparation-refusal')
    expect(refusal).toHaveTextContent(/does not rehearse ways to humiliate/)
    expect(refusal).toHaveTextContent(/firm, respectful conversation/)
    // The wizard stays on the target step; nothing is lost.
    expect(screen.getByTestId('preparation-wizard')).toHaveAttribute('data-step', 'target')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByLabelText('Desired outcome')).toHaveValue('Push back firmly on the estimate.')

    refuse = false
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = await screen.findByTestId('preparation-review')
    expect(review).toHaveTextContent('This is the text the rehearsal will use.')
    expect(within(review).getByTestId('preparation-limitation')).toHaveTextContent(/not legal advice/)
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
    expect(screen.getByText(/Synthetic University cannot see it/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Switch to my personal workspace' })).toBeInTheDocument()
    expect(calls.some((c) => c.url.includes('/api/v1/preparation'))).toBe(false)
  })
})

describe('Rehearsal', () => {
  it('is private and untimed, keeps learner and counterpart turns apart, shows the explicit allowance and a reply failure honestly', async () => {
    const user = userEvent.setup()
    let state = attempt()
    const { calls } = render('/app/prepare/:attemptId', <PreparationAttemptPage />, {
      [`POST /api/v1/preparation/${ATT}/turns`]: (u, init) => {
        const { text } = JSON.parse(init.body)
        const n = state.turns.length
        const fail = text.includes('fail')
        state = {
          ...state,
          turns: [...state.turns, { id: `c${n}`, actor: 'CANDIDATE', authorship: 'LEARNER', text, createdAt: null }, ...(fail ? [] : [{ id: `p${n}`, actor: 'AI_PARTICIPANT', authorship: 'ASSISTANT', text: 'Who owns the next step?', createdAt: null }])],
          limits: { ...state.limits, turns: { ...state.limits.turns, used: state.limits.turns.used + 1 } },
          replyError: fail ? 'PROVIDER_ERROR' : null,
        }
        return jsonResponse(201, { data: state })
      },
      [`/api/v1/preparation/${ATT}`]: () => jsonResponse(200, { data: state }),
    }, `/app/prepare/${ATT}`)
    const view = await screen.findByTestId('rehearsal')
    expect(view).toHaveTextContent('Personal preparation · Private to you')
    expect(view).toHaveTextContent('Not a formal assessment')
    expect(view).toHaveTextContent('Untimed')
    expect(within(view).getByTestId('rehearsal-summary')).toHaveTextContent(summary)
    expect(view).toHaveTextContent('Agree a later date without dropping the review.')
    expect(view).toHaveTextContent('Name a constraint clearly')
    expect(within(view).getByTestId('rehearsal-assumptions')).toHaveTextContent('The counterpart owns the deadline.')
    expect(screen.queryByText(/\d+:\d\d/)).not.toBeInTheDocument()
    const allowance = within(view).getByTestId('rehearsal-limits')
    expect(allowance).toHaveTextContent('No limit on preparations.')
    expect(allowance).toHaveTextContent('Your lines: 0 of 40')
    expect(allowance).toHaveTextContent('AI suggestions: 0 of 5')

    await user.type(screen.getByLabelText('Your answer'), 'I need to move the date because the review cannot be skipped.')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    const log = await screen.findByRole('log')
    await waitFor(() => expect(log.querySelector('[data-role="participant"]')).toBeInTheDocument())
    const roles = [...log.querySelectorAll('[data-role]')].map((n) => n.getAttribute('data-role'))
    expect(roles).toEqual(['candidate', 'participant'])
    expect(within(log).getByText('Who owns the next step?')).toBeInTheDocument()
    expect(within(log).getByText(/Counterpart/)).toBeInTheDocument()
    expect(log.querySelector('[data-role="participant"]')).toHaveAttribute('data-ai-generated', 'true')
    expect(allowance).toHaveTextContent('Your lines: 1 of 40')
    const sent = calls.find((c) => c.url.endsWith('/turns'))
    expect(sent.body).toEqual({ text: 'I need to move the date because the review cannot be skipped.' })

    // A failed counterpart reply keeps the learner's line and says why.
    await user.type(screen.getByLabelText('Your answer'), 'Let me fail this line.')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText(/could not reply because of a technical problem. What you wrote is saved/)).toBeInTheDocument()
    expect(within(log).getByText('Let me fail this line.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try my last line again' })).toBeInTheDocument()
    noFormalVocabulary()
  })

  it('a requested sample sentence is shown apart as an AI suggestion, never in the conversation as the learner (T44), and the limit is explicit', async () => {
    const user = userEvent.setup()
    let state = attempt({ turns: [sys, { id: 'c1', actor: 'CANDIDATE', authorship: 'LEARNER', text: 'I need to move the date.', createdAt: null }], limits: { ...limits, turns: { used: 1, max: 40 }, assistance: { used: 4, max: 5 } } })
    render('/app/prepare/:attemptId', <PreparationAttemptPage />, {
      [`POST /api/v1/preparation/${ATT}/assist`]: () => {
        state = { ...state, turns: [...state.turns, { id: 'a1', actor: 'AI_ASSISTANT', authorship: 'ASSISTANT', text: 'One way to put it: the review protects the launch, so I would rather move the date than skip it.', createdAt: null }], limits: { ...state.limits, assistance: { used: 5, max: 5 } } }
        return jsonResponse(201, { data: state })
      },
      [`/api/v1/preparation/${ATT}`]: () => jsonResponse(200, { data: state }),
    }, `/app/prepare/${ATT}`)
    const view = await screen.findByTestId('rehearsal')
    const assist = within(view).getByTestId('rehearsal-assistance')
    expect(assist).toHaveTextContent('AI suggestion — not your line')
    expect(assist).toHaveTextContent(/never treated as something you said/)
    await user.click(within(assist).getByRole('button', { name: 'Ask for a sample sentence' }))
    const suggestion = await within(assist).findByTestId('assist-suggestion')
    expect(suggestion).toHaveAttribute('data-authorship', 'ASSISTANT')
    expect(suggestion).toHaveTextContent('AI suggestion')
    const log = screen.getByRole('log')
    expect(within(log).queryByText(/One way to put it/)).not.toBeInTheDocument()
    expect([...log.querySelectorAll('[data-role]')].map((n) => n.getAttribute('data-role'))).toEqual(['candidate'])
    expect(within(view).getByTestId('rehearsal-limits')).toHaveTextContent('AI suggestions: 5 of 5')
    expect(within(assist).getByRole('button', { name: 'No suggestions left for this rehearsal' })).toBeDisabled()
  })

  it('offers pause (everything saved), rename and delete with confirmation', async () => {
    const user = userEvent.setup()
    let state = attempt()
    const { calls } = render('/app/prepare/:attemptId', <PreparationAttemptPage />, {
      [`PATCH /api/v1/preparation/${ATT}`]: (u, init) => { state = { ...state, title: JSON.parse(init.body).title }; return jsonResponse(200, { data: state }) },
      [`DELETE /api/v1/preparation/${ATT}`]: () => jsonResponse(200, { data: { deleted: true } }),
      '/api/v1/preparation': (u) => (u.endsWith(`/preparation/${ATT}`) ? jsonResponse(200, { data: state }) : jsonResponse(200, { data: { items: [] } })),
    }, `/app/prepare/${ATT}`)
    await screen.findByTestId('rehearsal')
    expect(screen.getByRole('link', { name: 'Pause and come back later' })).toHaveAttribute('href', '/app/prepare')
    expect(screen.getByText(/everything is saved and you can resume from Prepare/)).toBeInTheDocument()
    expect(screen.getByTestId('preparation-name')).toHaveTextContent('Negotiate a deadline')
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    await user.type(screen.getByLabelText('Name this preparation'), 'Thursday with the lead')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await screen.findByTestId('preparation-name')).toHaveTextContent('Thursday with the lead')
    expect(calls.find((c) => c.method === 'PATCH').body).toEqual({ title: 'Thursday with the lead' })

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Delete this preparation?')
    expect(dialog).toHaveTextContent(/linked notes/)
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith(`/preparation/${ATT}`))).toBe(true))
    expect(await screen.findByText('No preparations yet')).toBeInTheDocument()
  })
})

describe('Action card, application and check-in', () => {
  it('finishing shows the card as AI assistance with learner-quoted observations, an editable application suggestion and a self-reported check-in (T45)', async () => {
    const user = userEvent.setup()
    let state = attempt({ turns: [sys, { id: 'c1', actor: 'CANDIDATE', authorship: 'LEARNER', text: observation.quote, createdAt: null }], limits: { ...limits, turns: { used: 1, max: 40 } } })
    const { calls } = render('/app/prepare/:attemptId', <PreparationAttemptPage />, {
      [`POST /api/v1/preparation/${ATT}/finish`]: () => { state = { ...state, state: 'COMPLETED', card, observations: [observation], application, completedAt: '2026-10-02T10:20:00.000Z' }; return jsonResponse(200, { data: state }) },
      [`PATCH /api/v1/preparation/${ATT}/application`]: (u, init) => { const edits = JSON.parse(init.body); state = { ...state, application: { ...state.application, ...edits, ...(edits.text ? { source: 'LEARNER', editedByLearner: true } : {}) } }; return jsonResponse(200, { data: state }) },
      [`/api/v1/preparation/${ATT}`]: () => jsonResponse(200, { data: state }),
      'POST /api/v1/checkins': (u, init) => jsonResponse(201, { data: { id: 'ck1', mode: 'SELF_REPORT', scope: 'PERSONAL', nextStep: null, ...JSON.parse(init.body), createdAt: null } }),
    }, `/app/prepare/${ATT}`)
    await screen.findByTestId('rehearsal')
    await user.click(screen.getByRole('button', { name: 'Finish and get my card' }))
    const view = await screen.findByTestId('action-card')
    expect(view).toHaveTextContent('AI assistance')
    expect(view).toHaveTextContent('Not a formal assessment')
    expect(view).toHaveTextContent('State the constraint.')
    expect(view).toHaveTextContent(card.opening)
    expect(view).toHaveTextContent(card.questions[0])
    expect(view).toHaveTextContent(card.tradeoffs[0])
    expect(view).toHaveTextContent(card.boundary)
    expect(view).toHaveTextContent(card.selfCheck)
    expect(view).toHaveTextContent(/saving a plan is not a measure/)
    expect(view).toHaveTextContent(/never a credential/)

    // Observations quote only the learner's own line and say the counterpart's agreement is not the measure.
    const observations = within(view).getByTestId('observations')
    expect(observations).toHaveTextContent('Prism observed in your rehearsal')
    expect(observations).toHaveTextContent(/agreeing or not is not the measure/)
    const row = within(observations).getByTestId('observation')
    expect(row).toHaveAttribute('data-authorship', 'LEARNER')
    expect(row).toHaveTextContent('Named a constraint clearly')
    expect(row).toHaveTextContent(`You wrote: “${observation.quote}”`)

    // The application suggestion is labelled, editable and reminder is opt-in and in-app only.
    const app = within(view).getByTestId('application-card')
    expect(app).toHaveTextContent('One thing to try outside Prism')
    expect(app).toHaveTextContent('Suggested from your practice target')
    expect(within(app).getByTestId('application-text')).toHaveTextContent(application.text)
    expect(within(app).getByRole('checkbox', { name: 'Remind me in Prism to record how it went' })).not.toBeChecked()
    expect(app).toHaveTextContent(/Nothing is emailed or sent anywhere/)
    await user.click(within(app).getByRole('button', { name: 'Edit' }))
    const field = within(app).getByLabelText('One thing to try')
    await user.clear(field)
    await user.type(field, 'Ask who owns the next step before we end.')
    await user.click(within(app).getByRole('button', { name: 'Save' }))
    expect(await within(app).findByTestId('application-text')).toHaveTextContent('Ask who owns the next step before we end.')
    expect(app).toHaveTextContent('Your wording')
    const patch = calls.find((c) => c.method === 'PATCH' && c.url.endsWith('/application'))
    expect(patch.body).toEqual({ text: 'Ask who owns the next step before we end.' })

    await user.click(screen.getByRole('button', { name: 'Record how it went' }))
    const form = screen.getByTestId('checkin-form')
    expect(form).toHaveTextContent('Self-reported')
    expect(form).toHaveTextContent(/cannot change a formal result/)
    await user.click(screen.getByRole('button', { name: 'Save check-in' }))
    expect(within(form).getByText('Say what you tried.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Did you try it? What did you do?'), 'Named the constraint first.')
    await user.type(screen.getByLabelText('What happened?'), 'We agreed a date.')
    await user.type(screen.getByLabelText('What do you want to try next? (optional)'), 'Ask for the owner earlier.')
    await user.click(screen.getByRole('button', { name: 'Save check-in' }))
    expect(await screen.findByTestId('checkin-saved')).toHaveTextContent('saved as self-reported')
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v1/checkins'))
    expect(post.body).toEqual({ sourceType: 'PREPARATION', sourceId: ATT, whatTried: 'Named the constraint first.', outcome: 'We agreed a date.', nextStep: 'Ask for the owner earlier.' })
    expect(post.body.mode).toBeUndefined()
    expect(post.body.scope).toBeUndefined()
    expect(screen.getByRole('link', { name: 'Back to Prepare' })).toHaveAttribute('href', '/app/prepare')
    noFormalVocabulary()
  })

  it('the card can be edited (still labelled assistance you edited) or discarded, and the application suggestion dismissed', async () => {
    const user = userEvent.setup()
    let state = attempt({ state: 'COMPLETED', card, observations: [observation], application, completedAt: '2026-10-02T10:20:00.000Z' })
    const { calls } = render('/app/prepare/:attemptId', <PreparationAttemptPage />, {
      [`PATCH /api/v1/preparation/${ATT}/card`]: (u, init) => { state = { ...state, card: { ...state.card, ...JSON.parse(init.body), editedByLearner: true } }; return jsonResponse(200, { data: state }) },
      [`DELETE /api/v1/preparation/${ATT}/card`]: () => { state = { ...state, card: null, cardError: 'DISCARDED_BY_LEARNER' }; return jsonResponse(200, { data: state }) },
      [`PATCH /api/v1/preparation/${ATT}/application`]: (u, init) => { state = { ...state, application: { ...state.application, ...JSON.parse(init.body) } }; return jsonResponse(200, { data: state }) },
      [`/api/v1/preparation/${ATT}`]: () => jsonResponse(200, { data: state }),
    }, `/app/prepare/${ATT}`)
    const view = await screen.findByTestId('action-card')
    await user.click(within(view).getByRole('button', { name: 'Edit card' }))
    const editor = within(view).getByTestId('card-editor')
    const opening = within(editor).getByLabelText('Opening')
    await user.clear(opening)
    await user.type(opening, 'Here is my constraint, and one option that keeps the review.')
    await user.click(within(editor).getByRole('button', { name: 'Save card' }))
    await waitFor(() => expect(view).toHaveTextContent('Here is my constraint, and one option that keeps the review.'))
    expect(view).toHaveTextContent('You adjusted this card. It is still assistance you edited, not an observation.')
    const patch = calls.find((c) => c.method === 'PATCH' && c.url.endsWith('/card'))
    expect(patch.body).toEqual({ plan: card.plan, opening: 'Here is my constraint, and one option that keeps the review.', questions: card.questions, tradeoffs: card.tradeoffs, boundary: card.boundary, selfCheck: card.selfCheck })
    expect(patch.body.generatedBy).toBeUndefined()

    await user.click(within(within(view).getByTestId('application-card')).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(within(view).queryByTestId('application-card')).not.toBeInTheDocument())
    expect(calls.find((c) => c.method === 'PATCH' && c.url.endsWith('/application')).body).toEqual({ dismissed: true })

    await user.click(within(view).getByRole('button', { name: 'Discard card' }))
    await waitFor(() => expect(view).toHaveTextContent('You discarded the card. Your rehearsal is kept.'))
    expect(view).not.toHaveTextContent('Plan')
    expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/card'))).toBe(true)
    // Observations survive the discard: they are what Prism saw, not assistance.
    expect(within(view).getByTestId('observations')).toHaveTextContent(observation.quote)
  })

  it('a missing card is an explicit message, never a generic stand-in; no observation is invented', async () => {
    render('/app/prepare/:attemptId', <PreparationAttemptPage />, {
      [`/api/v1/preparation/${ATT}`]: { data: attempt({ state: 'COMPLETED', card: null, cardError: 'PROVIDER_ERROR', completedAt: '2026-10-02T10:20:00.000Z' }) },
    }, `/app/prepare/${ATT}`)
    const view = await screen.findByTestId('action-card')
    expect(view).toHaveTextContent('No card')
    expect(view).toHaveTextContent(/technical problem. Your rehearsal is kept/)
    expect(view).not.toHaveTextContent('Plan')
    expect(within(view).getByTestId('observations')).toHaveTextContent('No specific behaviour could be quoted from your lines in this rehearsal.')
    expect(within(view).queryByTestId('application-card')).not.toBeInTheDocument()
  })

  it('a DRAFT shows the sanitized situation, summary, assumptions and a limitation and asks for confirmation; a stopped one says so', async () => {
    const limitation = { category: 'MEDICAL', message: 'This touches a medical or health matter. The rehearsal practises the conversation only; it is not medical advice.' }
    const { unmount } = render('/app/prepare/:attemptId', <PreparationAttemptPage />, {
      [`/api/v1/preparation/${ATT}`]: { data: attempt({ state: 'DRAFT', turns: [], limitation }) },
    }, `/app/prepare/${ATT}`)
    expect(await screen.findByText('Confirm the situation first')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm and start rehearsal' })).toBeInTheDocument()
    expect(screen.getByText('The project lead [email removed]')).toBeInTheDocument()
    expect(screen.getByText(summary)).toBeInTheDocument()
    expect(screen.getByText('The review step cannot be skipped.')).toBeInTheDocument()
    expect(screen.getByText(/not medical advice/)).toBeInTheDocument()
    unmount()
    vi.restoreAllMocks()

    render('/app/prepare/:attemptId', <PreparationAttemptPage />, {
      [`/api/v1/preparation/${ATT}`]: { data: attempt({ state: 'ABANDONED', turns: [sys, { id: 'c1', actor: 'CANDIDATE', authorship: 'LEARNER', text: 'I need to move the date.', createdAt: null }] }) },
    }, `/app/prepare/${ATT}`)
    expect(await screen.findByText('This preparation was stopped')).toBeInTheDocument()
    expect(screen.getByText(/No card was written. What you wrote in the rehearsal is kept/)).toBeInTheDocument()
    expect(screen.getByTestId('preparation-title-bar')).toBeInTheDocument()
  })
})
