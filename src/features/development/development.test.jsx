// C8.08–C8.09 — Development V2 UI over mocked /api/v1 responses: the plan
// lists recommended and catalogue missions with honest empty states; the
// mission player starts an attempt, autosaves with If-Match, submits after a
// confirmation and shows criterion feedback with no levels; retry starts a
// new attempt; the campus intervention builder validates and sends only what
// the form holds.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
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
