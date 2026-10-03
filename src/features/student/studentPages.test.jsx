// C4.04–C4.11, C4.13 — student pages in every state (loading, error,
// unauthorized, empty, data), scope labels, sponsored acknowledgement,
// practice-vs-formal distinction, telemetry allow-list and device checks.
import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp, mockFetch, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import { studentRoutes, home, card, briefing, describedCapabilities, growth, preferences } from '../../test/studentFixtures.js'
import HomePage from '../home/pages/HomePage.jsx'
import AssessmentsPage from '../assessments/pages/AssessmentsPage.jsx'
import BriefingPage from '../assessments/pages/BriefingPage.jsx'
import SystemCheckPage from '../assessments/pages/SystemCheckPage.jsx'
import CapabilitiesPage from '../capabilities/pages/CapabilitiesPage.jsx'
import AssessmentDetailPage from '../assessments/pages/AssessmentDetailPage.jsx'
import EvidencePage from '../evidence/pages/EvidencePage.jsx'
import GrowthPage from '../growth/pages/GrowthPage.jsx'
import DevelopmentPage from '../development/pages/DevelopmentPage.jsx'
import SharingPage from '../sharing/pages/SharingPage.jsx'
import SettingsPage from '../settings/pages/SettingsPage.jsx'
import ExplorePage from '../exploration/pages/ExplorePage.jsx'
import { applyPreferences } from '../settings/PreferencesEffect.jsx'
import { allowedProps, track, setTelemetrySender } from '../../lib/telemetry.js'
import { checkScreen, checkConnection, checkMediaSupport, summarise, testMicrophone } from '../../lib/deviceCheck.js'
import { SPONSORED_DISCLOSURE_VERSION } from '../../lib/copy/student.js'

const CAMPUS_WS = { id: '11111111-1111-4111-8111-111111111111', type: 'CAMPUS_STUDENT', name: 'Synthetic University', organizationId: '22222222-2222-4222-8222-222222222222', organizationName: 'Synthetic University', visibilityPolicy: 'OWNER_AND_SPONSOR', permissions: [] }
const PERSONAL_WS = { id: 'personal', type: 'PERSONAL', name: 'Personal', organizationId: null, organizationName: null, visibilityPolicy: 'OWNER_ONLY' }

function render(page, { path = '/p', route = '/p', routes = {}, campus = false } = {}) {
  signIn()
  if (campus) sessionStorage.setItem('prismActiveWorkspace', CAMPUS_WS.id)
  const spy = mockFetch({ ...studentRoutes(routes), '/api/v1/me': meBody({ flags: { PRISM_APP_SHELL_V3: true }, workspaces: [PERSONAL_WS, CAMPUS_WS] }) })
  const out = renderApp(<Routes><Route path={path} element={page} /></Routes>, { route })
  return { ...out, spy }
}

const error500 = () => jsonResponse(500, { error: { code: 'INTERNAL', message: 'x', requestId: 'req-500' } })
const forbidden = () => jsonResponse(403, { error: { code: 'FORBIDDEN', message: 'no', requestId: 'req-403' } })
const pending = () => new Promise(() => {})
const noPercent = () => expect(document.body.textContent).not.toMatch(/\d\s*%/)

const historyItem = (overrides = {}) => ({
  id: 'FORMAL_SESSION:sess-1', sourceType: 'FORMAL_SESSION', sourceId: 'sess-1', mode: 'FORMAL', title: 'Prism Workplace Simulation',
  startedAt: '2026-09-01T09:00:00.000Z', completedAt: '2026-09-01T10:00:00.000Z', issuedAt: '2026-09-01T10:00:00.000Z', scope: 'PERSONAL', sponsorOrganizationId: null,
  status: 'COMPLETED', reportFormat: 'V3', permittedAction: { kind: 'VIEW_REPORT', to: '/app/reports/sess-1' }, recoveryState: 'NONE', ...overrides,
})
const historyPage = (items) => ({ data: { items, nextCursor: null } })

