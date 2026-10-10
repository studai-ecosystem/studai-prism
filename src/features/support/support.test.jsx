// PROD-READY Phase 4 — UI entry points for the V3 support routes: the free
// human review and the identity check on the V3 report page, the adjustment
// request on the briefing page and in Settings. Every entry point is hidden
// unless the server flag PRISM_V3_SUPPORT_ROUTES is on (GET /api/v1/me), uses
// the central API client (Idempotency-Key on every mutation) and keeps to the
// copy ceiling.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import { studentRoutes, briefing, card } from '../../test/studentFixtures.js'
import StudentReportPage from '../reports/pages/StudentReportPage.jsx'
import BriefingPage from '../assessments/pages/BriefingPage.jsx'
import SettingsPage from '../settings/pages/SettingsPage.jsx'
import SystemCheckPage from '../assessments/pages/SystemCheckPage.jsx'
import { REVIEW_COPY, ACCOMMODATION_COPY, IDENTITY_COPY, SUPPORT_SETTINGS_COPY } from '../../lib/copy/support.js'
import * as copy from '../../lib/copy/support.js'

const SID = 'sess-report-0001'
// Minimal synthetic Report V3 (same contract as src/features/reports/reports.test.jsx).
function reportFixture() {
  const cap = (id, name, displayLabel) => ({ id, name, displayLabel, definition: null, layer: 'PRIMARY', status: 'INSUFFICIENT_EVIDENCE', statusReasons: ['BELOW_MINIMUM_EVIDENCE_UNITS'], level: null, levelDescriptor: null, summary: { claimId: null, text: 'There was not enough evidence in Synthetic Assessment to describe this.', status: 'INSUFFICIENT', evidenceIds: [] } })
  return {
    builderVersion: 'student-report.v3.0', sessionId: SID, disclosure: 'FULL',
    header: { candidateName: 'Synthetic Student', assessment: { definitionId: 'prism-workplace-core', title: 'Synthetic Assessment', formId: 'synthetic:1' }, scenarioTitle: 'Synthetic Scenario', sponsor: null, scope: 'PERSONAL', completedAt: '2026-10-02T10:00:00.000Z', verification: { identityAssurance: 'L1', credentialId: null } },
    summary: { capabilities: [cap('CAP-A', 'Synthetic Reasoning', 'Making decisions')], describedCount: 0, insufficientCount: 1 },
    plainStatement: null,
    displayLabels: [{ id: 'CAP-A', name: 'Synthetic Reasoning', displayLabel: 'Making decisions' }],
    moments: [], evidence: [], boundedObservations: [],
    development: { priorities: [], maxPriorities: 3 },
    methodology: { builderVersion: 'student-report.v3.0', sufficiencyRulesVersion: 'sufficiency-rules.v1-provisional', levelLabelsStatus: 'PROVISIONAL', catalogVersion: 'assessment-catalog.v1', assessmentDefinitionId: 'prism-workplace-core', formId: 'synthetic:1' },
    claims: [],
  }
}
const PERSONAL_WS = { id: 'personal', type: 'PERSONAL', name: 'Personal', organizationId: null, organizationName: null, visibilityPolicy: 'OWNER_ONLY' }

const reviewBody = (request = null, over = {}) => ({ data: { sessionId: SID, reportPublished: true, freeReview: { used: Boolean(request), available: !request }, request, turnaround: { targetBusinessDays: 7, guaranteed: false }, furtherReview: { offered: false }, ...over } })
const levels = [
  { level: 'L1', label: 'Level 1 — Self-declared', explanation: 'Self-declared.', available: true, how: 'SELF_DECLARATION' },
  { level: 'L2', label: 'Level 2 — Institution-verified', explanation: 'Institution.', available: false, how: 'INSTITUTION_RECORD', reason: 'NEEDS_AN_INSTITUTION' },
  { level: 'L3', label: 'Level 3 — Identity-verified', explanation: 'Document.', available: false, how: 'DOCUMENT_CHECK', reason: 'NOT_OFFERED' },
]
const identityBody = (recorded = false) => ({ data: { sessionId: SID, current: { level: 'L1', label: 'Level 1 — Self-declared', explanation: 'Identity is based on the candidate account.' }, selfDeclaration: { recorded, declaredAt: recorded ? '2026-10-10T10:00:00.000Z' : null, nameMatchesAccount: recorded ? true : null }, otherRecordOnFile: false, options: recorded ? levels.map((l) => ({ ...l, available: false })) : levels } })
const ownerReport = { data: { report: reportFixture(), version: { number: 1, createdAt: '2026-10-02T10:00:00.000Z' }, audience: 'OWNER', privacy: { visibility: 'OWNER_ONLY', activeShares: [], canShare: true }, review: { openRequests: 0, pending: false }, recommendations: [] } }

