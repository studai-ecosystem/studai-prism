// PROD-READY Phase 8 (campus P3 UX follow-ups): the mission player lists an
// attempt left unfinished when its intervention ended under "Earlier
// attempts" read-only (labelled, no resume), and offers a "Go to your work"
// jump link below lg so the Start button is reachable on small screens.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import DevelopmentPage from './pages/DevelopmentPage.jsx'
import MissionPlayerPage from './pages/MissionPlayerPage.jsx'

const MID = 'MIS-MKT-EXP-01'
const SUBMITTED = '55555555-5555-4555-8555-555555555555'
const CLOSED = '66666666-6666-4666-8666-666666666666'
const flags = { PRISM_APP_SHELL_V3: true, PRISM_DEVELOPMENT_V2: true }

const mission = {
  mission: {
    id: MID, version: 1, title: 'Design a clean A/B test for a new ad message', targetCapability: { id: 'CAP-MKT-EXPERIMENTATION', name: 'Experimentation' },
    scenario: { setting: 'A skincare brand has a test budget.', objective: 'Design a clean test.' },
    instructions: ['Write your hypothesis.'], constraints: ['The total budget is fixed.'],
    artifacts: [{ id: 'HYPOTHESIS', type: 'TEXT_RESPONSE', title: 'Hypothesis', prompt: 'What do you expect?', fields: null, columns: null, maxLength: 1500 }],
    whatIsChecked: [{ criterionId: 'C-HYPOTHESIS', description: 'States a testable hypothesis.' }],
    hintCount: 2, estimatedMinutes: 20, evidenceType: 'PRACTICE',
  },
  intervention: null,
  openAttemptId: null,
  pastAttempts: [
    { id: SUBMITTED, status: 'EVALUATED', summary: 'Attempt reviewed — 2 of 4 target behaviours demonstrated.', submittedAt: '2026-10-01T09:00:00Z' },
    // Left unfinished when its intervention ended: still IN_PROGRESS on the
    // server, but no longer the open attempt of this mission.
    { id: CLOSED, status: 'IN_PROGRESS', summary: null, submittedAt: null },
  ],
}

function renderStudent(path, element, routes, route) {
  signIn()
  const calls = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url)
    calls.push(u)
    const all = { ...routes, '/api/v1/me': meBody({ flags }) }
    for (const [prefix, body] of Object.entries(all)) if (u.startsWith(prefix)) return jsonResponse(200, body)
    throw new Error(`unexpected fetch ${u}`)
  })
  renderApp(<Routes><Route path={path} element={element} /></Routes>, { route })
  return calls
}

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear() })

describe('Mission player: earlier attempts', () => {
  it('lists an unfinished attempt closed with its intervention read-only, next to submitted ones, and never resumes it', async () => {
    const calls = renderStudent('/app/development/missions/:missionId', <MissionPlayerPage />, { [`/api/v1/missions/${MID}`]: { data: mission } }, `/app/development/missions/${MID}`)
    expect(await screen.findByRole('heading', { level: 3, name: 'Earlier attempts' })).toBeInTheDocument()
    const items = screen.getAllByTestId('earlier-attempt')
    expect(items).toHaveLength(2)
    const closed = items.find((i) => i.dataset.status === 'closed')
    const submitted = items.find((i) => i.dataset.status === 'submitted')
    expect(submitted).toHaveTextContent('Attempt reviewed — 2 of 4 target behaviours demonstrated.')
    expect(closed).toHaveTextContent('Not finished — closed')
    expect(closed).toHaveTextContent('can no longer be changed. Your work is kept.')
    // Read-only: no action inside the listing, and the closed attempt is never loaded as the current one.
    expect(within(closed).queryByRole('button')).not.toBeInTheDocument()
    expect(within(closed).queryByRole('link')).not.toBeInTheDocument()
    expect(calls.some((u) => u.includes(`/mission-attempts/${CLOSED}`))).toBe(false)
    expect(screen.getByRole('button', { name: 'Start a new attempt' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Hypothesis')).not.toBeInTheDocument()
  })

  it('never lists the open attempt as an earlier attempt', async () => {
    const open = { ...mission, openAttemptId: CLOSED }
    renderStudent('/app/development/missions/:missionId', <MissionPlayerPage />, {
      [`/api/v1/missions/${MID}`]: { data: open },
      [`/api/v1/mission-attempts/${CLOSED}`]: { data: { id: CLOSED, missionId: MID, missionVersion: 1, status: 'IN_PROGRESS', version: 1, work: { HYPOTHESIS: { text: '' } }, hints: [], hintsRemaining: 2, result: null, submittedAt: null, evidenceType: 'PRACTICE' } },
    }, `/app/development/missions/${MID}`)
    expect(await screen.findByLabelText('Hypothesis')).toBeEnabled()
    expect(screen.getAllByTestId('earlier-attempt').map((i) => i.dataset.status)).toEqual(['submitted'])
  })
})

describe('Mission player: "Go to your work" jump link', () => {
  it('sits near the top, is hidden from lg up, and moves focus to the work area with the Start button', async () => {
    renderStudent('/app/development/missions/:missionId', <MissionPlayerPage />, { [`/api/v1/missions/${MID}`]: { data: { ...mission, pastAttempts: [] } } }, `/app/development/missions/${MID}`)
    const link = await screen.findByRole('link', { name: 'Go to your work' })
    expect(link).toHaveAttribute('href', '#mission-work-title')
    expect(link.className).toMatch(/lg:hidden/)
    // Before the scene: the link precedes the "Scene" panel and the Start button in document order.
    const start = screen.getByRole('button', { name: 'Start mission' })
    const scene = screen.getByTestId('scene-setting')
    expect(link.compareDocumentPosition(scene) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(link.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.click(link)
    expect(screen.getByRole('heading', { level: 2, name: 'Your work' })).toHaveFocus()
  })
})

describe('Development page: practice attempts', () => {
  it('labels an attempt that was not finished as closed, read-only', async () => {
    renderStudent('/app/development', <DevelopmentPage />, {
      '/api/v1/me/development-plan': { data: {
        status: 'NO_PLAN', priorities: [], missions: [], catalogue: [], missionsAvailable: false, missionsEnabled: true, upcomingReassessment: null, practiceEvidence: [],
        completedMissions: [
          { attemptId: SUBMITTED, missionId: MID, title: 'Design a clean A/B test', status: 'EVALUATED', summary: 'Attempt reviewed — 2 of 4 target behaviours demonstrated.', submittedAt: '2026-10-01T09:00:00Z' },
          { attemptId: CLOSED, missionId: MID, title: 'Design a clean A/B test', status: 'IN_PROGRESS', summary: null, submittedAt: null },
        ],
      } },
      '/api/v1/me/growth': { data: { reassessments: [] } },
    }, '/app/development')
    const closed = await screen.findByTestId('closed-attempt')
    expect(closed).toHaveTextContent('Not finished — closed')
    expect(screen.getByText('Attempt reviewed — 2 of 4 target behaviours demonstrated.')).toBeInTheDocument()
    expect(within(closed.closest('li')).queryByRole('button')).not.toBeInTheDocument()
    expect(within(closed.closest('li')).queryByRole('link')).not.toBeInTheDocument()
  })
})