describe('Student Home (§9, P3.3)', () => {
  it('recent activity shows the three newest owned records with stored dates and mode labels; the report is one click away', async () => {
    const items = [
      historyItem({ id: 'FORMAL_SESSION:older', sourceId: 'older', title: 'Synthetic older', completedAt: '2026-09-01T10:00:00.000Z', issuedAt: '2026-09-01T10:00:00.000Z', permittedAction: { kind: 'VIEW_REPORT', to: '/score?session=older' }, reportFormat: 'LEGACY_V2' }),
      historyItem({ id: 'PRACTICE_ATTEMPT:p-1', sourceType: 'PRACTICE_ATTEMPT', sourceId: 'p-1', mode: 'PRACTICE', title: 'Separate cause from symptom', completedAt: '2026-09-20T10:00:00.000Z', issuedAt: null, reportFormat: null, permittedAction: { kind: 'NONE', to: null } }),
      historyItem({ id: 'FORMAL_SESSION:latest', sourceId: 'latest', title: 'Synthetic latest', completedAt: '2026-10-01T10:00:00.000Z', issuedAt: '2026-10-01T10:00:00.000Z', permittedAction: { kind: 'VIEW_REPORT', to: '/app/reports/latest' } }),
      historyItem({ id: 'FORMAL_SESSION:oldest', sourceId: 'oldest', title: 'Synthetic oldest', completedAt: '2026-08-01T10:00:00.000Z', issuedAt: '2026-08-01T10:00:00.000Z' }),
    ]
    render(<HomePage />, { routes: { '/api/v1/me/history': historyPage(items), '/api/v1/me/home': home({ primaryAction: { kind: 'REPORT_READY', assignmentId: 'a-latest', title: 'Synthetic latest', scope: 'PERSONAL', dueAt: null, to: '/app/reports/latest' } }) } })
    const section = await screen.findByRole('region', { name: 'Recent activity' })
    const cards = await within(section).findAllByTestId('history-item')
    expect(cards.map((c) => c.getAttribute('data-mode'))).toEqual(['FORMAL', 'PRACTICE', 'FORMAL'])
    expect(within(cards[0]).getByRole('heading', { level: 3, name: 'Synthetic latest' })).toBeInTheDocument()
    expect(within(cards[0]).getByRole('link', { name: /^View report\s*:\s*Synthetic latest$/ })).toHaveAttribute('href', '/app/reports/latest')
    expect(within(cards[0]).getByText(/^Completed /)).toBeInTheDocument()
    expect(within(cards[1]).getByText('Practice')).toBeInTheDocument()
    expect(within(cards[1]).getByText(/^Submitted /)).toBeInTheDocument()
    expect(within(cards[2]).getByRole('link', { name: /^Original report\s*:\s*Synthetic older$/ })).toHaveAttribute('href', '/score?session=older')
    expect(within(section).queryByText('Synthetic oldest')).not.toBeInTheDocument()
    expect(within(section).getByRole('link', { name: 'View all history' })).toHaveAttribute('href', '/app/assessments?tab=history')
    // Report ready: the primary action opens the latest owned report.
    const next = screen.getByTestId('next-action')
    expect(next).toHaveAttribute('data-kind', 'REPORT_READY')
    expect(within(next).getByRole('link', { name: 'Open my report' })).toHaveAttribute('href', '/app/reports/latest')
    noPercent()
  })

  it('history failures stay explicit without pretending there is no activity', async () => {
    render(<HomePage />, { routes: { '/api/v1/me/history': error500 } })
    const section = await screen.findByRole('region', { name: 'Recent activity' })
    expect(await within(section).findByText('Reference: req-500', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(within(section).queryByText(/No assessments or practice/)).not.toBeInTheDocument()
  })

  it('missing owned history provides support rather than fabricating a report', async () => {
    render(<HomePage />, { routes: { '/api/v1/me/home': home({ primaryAction: { kind: 'CAPABILITY_SUMMARY', to: '/app/capabilities' } }) } })
    const section = await screen.findByRole('region', { name: 'Recent activity' })
    expect(await within(section).findByText(/No assessments or practice are linked/)).toBeInTheDocument()
    expect(within(section).getByRole('link', { name: 'contact support' })).toHaveAttribute('href', '/contact')
    expect(within(section).queryByRole('link', { name: /View report/ })).not.toBeInTheDocument()
  })

  it('a new learner (no history, no saved intent) first sees the skippable intent step; skipping shows the intention chooser', async () => {
    render(<HomePage />)
    const step = await screen.findByTestId('intent-step')
    expect(screen.queryByTestId('intent-chooser')).not.toBeInTheDocument()
    expect(screen.queryByTestId('next-action')).not.toBeInTheDocument()
    expect(within(step).getByText(/never used to measure you/)).toBeInTheDocument()
    expect(within(step).getByLabelText(/Speaking \(speech\)/)).toBeDisabled()
    expect(within(step).getByText(/Speech responses are not supported yet/)).toBeInTheDocument()
    await userEvent.click(within(step).getByRole('button', { name: 'Skip for now' }))
    const chooser = await screen.findByTestId('intent-chooser')
    expect(screen.queryByTestId('next-action')).not.toBeInTheDocument()
    expect(within(chooser).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Understand', 'Practise', 'Prepare'])
    expect(within(chooser).getByRole('link', { name: 'Take the assessment' })).toHaveAttribute('href', '/payment')
    expect(within(chooser).getByRole('link', { name: 'See practice missions' })).toHaveAttribute('href', '/app/development')
    expect(within(chooser).getByTestId('intent-practise')).toHaveTextContent('never changes your formal results')
    expect(within(within(chooser).getByTestId('intent-prepare')).queryByRole('link')).not.toBeInTheDocument()
    expect(within(chooser).getByTestId('intent-prepare')).toHaveTextContent('Not yet available')
    noPercent()
  })

  it('the intent step saves segment, intention and text response mode as display-only preferences and then shows the chooser', async () => {
    const { spy } = render(<HomePage />)
    const step = await screen.findByTestId('intent-step')
    await userEvent.click(within(step).getByLabelText('Student'))
    await userEvent.click(within(step).getByLabelText(/Practise what matters next/))
    await userEvent.click(within(step).getByRole('button', { name: 'Continue' }))
    await screen.findByTestId('intent-chooser')
    const put = spy.mock.calls.find(([url, init]) => String(url).includes('/api/v1/me/preferences') && init?.method === 'PUT')
    expect(JSON.parse(put[1].body)).toEqual({ reducedMotion: false, largerText: false, segment: 'STUDENT', intention: 'PRACTISE', responseMode: 'TEXT' })
  })

  it('P8.2: the intent step discloses supported vs not-yet-available modes and languages, needs no CV/grades/employer/photo/college, and sends the research choice and display name only when the learner sets them', async () => {
    const { spy } = render(<HomePage />)
    const step = await screen.findByTestId('intent-step')
    const support = within(step).getByTestId('intent-support')
    expect(support).toHaveTextContent('Typing (text): supported')
    expect(support).toHaveTextContent('Speaking (speech): not yet available')
    expect(support).toHaveTextContent('English: supported')
    expect(support).toHaveTextContent('No CV, grades, employer, photograph or college is needed')
    for (const forbidden of [/CV/i, /grades/i, /employer/i, /photo/i, /college/i]) {
      expect(within(step).queryByLabelText(forbidden)).not.toBeInTheDocument()
    }
    await userEvent.click(within(step).getByLabelText('Early career'))
    await userEvent.click(within(step).getByLabelText(/Understand how I work/))
    await userEvent.type(within(step).getByLabelText(/What should we call you/), 'Sam')
    const research = within(step).getByRole('checkbox', { name: /use my pseudonymous practice data for research/ })
    expect(research).not.toBeChecked()
    await userEvent.click(research)
    await userEvent.click(within(step).getByRole('button', { name: 'Continue' }))
    await screen.findByTestId('intent-chooser')
    const put = spy.mock.calls.find(([url, init]) => String(url).includes('/api/v1/me/preferences') && init?.method === 'PUT')
    expect(JSON.parse(put[1].body)).toEqual({ reducedMotion: false, largerText: false, segment: 'EARLY_CAREER', intention: 'UNDERSTAND', responseMode: 'TEXT', displayName: 'Sam', researchPermission: true })
    // The display name never travels to any assessment or practice endpoint.
    const scoringCalls = spy.mock.calls.filter(([url]) => /assessment-sessions|development|preparation|reports/.test(String(url)))
    for (const [, init] of scoringCalls) expect(String(init?.body || '')).not.toMatch(/Sam|displayName/)
  })

  it('a new learner with a saved intent goes straight to the chooser', async () => {
    render(<HomePage />, { routes: { '/api/v1/me/preferences': preferences({ segment: 'OTHER', intention: 'UNDERSTAND', responseMode: 'TEXT' }) } })
    await screen.findByTestId('intent-chooser')
    expect(screen.queryByTestId('intent-step')).not.toBeInTheDocument()
  })

  it('a learner with history but nothing active gets the single get-started action, not the chooser', async () => {
    render(<HomePage />, { routes: { '/api/v1/me/history': historyPage([historyItem({ status: 'LEGACY', reportFormat: 'LEGACY_V2', permittedAction: { kind: 'VIEW_REPORT', to: '/score?session=sess-1' } })]) } })
    const next = await screen.findByTestId('next-action')
    await screen.findAllByTestId('history-item')
    expect(screen.queryByTestId('intent-chooser')).not.toBeInTheDocument()
    expect(within(next).getByRole('link', { name: 'Start an assessment' })).toHaveAttribute('href', '/payment')
  })

  it('an active run resumes the saved assessment on the existing player path, without another assessment', async () => {
    const data = home({ primaryAction: { kind: 'ASSESSMENT_IN_PROGRESS', assignmentId: 'a-1', title: 'Prism Workplace Simulation', scope: 'PERSONAL', dueAt: null, to: '/app/assessment/sess-live' } })
    render(<HomePage />, { routes: { '/api/v1/me/home': data } })
    const next = await screen.findByTestId('next-action')
    expect(within(next).getByRole('link', { name: 'Resume saved assessment' })).toHaveAttribute('href', '/app/assessment/sess-live')
    expect(within(next).getAllByRole('link')).toHaveLength(1)
    expect(next).toHaveTextContent('does not use another assessment')
  })

  it('processing: the work is saved, review continues, and the only action is to check status', async () => {
    const data = home({ primaryAction: { kind: 'ASSESSMENT_PROCESSING', sessionId: 'sess-p', title: 'Prism Workplace Simulation', scope: 'PERSONAL', completedAt: '2026-10-01T10:00:00.000Z', to: null } })
    render(<HomePage />, { routes: { '/api/v1/me/home': data } })
    const next = await screen.findByTestId('next-action')
    expect(within(next).getByRole('heading', { name: 'Your work is saved; review is continuing' })).toBeInTheDocument()
    expect(within(next).getByText(/^Responses received /)).toBeInTheDocument()
    expect(within(next).getByRole('link', { name: 'Check status' })).toHaveAttribute('href', '/app/assessments?tab=history')
    expect(within(next).queryByRole('link', { name: /Resume|Start|Buy/ })).not.toBeInTheDocument()
  })

  it('technical failure: recovery first and support, never buy another assessment', async () => {
    const data = home({ primaryAction: { kind: 'ASSESSMENT_TECHNICAL_FAILED', sessionId: 'sess-f', title: 'Prism Workplace Simulation', scope: 'PERSONAL', completedAt: '2026-09-20T10:00:00.000Z', to: '/app/assessment/sess-f' } })
    render(<HomePage />, { routes: { '/api/v1/me/home': data } })
    const next = await screen.findByTestId('next-action')
    const links = within(next).getAllByRole('link')
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([['Open assessment', '/app/assessment/sess-f'], ['Contact support', '/contact']])
    expect(next).toHaveTextContent('Nothing you did is lost')
    expect(next).toHaveTextContent('Reference: sess-f')
    expect(next).not.toHaveTextContent(/buy|payment/i)
  })

  it('technical failure without a recovery path offers support only', async () => {
    const data = home({ primaryAction: { kind: 'ASSESSMENT_TECHNICAL_FAILED', sessionId: 'sess-f', title: null, scope: 'SPONSORED', completedAt: null, to: null } })
    render(<HomePage />, { campus: true, routes: { '/api/v1/me/home': data } })
    const next = await screen.findByTestId('next-action')
    expect(within(next).getAllByRole('link').map((l) => l.textContent)).toEqual(['Contact support'])
  })

  it('P3.3 practice available: one mission with duration, mode and allowance; labelled practice; one CTA', async () => {
    const data = home({ primaryAction: { kind: 'PRACTICE_AVAILABLE', missionId: 'MIS-SYN-01', title: 'Synthetic mission', targetCapabilityName: 'Communication', estimatedMinutes: 12, mode: 'GUIDED', allowance: { kind: 'BOUNDED', total: 5, used: 1, remaining: 4, validUntil: null }, to: '/app/development/missions/MIS-SYN-01' } })
    render(<HomePage />, { routes: { '/api/v1/me/home': data } })
    const next = await screen.findByTestId('next-action')
    expect(next).toHaveAttribute('data-kind', 'PRACTICE_AVAILABLE')
    expect(within(next).getByRole('heading', { level: 2, name: 'Synthetic mission' })).toBeInTheDocument()
    const facts = within(next).getByTestId('practice-facts')
    expect(facts).toHaveTextContent('Practice')
    expect(facts).toHaveTextContent('Guided, with hints on request')
    expect(facts).toHaveTextContent('About 12 minutes')
    expect(facts).toHaveTextContent('4 of 5 practice attempts left')
    expect(next).toHaveTextContent('never changes your formal results')
    expect(within(next).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([['Start practice', '/app/development/missions/MIS-SYN-01']])
    expect(screen.queryByTestId('home-mission')).not.toBeInTheDocument()
    noPercent()
  })

  it('P3.3 preparation in progress: returns privately to the saved attempt', async () => {
    const data = home({ primaryAction: { kind: 'PREPARATION_IN_PROGRESS', attemptId: 'prep-1', title: 'Interview', scope: 'PERSONAL', completedAt: null, startedAt: '2026-09-30T10:00:00.000Z', to: '/app/prepare/prep-1' } })
    render(<HomePage />, { routes: { '/api/v1/me/home': data } })
    const next = await screen.findByTestId('next-action')
    expect(within(next).getByRole('heading', { level: 2, name: 'Return to your private preparation' })).toBeInTheDocument()
    expect(next).toHaveTextContent('visible only to you')
    expect(next).toHaveTextContent('Private preparation')
    expect(within(next).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([['Return to your private preparation', '/app/prepare/prep-1']])
    expect(next).not.toHaveTextContent(/buy|payment/i)
  })

  it('loading keeps the h1 and announces loading', async () => {
    render(<HomePage />, { routes: { '/api/v1/me/home': pending } })
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
    expect(screen.getByText('Loading your home…')).toBeInTheDocument()
  })
  it('an error offers retry with a reference', async () => {
    render(<HomePage />, { routes: { '/api/v1/me/home': error500 } })
    expect(await screen.findByText('Reference: req-500', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
  it('a forbidden workspace shows the unavailable state', async () => {
    render(<HomePage />, { routes: { '/api/v1/me/home': forbidden } })
    expect(await screen.findByText('This page is not available')).toBeInTheDocument()
  })
  it('a due sponsored assessment is the primary action, with the campus privacy note', async () => {
    const data = home({
      workspace: { id: CAMPUS_WS.id, type: 'CAMPUS_STUDENT', name: 'Synthetic University', organizationName: 'Synthetic University' },
      primaryAction: { kind: 'ASSESSMENT_DUE', assignmentId: 'a-1', title: 'Prism Workplace Simulation', scope: 'SPONSORED', dueAt: '2026-10-04T10:00:00.000Z', to: '/app/campus/x/assignments/a-1/briefing' },
      sponsor: { organizationId: CAMPUS_WS.organizationId, organizationName: 'Synthetic University', programName: null },
    })
    render(<HomePage />, { campus: true, routes: { '/api/v1/me/home': data } })
    expect(await screen.findByText(/Synthetic University can see sponsored results here/)).toBeInTheDocument()
    expect(await screen.findByText('Sponsored by Synthetic University')).toBeInTheDocument()
    expect(screen.getByText('Due soon')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open briefing' })).toHaveAttribute('href', '/app/campus/x/assignments/a-1/briefing')
    expect(screen.getAllByTestId('capability-snapshot')).toHaveLength(5)
    expect(screen.queryByRole('link', { name: /See details/ })).not.toBeInTheDocument()
    noPercent()
  })
  it('focus areas are listed (max three) with their provisional level', async () => {
    const data = home({ focus: [{ capabilityId: 'CAP-L1-REASONING', name: 'Reasoning & Decision Quality', level: { band: 'DEVELOPING', label: 'Developing' }, status: 'PROVISIONAL', basedOn: null }], primaryAction: { kind: 'CAPABILITY_SUMMARY', to: '/app/capabilities' } })
    render(<HomePage />, { routes: { '/api/v1/me/home': data } })
    expect(await screen.findByText('1. Develop Reasoning & Decision Quality')).toBeInTheDocument()
    expect(screen.getByText('Developing (provisional)')).toBeInTheDocument()
  })
  it('with no demonstrated level, strengths say so; no mission is invented', async () => {
    render(<HomePage />)
    expect(await screen.findByText(/Nothing is shown as demonstrated yet/)).toBeInTheDocument()
    expect(screen.queryByTestId('home-strengths')).not.toBeInTheDocument()
    expect(screen.queryByTestId('home-mission')).not.toBeInTheDocument()
  })
  it('a demonstrated capability is a strength; an available mission is recommended as practice', async () => {
    const base = home()
    base.data.capabilitySnapshot[0] = { ...base.data.capabilitySnapshot[0], status: 'SUFFICIENT', level: { band: 'DEMONSTRATED', label: 'Demonstrated' } }
    const plan = { data: { status: 'FOCUS_FROM_EVIDENCE', priorities: [], missions: [{ id: 'm-1', title: 'Separate cause from symptom', targetCapabilityName: 'Reasoning & Decision Quality', estimatedMinutes: 15, intervention: null, latestAttempt: null }], completedMissions: [], missionsAvailable: true, upcomingReassessment: null, practiceEvidence: [] } }
    render(<HomePage />, { routes: { '/api/v1/me/home': base, '/api/v1/me/development-plan': plan } })
    const strengths = await screen.findByTestId('home-strengths')
    expect(within(strengths).getByText('Reasoning & Decision Quality')).toBeInTheDocument()
    expect(await screen.findByTestId('home-mission')).toHaveTextContent('Separate cause from symptom')
    expect(screen.getByTestId('home-mission')).toHaveTextContent('Practice never changes your formal results')
    expect(screen.getAllByRole('link', { name: /See details/ })[0]).toHaveAttribute('href', '/app/capabilities/CAP-L1-REASONING')
    noPercent()
  })
})

describe('Assessments list (§10)', () => {
  it('a completed assessment without a report provides support, never a broken report button', async () => {
    render(<AssessmentsPage />, { routes: { '/api/v1/me/assessments': { data: {
      active: [], upcoming: [], completed: [card({ status: 'COMPLETED', tab: 'COMPLETED', completedAt: '2026-10-01T10:00:00.000Z', cta: { kind: 'NONE', to: null } })],
    } } } })
    await userEvent.click(await screen.findByRole('tab', { name: 'Completed (1)' }))
    const assignment = await screen.findByTestId('assignment-card')
    expect(within(assignment).getByText(/Report not available yet/)).toBeInTheDocument()
    expect(within(assignment).getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', '/contact')
    expect(within(assignment).queryByRole('link', { name: /View report/ })).not.toBeInTheDocument()
  })

  it('under-review history does not pretend that a missing report is available', async () => {
    render(<AssessmentsPage />, { routes: { '/api/v1/me/assessments': { data: {
      active: [], upcoming: [], completed: [card({ status: 'COMPLETED', tab: 'COMPLETED', underReview: true, cta: { kind: 'NONE', to: null } })],
    } } } })
    await userEvent.click(await screen.findByRole('tab', { name: 'Completed (1)' }))
    const assignment = await screen.findByTestId('assignment-card')
    expect(within(assignment).getByText(/This result is under review/)).toBeInTheDocument()
    expect(within(assignment).queryByText('Report available')).not.toBeInTheDocument()
    expect(within(assignment).queryByRole('link', { name: /View report/ })).not.toBeInTheDocument()
  })

  it('always shows the scope; empty tabs explain themselves', async () => {
    const data = { data: {
      active: [card(), card({ id: 'a-s', scope: 'SPONSORED', sponsor: { organizationId: 'o', name: 'Synthetic University' }, dueAt: '2026-10-04T10:00:00.000Z', acknowledgementRequired: true, cta: { kind: 'START', to: '/x' } })],
      completed: [],
      upcoming: [],
    } }
    render(<AssessmentsPage />, { routes: { '/api/v1/me/assessments': data } })
    const cards = await screen.findAllByTestId('assignment-card')
    expect(within(cards[0]).getByText('Personal assessment')).toBeInTheDocument()
    expect(within(cards[0]).getByRole('link', { name: 'Prism Workplace Simulation' })).toHaveAttribute('href', '/app/assessments/pa_00000000000000000000000000000001')
    expect(within(cards[1]).getByText('Sponsored by Synthetic University')).toBeInTheDocument()
    expect(within(cards[1]).getByText(/^Due /)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Upcoming (0)' }))
    expect(screen.getByRole('heading', { name: 'Nothing scheduled' })).toBeInTheDocument()
  })
  it('an empty personal list offers the start flow', async () => {
    render(<AssessmentsPage />)
    expect(await screen.findByRole('heading', { name: 'Nothing to take right now' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Start an assessment' })[0]).toHaveAttribute('href', '/payment')
  })
})

describe('Assessment detail (§10)', () => {
  const path = '/app/assessments/:assignmentId'
  it('shows scope, status, what it looks at, what it does not measure and the next step', async () => {
    render(<AssessmentDetailPage />, { path, route: '/app/assessments/a-1', routes: { '/api/v1/assessment-assignments/': briefing() } })
    expect(await screen.findByRole('heading', { level: 1, name: 'Prism Workplace Simulation' })).toBeInTheDocument()
    expect(screen.getByText('Personal assessment')).toBeInTheDocument()
    expect(screen.getByText('Not started')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'What it does not measure' })).toBeInTheDocument()
    expect(screen.getByText('Your personality type')).toBeInTheDocument()
    expect(screen.getByText('Reasoning & Decision Quality')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open briefing/ })).toHaveAttribute('href', '/app/assessments/pa_00000000000000000000000000000001/briefing')
    noPercent()
  })
  it('an unknown assignment keeps the heading and says it is not available', async () => {
    render(<AssessmentDetailPage />, { path, route: '/app/assessments/nope' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Assessment' })).toBeInTheDocument()
    expect(await screen.findByText('This page is not available')).toBeInTheDocument()
  })
})
describe('Briefing (§11)', () => {
  const path = '/app/assessments/:assignmentId/briefing'
  const route = '/app/assessments/a-1/briefing'
  it('shows all ten sections for a personal assessment and continues to the system check', async () => {
    const events = []
    setTelemetrySender((e) => events.push(e))
    render(<BriefingPage />, { path, route, routes: { '/api/v1/assessment-assignments/': briefing() } })
    for (const n of ['What this assessment measures', 'What it does not measure', 'How the simulation works', 'Estimated duration', 'Allowed tools and resources', 'Integrity requirements (Standard)', 'Accessibility and adjustments', 'Who can see the result', 'Technical check', 'Start']) {
      expect(await screen.findByRole('heading', { level: 2, name: new RegExp(n.replace(/[()]/g, '\\$&')) })).toBeInTheDocument()
    }
    expect(screen.getByText('Your facial expressions, voice tone or emotions')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue to system check' })).toHaveAttribute('href', '/app/assessments/a-1/system-check')
    await waitFor(() => expect(events.map((e) => e.event)).toContain('briefing_opened'))
    expect(events[0].props).toEqual({ assignmentId: 'a-1', scope: 'PERSONAL', surface: 'BRIEFING' })
    setTelemetrySender(() => {})
  })
  it('a sponsored briefing requires an explicit acknowledgement sent with the copy version', async () => {
    const sponsored = briefing({
      assignment: { id: 'a-2', scope: 'SPONSORED', sponsor: { organizationId: 'o', name: 'Synthetic University' }, acknowledgementRequired: true },
      rest: {
        sponsorship: { scope: 'SPONSORED', sponsorName: 'Synthetic University', disclosureCopyVersion: SPONSORED_DISCLOSURE_VERSION, acknowledged: false, acknowledgedAt: null },
        start: { allowed: false, reason: 'ACKNOWLEDGEMENT_REQUIRED', to: null },
      },
    })
    const { spy } = render(<BriefingPage />, {
      path, route: '/app/assessments/a-2/briefing', campus: true,
      routes: { '/api/v1/assessment-assignments/a-2/acknowledge': { data: { acknowledged: true } }, '/api/v1/assessment-assignments/': sponsored },
    })
    // The campus workspace activates once /api/v1/me has loaded.
    await waitFor(() => expect(screen.getByRole('link', { name: 'Assessments' })).toHaveAttribute('href', `/app/campus/${CAMPUS_WS.organizationId}/assignments`))
    const disclosure = await screen.findByTestId('sponsored-disclosure')
    expect(disclosure).toHaveTextContent('This assessment is sponsored by Synthetic University.')
    expect(disclosure).toHaveTextContent('Your personal Prism assessments and private activity are not shared automatically.')
    const confirm = await screen.findByRole('button', { name: 'Confirm' })
    expect(confirm).toBeDisabled()
    expect(screen.getByText('Confirm you have read who can see this assessment to continue.')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('I understand what Synthetic University can and cannot see'))
    await userEvent.click(confirm)
    await waitFor(() => expect(spy.mock.calls.some(([u]) => String(u).endsWith('/a-2/acknowledge'))).toBe(true))
    const call = spy.mock.calls.find(([u]) => String(u).endsWith('/a-2/acknowledge'))
    expect(JSON.parse(call[1].body)).toEqual({ copyVersion: SPONSORED_DISCLOSURE_VERSION, acknowledged: true })
    expect(call[1].headers['X-Prism-Workspace']).toBe(CAMPUS_WS.id)
  })
  it('a changed disclosure version cannot be acknowledged from stale copy', async () => {
    const stale = briefing({
      assignment: { id: 'a-3', scope: 'SPONSORED', sponsor: { organizationId: 'o', name: 'Synthetic University' }, acknowledgementRequired: true },
      rest: { sponsorship: { scope: 'SPONSORED', sponsorName: 'Synthetic University', disclosureCopyVersion: 'campus-assessment-disclosure.v9', acknowledged: false, acknowledgedAt: null }, start: { allowed: false, reason: 'ACKNOWLEDGEMENT_REQUIRED', to: null } },
    })
    render(<BriefingPage />, { path, route: '/app/assessments/a-3/briefing', routes: { '/api/v1/assessment-assignments/': stale } })
    expect(await screen.findByText('This disclosure was updated')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })
  it('an unknown assignment keeps the heading and says it is not available', async () => {
    render(<BriefingPage />, { path, route })
    expect(await screen.findByRole('heading', { level: 1, name: 'Assessment briefing' })).toBeInTheDocument()
    expect(await screen.findByText('This page is not available')).toBeInTheDocument()
  })
})

describe('System check (§11 item 9)', () => {
  it('lists the checks and links to the server-provided start', async () => {
    render(<SystemCheckPage />, { path: '/app/assessments/:assignmentId/system-check', route: '/app/assessments/a-1/system-check', routes: { '/api/v1/assessment-assignments/': briefing() } })
    expect(await screen.findByText('Browser')).toBeInTheDocument()
    expect(await screen.findByText('Prism can be reached.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Begin assessment' })).toHaveAttribute('href', '/briefing?session=sess-x')
  })
  it('device check helpers', async () => {
    expect(checkScreen(1280).status).toBe('PASS')
    expect(checkScreen(400, { needsLargeScreen: true }).status).toBe('WARN')
    expect(checkConnection(false, true).status).toBe('FAIL')
    expect(checkConnection(true, false).status).toBe('FAIL')
    expect(checkMediaSupport(undefined, { needsCamera: true }).map((r) => r.status)).toEqual(['WARN', 'FAIL'])
    expect(summarise([{ status: 'PASS' }, { status: 'WARN' }])).toBe('WARN')
    const stop = vi.fn()
    const ok = await testMicrophone({ getUserMedia: async () => ({ getTracks: () => [{ stop }] }) })
    expect(ok.status).toBe('PASS')
    expect(stop).toHaveBeenCalled()
    expect((await testMicrophone({ getUserMedia: async () => { throw new Error('denied') } })).status).toBe('WARN')
  })
})

describe('Capabilities (§13) and Evidence (§15)', () => {
  it('the list shows a card per capability with its level and sufficiency; insufficient ones say why', async () => {
    render(<CapabilitiesPage />, { routes: { '/api/v1/me/capabilities': describedCapabilities() } })
    const cards = await screen.findAllByTestId('capability-card')
    expect(cards).toHaveLength(5)
    expect(within(cards[0]).getByText('Developing (provisional)')).toBeInTheDocument()
    expect(within(cards[0]).getByText('Development priority')).toBeInTheDocument()
    expect(within(cards[0]).getByRole('link', { name: /View capability/ })).toHaveAttribute('href', '/app/capabilities/CAP-L1-REASONING')
    expect(within(cards[1]).getByText('Not yet measured')).toBeInTheDocument()
    expect(within(cards[1]).getAllByText('This capability has not been measured yet.').length).toBeGreaterThan(0)
    expect(cards[1]).toHaveAttribute('data-described', 'false')
    expect(screen.queryByText(/I would first separate/)).not.toBeInTheDocument()
    noPercent()
  })
  it('no completed assessment → the empty state with the start flow', async () => {
    render(<CapabilitiesPage />)
    expect(await screen.findByText('You do not have a formal capability profile yet.')).toBeInTheDocument()
  })
  it('formal and practice evidence are labelled differently; filters go to the server', async () => {
    const data = { data: {
      items: [
        { id: 'u1', kind: 'FORMAL', sessionId: 's1', assessmentTitle: 'Prism Workplace Simulation', scope: 'PERSONAL', date: '2026-09-20T10:00:00.000Z', candidateAction: { quote: 'I would first separate', turn: 1, artifactId: null }, observedBehavior: 'Separated symptoms', capability: { id: 'CAP-L1-REASONING', name: 'Reasoning & Decision Quality' }, rubricAnchor: { criteria: 'Explicitly identifies assumptions' }, evidenceStatus: 'PROVISIONAL' },
        { id: 'p1', kind: 'PRACTICE', date: '2026-09-21T10:00:00.000Z', observedBehavior: 'Practised structuring', capability: { id: 'CAP-L1-COMMUNICATION', name: 'Communication & Structure' } },
      ],
      total: 2,
      facets: { capabilities: [{ id: 'CAP-L1-REASONING', name: 'Reasoning & Decision Quality' }], assessments: [{ sessionId: 's1', title: 'Prism Workplace Simulation', completedAt: '2026-09-20T10:00:00.000Z' }] },
      practiceAvailable: true,
    } }
    const { spy } = render(<EvidencePage />, { routes: { '/api/v1/me/evidence': data } })
    const formal = await screen.findByText('Formal assessment', { selector: 'span' })
    expect(formal.closest('article')).toHaveAttribute('data-kind', 'FORMAL')
    expect(screen.getByText('Practice evidence', { selector: 'span' }).closest('article')).toHaveAttribute('data-kind', 'PRACTICE')
    expect(document.querySelector('[data-kind="PRACTICE"]').className).toMatch(/border-dashed/)
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'FORMAL')
    await waitFor(() => expect(spy.mock.calls.some(([u]) => String(u).includes('/api/v1/me/evidence?kind=FORMAL'))).toBe(true))
    expect(screen.getByLabelText('Type')).toBeInTheDocument()
  })
})

describe('Development, Growth, Sharing, Settings', () => {
  it('development: no plan and no missions are stated honestly', async () => {
    render(<DevelopmentPage />)
    expect(await screen.findByRole('heading', { name: 'No development focus yet' })).toBeInTheDocument()
    expect(screen.getByText(/Practice missions are not available here yet/)).toBeInTheDocument()
  })
  it('growth: a later but non-comparable assessment says why no change is shown', async () => {
    render(<GrowthPage />, { routes: { '/api/v1/me/growth': growth('FORMS_NOT_VALIDATED_FOR_COMPARISON', [{ sessionId: 's2', title: 'Prism Workplace Simulation', completedAt: '2026-09-25T10:00:00.000Z' }, { sessionId: 's1', title: 'Prism Workplace Simulation', completedAt: '2026-09-01T10:00:00.000Z' }]) } })
    expect(await screen.findByText('A later assessment exists, but these forms are not yet validated for direct growth comparison.')).toBeInTheDocument()
    noPercent()
  })
  it('sharing: lists grants and revokes after confirmation', async () => {
    const grants = { data: { items: [{ id: '33333333-3333-4333-8333-333333333333', recipient: { type: 'ORGANIZATION', organizationName: 'Synthetic University' }, resources: [{ resourceType: 'ASSESSMENT_REPORT', resourceId: 's1', disclosureLevel: 'SUMMARY' }], createdAt: '2026-09-20T10:00:00.000Z', expiresAt: '2026-12-20T10:00:00.000Z', revokedAt: null, status: 'ACTIVE' }] } }
    const { spy } = render(<SharingPage />, { routes: { '/api/v1/me/share-grants/33333333-3333-4333-8333-333333333333/revoke': { data: { status: 'REVOKED' } }, '/api/v1/me/share-grants': grants } })
    expect(await screen.findByText('Assessment report — summary')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Revoke access for Synthetic University/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke access' }))
    await waitFor(() => expect(spy.mock.calls.some(([u, init]) => String(u).endsWith('/revoke') && init.method === 'POST')).toBe(true))
  })
  it('settings: accessibility switches save to the account', async () => {
    const { spy } = render(<SettingsPage />, { routes: { '/api/v1/me/preferences': (u) => jsonResponse(200, { data: { reducedMotion: false, largerText: false, updatedAt: null } }) } })
    const sw = await screen.findByRole('switch', { name: 'Larger text' })
    await userEvent.click(sw)
    await waitFor(() => expect(spy.mock.calls.some(([u, init]) => String(u).endsWith('/api/v1/me/preferences') && init.method === 'PUT')).toBe(true))
    const put = spy.mock.calls.find(([, init]) => init.method === 'PUT')
    expect(JSON.parse(put[1].body)).toEqual({ reducedMotion: false, largerText: true })
    expect(put[1].headers['X-Prism-Workspace']).toBeUndefined()
  })
  it('preferences apply to the document', () => {
    const root = document.createElement('html')
    applyPreferences({ reducedMotion: true, largerText: true }, root)
    expect(root.classList.contains('prism-reduced-motion')).toBe(true)
    expect(root.classList.contains('prism-large-text')).toBe(true)
    applyPreferences({ reducedMotion: false, largerText: false }, root)
    expect(root.className).toBe('')
  })
})

describe('Every student page keeps its h1 through loading, error and unauthorized states', () => {
  const PAGES = [
    ['Assessments', <AssessmentsPage key="a" />, '/api/v1/me/assessments'],
    ['Capabilities', <CapabilitiesPage key="c" />, '/api/v1/me/capabilities'],
    ['Evidence', <EvidencePage key="e" />, '/api/v1/me/evidence'],
    ['Development', <DevelopmentPage key="d" />, '/api/v1/me/development-plan'],
    ['Growth', <GrowthPage key="g" />, '/api/v1/me/growth'],
    ['Sharing', <SharingPage key="s" />, '/api/v1/me/share-grants'],
    ['Explore Roles', <ExplorePage key="x" />, '/api/v1/me/capabilities'],
  ]
  for (const [title, page, url] of PAGES) {
    it(`${title}: loading → error → unauthorized`, async () => {
      const a = render(page, { routes: { [url]: pending } })
      expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
      expect(screen.getByText(/…$/, { selector: '.sr-only' })).toBeInTheDocument()
      a.unmount()
      const b = render(page, { routes: { [url]: error500 } })
      expect(await screen.findByText('Reference: req-500', {}, { timeout: 4000 })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
      b.unmount()
      render(page, { routes: { [url]: forbidden } })
      expect(await screen.findByText('This page is not available')).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    })
  }
})

describe('Explore Roles V2 (§18)', () => {
  it('evaluates only after interests are chosen and labels both kinds of reason', async () => {
    const result = { data: {
      selfReported: { interests: ['I'] },
      demonstrated: [],
      recommendations: [{
        roleId: 'SYN', title: 'Synthetic Role', basis: 'BOTH',
        selfReportedReasons: ['You said you enjoy Investigative work, which is central to Synthetic Role.'],
        demonstratedReasons: ['Your assessment evidence shows developing Reasoning & Decision Quality (provisional).'],
        unknowns: ['No formal evidence yet for Campaign Analytics.'],
        nextStep: { type: 'FORMAL_ASSESSMENT', label: 'Complete an assessment that covers the capabilities we have no evidence for yet.' },
      }],
      evaluated: true,
    } }
    const { spy } = render(<ExplorePage />, { routes: { '/api/v1/me/role-exploration': result, '/api/v1/me/capabilities': describedCapabilities() } })
    const show = await screen.findByRole('button', { name: 'Show roles' })
    expect(show).toBeDisabled()
    expect(screen.getByText('Developing (provisional)')).toBeInTheDocument()
    expect(spy.mock.calls.some(([u]) => String(u).includes('role-exploration'))).toBe(false)
    await userEvent.click(screen.getByLabelText('Investigating and analysing'))
    await userEvent.click(show)
    expect(await screen.findByRole('heading', { name: 'Synthetic Role' })).toBeInTheDocument()
    const post = spy.mock.calls.find(([u]) => String(u).includes('role-exploration'))
    expect(JSON.parse(post[1].body)).toEqual({ interests: { I: 1 } })
    expect(screen.getByText('You said')).toBeInTheDocument()
    expect(screen.getByText('Prism observed')).toBeInTheDocument()
    expect(screen.getByText('What remains unknown')).toBeInTheDocument()
    noPercent()
    expect(document.body.textContent).not.toMatch(/\bmatch\b|\bfit\b/i)
  })
  it('keeps interest and observed capability apart, assumes no interest, and states what is unknown', async () => {
    const result = { data: {
      selfReported: { interests: ['A'] }, demonstrated: [],
      recommendations: [
        { roleId: 'R1', title: 'Synthetic Role One', basis: 'SELF_REPORTED', selfReportedReasons: ['You said you enjoy Creative work.'], demonstratedReasons: [], unknowns: ['No formal evidence yet for Campaign Analytics.'], nextStep: { type: 'FORMAL_ASSESSMENT', label: 'Complete an assessment that covers the capabilities we have no evidence for yet.' } },
        { roleId: 'R2', title: 'Synthetic Role Two', basis: 'BOTH', selfReportedReasons: ['You said you enjoy Creative work.'], demonstratedReasons: ['Your assessment evidence shows developing Reasoning & Decision Quality (provisional).'], unknowns: [], nextStep: { type: 'EXPLORE', label: 'Talk to someone who works in this role about a typical week.' } },
      ],
      evaluated: true,
    } }
    const { spy } = render(<ExplorePage />, { routes: { '/api/v1/me/role-exploration': result, '/api/v1/me/capabilities': describedCapabilities() } })
    expect(await screen.findByText('Interest and capability are different things')).toBeInTheDocument()
    expect(screen.getByText('Self-reported')).toBeInTheDocument()
    expect(screen.getByText('Formal evidence')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { checked: true })).not.toBeInTheDocument()
    expect(screen.queryByTestId('role-card')).not.toBeInTheDocument()
    expect(spy.mock.calls.some(([u]) => String(u).includes('role-exploration'))).toBe(false)
    await userEvent.click(screen.getByLabelText('Creating and designing'))
    await userEvent.click(screen.getByRole('button', { name: 'Show roles' }))
    const cards = await screen.findAllByTestId('role-card')
    expect(cards).toHaveLength(2)
    expect(within(cards[0]).getByTestId('role-evidence')).toHaveTextContent('No formal evidence connects to this role yet.')
    expect(within(cards[0]).getByRole('link', { name: 'Go to assessments' })).toHaveAttribute('href', '/app/assessments')
    expect(within(cards[1]).getByTestId('role-interest')).toHaveTextContent('You said you enjoy Creative work.')
    expect(within(cards[1]).getByTestId('role-evidence')).toHaveTextContent('Prism observed')
    expect(within(cards[1]).queryByRole('link', { name: 'Go to assessments' })).not.toBeInTheDocument()
    expect(within(cards[1]).getByRole('link', { name: /Practise in Development/ })).toHaveAttribute('href', '/app/development')
    expect(document.body.textContent).not.toMatch(/\b(match|fit|best|perfect|ideal|suited|should become|you will)\b|\d\s*%/i)
  })
  it('at most three interests can be chosen', async () => {
    render(<ExplorePage />)
    for (const label of ['Hands-on, practical work', 'Investigating and analysing', 'Creating and designing']) {
      await userEvent.click(await screen.findByLabelText(label))
    }
    expect(screen.getByLabelText('Helping and teaching people')).toBeDisabled()
  })
})

describe('Accessibility details', () => {
  it('after acknowledging, focus moves to the announced confirmation', async () => {
    let acknowledged = false
    const sponsored = () => jsonResponse(200, briefing({
      assignment: { id: 'a-9', scope: 'SPONSORED', sponsor: { organizationId: 'o', name: 'Synthetic University' }, acknowledgementRequired: true, acknowledged },
      rest: {
        sponsorship: { scope: 'SPONSORED', sponsorName: 'Synthetic University', disclosureCopyVersion: SPONSORED_DISCLOSURE_VERSION, acknowledged, acknowledgedAt: acknowledged ? '2026-10-01T10:00:00.000Z' : null },
        start: { allowed: false, reason: acknowledged ? 'SPONSORED_START_UNAVAILABLE' : 'ACKNOWLEDGEMENT_REQUIRED', to: null },
      },
    }))
    render(<BriefingPage />, {
      path: '/app/assessments/:assignmentId/briefing', route: '/app/assessments/a-9/briefing',
      routes: { '/api/v1/assessment-assignments/a-9/acknowledge': () => { acknowledged = true; return jsonResponse(200, { data: { acknowledged: true } }) }, '/api/v1/assessment-assignments/': sponsored },
    })
    await userEvent.click(await screen.findByLabelText('I understand what Synthetic University can and cannot see'))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    const confirmation = await screen.findByText('You confirmed you have read this.')
    expect(confirmation).toHaveAttribute('role', 'status')
    await waitFor(() => expect(confirmation).toHaveFocus())
  })
  it('a held result is marked under review on its card', async () => {
    const data = { data: { active: [], completed: [card({ id: 'c-1', status: 'COMPLETED', tab: 'COMPLETED', underReview: true, cta: { kind: 'NONE', to: null } })], upcoming: [] } }
    render(<AssessmentsPage />, { routes: { '/api/v1/me/assessments': data } })
    await userEvent.click(await screen.findByRole('tab', { name: 'Completed (1)' }))
    expect(screen.getByText(/under review and is not included in your capabilities/)).toBeInTheDocument()
  })
})

describe('Product telemetry (§46)', () => {
  it('only allow-listed props leave the browser; unknown events are ignored', () => {
    expect(allowedProps({ assignmentId: 'a-1', scope: 'PERSONAL', email: 'x@test.local', transcript: 'my answer', url: '/app/campus-invite/token', count: 3 }))
      .toEqual({ assignmentId: 'a-1', scope: 'PERSONAL', count: 3 })
    const sent = []
    setTelemetrySender((e) => sent.push(e))
    expect(track('typed_an_answer', { text: 'x' })).toBe(false)
    expect(track('report_viewed', { sessionId: 'sess-1', name: 'Synthetic Student' })).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0].props).toEqual({ sessionId: 'sess-1' })
    setTelemetrySender(() => {})
  })
})