// A method-aware fetch router: `${METHOD} ${path}` or `${path}` (any method),
// longest prefix wins; handlers get (url, init).
function mockRoutes(routes) {
  const entries = Object.entries(routes).sort((a, b) => b[0].length - a[0].length)
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
    const path = new URL(String(url), 'http://test.local').pathname
    const method = (init.method || 'GET').toUpperCase()
    for (const [key, handler] of entries) {
      const [m, p] = key.includes(' ') ? key.split(' ') : [null, key]
      if ((m === null || m === method) && path.startsWith(p)) return typeof handler === 'function' ? handler(url, init) : jsonResponse(200, handler)
    }
    throw new Error(`unexpected fetch ${method} ${path}`)
  })
}

const flags = (on) => ({ PRISM_APP_SHELL_V3: true, PRISM_STUDENT_REPORT_V3: true, ...(on ? { PRISM_V3_SUPPORT_ROUTES: true } : {}) })
const supportCalls = (spy) => spy.mock.calls.filter(([u]) => /human-review|identity-check|accommodation|support-requests/.test(String(u)))

function renderReport({ on, routes = {} }) {
  signIn()
  const spy = mockRoutes({
    [`/api/v1/assessment-sessions/${SID}/report/versions`]: { data: { sessionId: SID, versions: [], reviews: [] } },
    [`/api/v1/assessment-sessions/${SID}/report`]: ownerReport,
    '/api/v1/me': meBody({ flags: flags(on), workspaces: [PERSONAL_WS] }),
    ...routes,
  })
  renderApp(<Routes><Route path="/app/reports/:sessionId" element={<StudentReportPage />} /></Routes>, { route: `/app/reports/${SID}` })
  return spy
}

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear() })

