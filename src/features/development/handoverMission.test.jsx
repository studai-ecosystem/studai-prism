// P2.8 — the DRAFT handover mission in the mission player over mocked
// /api/v1 responses: labelled as practice (never formal), the board artifact
// is editable, a scaffold hint can be requested, criterion feedback is shown
// per criterion with no formal score, "Try again" starts a NEW attempt, and
// the way back to history exists. The origin from the URL is sent by id only.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import MissionPlayerPage from './pages/MissionPlayerPage.jsx'

const MID = 'MIS-CORE-HANDOVER-01'
const ATT = '66666666-6666-4666-8666-666666666666'
const ATT2 = '77777777-7777-4777-8777-777777777777'
const SESSION = 'sess-source-1'
const flags = { PRISM_APP_SHELL_V3: true, PRISM_DEVELOPMENT_V2: true }

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

const HINTS = [
  'Start the message with the two tasks that have no owner, so Sam sees them first.',
  'If you cannot assign an owner, name the person who should decide instead of leaving it blank.',
  'A check-in is only useful if Sam can put it in a calendar: give a day and a clock time.',
]
const boardRows = [{ id: 'quotes', task: 'Vendor quotes', due: 'Thursday', owner: null }, { id: 'checklist', task: 'Launch checklist', due: 'Friday', owner: null }]
const mission = {
  mission: {
    id: MID, version: 1, title: 'Hand over an unfinished plan to a colleague', targetCapability: { id: 'CAP-L1-COMMUNICATION', name: 'Communication' },
    scenario: { setting: 'Two tasks on the board have no owner yet.', objective: 'Write the handover so Sam can pick the plan up.' },
    instructions: ['Fill in the owner column.', 'Write the handover message.'], constraints: ['Sam has not seen this plan before.'],
    artifacts: [
      { id: 'BOARD', type: 'TABLE', title: 'Task board', prompt: 'Fill in who owns each one now.', fields: null, columns: [{ key: 'task', label: 'Task', kind: 'text', editable: false }, { key: 'due', label: 'Due', kind: 'text', editable: false }, { key: 'owner', label: 'Owner', kind: 'text', editable: true }], maxLength: null },
      { id: 'MESSAGE', type: 'TEXT_RESPONSE', title: 'Handover message to Sam', prompt: 'What does Sam need to know?', fields: null, columns: null, maxLength: 1500 },
    ],
    whatIsChecked: [
      { criterionId: 'C-NAMES-TASKS', description: 'Names both unowned tasks in the handover message.' },
      { criterionId: 'C-OWNERSHIP', description: 'Assigns an owner to each unowned task, or names who will decide.' },
    ],
    hintCount: 3, estimatedMinutes: 15, evidenceType: 'PRACTICE', accessibility: { keyboard_only: true, screen_reader: true, untimed: true },
  },
  intervention: null, openAttemptId: null, pastAttempts: [],
}
const work = () => ({ BOARD: { rows: boardRows.map((r) => ({ ...r })) }, MESSAGE: { text: '' } })
const origin = { kind: 'ASSESSMENT_MOMENT', sessionId: SESSION, opportunityId: 'opp-3' }
const attempt = (over = {}) => ({ id: ATT, missionId: MID, missionVersion: 1, status: 'IN_PROGRESS', version: 1, work: work(), hints: [], hintsRemaining: 3, origin, result: null, submittedAt: null, evidenceType: 'PRACTICE', ...over })
const result = {
  status: 'EVALUATED', verified: true, summary: 'Mission completed — 1 of 2 target behaviours demonstrated.', counts: { demonstrated: 1, uncertain: 0, total: 2 },
  criteria: [
    { criterionId: 'C-NAMES-TASKS', description: 'Names both unowned tasks in the handover message.', result: 'NOT_OBSERVED', quote: null, checks: [{ description: 'The message names the vendor quotes.', passed: true }, { description: 'The message names the launch checklist.', passed: false }], note: 'Not shown yet in this attempt.' },
    { criterionId: 'C-OWNERSHIP', description: 'Assigns an owner to each unowned task, or names who will decide.', result: 'OBSERVED', quote: null, checks: [{ description: 'Both unowned tasks now have an owner, or a named person who will decide.', passed: true }], note: 'Shown in this attempt.' },
  ],
}

function renderPlayer(routes, route) {
  signIn()
  const calls = routeFetch({ ...routes, '/api/v1/me': meBody({ flags }) })
  const out = renderApp(<Routes><Route path="/app/development/missions/:missionId" element={<MissionPlayerPage />} /></Routes>, { route })
  return { ...out, calls }
}

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear() })

