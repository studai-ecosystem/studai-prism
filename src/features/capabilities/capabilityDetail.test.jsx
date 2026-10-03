// P5.4 (CH-26, CH-27, T37, T38) — the capability detail page bound to its
// latest snapshot: meaning -> level with a SEPARATE evidence chip -> the
// learner's verified moments -> next behaviour -> reviewed practice or an
// honest none -> scope/method/limitation -> review. One state when nothing is
// publishable; technical vocabulary only under Details; no percentages.
import { describe, it, expect } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp, mockFetch, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import { studentRoutes, capabilityDetail, detailMoment, recommendation } from '../../test/studentFixtures.js'
import CapabilityDetailPage from './pages/CapabilityDetailPage.jsx'

const PERSONAL_WS = { id: 'personal', type: 'PERSONAL', name: 'Personal', organizationId: null, organizationName: null, visibilityPolicy: 'OWNER_ONLY' }
const path = '/app/capabilities/:capabilityId'
const DETAIL = '/api/v1/me/capabilities/CAP-L1-REASONING'

function render(detail, { route = '/app/capabilities/CAP-L1-REASONING', extra = {} } = {}) {
  signIn()
  const spy = mockFetch({ ...studentRoutes({ [DETAIL]: detail, ...extra }), '/api/v1/me': meBody({ flags: { PRISM_APP_SHELL_V3: true, PRISM_STUDENT_REPORT_V3: true }, workspaces: [PERSONAL_WS] }) })
  return { spy, ...renderApp(<Routes><Route path={path} element={<CapabilityDetailPage />} /></Routes>, { route }) }
}
const noPercent = () => expect(document.body.textContent).not.toMatch(/\d\s*%/)
const headings = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