describe('V3 report page: human review and identity check', () => {
  it('shows no support entry point and calls no support route while the server flag is off', async () => {
    const spy = renderReport({ on: false })
    expect(await screen.findByTestId('report-header')).toBeInTheDocument()
    expect(screen.queryByTestId('human-review-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('identity-check-card')).not.toBeInTheDocument()
    expect(supportCalls(spy)).toEqual([])
  })

  it('requests the one free human review with an Idempotency-Key, then shows that a person is reviewing it', async () => {
    let state = null
    const spy = renderReport({
      on: true,
      routes: {
        [`GET /api/v1/assessment-sessions/${SID}/human-review`]: () => jsonResponse(200, reviewBody(state)),
        [`POST /api/v1/assessment-sessions/${SID}/human-review`]: () => {
          state = { id: 'r1', state: 'OPEN', version: 1, createdAt: '2026-10-10T10:00:00.000Z', outcome: null }
          return jsonResponse(201, reviewBody(state))
        },
        [`/api/v1/assessment-sessions/${SID}/identity-check`]: identityBody(),
      },
    })
    const cardEl = await screen.findByTestId('human-review-card')
    expect(cardEl).toHaveTextContent(REVIEW_COPY.title)
    expect(await screen.findByText(/This is a target, not a guarantee/)).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: REVIEW_COPY.submit }))
    expect(await screen.findByText('Write a few sentences so a person knows what to look at.')).toBeInTheDocument()
    await user.type(screen.getByLabelText(REVIEW_COPY.reasonLabel), 'The second moment was read differently from what I meant.')
    await user.click(screen.getByRole('button', { name: REVIEW_COPY.submit }))
    expect(await screen.findByTestId('human-review-open')).toHaveTextContent(REVIEW_COPY.open)
    const post = spy.mock.calls.find(([u, i]) => String(u).endsWith('/human-review') && i?.method === 'POST')
    expect(JSON.parse(post[1].body)).toEqual({ reason: 'The second moment was read differently from what I meant.' })
    expect(post[1].headers['Idempotency-Key']).toMatch(/^review-/)
  })

  it('after a decision shows the plain-language outcome, says the free review is used and offers nothing further', async () => {
    renderReport({
      on: true,
      routes: {
        [`/api/v1/assessment-sessions/${SID}/human-review`]: reviewBody({ id: 'r1', state: 'RESOLVED', version: 1, createdAt: '2026-10-08T10:00:00.000Z', outcome: { decision: 'CORRECT', decidedAt: '2026-10-09T10:00:00.000Z', explanation: 'A person reviewed your report and issued a corrected version. The original stays in your version history.', correctedVersion: 2 } }),
        [`/api/v1/assessment-sessions/${SID}/identity-check`]: identityBody(true),
      },
    })
    const resolved = await screen.findByTestId('human-review-resolved')
    expect(resolved).toHaveTextContent('issued a corrected version')
    expect(resolved).toHaveTextContent(REVIEW_COPY.correctedVersion(2))
    expect(resolved).toHaveTextContent(REVIEW_COPY.used)
    expect(resolved).toHaveTextContent('A further review is not offered in the app')
    expect(screen.queryByRole('button', { name: REVIEW_COPY.submit })).not.toBeInTheDocument()
    expect(await screen.findByText(/You confirmed your identity on/)).toBeInTheDocument()
  })

  it('identity check: shows the level and its meaning, Level 3 is not offered, and a Level 1 confirmation sends the name only', async () => {
    let recorded = false
    const spy = renderReport({
      on: true,
      routes: {
        [`/api/v1/assessment-sessions/${SID}/human-review`]: reviewBody(),
        [`GET /api/v1/assessment-sessions/${SID}/identity-check`]: () => jsonResponse(200, identityBody(recorded)),
        [`POST /api/v1/assessment-sessions/${SID}/identity-check`]: () => { recorded = true; return jsonResponse(201, identityBody(true)) },
      },
    })
    const cardEl = await screen.findByTestId('identity-check-card')
    expect(await screen.findByTestId('identity-level')).toHaveTextContent('Level 1 — Self-declared')
    expect(cardEl).toHaveTextContent(IDENTITY_COPY.levels.L3)
    expect(cardEl).toHaveTextContent(IDENTITY_COPY.levels.L2)
    expect(cardEl).not.toHaveTextContent(/Aadhaar|ID number field|upload/i)
    const user = userEvent.setup()
    const name = screen.getByLabelText(IDENTITY_COPY.declareLabel)
    expect(name).toHaveValue('Synthetic Student')
    await user.click(screen.getByRole('button', { name: IDENTITY_COPY.submit }))
    expect(await screen.findByText('Tick the box to confirm.')).toBeInTheDocument()
    await user.click(screen.getByLabelText(IDENTITY_COPY.confirm))
    await user.click(screen.getByRole('button', { name: IDENTITY_COPY.submit }))
    expect(await screen.findByText(/You confirmed your identity on/)).toBeInTheDocument()
    const post = spy.mock.calls.find(([u, i]) => String(u).endsWith('/identity-check') && i?.method === 'POST')
    expect(JSON.parse(post[1].body)).toEqual({ level: 'L1', declaredName: 'Synthetic Student', confirm: true })
    expect(post[1].headers['Idempotency-Key']).toMatch(/^identity-/)
  })
})

function renderBriefing({ on, accommodation }) {
  signIn()
  const spy = mockRoutes({
    '/api/v1/assessment-assignments/a-1': briefing({ assignment: { id: 'a-1' } }),
    ...accommodation,
    '/api/v1/me': meBody({ flags: flags(on), workspaces: [PERSONAL_WS] }),
  })
  renderApp(<Routes><Route path="/app/assessments/:assignmentId/briefing" element={<BriefingPage />} /></Routes>, { route: '/app/assessments/a-1/briefing' })
  return spy
}

