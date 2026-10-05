// C8.08–C8.09 — Development V2 UI over mocked /api/v1 responses: the plan
// lists recommended and catalogue missions with honest empty states; the
// mission player starts an attempt, autosaves with If-Match, submits after a
// confirmation and shows criterion feedback with no levels; retry starts a
// new attempt; the campus intervention builder validates and sends only what
// the form holds.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route, useLocation } from 'react-router-dom'
import { renderApp, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import { WorkspaceGuard } from '../../app/guards/WorkspaceGuard.jsx'
import DevelopmentPage from './pages/DevelopmentPage.jsx'
import MissionPlayerPage from './pages/MissionPlayerPage.jsx'
import CampusDevelopmentPage from '../campus/pages/CampusDevelopmentPage.jsx'
import { formatDate } from '../student/QueryState.jsx'

const MID = 'MIS-MKT-EXP-01'
const ATT = '44444444-4444-4444-8444-444444444444'
const ORG = '11111111-1111-4111-8111-111111111111'
const COHORT = '22222222-2222-4222-8222-222222222222'
const flags = { PRISM_APP_SHELL_V3: true, PRISM_DEVELOPMENT_V2: true, PRISM_CAMPUS_ENABLED: true }

// Routes by "METHOD path-prefix"; records every call.
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

const card = { id: MID, version: 1, title: 'Design a clean A/B test for a new ad message', targetCapabilityId: 'CAP-MKT-EXPERIMENTATION', targetCapabilityName: 'Experimentation', estimatedMinutes: 20, behaviorCount: 4, intervention: null, latestAttempt: null }
const mission = {
  mission: {
    id: MID, version: 1, title: card.title, targetCapability: { id: card.targetCapabilityId, name: 'Experimentation' },
    scenario: { setting: 'A skincare brand has a test budget.', objective: 'Design a clean test.' },
    instructions: ['Write your hypothesis.'], constraints: ['The total budget is fixed.'],
    artifacts: [{ id: 'HYPOTHESIS', type: 'TEXT_RESPONSE', title: 'Hypothesis', prompt: 'What do you expect?', fields: null, columns: null, maxLength: 1500 }],
    whatIsChecked: [{ criterionId: 'C-HYPOTHESIS', description: 'States a testable hypothesis.' }],
    hintCount: 2, estimatedMinutes: 20, evidenceType: 'PRACTICE', accessibility: { keyboard_only: true, screen_reader: true, untimed: true },
  },
  intervention: null, openAttemptId: null, pastAttempts: [],
}
const attempt = (over = {}) => ({ id: ATT, missionId: MID, missionVersion: 1, status: 'IN_PROGRESS', version: 1, work: { HYPOTHESIS: { text: '' } }, hints: [], hintsRemaining: 2, result: null, submittedAt: null, evidenceType: 'PRACTICE', ...over })
const result = {
  status: 'EVALUATED', verified: true, summary: 'Mission completed — 1 of 1 target behaviour demonstrated.', counts: { demonstrated: 1, uncertain: 0, total: 1 },
  criteria: [{ criterionId: 'C-HYPOTHESIS', description: 'States a testable hypothesis.', result: 'OBSERVED', quote: null, checks: [{ description: 'Written as If … then … because …', passed: true }], note: 'Shown in this attempt.' }],
}

function renderStudent(path, element, routes, { route } = {}) {
  signIn()
  const calls = routeFetch({ ...routes, '/api/v1/me': meBody({ flags }) })
  const out = renderApp(<Routes><Route path={path} element={element} /></Routes>, { route: route || path.replace(':missionId', MID) })
  return { ...out, calls }
}

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear() })

describe('Development page (V2)', () => {
  it('shows recommended and catalogue missions, past attempts, and labels practice', async () => {
    renderStudent('/app/development', <DevelopmentPage />, {
      '/api/v1/me/development-plan': { data: {
        status: 'NO_PLAN', priorities: [], missions: [], catalogue: [card], missionsAvailable: true, missionsEnabled: true, upcomingReassessment: null, practiceEvidence: [],
        completedMissions: [{ attemptId: ATT, missionId: MID, title: card.title, status: 'EVALUATED', summary: 'Mission completed — 2 of 4 target behaviours demonstrated.', submittedAt: '2026-10-10T09:00:00Z' }],
      } },
    })
    expect(await screen.findByText(/No practice mission matches your current priorities yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: (n) => n.startsWith('Open mission') && n.includes(card.title) })).toHaveAttribute('href', `/app/development/missions/${MID}`)
    expect(screen.getByText('Mission completed — 2 of 4 target behaviours demonstrated.')).toBeInTheDocument()
    expect(screen.getAllByText('Practice').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('practice-label')[0].className).toMatch(/border-dashed/)
    expect(document.body.textContent).not.toMatch(/level 4|achieved|points|\d+\s*%/i)
  })

  it('offers the way into a reassessment only when the server lists one', async () => {
    const plan = { data: { status: 'NO_PLAN', priorities: [], missions: [], catalogue: [], missionsAvailable: false, missionsEnabled: false, upcomingReassessment: null, practiceEvidence: [], completedMissions: [] } }
    const growth = (reassessments) => ({ data: { comparable: false, reason: 'NEEDS_COMPARABLE_REASSESSMENT', assessments: [], comparison: null, changes: [], reassessments, interventions: [], growthEnabled: true } })
    const open = { id: 'r1', name: 'December reassessment', windowStart: '2026-12-01T08:00:00.000Z', windowEnd: '2026-12-15T18:00:00.000Z', status: 'ACTIVE', assignmentId: 'a-2', rosterStatus: 'ASSIGNED', endedAt: null, comparability: 'PENDING' }
    const a = renderStudent('/app/development', <DevelopmentPage />, { '/api/v1/me/development-plan': plan, '/api/v1/me/growth': growth([open]) })
    const entry = await screen.findByTestId('reassessment-entry')
    expect(entry).toHaveTextContent('December reassessment is open until')
    expect(within(entry).getByRole('link', { name: 'Go to your assessments' })).toHaveAttribute('href', '/app/assessments')
    expect(entry).toHaveTextContent('will not show a change yet')
    a.unmount()
    renderStudent('/app/development', <DevelopmentPage />, { '/api/v1/me/development-plan': plan, '/api/v1/me/growth': growth([]) })
    expect(await screen.findByRole('heading', { name: 'Current priorities' })).toBeInTheDocument()
    expect(screen.queryByTestId('reassessment-entry')).not.toBeInTheDocument()
  })
})