describe('Capability detail (P5.4)', () => {
  it('described: sections in order, level and evidence state as separate chips, verified moment, next behaviour, reachable practice, scope and method; database words only under Details', async () => {
    render(capabilityDetail())
    expect(await screen.findByRole('heading', { level: 1, name: 'Making decisions' })).toBeInTheDocument()
    const detail = await screen.findByTestId('capability-detail')
    expect(detail).toHaveAttribute('data-state', 'DESCRIBED')
    const order = headings()
    const idx = (name) => order.findIndex((h) => h.startsWith(name))
    expect(idx('What this means')).toBeLessThan(idx('What the evidence supports'))
    expect(idx('What the evidence supports')).toBeLessThan(idx('What you did'))
    expect(idx('What you did')).toBeLessThan(idx('A next behaviour'))
    expect(idx('A next behaviour')).toBeLessThan(idx('Practice'))
    expect(idx('Practice')).toBeLessThan(idx('Scope and limits'))
    expect(within(detail).getByText(/Observed in Prism Workplace Simulation, completed/)).toBeInTheDocument()
    const level = within(detail).getByTestId('capability-level-row')
    expect(within(level).getByText('Developing (provisional)')).toBeInTheDocument()
    expect(within(level).getByText('Provisional')).toBeInTheDocument()
    expect(within(level).queryByText(/PROVISIONAL/)).not.toBeInTheDocument()
    const moment = within(detail).getByTestId('report-moment')
    expect(within(moment).getByText(/I would first separate the complaint data/)).toBeInTheDocument()
    expect(within(moment).getByText('Your words')).toBeInTheDocument()
    expect(within(moment).getByText(/Priya \(Coordinating colleague\)/)).toBeInTheDocument()
    expect(within(detail).getByTestId('capability-next-behaviour')).toHaveTextContent('States what is uncertain before deciding.')
    expect(within(detail).getByText(/Why it matters:/)).toBeInTheDocument()
    const practice = within(detail).getByTestId('practice-recommendation')
    expect(practice).toHaveAttribute('data-availability', 'AVAILABLE')
    expect(within(practice).getByText('Practice mission')).toBeInTheDocument()
    expect(within(practice).getByText('Find the missing fact')).toBeInTheDocument()
    expect(within(practice).getByText('About 10 minutes')).toBeInTheDocument()
    expect(within(practice).getByText('No limit on practice activities')).toBeInTheDocument()
    expect(within(practice).getByRole('link', { name: /^Practise this/ })).toHaveAttribute('href', '/app/development/missions/MIS-CORE-MISSING-FACT-01')
    expect(within(detail).getByText(/Prism Workplace Simulation, .* · Personal assessment/)).toBeInTheDocument()
    expect(within(detail).getByTestId('capability-limitation')).toHaveTextContent(/observed in Prism Workplace Simulation only/)
    // Technical provenance is available, but only once Details is opened.
    const details = within(detail).getByTestId('capability-details')
    expect(details).not.toHaveAttribute('open')
    expect(details.textContent).toMatch(/CAP-L1-REASONING|student-report\.v3\.1|RULES_NOT_APPROVED|rules not approved/i)
    expect(within(detail).queryByText('NO_EVIDENCE')).not.toBeInTheDocument()
    expect(within(detail).getByRole('button', { name: 'Ask for a review' })).toBeInTheDocument()
    expect(within(detail).getByRole('link', { name: 'Open the full report' })).toHaveAttribute('href', '/app/reports/sess-1')
    // One assessment: the history timeline would only repeat the state above.
    expect(screen.queryByTestId('evidence-timeline')).not.toBeInTheDocument()
    noPercent()
  })

  it('two assessments show the evidence timeline once, below the current snapshot', async () => {
    const base = capabilityDetail().data
    render(capabilityDetail({ history: [...base.history, { sessionId: 'sess-0', assessmentTitle: 'Prism Workplace Simulation', completedAt: '2026-06-01T10:00:00.000Z', status: 'INSUFFICIENT_EVIDENCE', level: null }] }))
    await screen.findByTestId('capability-detail')
    expect(screen.getByTestId('evidence-timeline')).toHaveTextContent('Developing (provisional)')
    expect(screen.getByText('1 earlier assessment measured this')).toBeInTheDocument()
  })

  it('bounded-only: one moment, no level, ONE plain state and a next behaviour; no reviewed practice is said honestly', async () => {
    render(capabilityDetail({
      state: 'BOUNDED_ONLY', status: 'INSUFFICIENT_EVIDENCE', statusReasons: ['BELOW_MINIMUM_EVIDENCE_UNITS'], level: null, levelDescriptor: null, moments: [],
      boundedObservation: { id: 'u9', capability: { id: 'CAP-L1-REASONING', name: 'Reasoning & Decision Quality' }, observedBehavior: 'Asked who owned the two unassigned tasks.', quote: 'who owns the two tasks', source: { turn: 2, artifactId: null, opportunityId: 'OPP-CLARIFY' }, rubricAnchor: { criteria: 'Names the gap.' }, nextBehavior: 'Confirms the owner in writing.', limitation: 'One moment was observed in Prism Workplace Simulation. That is not enough to describe Reasoning & Decision Quality as a whole; sufficiency reasons: BELOW_MINIMUM_EVIDENCE_UNITS.', provenance: { evidenceId: 'u9', source: 'CONVERSATION', turn: 2, artifactId: null, rubricVersion: 'rubric.v1', reviewedBy: 'AI', legacy: false } },
      nextBehavior: 'Confirms the owner in writing.',
      recommendation: recommendation({ availability: 'NO_REVIEWED_PRACTICE', mission: null, behaviourIds: ['ASSIGN_RESPONSIBILITY'], nextBehavior: 'Confirms the owner in writing.' }),
      evidenceSummary: { text: 'There was not enough evidence in Prism Workplace Simulation to describe this.', status: 'INSUFFICIENT', evidenceIds: [] },
      limitation: 'One moment was observed in Prism Workplace Simulation. That is not enough to describe Reasoning & Decision Quality as a whole; sufficiency reasons: BELOW_MINIMUM_EVIDENCE_UNITS.',
    }))
    const detail = await screen.findByTestId('capability-detail')
    expect(detail).toHaveAttribute('data-state', 'BOUNDED_ONLY')
    const single = within(detail).getByTestId('capability-single-state')
    expect(within(single).getByText('One moment observed, not a level')).toBeInTheDocument()
    expect(within(detail).queryByTestId('capability-level-row')).not.toBeInTheDocument()
    expect(within(detail).queryByText('Insufficient evidence')).not.toBeInTheDocument()
    expect(within(detail).queryByText('Not enough evidence')).not.toBeInTheDocument()
    const moment = within(detail).getByTestId('report-moment')
    expect(within(moment).getByText(/who owns the two tasks/)).toBeInTheDocument()
    expect(within(moment).getByText(/One observed moment, not a level/)).toBeInTheDocument()
    expect(within(detail).getByTestId('capability-next-behaviour')).toHaveTextContent('Confirms the owner in writing.')
    expect(within(detail).getByTestId('practice-unavailable')).toHaveTextContent('No reviewed practice is available yet for this.')
    expect(within(detail).queryByText(/MIS-MKT|Marketing experiment/)).not.toBeInTheDocument()
    expect(detail.querySelector('.bg-prism-blocked, .text-prism-blocked')).toBeNull()
    noPercent()
  })

  it('insufficient: exactly one neutral state with its reason and a next action, no duplicate badge, no invented deficit or practice', async () => {
    render(capabilityDetail({
      state: 'INSUFFICIENT', status: 'INSUFFICIENT_EVIDENCE', statusReasons: ['NO_EVIDENCE'], level: null, levelDescriptor: null, moments: [], evidence: [], nextBehavior: null, recommendation: null, developmentPriority: false,
      evidenceSummary: { text: 'No evidence for this was recorded in Prism Workplace Simulation, so it is not described.', status: 'INSUFFICIENT', evidenceIds: [] },
      limitation: 'No evidence for this was recorded in Prism Workplace Simulation, so it is not described.',
    }))
    const detail = await screen.findByTestId('capability-detail')
    expect(detail).toHaveAttribute('data-state', 'INSUFFICIENT')
    expect(within(detail).getAllByText(/Not enough evidence yet/)).toHaveLength(1)
    expect(within(detail).queryByText('Insufficient evidence')).not.toBeInTheDocument()
    expect(within(detail).queryByText('Not enough evidence', { exact: true })).not.toBeInTheDocument()
    expect(within(detail).queryByRole('heading', { name: 'A next behaviour' })).not.toBeInTheDocument()
    expect(within(detail).queryByRole('heading', { name: 'Practice' })).not.toBeInTheDocument()
    expect(within(detail).getByText(/a statement about the evidence, not about you/)).toBeInTheDocument()
    expect(within(detail).getByRole('button', { name: 'Ask for a review' })).toBeInTheDocument()
    expect(detail.querySelector('.bg-prism-blocked, .text-prism-blocked')).toBeNull()
    // Database vocabulary stays under Details.
    expect(within(detail).queryByText('NO_EVIDENCE')).not.toBeInTheDocument()
    expect(within(detail).getByTestId('capability-details').textContent).toContain('INSUFFICIENT_EVIDENCE')
    noPercent()
  })

  it('under review: the held state, no level, no moments, and the pending chip when a review is open', async () => {
    render(capabilityDetail({
      state: 'UNDER_REVIEW', status: 'HUMAN_REVIEW_REQUIRED', statusReasons: ['JUDGE_DISAGREEMENT'], level: null, levelDescriptor: null, moments: [], evidence: [], nextBehavior: null, recommendation: null,
      review: { openRequests: 1, pending: true },
      evidenceSummary: { text: 'A person is reviewing the evidence for this before it is described.', status: 'INSUFFICIENT', evidenceIds: [] },
      limitation: 'A person is reviewing the evidence for this before it is described.',
    }))
    const detail = await screen.findByTestId('capability-detail')
    expect(detail).toHaveAttribute('data-state', 'UNDER_REVIEW')
    expect(within(detail).getByText('Under review')).toBeInTheDocument()
    expect(within(detail).getByText(/An interpretation review is pending/)).toBeInTheDocument()
    expect(within(detail).queryByTestId('report-moment')).not.toBeInTheDocument()
    expect(within(detail).queryByRole('heading', { name: 'Practice' })).not.toBeInTheDocument()
    noPercent()
  })

  it('stretch: a strongly demonstrated capability offers optional practice, labelled as such, never a correction', async () => {
    render(capabilityDetail({
      state: 'STRETCH', status: 'SUFFICIENT', statusReasons: [], level: { band: 'STRONG', label: 'Strongly demonstrated' }, developmentPriority: false,
      moments: [detailMoment({ evidenceStatus: 'SUFFICIENT', nextBehavior: null })], nextBehavior: null,
      recommendation: recommendation({ kind: 'STRETCH', nextBehavior: null, mission: { ...recommendation().mission, title: 'Explain a decision to a new audience' } }),
    }))
    const detail = await screen.findByTestId('capability-detail')
    expect(detail).toHaveAttribute('data-state', 'STRETCH')
    const level = within(detail).getByTestId('capability-level-row')
    expect(within(level).getByText('Strongly demonstrated')).toBeInTheDocument()
    expect(within(level).getByText('Sufficient')).toBeInTheDocument()
    const practice = within(detail).getByTestId('practice-recommendation')
    expect(within(practice).getByRole('heading', { level: 3, name: 'Optional stretch practice' })).toBeInTheDocument()
    expect(within(practice).getByText(/Practice here is optional, not a correction/)).toBeInTheDocument()
    expect(within(detail).queryByRole('heading', { name: 'A next behaviour' })).not.toBeInTheDocument()
    expect(within(detail).queryByText('Development priority')).not.toBeInTheDocument()
    noPercent()
  })

  it('corrected snapshot and a bounded allowance are stated as facts; starting that consumes an activity says so', async () => {
    render(capabilityDetail({
      latestSnapshot: { ...capabilityDetail().data.latestSnapshot, version: 2, reason: 'REVIEW_CORRECTION', priorVersion: 1 },
      recommendation: recommendation({ availability: 'ALLOWANCE_EXHAUSTED', consumesActivity: true, allowance: { kind: 'BOUNDED', total: 3, used: 3, remaining: 0, validUntil: null } }),
    }))
    const detail = await screen.findByTestId('capability-detail')
    expect(within(detail).getByText(/2 · Corrected after a review/)).toBeInTheDocument()
    const practice = within(detail).getByTestId('practice-recommendation')
    expect(within(practice).getByText('0 of 3 practice activities left')).toBeInTheDocument()
    expect(within(practice).getByText(/Starting uses one practice activity/)).toBeInTheDocument()
    expect(within(practice).getByRole('status')).toHaveTextContent(/allowance is used up/)
    expect(within(practice).queryByRole('link', { name: /^Practise this/ })).not.toBeInTheDocument()
  })

  it('asking for a review opens the dialog scoped to this capability and posts to the snapshot session', async () => {
    const { spy } = render(capabilityDetail(), { extra: {
      '/api/v1/assessment-sessions/sess-1/report/review-request': () => jsonResponse(201, { data: { id: '33333333-3333-4333-8333-333333333333', sessionId: 'sess-1', version: 1, category: 'INTERPRETATION', momentId: 'u1', state: 'OPEN', createdAt: '2026-10-03T10:00:00.000Z' } }),
    } })
    await screen.findByTestId('capability-detail')
    await userEvent.click(screen.getByRole('button', { name: 'Ask for a review' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('review-capability-scope')).toHaveTextContent('About: Making decisions')
    await userEvent.selectOptions(within(dialog).getByLabelText('Which moment (optional)'), 'u1')
    await userEvent.type(within(dialog).getByLabelText(/What you would like reviewed/), 'The quoted words answered a different question than the one shown.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }))
    expect(await within(dialog).findByText('Your request has been recorded')).toBeInTheDocument()
    const post = spy.mock.calls.find(([url, o]) => String(url).includes('/review-request') && o?.method === 'POST')
    const body = JSON.parse(post[1].body)
    expect(body.momentId).toBe('u1')
    expect(body.reason).toMatch(/^\[Making decisions\] The quoted words/)
    expect(Object.keys(body).sort()).toEqual(['category', 'momentId', 'reason', 'version'])
  })

  it('not measured and unknown capabilities are honest states with a way back', async () => {
    render(capabilityDetail({ state: 'NOT_MEASURED', status: 'INSUFFICIENT_EVIDENCE', level: null, latestSnapshot: null, moments: [], evidence: [], nextBehavior: null, recommendation: null, history: [], evidenceSources: [], limitation: 'No completed assessment has measured this yet.' }))
    const detail = await screen.findByTestId('capability-detail')
    expect(within(detail).getByText('Not yet measured')).toBeInTheDocument()
    expect(within(detail).queryByRole('button', { name: 'Ask for a review' })).not.toBeInTheDocument()
    expect(within(detail).getByText('Not measured yet')).toBeInTheDocument()
    document.body.innerHTML = ''
    render(() => jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'req-404' } }), { route: '/app/capabilities/CAP-NOPE', extra: { '/api/v1/me/capabilities/CAP-NOPE': () => jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'req-404' } }) } })
    expect(await screen.findByText('This capability is not available')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to capabilities' })).toHaveAttribute('href', '/app/capabilities')
  })
})