describe('Handover practice mission (P2.8)', () => {
  it('is labelled practice, sends the origin by id, edits the board, shows a hint, gives criterion feedback with no formal score, retries as a new attempt, and links back to history', async () => {
    let version = 1
    let current = attempt()
    const { calls } = renderPlayer({
      [`/api/v1/missions/${MID}`]: { data: mission },
      [`POST /api/v1/missions/${MID}/attempts`]: (u, init) => {
        const body = JSON.parse(init.body || '{}')
        current = attempt(body.retry ? { id: ATT2 } : {})
        version = 1
        return jsonResponse(201, { data: current })
      },
      'PATCH /api/v1/mission-attempts/': (u, init) => { version += 1; current = { ...current, version, work: JSON.parse(init.body).work }; return jsonResponse(200, { data: current }) },
      'POST /api/v1/mission-attempts/': (u) => {
        if (u.endsWith('/hints')) { version += 1; current = { ...current, version, hints: HINTS.slice(0, current.hints.length + 1), hintsRemaining: current.hintsRemaining - 1 }; return jsonResponse(200, { data: current }) }
        version += 1; current = { ...current, version, status: 'EVALUATED', result, submittedAt: '2026-10-10T09:00:00Z' }; return jsonResponse(201, { data: current })
      },
      '/api/v1/mission-attempts/': () => jsonResponse(200, { data: current }),
      '/api/v1/me/development-plan': { data: { status: 'NO_PLAN', priorities: [], missions: [], catalogue: [], missionsAvailable: true, missionsEnabled: true, upcomingReassessment: null, practiceEvidence: [], completedMissions: [] } },
      '/api/v1/me/growth': { data: { comparable: false, reason: 'NEEDS_COMPARABLE_REASSESSMENT', assessments: [], comparison: null, changes: [], reassessments: [], interventions: [], growthEnabled: true } },
    }, `/app/development/missions/${MID}?source=${SESSION}&moment=opp-3`)

    // Practice label, never a formal one.
    expect(await screen.findByRole('heading', { level: 1, name: mission.mission.title })).toBeInTheDocument()
    const label = screen.getByTestId('practice-label')
    expect(label).toHaveTextContent(/practice mission/i)
    expect(label).toHaveTextContent('This is practice, not a formal assessment')
    expect(screen.queryByText(/^Formal assessment$/)).not.toBeInTheDocument()
    const originNote = screen.getByTestId('practice-origin')
    expect(originNote).toHaveTextContent('does not change that assessment or its report')
    expect(within(originNote).getByRole('link', { name: 'Back to history' })).toHaveAttribute('href', '/app/assessments?tab=history')

    // Start: the origin travels as identifiers only.
    await userEvent.click(screen.getByRole('button', { name: 'Start mission' }))
    const start = calls.find((c) => c.method === 'POST' && c.url.endsWith('/attempts'))
    expect(start.body).toEqual({ origin })
    expect(JSON.stringify(start.body)).not.toMatch(/transcript|evidence|score/i)

    // Board artifact edit: owner cells are editable text, task names are row headers.
    const ownerQuotes = await screen.findByLabelText('Owner for Vendor quotes')
    expect(screen.getByRole('rowheader', { name: 'Launch checklist' })).toBeInTheDocument()
    await userEvent.type(ownerQuotes, 'Sam')
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true), { timeout: 4000 })
    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch.body.work.BOARD.rows[0].owner).toBe('Sam')
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument(), { timeout: 4000 })

    // Scaffold on request.
    await userEvent.click(screen.getByRole('button', { name: /^Hints/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Hints' })
    await userEvent.click(within(drawer).getByRole('button', { name: 'Show a hint' }))
    expect(await within(drawer).findByText(HINTS[0])).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/hints'))).toBe(true)
    await userEvent.keyboard('{Escape}')

    // Submit → feedback per criterion, no formal score text.
    await userEvent.click(screen.getByRole('button', { name: 'Submit for feedback' }))
    const dialog = await screen.findByRole('dialog', { name: 'Submit this attempt?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Submit' }))
    expect(await screen.findByTestId('mission-summary')).toHaveTextContent('1 of 2 target behaviours demonstrated')
    const criteria = screen.getAllByTestId('mission-criterion')
    expect(criteria).toHaveLength(2)
    expect(criteria[0]).toHaveTextContent('Not shown yet')
    expect(criteria[0]).toHaveTextContent('The message names the launch checklist.')
    expect(criteria[1]).toHaveTextContent('Shown')
    expect(screen.getByLabelText('Owner for Vendor quotes')).toBeDisabled()
    expect(document.body.textContent).not.toMatch(/formal score|level\s*\d|score|points|rubric level|\d+\s*%|percent|readiness|congrat|!/i)
    expect(screen.getAllByRole('link', { name: 'Back to history' }).length).toBeGreaterThanOrEqual(2)

    // Try again → a NEW attempt id, fresh work, hints cleared.
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/attempts')).at(-1).body).toEqual({ retry: true, origin }))
    await waitFor(() => expect(screen.getByLabelText('Owner for Vendor quotes')).toBeEnabled())
    expect(screen.getByLabelText('Owner for Vendor quotes')).toHaveValue('')
    expect(screen.queryByTestId('mission-summary')).not.toBeInTheDocument()
    expect(current.id).toBe(ATT2)
  })

  it('without a source in the URL the attempt starts from the learner goal (server default) and shows no origin note', async () => {
    const { calls } = renderPlayer({
      [`/api/v1/missions/${MID}`]: { data: mission },
      [`POST /api/v1/missions/${MID}/attempts`]: () => jsonResponse(201, { data: attempt({ origin: { kind: 'GOAL' } }) }),
      '/api/v1/mission-attempts/': () => jsonResponse(200, { data: attempt({ origin: { kind: 'GOAL' } }) }),
    }, `/app/development/missions/${MID}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Start mission' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/attempts')).body).toEqual({}))
    expect(screen.queryByTestId('practice-origin')).not.toBeInTheDocument()
    expect(await screen.findByLabelText('Owner for Launch checklist')).toBeEnabled()
  })
})