describe('Mission player', () => {
  it('renders unjudgeable work neutrally without calling it absent behaviour or mastery', async () => {
    const unjudgeable = {
      ...result, verified: false, summary: 'The situation needs more context for this check.',
      counts: { demonstrated: 0, uncertain: 0, total: 1 },
      focus: { completed: null, nextChange: null, allMet: false, reviewIncomplete: true, note: null },
      criteria: [{ ...result.criteria[0], result: 'NOT_JUDGEABLE', checks: [], quote: null, note: 'Attendance is not known in this situation.' }],
    }
    renderStudent('/app/development/missions/:missionId', <MissionPlayerPage />, {
      [`/api/v1/missions/${MID}`]: { data: { ...mission, openAttemptId: ATT } },
      '/api/v1/mission-attempts/': { data: attempt({ status: 'EVALUATED', result: unjudgeable, submittedAt: '2026-10-10T09:00:00Z' }) },
    })
    expect(await screen.findByText('Needs context to review')).toBeInTheDocument()
    expect(screen.getByText('The review could not be completed. Your work is kept and nothing was guessed.')).toBeInTheDocument()
    expect(screen.queryByText('Not shown yet')).not.toBeInTheDocument()
    expect(screen.queryByText(/Every checked behaviour was shown/)).not.toBeInTheDocument()
  })

  it('is labelled as practice before anything starts, and completion is calm: observed, reflect, next, reassessment', async () => {
    const other = { ...card, id: 'MIS-OTHER', title: 'Write a clear update for a stakeholder' }
    const open = { id: 'r1', name: 'December reassessment', windowStart: '2026-12-01T08:00:00.000Z', windowEnd: '2026-12-15T18:00:00.000Z', status: 'SCHEDULED', assignmentId: 'a-2', rosterStatus: 'ASSIGNED', endedAt: null, comparability: 'APPROVED' }
    const partial = { ...result, summary: 'Mission completed - 1 of 2 target behaviours demonstrated.', counts: { demonstrated: 1, uncertain: 0, total: 2 } }
    renderStudent('/app/development/missions/:missionId', <MissionPlayerPage />, {
      [`/api/v1/missions/${MID}`]: { data: { ...mission, openAttemptId: ATT } },
      '/api/v1/mission-attempts/': { data: attempt({ status: 'EVALUATED', version: 3, result: partial, submittedAt: '2026-10-10T09:00:00Z' }) },
      '/api/v1/me/development-plan': { data: { status: 'NO_PLAN', priorities: [], missions: [card], catalogue: [other], missionsAvailable: true, missionsEnabled: true, upcomingReassessment: null, practiceEvidence: [], completedMissions: [] } },
      '/api/v1/me/growth': { data: { comparable: false, reason: 'NEEDS_COMPARABLE_REASSESSMENT', assessments: [], comparison: null, changes: [], reassessments: [open], interventions: [], growthEnabled: true } },
    })
    const label = await screen.findByTestId('practice-label')
    expect(label).toHaveTextContent('This is practice, not a formal assessment')
    const next = await screen.findByTestId('mission-next-steps')
    expect(next).toHaveTextContent('What was observed: 1 of 2 behaviours in this attempt.')
    expect(next).toHaveTextContent('Reflect: pick one behaviour that was not observed')
    expect(within(next).getByRole('link', { name: 'Write a clear update for a stakeholder' })).toHaveAttribute('href', '/app/development/missions/MIS-OTHER')
    expect(await within(next).findByText(/December reassessment opens/)).toBeInTheDocument()
    expect(within(next).queryByRole('link', { name: 'Go to your assessments' })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/congrat|well done|great job|you.ve earned|streak|badge|!|level\s*\d|\d+\s*%/i)
  })

  it('starts, autosaves with If-Match, submits after confirmation, shows criterion feedback, and retries', async () => {
    let saved = 1
    const calls = renderStudent('/app/development/missions/:missionId', <MissionPlayerPage />, {
      [`POST /api/v1/missions/${MID}/attempts`]: (u, init) => jsonResponse(201, { data: attempt(JSON.parse(init.body || '{}').retry ? { id: '55555555-5555-4555-8555-555555555555' } : {}) }),
      [`/api/v1/missions/${MID}`]: { data: mission },
      [`PATCH /api/v1/mission-attempts/${ATT}`]: (u, init) => { saved += 1; return jsonResponse(200, { data: attempt({ version: saved, work: JSON.parse(init.body).work }) }) },
      [`POST /api/v1/mission-attempts/${ATT}/submit`]: () => jsonResponse(201, { data: attempt({ status: 'EVALUATED', version: saved + 1, result, submittedAt: '2026-10-10T09:00:00Z' }) }),
      '/api/v1/mission-attempts/': (u) => jsonResponse(200, { data: attempt({ id: u.split('/').pop(), version: saved }) }),
    }).calls
    expect(await screen.findByRole('heading', { level: 1, name: card.title })).toBeInTheDocument()
    expect(screen.getByText('What will be checked')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Start mission' }))
    const start = calls.find((c) => c.method === 'POST' && c.url.endsWith('/attempts'))
    expect(start.headers['Idempotency-Key']).toMatch(/^mission-/)
    const box = await screen.findByLabelText('Hypothesis')
    await userEvent.type(box, 'If we change the headline then sales rise because trust grows.')
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true), { timeout: 4000 })
    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch.headers['If-Match']).toBe('"1"')
    expect(patch.body.work.HYPOTHESIS.text).toMatch(/headline/)
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument(), { timeout: 4000 })

    await userEvent.click(screen.getByRole('button', { name: 'Submit for feedback' }))
    const dialog = await screen.findByRole('dialog', { name: 'Submit this attempt?' })
    expect(calls.some((c) => c.url.endsWith('/submit'))).toBe(false)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Submit' }))
    expect(await screen.findByTestId('mission-summary')).toHaveTextContent('Mission completed — 1 of 1 target behaviour demonstrated.')
    expect(screen.getByTestId('mission-criterion')).toHaveTextContent('Shown')
    await waitFor(() => expect(document.activeElement).toHaveTextContent('Feedback'))
    expect(screen.getByLabelText('Hypothesis')).toBeDisabled()
    expect(document.body.textContent).not.toMatch(/level\s*\d|score|points|\d+\s*%/i)

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/attempts')).at(-1).body).toEqual({ retry: true }))
  })

  it('tells a version conflict apart from an attempt that can no longer change', async () => {
    const conflict = (details) => () => jsonResponse(409, { error: { code: 'CONFLICT', message: details ? 'This work was changed somewhere else. Reload to continue.' : 'This intervention has ended. Your work is kept, but it can no longer be changed or submitted.', requestId: 'r', ...(details ? { details } : {}) } })
    for (const [details, expectText] of [[{ current: attempt({ version: 3 }) }, 'Load the saved version'], [null, 'This intervention has ended']]) {
      const { unmount } = renderStudent('/app/development/missions/:missionId', <MissionPlayerPage />, {
        [`PATCH /api/v1/mission-attempts/${ATT}`]: conflict(details),
        '/api/v1/mission-attempts/': { data: attempt() },
        [`/api/v1/missions/${MID}`]: { data: { ...mission, openAttemptId: ATT } },
      })
      await userEvent.type(await screen.findByLabelText('Hypothesis'), 'If x')
      expect(await screen.findByText(new RegExp(expectText), {}, { timeout: 4000 })).toBeInTheDocument()
      if (!details) {
        expect(screen.getAllByRole('alert').some((a) => /intervention has ended/.test(a.textContent))).toBe(true)
        expect(screen.getByLabelText('Hypothesis')).toBeDisabled()
        expect(screen.queryByRole('button', { name: 'Submit for feedback' })).not.toBeInTheDocument()
      }
      unmount()
      vi.restoreAllMocks()
      localStorage.clear()
    }
  })

  it('an unknown mission shows the not-available state with a way back to development', async () => {
    renderStudent('/app/development/missions/:missionId', <MissionPlayerPage />, {
      [`/api/v1/missions/${MID}`]: () => jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'r' } }),
    })
    expect(await screen.findByText('Mission not available')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to development' })).toHaveAttribute('href', '/app/development')
  })
})