describe('Briefing: adjustment requests before the start', () => {
  it('keeps the contact link and calls no support route while the flag is off', async () => {
    const spy = renderBriefing({ on: false })
    expect(await screen.findByRole('link', { name: 'Contact us about an adjustment' })).toBeInTheDocument()
    expect(screen.queryByTestId('adjustment-panel')).not.toBeInTheDocument()
    expect(supportCalls(spy)).toEqual([])
  })

  it('sends the request with an Idempotency-Key and shows that a person will decide before the start', async () => {
    let request = null
    const body = () => ({ data: { assignmentId: 'a-1', requestable: true, reason: null, request } })
    const spy = renderBriefing({
      on: true,
      accommodation: {
        'GET /api/v1/assessment-assignments/a-1/accommodation': () => jsonResponse(200, body()),
        'POST /api/v1/assessment-assignments/a-1/accommodation': (_u, init) => {
          request = { id: 'q1', status: 'REQUESTED', needs: JSON.parse(init.body).needs, modes: null, createdAt: '2026-10-10T10:00:00.000Z', updatedAt: '2026-10-10T10:00:00.000Z', decidedAt: null, linkedToSession: false }
          return jsonResponse(201, body())
        },
      },
    })
    expect(await screen.findByTestId('adjustment-panel')).toHaveTextContent('Adjustments never change how your answers are judged.')
    expect(screen.queryByRole('link', { name: 'Contact us about an adjustment' })).not.toBeInTheDocument()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(ACCOMMODATION_COPY.needsLabel), 'I need a text-only mode without the camera check.')
    await user.click(screen.getByRole('button', { name: ACCOMMODATION_COPY.submit }))
    expect(await screen.findByText(ACCOMMODATION_COPY.sent)).toBeInTheDocument()
    expect(screen.getByTestId('adjustment-status')).toHaveTextContent(ACCOMMODATION_COPY.status.REQUESTED)
    expect(screen.getByRole('button', { name: ACCOMMODATION_COPY.update })).toBeInTheDocument()
    const post = spy.mock.calls.find(([u, i]) => String(u).endsWith('/accommodation') && i?.method === 'POST')
    expect(JSON.parse(post[1].body)).toEqual({ needs: 'I need a text-only mode without the camera check.' })
    expect(post[1].headers['Idempotency-Key']).toMatch(/^adjustment-/)
  })

  it('after the start: shows the approved modes and no form; an undecided request is honestly reported as not applied', async () => {
    renderBriefing({
      on: true,
      accommodation: {
        '/api/v1/assessment-assignments/a-1/accommodation': { data: { assignmentId: 'a-1', requestable: false, reason: 'ALREADY_STARTED', request: { id: 'q1', status: 'APPROVED', needs: 'x'.repeat(12), modes: { textOnly: true, noCamera: true, reducedProctoring: false }, createdAt: '2026-10-08T10:00:00.000Z', updatedAt: null, decidedAt: '2026-10-09T10:00:00.000Z', linkedToSession: true } } },
      },
    })
    const status = await screen.findByTestId('adjustment-status')
    expect(status).toHaveTextContent('Approved')
    expect(status).toHaveTextContent(ACCOMMODATION_COPY.modes.textOnly)
    expect(status).toHaveTextContent(ACCOMMODATION_COPY.modes.noCamera)
    expect(status).not.toHaveTextContent(ACCOMMODATION_COPY.modes.reducedProctoring)
    expect(screen.queryByLabelText(ACCOMMODATION_COPY.needsLabel)).not.toBeInTheDocument()
  })

  it('refused after the start: the honest copy, no form', async () => {
    renderBriefing({ on: true, accommodation: { '/api/v1/assessment-assignments/a-1/accommodation': { data: { assignmentId: 'a-1', requestable: false, reason: 'ALREADY_STARTED', request: null } } } })
    expect(await screen.findByText(ACCOMMODATION_COPY.notRequestable.ALREADY_STARTED)).toBeInTheDocument()
    expect(screen.queryByLabelText(ACCOMMODATION_COPY.needsLabel)).not.toBeInTheDocument()
  })
})

function renderSettings({ on }) {
  signIn()
  const upcoming = card({ id: 'pa_00000000000000000000000000000009', title: 'Synthetic Assessment', status: 'NOT_STARTED' })
  const spy = mockRoutes({
    ...studentRoutes({ '/api/v1/me/assessments': { data: { active: [upcoming], completed: [], upcoming: [] } } }),
    '/api/v1/me/support-requests': { data: { humanReviews: [reviewBody({ id: 'r1', state: 'OPEN', version: 1, createdAt: '2026-10-08T10:00:00.000Z', outcome: null }).data], accommodations: [{ id: 'q1', assignmentId: upcoming.id, status: 'REQUESTED', needs: 'I need a text-only mode please.', modes: null, createdAt: '2026-10-08T10:00:00.000Z', updatedAt: null, decidedAt: null, linkedToSession: false }] } },
    [`/api/v1/assessment-assignments/${upcoming.id}/accommodation`]: { data: { assignmentId: upcoming.id, requestable: true, reason: null, request: null } },
    '/api/': {},
    '/api/v1/me': meBody({ flags: flags(on), workspaces: [PERSONAL_WS] }),
  })
  renderApp(<Routes><Route path="/app/settings" element={<SettingsPage />} /></Routes>, { route: '/app/settings' })
  return { spy, upcoming }
}