// ── P6: library grouping, draft label, replay, fresh challenge, uncoached player, completion flow ──
const ATT_R = '88888888-8888-4888-8888-888888888888'
const ATT_C = '99999999-9999-4999-8999-999999999999'
const draftCard = (id, code, title, capId, capName) => ({ ...card, id, title, displayCode: code, status: 'DRAFT', modes: ['GUIDED'], targetCapabilityId: capId, targetCapabilityName: capName })
const M01 = draftCard('MIS-CORE-MISSING-FACT-01', 'M01', 'Find the missing fact', 'CAP-L1-REASONING', 'Making decisions')
const M02 = draftCard('MIS-CORE-CHECK-RECOMMENDATION-01', 'M02', 'Check the confident recommendation', 'CAP-L1-REASONING', 'Making decisions')
const M04 = draftCard('MIS-CORE-HANDOVER-01', 'M04', 'Hand over an unfinished plan to a colleague', 'CAP-L1-COMMUNICATION', 'Getting your point across')
const published = { ...card, status: 'PUBLISHED', modes: ['GUIDED'], targetCapabilityName: 'Experimentation' }
const planWith = (over = {}) => ({ data: { status: 'NO_PLAN', priorities: [], missions: [], catalogue: [published, M01, M04, M02], missionsAvailable: true, missionsEnabled: true, upcomingReassessment: null, practiceEvidence: [], completedMissions: [], allowance: { kind: 'UNLIMITED' }, ...over } })
const growthNone = { data: { comparable: false, reason: 'NEEDS_COMPARABLE_REASSESSMENT', assessments: [], comparison: null, changes: [], reassessments: [], interventions: [], growthEnabled: true } }

// P6 pages navigate after a replay/challenge; MemoryRouter has no window
// location, so a probe route records where the app went.
function LocationProbe() {
  const { pathname, search } = useLocation()
  return <p data-testid="location-probe">{pathname}{search}</p>
}
function renderWithProbe(path, element, routes, opts) {
  signIn()
  const calls = routeFetch({ ...routes, '/api/v1/me': meBody({ flags }) })
  const out = renderApp(
    <Routes>
      <Route path={path} element={element} />
      <Route path="/app/development/missions/:missionId" element={<LocationProbe />} />
    </Routes>,
    { route: opts?.route || path },
  )
  return { ...out, calls }
}
const landedOn = async (expected) => expect(await screen.findByTestId('location-probe')).toHaveTextContent(expected)