describe('Settings: assessment support', () => {
  it('is absent (no nav item, no request) while the flag is off', async () => {
    const { spy } = renderSettings({ on: false })
    expect(await screen.findByRole('heading', { name: 'Assessment preferences' })).toBeInTheDocument()
    expect(screen.queryByTestId('support-settings')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Assessment support' })).not.toBeInTheDocument()
    expect(supportCalls(spy)).toEqual([])
  })

  it('lists the learner\'s reviews and adjustment requests and offers a request for an assessment that has not started', async () => {
    const { upcoming } = renderSettings({ on: true })
    const section = await screen.findByTestId('support-settings')
    expect(section).toHaveTextContent(SUPPORT_SETTINGS_COPY.title)
    expect(screen.getByRole('link', { name: 'Assessment support' })).toHaveAttribute('href', '#support')
    expect(await screen.findByTestId('support-reviews')).toHaveTextContent('In review')
    expect(screen.getByRole('link', { name: SUPPORT_SETTINGS_COPY.openReport })).toHaveAttribute('href', `/app/reports/${SID}`)
    expect(await screen.findByTestId('support-adjustments')).toHaveTextContent('Synthetic Assessment')
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText(ACCOMMODATION_COPY.chooseAssessment), upcoming.id)
    expect(await screen.findByLabelText(ACCOMMODATION_COPY.needsLabel)).toBeInTheDocument()
    expect(section).toHaveTextContent(SUPPORT_SETTINGS_COPY.identityNote)
  })
})

describe('System check: an approved "no camera check" adjustment', () => {
  const proctored = briefing({ assignment: { id: 'a-1', integrityMode: 'PROCTORED' }, rest: { start: { allowed: true, reason: 'ALLOWED', to: null, mode: 'V3' } } })
  const approved = { data: { assignmentId: 'a-1', requestable: true, reason: null, request: { id: 'q1', status: 'APPROVED', needs: 'x'.repeat(12), modes: { textOnly: false, noCamera: true, reducedProctoring: false }, createdAt: '2026-10-08T10:00:00.000Z', updatedAt: null, decidedAt: '2026-10-09T10:00:00.000Z', linkedToSession: false } } }
  function renderCheck(on) {
    signIn()
    const spy = mockRoutes({
      '/api/v1/assessment-assignments/a-1': proctored,
      '/api/v1/assessment-assignments/a-1/accommodation': approved,
      '/api/health': { status: 'ok' },
      '/api/v1/me': meBody({ flags: flags(on), workspaces: [PERSONAL_WS] }),
    })
    renderApp(<Routes><Route path="/app/assessments/:assignmentId/system-check" element={<SystemCheckPage />} /></Routes>, { route: '/app/assessments/a-1/system-check' })
    return spy
  }
  it('keeps the camera check while the flag is off', async () => {
    const spy = renderCheck(false)
    expect(await screen.findByText('Camera')).toBeInTheDocument()
    expect(supportCalls(spy)).toEqual([])
  })
  it('drops the camera requirement when the adjustment was approved (flag on)', async () => {
    renderCheck(true)
    expect(await screen.findByText('Microphone')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Camera')).not.toBeInTheDocument())
  })
})

describe('support copy ceiling', () => {
  it('never claims selection, ranking, pass/fail, scores, percentages or a guaranteed deadline', () => {
    const text = JSON.stringify(copy, (_k, v) => (typeof v === 'function' ? v(7) : v))
    expect(text).not.toMatch(/\b(hire|hiring|rank|ranking|pass(ed)?|fail(ed)?|score[sd]?|percentile|cut-?off|predict)\b|%/i)
    expect(text).not.toMatch(/guaranteed (to|within)|will be fixed|will be corrected/i)
    expect(text).toMatch(/not a guarantee/)
    expect(text).toMatch(/never change how your answers are judged/)
  })
})