describe('P6 practice library (Development page)', () => {
  it('groups the catalogue by family, labels draft content and the guided mode, and shows the allowance only when bounded', async () => {
    const { unmount } = renderStudent('/app/development', <DevelopmentPage />, { '/api/v1/me/development-plan': planWith(), '/api/v1/me/growth': growthNone })
    const groups = await screen.findAllByTestId('family-group')
    expect(groups.map((g) => within(g).getByRole('heading', { level: 4 }).textContent)).toEqual(['Experimentation', 'Making decisions', 'Getting your point across'])
    const reasoning = groups[1]
    expect(within(reasoning).getAllByRole('article')).toHaveLength(2)
    expect(within(reasoning).getByRole('heading', { level: 5, name: /M01.*Find the missing fact/ })).toBeInTheDocument()
    expect(within(reasoning).getAllByTestId('draft-label').map((d) => d.textContent)).toEqual(['Draft content', 'Draft content'])
    expect(within(groups[0]).queryByTestId('draft-label')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('mode-badge')[0]).toHaveTextContent('Guided')
    expect(screen.getByTestId('draft-note')).toHaveTextContent('never recommended automatically')
    expect(within(reasoning).getByRole('button', { name: 'Fresh challenge for Making decisions' })).toBeInTheDocument()
    expect(screen.queryByTestId('practice-allowance')).not.toBeInTheDocument()
    expect(screen.queryByTestId('replay-moment')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\d+\s*%|readiness|!/i)
    unmount()
    vi.restoreAllMocks()
    renderStudent('/app/development', <DevelopmentPage />, { '/api/v1/me/development-plan': planWith({ allowance: { kind: 'BOUNDED', total: 4, used: 1, remaining: 3, validUntil: null } }), '/api/v1/me/growth': growthNone })
    expect(await screen.findByTestId('practice-allowance')).toHaveTextContent('3 of 4 practice attempts remaining')
  })

  it('offers "Try that moment again" for a report moment and opens the replayed attempt; a fresh challenge opens an uncoached attempt', async () => {
    const replayed = attempt({ id: ATT_R, missionId: M04.id, origin: { kind: 'ASSESSMENT_MOMENT', sessionId: 'sess-1', opportunityId: 'OPP-COMM-HANDOVER-AUDIENCE' }, assistance: { mode: 'GUIDED', hintsUsed: 0, scaffoldRequested: false }, stimulus: { source: 'ASSESSMENT_MOMENT', opportunityId: 'OPP-COMM-HANDOVER-AUDIENCE', text: 'Ade: I only need to know whether the workshop goes ahead.', presentedAt: null } })
    const { calls } = renderWithProbe('/app/development', <DevelopmentPage />, {
      '/api/v1/me/development-plan': planWith(),
      '/api/v1/me/growth': growthNone,
      'POST /api/v1/development/replay': () => jsonResponse(201, { data: { attempt: replayed, missionId: M04.id } }),
      'POST /api/v1/development/challenge': () => jsonResponse(201, { data: { attempt: attempt({ id: ATT_C, missionId: M02.id, assistance: { mode: 'UNCOACHED', hintsUsed: 0, scaffoldRequested: false }, stimulus: null }), missionId: M02.id } }),
    }, { route: '/app/development?source=sess-1&moment=OPP-COMM-HANDOVER-AUDIENCE' })
    const panel = await screen.findByTestId('replay-moment')
    expect(panel).toHaveTextContent('Your assessment and its report stay unchanged')
    await userEvent.click(within(panel).getByRole('button', { name: 'Try that moment again' }))
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/development/replay'))).toBe(true))
    const call = calls.find((c) => c.url.endsWith('/development/replay'))
    expect(call.body).toEqual({ sessionId: 'sess-1', opportunityId: 'OPP-COMM-HANDOVER-AUDIENCE' })
    expect(call.headers['Idempotency-Key']).toMatch(/^replay-/)
    await landedOn(`/app/development/missions/${M04.id}?attempt=${ATT_R}`)
  })

  it('a fresh challenge sends the capability and lands on the uncoached attempt', async () => {
    const { calls } = renderWithProbe('/app/development', <DevelopmentPage />, {
      '/api/v1/me/development-plan': planWith(),
      '/api/v1/me/growth': growthNone,
      'POST /api/v1/development/challenge': () => jsonResponse(201, { data: { attempt: attempt({ id: ATT_C, missionId: M02.id, assistance: { mode: 'UNCOACHED', hintsUsed: 0, scaffoldRequested: false } }), missionId: M02.id } }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Fresh challenge for Making decisions' }))
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/development/challenge'))).toBe(true))
    expect(calls.find((c) => c.url.endsWith('/development/challenge')).body).toEqual({ capabilityId: 'CAP-L1-REASONING' })
    await landedOn(`/app/development/missions/${M02.id}?attempt=${ATT_C}`)
  })

  it('a server refusal (nothing unfamiliar left) is shown inline, not as success', async () => {
    renderWithProbe('/app/development', <DevelopmentPage />, {
      '/api/v1/me/development-plan': planWith(),
      '/api/v1/me/growth': growthNone,
      'POST /api/v1/development/challenge': () => jsonResponse(409, { error: { code: 'NO_FRESH_CHALLENGE', message: 'No unfamiliar practice setting is available for this capability yet.', requestId: 'r' } }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Fresh challenge for Making decisions' }))
    await waitFor(() => expect(screen.getAllByRole('alert').some((a) => /No unfamiliar practice setting is available/.test(a.textContent))).toBe(true))
    expect(screen.queryByTestId('location-probe')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fresh challenge for Making decisions' })).toBeEnabled()
  })
})

describe('P6 mission player: uncoached mode and completion flow', () => {
  const m02 = { ...mission, mission: { ...mission.mission, id: M02.id, title: M02.title, displayCode: 'M02', status: 'DRAFT', targetCapability: { id: 'CAP-L1-REASONING', name: 'Making decisions' }, whyItMatters: 'A confident summary is easy to forward.', reflectionPrompt: 'What made the summary sound reliable?', hintCount: 3 } }
  it('opens the ?attempt= attempt, hides hints with an honest note when uncoached, and shows the replay stimulus when present', async () => {
    const uncoached = attempt({ id: ATT_C, missionId: M02.id, hints: [], hintsRemaining: 0, assistance: { mode: 'UNCOACHED', hintsUsed: 0, scaffoldRequested: false }, stimulus: null })
    const { calls, unmount } = renderStudent('/app/development/missions/:missionId', <MissionPlayerPage />, {
      [`/api/v1/missions/${M02.id}`]: { data: m02 },
      [`/api/v1/mission-attempts/${ATT_C}`]: { data: uncoached },
    }, { route: `/app/development/missions/${M02.id}?attempt=${ATT_C}` })
    expect(await screen.findByLabelText('Hypothesis')).toBeEnabled()
    expect(calls.some((c) => c.url.endsWith(`/mission-attempts/${ATT_C}`))).toBe(true)
    expect(screen.getByTestId('uncoached-note')).toHaveTextContent('hints are off for this attempt')
    expect(screen.getByTestId('uncoached-note')).toHaveTextContent('It is still practice')
    expect(screen.queryByRole('button', { name: /^Hints/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit for feedback' })).toBeInTheDocument()
    expect(screen.getByText('Why it matters')).toBeInTheDocument()
    expect(screen.queryByTestId('replay-stimulus')).not.toBeInTheDocument()
    unmount()
    vi.restoreAllMocks()
    const replayed = attempt({ id: ATT_R, missionId: M02.id, origin: { kind: 'ASSESSMENT_MOMENT', sessionId: 'sess-1', opportunityId: 'OPP-X' }, assistance: { mode: 'GUIDED', hintsUsed: 0, scaffoldRequested: false }, stimulus: { source: 'ASSESSMENT_MOMENT', opportunityId: 'OPP-X', text: 'Dev: Can you confirm the room booking?', presentedAt: null } })
    renderStudent('/app/development/missions/:missionId', <MissionPlayerPage />, {
      [`/api/v1/missions/${M02.id}`]: { data: m02 },
      [`/api/v1/mission-attempts/${ATT_R}`]: { data: replayed },
    }, { route: `/app/development/missions/${M02.id}?attempt=${ATT_R}` })
    const stim = await screen.findByTestId('replay-stimulus')
    expect(stim).toHaveTextContent('Dev: Can you confirm the room booking?')
    expect(stim).toHaveTextContent('Your earlier answer is not shown or compared')
    expect(screen.getByTestId('practice-origin')).toHaveTextContent('does not change that assessment or its report')
    expect(screen.getByRole('button', { name: /^Hints/ })).toBeInTheDocument()
  })

  it('completion is calm: reflection, observed criteria with the learner\'s words, then one next action (another mission or a fresh challenge)', async () => {
    const done = {
      status: 'EVALUATED', verified: true, summary: 'Mission completed — 1 of 2 target behaviours demonstrated.', counts: { demonstrated: 1, uncertain: 0, total: 2 },
      criteria: [
        { criterionId: 'C-CLAIM', description: 'Names the claim that was checked.', result: 'OBSERVED', quote: 'the supplier delivers in two days', checks: [{ description: 'The note names the claim that was checked.', passed: true }], note: 'Shown in this attempt.' },
        { criterionId: 'C-UNCERTAIN', description: 'Names what is still uncertain.', result: 'NOT_OBSERVED', quote: null, checks: [], note: 'Not shown yet in this attempt.' },
      ],
    }
    const { calls } = renderStudent('/app/development/missions/:missionId', <MissionPlayerPage />, {
      [`/api/v1/missions/${M02.id}`]: { data: { ...m02, openAttemptId: ATT } },
      '/api/v1/mission-attempts/': { data: attempt({ missionId: M02.id, status: 'EVALUATED', version: 3, result: done, submittedAt: '2026-10-10T09:00:00Z', assistance: { mode: 'GUIDED', hintsUsed: 1, scaffoldRequested: true } }) },
      '/api/v1/me/development-plan': planWith({ catalogue: [M01, M02] }),
      '/api/v1/me/growth': growthNone,
      'POST /api/v1/development/challenge': () => jsonResponse(201, { data: { attempt: attempt({ id: ATT_C, missionId: M01.id, assistance: { mode: 'UNCOACHED', hintsUsed: 0, scaffoldRequested: false } }), missionId: M01.id } }),
    }, { route: `/app/development/missions/${M02.id}` })
    const next = await screen.findByTestId('mission-next-steps')
    expect(within(next).getByTestId('reflection-prompt')).toHaveTextContent('What made the summary sound reliable?')
    const observed = within(next).getByTestId('observed-criteria')
    expect(observed).toHaveTextContent('What was observed: 1 of 2 behaviours in this attempt.')
    expect(observed).toHaveTextContent('Names the claim that was checked.')
    expect(observed).toHaveTextContent('the supplier delivers in two days')
    expect(observed).not.toHaveTextContent('Names what is still uncertain.')
    const action = within(next).getByTestId('next-action')
    expect(within(action).getByRole('link', { name: 'Find the missing fact' })).toHaveAttribute('href', `/app/development/missions/${M01.id}`)
    expect(screen.getByRole('link', { name: 'Back to history' })).toHaveAttribute('href', '/app/assessments?tab=history')
    expect(document.body.textContent).not.toMatch(/congrat|well done|streak|badge|!|level\s*\d|\d+\s*%/i)
    await userEvent.click(within(action).getByRole('button', { name: 'Try a fresh challenge for this capability' }))
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/development/challenge'))?.body).toEqual({ capabilityId: 'CAP-L1-REASONING' }))
    // The player navigates to the new attempt in the same route; the mission query for M01 is then requested.
    await waitFor(() => expect(calls.some((c) => c.url.endsWith(`/missions/${M01.id}`))).toBe(true))
  })
})

// ── P6.1 / P6.5 / P6.6: catalogue card facts and goal filter; focus feedback, examples on request, comparison, copied text ──
describe('P6 practice catalogue and player', () => {
  const rich = (c, over = {}) => ({ ...c, availability: c.status === 'PUBLISHED' ? 'REVIEWED' : 'DRAFT', behaviourIds: ['QUESTION_ASSUMPTION', 'STATE_UNCERTAINTY'], situation: 'Dev has booked Room 2 and asks you to confirm.', untimed: true, mode: { input: 'TEXT', language: 'en', label: 'Text, English' }, hasTransfer: true, estimatedMinutes: 10, ...over })
  it('cards state target behaviour, situation, untimed minutes, mode and availability; "Choose a different goal" filters by family; a bounded allowance is exact', async () => {
    renderStudent('/app/development', <DevelopmentPage />, {
      '/api/v1/me/development-plan': planWith({ catalogue: [rich(published, { situation: 'A test budget is available.', behaviourIds: ['TESTABLE_HYPOTHESIS'], hasTransfer: false }), rich(M01), rich(M04, { targetCapabilityName: 'Getting your point across' }), rich(M02)], allowance: { kind: 'BOUNDED', total: 4, used: 1, remaining: 3, validUntil: null } }),
      '/api/v1/me/growth': growthNone,
    })
    const m01 = (await screen.findAllByRole('article')).find((a) => within(a).queryByText('Find the missing fact'))
    expect(within(m01).getByTestId('card-target')).toHaveTextContent('Making decisions · question assumption, state uncertainty')
    expect(within(m01).getByTestId('card-situation')).toHaveTextContent('Dev has booked Room 2 and asks you to confirm.')
    expect(within(m01).getByTestId('card-facts')).toHaveTextContent('About 10 minutes, untimed · Text, English · Has an unfamiliar-setting version')
    expect(within(m01).getByTestId('draft-label')).toHaveTextContent('Draft content')
    expect(within(m01).getByRole('link', { name: /^Open mission/ })).toHaveAttribute('href', `/app/development/missions/${M01.id}`)
    const pub = screen.getAllByRole('article').find((a) => within(a).queryByText(published.title))
    expect(within(pub).getByTestId('reviewed-label')).toHaveTextContent('Reviewed')
    expect(screen.getByTestId('practice-allowance')).toHaveTextContent('3 of 4 practice attempts remaining')
    // Choose a different goal: only that family's missions remain; nothing is inferred from the choice.
    expect(screen.getAllByTestId('family-group')).toHaveLength(3)
    await userEvent.selectOptions(screen.getByLabelText('Choose a different goal'), 'CAP-L1-COMMUNICATION')
    await waitFor(() => expect(screen.getAllByTestId('family-group')).toHaveLength(1))
    expect(screen.getByText('Hand over an unfinished plan to a colleague')).toBeInTheDocument()
    expect(screen.queryByText('Find the missing fact')).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Choose a different goal'), '')
    await waitFor(() => expect(screen.getAllByTestId('family-group')).toHaveLength(3))
    expect(document.body.textContent).not.toMatch(/deficit|weak|\d+\s*%|level\s*\d/i)
  })

  const m01View = { ...mission, mission: { ...mission.mission, id: M01.id, title: M01.title, displayCode: 'M01', status: 'DRAFT', availability: 'DRAFT', targetCapability: { id: 'CAP-L1-REASONING', name: 'Making decisions' }, scenario: { setting: 'Dev asks you to confirm Room 2.', objective: 'Reply to Dev.' }, situationFacts: ['Room 2 seats twelve.', 'Nobody has said how many are coming.'], whatIsChecked: [{ criterionId: 'C-ASKS', description: 'Asks Dev a question.' }, { criterionId: 'C-NAMES-UNKNOWN', description: 'Says the headcount is unknown.' }], hintCount: 3, examplesAvailable: 2, estimatedMinutes: 10, untimed: true, mode: { input: 'TEXT', language: 'en', label: 'Text, English' } }, allowance: { kind: 'BOUNDED', total: 4, used: 1, remaining: 3, validUntil: null } }
  const focusResult = {
    status: 'EVALUATED', verified: true, summary: 'Mission completed — 1 of 2 target behaviours demonstrated.', counts: { demonstrated: 1, uncertain: 0, total: 2, copied: 0 },
    focus: { version: 'mission-feedback.v1', completed: { criterionId: 'C-ASKS', description: 'Asks Dev a question.', quote: 'could you tell me how many people are coming?', source: 'AUTOMATIC_CHECK' }, nextChange: { criterionId: 'C-NAMES-UNKNOWN', description: 'Says the headcount is unknown.', because: 'Not shown in this attempt.', yourWords: 'Confirmed, see you Tuesday.' }, allMet: false, reviewIncomplete: false, note: null },
    comparison: null,
    counterpart: { name: 'Dev', role: 'Colleague', lines: [{ criterionId: 'C-ASKS', when: 'OBSERVED', text: 'Fair question — I will find out how many are coming.' }, { criterionId: 'C-NAMES-UNKNOWN', when: 'NOT_OBSERVED', text: 'Which number do you actually need from me?' }], closing: null, note: 'This reply is written from what your message did and did not do in this attempt. It is practice, not a judgement of you.' },
    criteria: [
      { criterionId: 'C-ASKS', description: 'Asks Dev a question.', result: 'OBSERVED', reason: 'RULES_PASSED', quote: null, checks: [{ description: 'The reply asks Dev a question.', passed: true }], note: 'Shown in this attempt.' },
      { criterionId: 'C-NAMES-UNKNOWN', description: 'Says the headcount is unknown.', result: 'NOT_OBSERVED', reason: 'MEANING_NOT_EXPRESSED', quote: null, checks: [], note: 'Not shown yet in this attempt.' },
    ],
  }
  const examples = [
    { id: 'EX-ASK', kind: 'EXAMPLE', criterionIds: ['C-ASKS'], text: 'Before I confirm Room 2, can you tell me how many people are coming?', note: 'Asks for the one fact that decides the room.' },
    { id: 'CX-CONFIRM', kind: 'COUNTEREXAMPLE', criterionIds: ['C-HOLDS'], text: 'Confirmed, Room 2 is booked for Tuesday.', note: 'Confirms a fact nobody has.' },
  ]
  it('first view shows target, scene, what to do, duration (untimed) and the exact allowance with checks folded away; feedback leads with one observation, its source and one next change; examples open only on request and are recorded', async () => {
    const started = attempt({ missionId: M01.id, work: { HYPOTHESIS: { text: '' } }, hintsRemaining: 3, variant: 'BASE', scene: { setting: 'Dev asks you to confirm Room 2.', objective: 'Reply to Dev.', constraints: [], situationFacts: ['Room 2 seats twelve.'] }, examples: [], examplesAvailable: 2, assistance: { mode: 'GUIDED', hintsUsed: 0, scaffoldRequested: false }, provenance: { hintsExposed: [], examplesExposed: [], coachedRevision: false, retryOrigin: { kind: 'FIRST', previousAttemptId: null }, feedbackVersion: null, evaluatorVersion: null } })
    let current = null
    const { calls } = renderStudent('/app/development/missions/:missionId', <MissionPlayerPage />, {
      [`/api/v1/missions/${M01.id}`]: () => jsonResponse(200, { data: m01View }),
      [`POST /api/v1/missions/${M01.id}/attempts`]: () => { current = started; return jsonResponse(201, { data: current }) },
      [`POST /api/v1/mission-attempts/${ATT}/submit`]: () => { current = { ...current, status: 'EVALUATED', version: 3, result: focusResult, submittedAt: '2026-10-10T09:00:00Z' }; return jsonResponse(201, { data: current }) },
      [`POST /api/v1/mission-attempts/${ATT}/examples`]: () => { current = { ...current, version: current.version + 1, examples, provenance: { ...current.provenance, examplesExposed: examples.map((e) => e.id) } }; return jsonResponse(200, { data: current }) },
      [`/api/v1/mission-attempts/${ATT}`]: () => jsonResponse(200, { data: current }),
      '/api/v1/me/development-plan': planWith(),
      '/api/v1/me/growth': growthNone,
    }, { route: `/app/development/missions/${M01.id}` })
    // First view, before any attempt.
    const facts = await screen.findByTestId('first-view-facts')
    expect(facts).toHaveTextContent('Focus: Making decisions')
    expect(facts).toHaveTextContent('About 10 minutes, untimed')
    expect(facts).toHaveTextContent('Text, English')
    expect(screen.getByTestId('first-view-allowance')).toHaveTextContent('3 of 4 practice attempts remaining')
    expect(screen.getByTestId('scene-setting')).toHaveTextContent('Dev asks you to confirm Room 2.')
    expect(screen.getByText('What to do')).toBeInTheDocument()
    expect(screen.getByText('Room 2 seats twelve.')).toBeInTheDocument()
    const checks = screen.getByTestId('what-is-checked')
    expect(checks.tagName).toBe('DETAILS')
    expect(checks.open).toBe(false)
    expect(screen.queryByTestId('examples-action')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/time limit|proctor|camera|seconds left/i)
    // Attempt: examples are offered only on explicit request, and not shown until asked.
    await userEvent.click(screen.getByRole('button', { name: 'Start mission' }))
    expect(await screen.findByTestId('examples-action')).toBeInTheDocument()
    expect(screen.queryByTestId('examples-drawer')).not.toBeInTheDocument()
    expect(calls.some((c) => c.url.endsWith('/examples'))).toBe(false)
    // Submit → feedback focus.
    await userEvent.click(screen.getByRole('button', { name: 'Submit for feedback' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Submit this attempt?' })).getByRole('button', { name: 'Submit' }))
    const focus = await screen.findByTestId('feedback-focus')
    const observed = within(focus).getByTestId('focus-observed')
    expect(observed).toHaveTextContent('One thing you did')
    expect(observed).toHaveTextContent('Asks Dev a question.')
    expect(observed).toHaveTextContent('Your words: “could you tell me how many people are coming?”')
    expect(observed).toHaveTextContent('Source: an automatic check of your work')
    const next = within(focus).getByTestId('focus-next')
    expect(next).toHaveTextContent('One thing to change next')
    expect(next).toHaveTextContent('Says the headcount is unknown.')
    expect(next).toHaveTextContent('Not shown in this attempt.')
    // P6.8: the counterpart replies from the actual results, in criterion order.
    const counterpart = screen.getByTestId('feedback-counterpart')
    expect(counterpart).toHaveTextContent('Dev replies (Colleague)')
    const lines = within(counterpart).getAllByTestId('counterpart-line')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toHaveAttribute('data-when', 'OBSERVED')
    expect(lines[1]).toHaveTextContent('Which number do you actually need from me?')
    expect(counterpart).toHaveTextContent('It is practice, not a judgement of you.')
    expect(screen.getByTestId('all-checks').open).toBe(false)
    expect(screen.getAllByTestId('mission-criterion')).toHaveLength(2)
    expect(screen.queryByTestId('feedback-comparison')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    // Examples after feedback, on request: a drawer with examples and counterexamples, and the request is recorded server-side.
    await userEvent.click(screen.getByTestId('examples-action'))
    const drawer = await screen.findByTestId('examples-drawer')
    await waitFor(() => expect(within(drawer).getAllByTestId('example-item')).toHaveLength(2))
    expect(calls.filter((c) => c.url.endsWith('/examples') && c.method === 'POST')).toHaveLength(1)
    expect(within(drawer).getByText('Example')).toBeInTheDocument()
    expect(within(drawer).getByText('What not to do')).toBeInTheDocument()
    expect(drawer).toHaveTextContent('not counted as your own')
    expect(document.body.textContent).not.toMatch(/congrat|well done|\d+\s*%|level\s*\d|percentile/i)
  })

  it('a retry shows the criterion comparison (ids only, no percentage) and labels copied example text honestly without praising it', async () => {
    const retryResult = {
      ...focusResult,
      summary: '0 of 2 target behaviours demonstrated so far; 0 could not be checked reliably this time. 1 check matches an example or hint you were shown and is not counted as your own.',
      counts: { demonstrated: 0, uncertain: 0, total: 2, copied: 1 },
      focus: { version: 'mission-feedback.v1', completed: null, nextChange: { criterionId: 'C-ASKS', description: 'Asks Dev a question.', because: 'This matches the example you were shown, so it is not counted as your own.', yourWords: null }, allMet: false, reviewIncomplete: false, note: null },
      comparison: { previousAttemptId: ATT, newlyMet: ['C-NAMES-UNKNOWN'], noLongerMet: ['C-ASKS'], notCompared: [], note: 'Compared with your earlier attempt on the behaviours that could be checked in both. This is practice; it does not measure growth and it does not change any assessment.' },
      criteria: [
        { criterionId: 'C-ASKS', description: 'Asks Dev a question.', result: 'COPIED_ASSISTANCE', reason: 'COPIED_ASSISTANCE', quote: null, checks: [{ description: 'The reply asks Dev a question.', passed: true }], note: 'This matches the example you were shown, so it is not counted as your own.' },
        { criterionId: 'C-NAMES-UNKNOWN', description: 'Says the headcount is unknown.', result: 'OBSERVED', reason: 'MEANING_EXPRESSED', quote: 'I do not yet have a headcount for Tuesday', checks: [], note: 'Shown in this attempt.' },
      ],
    }
    renderStudent('/app/development/missions/:missionId', <MissionPlayerPage />, {
      [`/api/v1/missions/${M01.id}`]: { data: { ...m01View, openAttemptId: ATT_R } },
      [`/api/v1/mission-attempts/${ATT_R}`]: { data: attempt({ id: ATT_R, missionId: M01.id, status: 'EVALUATED', version: 3, result: retryResult, submittedAt: '2026-10-10T09:00:00Z', variant: 'BASE', examples: [], examplesAvailable: 2, assistance: { mode: 'GUIDED', hintsUsed: 0, scaffoldRequested: false }, provenance: { hintsExposed: [], examplesExposed: ['EX-ASK'], coachedRevision: true, retryOrigin: { kind: 'RETRY', previousAttemptId: ATT, reissued: false }, feedbackVersion: 'mission-feedback.v1', evaluatorVersion: 'mission_evaluator.v1' } }) },
      '/api/v1/me/development-plan': planWith(),
      '/api/v1/me/growth': growthNone,
    }, { route: `/app/development/missions/${M01.id}` })
    const cmp = await screen.findByTestId('feedback-comparison')
    expect(cmp).toHaveTextContent('Compared with your earlier attempt')
    expect(within(cmp).getByText('Shown now, not before').parentElement).toHaveTextContent('Says the headcount is unknown.')
    expect(within(cmp).getByText('Shown before, not now').parentElement).toHaveTextContent('Asks Dev a question.')
    expect(cmp).toHaveTextContent('does not measure growth')
    expect(cmp.textContent).not.toMatch(/\d+\s*%|improv/i)
    const focus = screen.getByTestId('feedback-focus')
    expect(within(focus).queryByTestId('focus-observed')).not.toBeInTheDocument()
    expect(within(focus).getByTestId('focus-next')).toHaveTextContent('This matches the example you were shown, so it is not counted as your own.')
    const copied = screen.getAllByTestId('mission-criterion').find((c) => c.dataset.result === 'COPIED_ASSISTANCE')
    expect(copied).toHaveTextContent('Matches an example')
    expect(copied).toHaveTextContent('not counted as your own')
    expect(copied).not.toHaveTextContent('Your words')
    expect(screen.getByTestId('mission-summary')).toHaveTextContent('not counted as your own')
  })

  it('a fresh challenge attempt shows the transfer scene (not the base scene) with the uncoached note and no examples action', async () => {
    const transfer = attempt({ id: ATT_C, missionId: M01.id, hints: [], hintsRemaining: 0, variant: 'TRANSFER', scene: { setting: 'Jo asks you to confirm the courier slot for Friday.', objective: 'Reply to Jo.', constraints: ['The van carries up to 20 kg.'], situationFacts: ['Nobody has weighed the boxes.'] }, examples: [], examplesAvailable: 0, assistance: { mode: 'UNCOACHED', hintsUsed: 0, scaffoldRequested: false } })
    renderStudent('/app/development/missions/:missionId', <MissionPlayerPage />, {
      [`/api/v1/missions/${M01.id}`]: { data: m01View },
      [`/api/v1/mission-attempts/${ATT_C}`]: { data: transfer },
    }, { route: `/app/development/missions/${M01.id}?attempt=${ATT_C}` })
    expect(await screen.findByTestId('transfer-note')).toHaveTextContent('A different setting for the same behaviours.')
    expect(screen.getByTestId('scene-setting')).toHaveTextContent('Jo asks you to confirm the courier slot for Friday.')
    expect(screen.getByTestId('scene-setting')).not.toHaveTextContent('Room 2')
    expect(screen.getByTestId('scene-objective')).toHaveTextContent('Reply to Jo.')
    expect(screen.getByText('Nobody has weighed the boxes.')).toBeInTheDocument()
    expect(screen.getByTestId('uncoached-note')).toHaveTextContent('setting you have not seen before')
    expect(screen.queryByTestId('examples-action')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Hints/ })).not.toBeInTheDocument()
  })
})

describe('Campus development (interventions)', () => {
  it('shows calendar days as the same day in every browser time zone', () => {
    const tz = process.env.TZ
    try {
      for (const zone of ['America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Kiritimati']) {
        process.env.TZ = zone
        expect(formatDate('2026-10-24')).toMatch(/\b24\b/)
      }
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
  })
  const adminWs = { id: 'ws-admin', type: 'CAMPUS_ADMIN', name: 'Synthetic University', organizationId: ORG, organizationName: 'Synthetic University', visibilityPolicy: 'OWNER_AND_SPONSOR', permissions: ['interventions.read', 'interventions.write', 'cohorts.read', 'org.overview.read'] }
  it('validates the builder, sends the chosen missions, and lists completion counts only', async () => {
    signIn()
    sessionStorage.setItem('prismActiveWorkspace', 'ws-admin')
    const created = { id: '66666666-6666-4666-8666-666666666666', name: 'Sprint', status: 'ACTIVE', cohortId: COHORT, cohortName: 'Commerce 2027', startsOn: '2026-10-10', endsOn: '2026-11-07', reassessmentPlanned: false, targetCapability: { id: 'CAP-MKT-EXPERIMENTATION', name: 'Experimentation' }, missions: [{ id: MID, title: card.title, completed: 0 }], counts: { members: 12, started: 0, completedAll: 0 } }
    let list = []
    const calls = routeFetch({
      '/api/v1/me': meBody({ flags, workspaces: [meBody().data.workspaces[0], adminWs] }),
      [`POST /api/v1/organizations/${ORG}/interventions`]: () => { list = [created]; return jsonResponse(201, { data: created }) },
      [`/api/v1/organizations/${ORG}/interventions`]: () => jsonResponse(200, { data: { items: list } }),
      [`/api/v1/organizations/${ORG}/practice-missions`]: { data: { missions: [{ id: MID, title: card.title, targetCapabilityId: card.targetCapabilityId, targetCapabilityName: 'Experimentation', estimatedMinutes: 20 }], capabilities: [{ id: 'CAP-MKT-EXPERIMENTATION', name: 'Experimentation' }] } },
      [`/api/v1/organizations/${ORG}/cohorts`]: { data: { items: [{ id: COHORT, name: 'Commerce 2027', status: 'ACTIVE', memberCount: 12 }] } },
    })
    renderApp(<Routes><Route path="/campus/:organizationId/development" element={<WorkspaceGuard type="CAMPUS_ADMIN"><CampusDevelopmentPage /></WorkspaceGuard>} /></Routes>, { route: `/campus/${ORG}/development` })
    expect(await screen.findByText('No interventions yet')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Create intervention' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Create an intervention' })
    await within(dialog).findByLabelText(card.title)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create intervention' }))
    expect(await within(dialog).findByText('Give the intervention a name.')).toBeInTheDocument()
    expect(within(dialog).getByText('Choose at least one mission.')).toBeInTheDocument()
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('textbox', { name: /^Name/ })))
    await userEvent.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'Sprint')
    await userEvent.selectOptions(within(dialog).getByLabelText(/Target capability/), 'CAP-MKT-EXPERIMENTATION')
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Cohort/), COHORT)
    await userEvent.click(within(dialog).getByLabelText(card.title))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create intervention' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    const body = calls.find((c) => c.method === 'POST').body
    expect(body).toMatchObject({ name: 'Sprint', targetCapabilityId: 'CAP-MKT-EXPERIMENTATION', cohortId: COHORT, missionIds: [MID], reassessmentPlanned: false })
    expect(await screen.findByText('0 of 12 finished all missions')).toBeInTheDocument()
    expect(screen.getByText(/Changes in formal results are shown only after a comparable reassessment/)).toBeInTheDocument()
  })
})
