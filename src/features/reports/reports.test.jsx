// C6.05–C6.08 — Student Report V3 UI: capability cards show only what the
// server validated (level + observed claim, or insufficient evidence), the
// evidence trail, at most three priorities, honest not-yet-available states,
// the share dialog (token shown once), revoke, the public shared page with
// selective disclosure, and a PDF built from structured data only.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp, mockFetch, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import StudentReportPage from './pages/StudentReportPage.jsx'
import SharedReportPage from './pages/SharedReportPage.jsx'
import { reportPdfLines } from '../../lib/reportPdf.js'
import { ReportCapabilityCard } from './components/ReportCapabilityCard.jsx'
import { CapabilityMap } from './components/CapabilityMap.jsx'

const CAMPUS_WS = { id: '11111111-1111-4111-8111-111111111111', type: 'CAMPUS_STUDENT', name: 'Synthetic University', organizationId: '22222222-2222-4222-8222-222222222222', organizationName: 'Synthetic University', visibilityPolicy: 'OWNER_AND_SPONSOR', permissions: [] }
const PERSONAL_WS = { id: 'personal', type: 'PERSONAL', name: 'Personal', organizationId: null, organizationName: null, visibilityPolicy: 'OWNER_ONLY' }

const PROVENANCE = { evidenceId: 'e1', source: 'CONVERSATION', turn: 1, artifactId: null, rubricVersion: 'rubric.v1', reviewedBy: 'AI', legacy: false }
const momentFixture = (over = {}) => ({
  id: 'e1', basis: 'DESCRIBED', capability: { id: 'CAP-A', name: 'Synthetic Reasoning', displayLabel: 'Making decisions' },
  observedBehavior: 'Checked the source of the complaints.', quote: 'check which customers raised the issue',
  context: 'Priya (Coordinating colleague): Before we plan, what do you want to check or ask?',
  source: { turn: 1, artifactId: null, opportunityId: 'OPP-1' }, rubricAnchor: { criteria: 'Identifies the problem source.' },
  nextBehavior: 'Weighs two options before deciding.', evidenceStatus: 'PROVISIONAL', provenance: PROVENANCE, ...over,
})

export function reportFixture({ disclosure = 'FULL', scope = 'PERSONAL', sponsor = null } = {}) {
  const full = disclosure === 'FULL'
  return {
    builderVersion: 'student-report.v3.0',
    sessionId: 'sess-report-0001',
    disclosure,
    header: {
      candidateName: 'Synthetic Student',
      assessment: { definitionId: 'prism-workplace-core', title: 'Prism Workplace Simulation', formId: 'prism-workplace-core:syn:1' },
      scenarioTitle: 'Synthetic Scenario',
      sponsor,
      scope,
      completedAt: '2026-10-02T10:00:00.000Z',
      verification: { identityAssurance: 'L1', credentialId: null },
    },
    summary: {
      capabilities: [
        { id: 'CAP-A', name: 'Synthetic Reasoning', displayLabel: 'Making decisions', definition: 'Reasoning definition.', layer: 'PRIMARY', status: 'PROVISIONAL', statusReasons: ['RULES_NOT_APPROVED'], level: { band: 'EARLY', label: 'Early evidence' }, levelDescriptor: 'Describes a first step.', summary: { claimId: 'claim-a', text: 'You checked which customers raised the issue first.', status: 'PROVISIONAL', evidenceIds: ['e1', 'e2', 'e3'] } },
        { id: 'CAP-B', name: 'Synthetic Collaboration', displayLabel: 'Working with people', definition: null, layer: 'PRIMARY', status: 'INSUFFICIENT_EVIDENCE', statusReasons: ['BELOW_MINIMUM_EVIDENCE_UNITS'], level: null, levelDescriptor: null, summary: { claimId: null, text: 'There was not enough evidence in Prism Workplace Simulation to describe this.', status: 'INSUFFICIENT', evidenceIds: [] } },
      ],
      describedCount: 1,
      insufficientCount: 1,
    },
    plainStatement: 'In this assessment you were observed doing this: Checked the source of the complaints. One thing to practise next: Weighs two options before deciding.',
    displayLabels: [{ id: 'CAP-A', name: 'Synthetic Reasoning', displayLabel: 'Making decisions' }, { id: 'CAP-B', name: 'Synthetic Collaboration', displayLabel: 'Working with people' }],
    moments: full ? [
      momentFixture(),
      momentFixture({ id: 'e2', observedBehavior: 'Compared the figures before choosing an option.', quote: 'compare the numbers before deciding', context: 'Synthetic Scenario, exchange 2', source: { turn: 2, artifactId: null, opportunityId: null }, provenance: { ...PROVENANCE, evidenceId: 'e2', turn: 2 } }),
    ] : [],
    evidence: full ? [
      { id: 'e1', kind: 'FORMAL', claimId: 'claim-e1', claim: 'Checked the source of the complaints.', claimStatus: 'PROVISIONAL', capability: { id: 'CAP-A', name: 'Synthetic Reasoning' }, assessmentTitle: 'Synthetic Scenario', candidateAction: { quote: 'check which customers raised the issue', turn: 1, artifactId: null }, observedBehavior: 'Checked the source of the complaints.', rubricAnchor: { criteria: 'Identifies the problem source.' }, evidenceStatus: 'PROVISIONAL', sufficiency: { status: 'PROVISIONAL', reasons: [], unitCount: 3, opportunities: 3 }, provenance: { evidenceId: 'e1', source: 'CONVERSATION', turn: 1, artifactId: null, rubricVersion: 'rubric.v1', reviewedBy: 'AI', legacy: false } },
    ] : [],
    development: full ? { priorities: [{ capabilityId: 'CAP-A', name: 'Synthetic Reasoning', claimId: 'claim-d', claim: 'Synthetic Reasoning is an area to build on.', evidenceIds: ['e1', 'e2', 'e3'], currentLevel: { band: 'EARLY', label: 'Early evidence' }, behaviorToImprove: 'Weighs two options before deciding.', whyItMatters: 'Decisions hold up better.', recommendedMission: null, practiceTime: null, reassessmentWindow: null, availability: { missions: 'NOT_YET_AVAILABLE', reassessment: 'NOT_YET_AVAILABLE' } }], maxPriorities: 3 } : null,
    methodology: { builderVersion: 'student-report.v3.0', sufficiencyRulesVersion: 'sufficiency-rules.v1-provisional', levelLabelsStatus: 'PROVISIONAL', catalogVersion: 'assessment-catalog.v1', assessmentDefinitionId: 'prism-workplace-core', formId: 'prism-workplace-core:syn:1' },
    claims: [],
  }
}

const ownerBody = (overrides = {}) => ({
  data: {
    report: reportFixture(overrides.report),
    version: { number: 1, createdAt: '2026-10-02T10:00:00.000Z' },
    audience: 'OWNER',
    privacy: { visibility: 'OWNER_ONLY', activeShares: [], canShare: true, ...overrides.privacy },
  },
})

function renderReport(routes, { campus = false, route = '/app/reports/sess-report-0001' } = {}) {
  signIn()
  if (campus) sessionStorage.setItem('prismActiveWorkspace', CAMPUS_WS.id)
  const spy = mockFetch({ ...routes, '/api/v1/me': meBody({ flags: { PRISM_APP_SHELL_V3: true, PRISM_STUDENT_REPORT_V3: true }, workspaces: [PERSONAL_WS, CAMPUS_WS] }) })
  const out = renderApp(<Routes><Route path="/app/reports/:sessionId" element={<StudentReportPage />} /></Routes>, { route })
  return { ...out, spy }
}

describe('Student Report V3 page', () => {
  it('P2.6 a failed review is a technical state with retry/support, never a learner deficit', async () => {
    renderReport({
      '/api/v1/assessment-sessions/sess-report-0001/report': () => jsonResponse(409, { error: { code: 'REPORT_PROCESSING_FAILED', message: 'The review did not finish.', requestId: 'req-proc-failed' } }),
    })
    expect(await screen.findByText('The review did not finish')).toBeInTheDocument()
    expect(screen.getByText(/Your submitted work is saved/)).toBeInTheDocument()
    expect(screen.getByText('Reference: req-proc-failed')).toBeInTheDocument()
    expect(screen.queryByTestId('report-capability')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/insufficient|not enough evidence/i)
  })

  it('P2.7/P5.5 a bounded observation surfaces as one moment with the learner words, a next behaviour and a practice link, never a level', async () => {
    const body = ownerBody()
    body.data.report.summary.capabilities[0].level = null
    body.data.report.summary.capabilities[0].status = 'INSUFFICIENT_EVIDENCE'
    body.data.report.summary.describedCount = 0
    body.data.report.summary.insufficientCount = 2
    body.data.report.evidence = []
    body.data.report.development = { priorities: [], maxPriorities: 3 }
    body.data.report.plainStatement = 'In this assessment you were observed doing this: Asked who owned the two unassigned tasks before sending the handover. One thing to practise next: Confirms the owner and the first step in writing.'
    body.data.report.boundedObservations = [{
      id: 'e9', capability: { id: 'CAP-A', name: 'Synthetic Reasoning' }, observedBehavior: 'Asked who owned the two unassigned tasks before sending the handover.',
      quote: 'who owns the two tasks', source: { turn: 2, artifactId: null, opportunityId: 'OPP-CLARIFY' }, rubricAnchor: { criteria: 'Names the gap.' },
      nextBehavior: 'Confirms the owner and the first step in writing.', limitation: 'One moment was observed in Prism Workplace Simulation. That is not enough to describe Synthetic Reasoning as a whole; sufficiency reasons: BELOW_MINIMUM_EVIDENCE_UNITS.',
      provenance: { evidenceId: 'e9', source: 'CONVERSATION', turn: 2, artifactId: null, rubricVersion: 'draft-handover-rubric.v0.1', reviewedBy: 'AI', legacy: false },
    }]
    body.data.report.moments = [momentFixture({
      id: 'e9', basis: 'BOUNDED', observedBehavior: 'Asked who owned the two unassigned tasks before sending the handover.', quote: 'who owns the two tasks',
      context: 'Sam (Operations colleague): Two of those have no owner on the board.', source: { turn: 2, artifactId: null, opportunityId: 'OPP-CLARIFY' },
      rubricAnchor: { criteria: 'Names the gap.' }, nextBehavior: 'Confirms the owner and the first step in writing.',
    })]
    renderReport({ '/api/v1/assessment-sessions/sess-report-0001/report': () => jsonResponse(200, body) })
    const section = await screen.findByTestId('report-moments')
    expect(within(section).getAllByTestId('report-moment')).toHaveLength(1)
    expect(within(section).getByText(/who owns the two tasks/)).toBeInTheDocument()
    expect(within(section).getByText(/One observed moment, not a level/)).toBeInTheDocument()
    expect(within(section).getByText(/Confirms the owner and the first step/)).toBeInTheDocument()
    expect(within(section).getByRole('link', { name: /^Practise this/ })).toHaveAttribute('href', '/app/development?source=sess-report-0001&moment=OPP-CLARIFY')
    // One clear state for "nothing on the map", not a chip on every row (CH-27).
    expect(screen.getByTestId('report-none-described')).toBeInTheDocument()
    const rows = screen.getAllByTestId('capability-map-row')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(within(row).getByText('Not yet measured')).toBeInTheDocument()
      expect(within(row).queryByText('Not enough evidence')).not.toBeInTheDocument()
      expect(row.querySelector('.bg-prism-blocked, .text-prism-blocked')).toBeNull()
    }
    expect(screen.getByTestId('report-next-practice')).toHaveTextContent('Confirms the owner and the first step in writing.')
    expect(document.body.textContent).not.toMatch(/\d\s*%/)
  })

  it.each([
    ['REPORT_NOT_READY', 'Your report is not ready yet'],
    ['REPORT_UNDER_REVIEW', 'This report is under review'],
  ])('%s offers a read-only recheck and support, never fabricated capability cards', async (code, title) => {
    let pending = true
    const { spy } = renderReport({
      '/api/v1/assessment-sessions/sess-report-0001/report': () => pending
        ? jsonResponse(409, { error: { code, message: 'Synthetic pending state', requestId: 'req-report-recovery' } })
        : jsonResponse(200, ownerBody()),
    })
    expect(await screen.findByText(title)).toBeInTheDocument()
    expect(document.title).toBe('Your report · Prism')
    expect(screen.getByText('Reference: req-report-recovery')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', '/contact')
    expect(screen.getByRole('link', { name: 'Back to assessments' })).toHaveAttribute('href', '/app/assessments')
    expect(screen.queryByTestId('report-capability')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download PDF' })).not.toBeInTheDocument()
    pending = false
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByTestId('report-header')).toBeInTheDocument()
    const reportCalls = spy.mock.calls.filter(([url]) => String(url).endsWith('/report'))
    expect(reportCalls.length).toBeGreaterThanOrEqual(2)
    expect(reportCalls.every(([, options]) => !options.method || options.method === 'GET')).toBe(true)
  })

  it('sponsored report recovery stays in its institution workspace', async () => {
    renderReport({
      '/api/v1/assessment-sessions/sess-report-0001/report': () => jsonResponse(409, { error: { code: 'REPORT_UNDER_REVIEW', message: 'Held', requestId: 'req-held' } }),
    }, { campus: true })
    await screen.findByText('This report is under review')
    expect(screen.getByRole('link', { name: 'Back to assessments' })).toHaveAttribute('href', `/app/campus/${CAMPUS_WS.organizationId}/assignments`)
  })

  it('a capability with no evidence shows one absence explanation and no empty level badge', () => {
    const cap = { ...reportFixture().summary.capabilities[1], statusReasons: ['NO_EVIDENCE'], summary: {
      claimId: null, text: 'No evidence for this was recorded in the synthetic assessment, so it is not described.', status: 'INSUFFICIENT', evidenceIds: [],
    } }
    render(<ReportCapabilityCard cap={cap} />)
    const card = screen.getByTestId('report-capability')
    expect(within(card).getAllByText('Insufficient evidence')).toHaveLength(1)
    expect(within(card).getByText(cap.summary.text)).toBeInTheDocument()
    expect(within(card).queryByText('No evidence was recorded for this capability.')).not.toBeInTheDocument()
    expect(within(card).queryByText('Observed level')).not.toBeInTheDocument()
    expect(within(card).queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows validated capability cards, insufficient evidence honestly, and no scores', async () => {
    renderReport({ '/api/v1/assessment-sessions/sess-report-0001/report': ownerBody() })
    expect(await screen.findByRole('heading', { level: 1, name: 'Your report' })).toBeInTheDocument()
    const header = await screen.findByTestId('report-header')
    expect(within(header).getByText('Synthetic Student')).toBeInTheDocument()
    expect(within(header).getByText('Personal assessment')).toBeInTheDocument()
    expect(within(header).getByText(/Identity self-declared/)).toBeInTheDocument()
    expect(screen.getByTestId('report-visibility')).toHaveTextContent('Only you can see this report unless you share it.')
    await userEvent.click(screen.getByRole('tab', { name: 'Evidence' }))
    const cards = screen.getAllByTestId('report-capability')
    expect(cards).toHaveLength(2)
    expect(within(cards[0]).getByText('You checked which customers raised the issue first.')).toBeInTheDocument()
    expect(within(cards[1]).getByText(/not enough evidence/)).toBeInTheDocument()
    expect(within(cards[1]).queryByText('What we observed')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\d\s*%|overall score|composite|rank/i)
  })

  it('links a card to its evidence, lists at most three priorities, and says what is not available yet', async () => {
    renderReport({ '/api/v1/assessment-sessions/sess-report-0001/report': ownerBody() })
    await userEvent.click(await screen.findByRole('tab', { name: 'Evidence' }))
    await userEvent.click(screen.getByRole('button', { name: 'See evidence for Synthetic Reasoning' }))
    expect(screen.getByRole('tab', { name: 'Evidence' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(document.activeElement).toHaveTextContent('Showing evidence for Making decisions'))
    const ev = screen.getAllByTestId('report-evidence')
    expect(ev).toHaveLength(1)
    expect(within(ev[0]).getByText(/check which customers raised the issue/)).toBeInTheDocument()
    expect(within(ev[0]).getByText(/Reviewed by AI, not yet by a person/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Development' }))
    expect(screen.getAllByTestId('development-priority').length).toBeLessThanOrEqual(3)
    expect(screen.getByText('Recommended practice missions are not available here yet.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Methodology' }))
    expect(screen.getByText(/There is no single overall score/)).toBeInTheDocument()
  })

  it('P5.2 the first screen reads statement -> Capability Map -> Moments -> Next useful practice; no invented strengths, highlights or percentages', async () => {
    renderReport({ '/api/v1/assessment-sessions/sess-report-0001/report': ownerBody() })
    const statement = await screen.findByTestId('report-plain-statement')
    expect(statement).toHaveTextContent(/^In this assessment you were observed doing this/)
    const map = screen.getByTestId('capability-map')
    const moments = screen.getByTestId('report-moments')
    const next = screen.getByTestId('report-next-practice')
    const glance = screen.getByTestId('report-glance')
    const order = [statement, map, moments, next, glance]
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(within(glance).getByTestId('evidence-coverage')).toHaveTextContent('1 of 2 capabilities have enough evidence to describe.')
    expect(within(glance).getByText('Change over time is shown only between assessments approved as comparable.')).toBeInTheDocument()
    expect(screen.queryByTestId('report-strengths')).not.toBeInTheDocument()
    expect(screen.queryByTestId('report-highlights')).not.toBeInTheDocument()
    expect(screen.getByText('Level names are provisional')).toBeInTheDocument()
    expect(within(next).getByText(/Weighs two options before deciding/)).toBeInTheDocument()
    expect(within(next).getByRole('link', { name: 'Practise this' })).toHaveAttribute('href', '/app/development?source=sess-report-0001&moment=OPP-1')
    expect(screen.queryByTestId('report-capability')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\d\s*%|percentile|overall|rank/i)
  })

  it('P5.3/T37 the Capability Map shows five labelled rows with a band and a separate evidence state; missing is neutral text, never zero or red', () => {
    const base = reportFixture().summary.capabilities
    const five = [
      { ...base[0], id: 'CAP-1', displayLabel: 'Making decisions', status: 'SUFFICIENT', level: { band: 'STRONG', label: 'Strongly demonstrated' } },
      { ...base[0], id: 'CAP-2', displayLabel: 'Getting your point across', status: 'PROVISIONAL', level: { band: 'DEVELOPING', label: 'Developing' } },
      { ...base[1], id: 'CAP-3', displayLabel: 'Working with people' },
      { ...base[1], id: 'CAP-4', displayLabel: 'Responding to change', status: 'HUMAN_REVIEW_REQUIRED', statusReasons: ['HUMAN_REVIEW_PENDING'] },
      { ...base[0], id: 'CAP-5', displayLabel: 'Making things happen', status: 'SUFFICIENT', level: { band: 'DEMONSTRATED', label: 'Demonstrated' } },
    ]
    const onSelect = vi.fn()
    render(<CapabilityMap capabilities={five} onSelect={onSelect} />)
    const rows = screen.getAllByTestId('capability-map-row')
    expect(rows).toHaveLength(5)
    expect(rows.map((r) => within(r).getByRole('button').textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Making decisions'), expect.stringContaining('Making things happen')]))
    expect(within(rows[0]).getByText('Strongly demonstrated')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Sufficient')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Developing')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Provisional')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Not yet measured')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Not enough evidence')).toBeInTheDocument()
    expect(within(rows[3]).getAllByText('Under review').length).toBeGreaterThanOrEqual(1)
    expect(within(rows[4]).getByText('Demonstrated')).toBeInTheDocument()
    expect(rows[2].getAttribute('data-band')).toBe('NONE')
    expect(rows[2].querySelector('.bg-prism-accent')).toBeNull()
    expect(rows[2].querySelector('.bg-prism-blocked, .text-prism-blocked, .bg-prism-blocked-soft')).toBeNull()
    // The band fill and the evidence chip never share a colour role.
    expect(rows[0].querySelectorAll('.bg-prism-accent')).toHaveLength(4)
    expect(rows[0].querySelector('.text-prism-positive')).not.toBeNull()
    expect(within(rows[0]).getByRole('button')).toHaveAccessibleName(/Making decisions\. Strongly demonstrated\. Evidence: Sufficient\./)
    expect(document.body.textContent).not.toMatch(/\d\s*%|\d\s*\/\s*\d|percentile/)
  })

  it('P5.3 a map row is one keyboard stop that opens that capability\'s evidence; moments are at most three and open the evidence drawer', async () => {
    const body = ownerBody()
    body.data.report.moments = [...body.data.report.moments, momentFixture({ id: 'e3', observedBehavior: 'Agreed next steps with the team lead.', quote: 'agree next steps with the team lead' })]
    renderReport({ '/api/v1/assessment-sessions/sess-report-0001/report': () => jsonResponse(200, body) })
    await screen.findByTestId('capability-map')
    expect(screen.getAllByTestId('report-moment')).toHaveLength(3)
    const row = screen.getByRole('button', { name: /Open details for Making decisions/ })
    row.focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('tab', { name: 'Evidence' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(document.activeElement).toHaveTextContent('Showing evidence for Making decisions'))
    expect(screen.getAllByTestId('report-evidence')).toHaveLength(1)
    expect(screen.getAllByTestId('report-capability')).toHaveLength(1)
    await userEvent.click(screen.getByRole('tab', { name: 'Your Prism' }))
    await userEvent.click(screen.getAllByRole('button', { name: /^See the moment/ })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Making decisions' })
    expect(within(dialog).getByText(/check which customers raised the issue/)).toBeInTheDocument()
    expect(within(dialog).getByText('Reviewed by AI, not yet by a person')).toBeInTheDocument()
  })

  it('P5.7 the owner sees version history and can ask for a review: the reason is posted, the outcome is not invented', async () => {
    let reviews = []
    const { spy } = renderReport({
      '/api/v1/assessment-sessions/sess-report-0001/report/versions': () => jsonResponse(200, { data: { sessionId: 'sess-report-0001', versions: [{ version: 1, builderVersion: 'student-report.v3.1', createdAt: '2026-10-02T10:00:00.000Z', issuedAt: '2026-10-02T10:00:00.000Z', reason: 'INITIAL', priorVersion: null }], reviews } }),
      '/api/v1/assessment-sessions/sess-report-0001/report/review-request': () => {
        reviews = [{ id: 'rr-1', sessionId: 'sess-report-0001', version: 1, category: 'ATTRIBUTION', momentId: 'e2', state: 'OPEN', createdAt: '2026-10-03T10:00:00.000Z' }]
        return jsonResponse(201, { data: reviews[0] })
      },
      '/api/v1/assessment-sessions/sess-report-0001/report': ownerBody(),
    })
    await userEvent.click(await screen.findByRole('tab', { name: 'Methodology' }))
    const history = await screen.findByTestId('report-versions')
    expect(await within(history).findByTestId('report-version')).toHaveTextContent('Version 1 (shown)')
    expect(within(history).getByTestId('report-version')).toHaveTextContent('First publication')
    await userEvent.click(within(history).getByRole('button', { name: 'Ask for a review' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ask for a review of this report' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/a few sentences/)
    expect(spy.mock.calls.some(([u]) => String(u).endsWith('/review-request'))).toBe(false)
    await userEvent.selectOptions(within(dialog).getByLabelText('What should be looked at'), 'ATTRIBUTION')
    await userEvent.selectOptions(within(dialog).getByLabelText('Which moment (optional)'), 'e2')
    await userEvent.type(within(dialog).getByLabelText(/What you would like reviewed/), 'The second moment quotes words that were in the prompt, not mine.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(spy.mock.calls.some(([u, init]) => String(u).endsWith('/review-request') && init.method === 'POST')).toBe(true))
    const call = spy.mock.calls.find(([u, init]) => String(u).endsWith('/review-request') && init.method === 'POST')
    expect(JSON.parse(call[1].body)).toEqual({ version: 1, category: 'ATTRIBUTION', momentId: 'e2', reason: 'The second moment quotes words that were in the prompt, not mine.' })
    expect(await within(dialog).findByText('Your request has been recorded')).toBeInTheDocument()
    expect(within(dialog).getByText(/does not promise a timing or an outcome/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/corrected|approved|accepted/i)).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(await within(history).findByTestId('report-review')).toHaveTextContent('Whether the words were mine · version 1 · Open')
    expect(document.body.textContent).not.toMatch(/\d\s*%/)
  })

  it('P5.6/P5.7 a pending review is a chip for the owner; a corrected version names what replaced it; the next practice shows the read-time recommendation with duration, label and allowance', async () => {
    const body = ownerBody()
    body.data.version = { number: 2, createdAt: '2026-10-03T10:00:00.000Z', reason: 'REVIEW_CORRECTION', priorVersion: 1 }
    body.data.review = { openRequests: 1, pending: true }
    body.data.report.review = { withheldEvidenceIds: ['e3'] }
    body.data.recommendations = [{
      kind: 'PRACTICE', capabilityId: 'CAP-A', behaviourIds: ['QUESTION_ASSUMPTION'], nextBehavior: 'Weighs two options before deciding.',
      availability: 'AVAILABLE', allowance: { kind: 'BOUNDED', total: 3, used: 1, remaining: 2, validUntil: null }, consumesActivity: true,
      mission: { id: 'MIS-CORE-MISSING-FACT-01', title: 'Find the missing fact', displayCode: 'P6-01', status: 'PUBLISHED', label: 'Practice mission', estimatedMinutes: 10, matchedBehaviourIds: ['QUESTION_ASSUMPTION'], matchedBy: 'BEHAVIOUR', to: '/app/development/missions/MIS-CORE-MISSING-FACT-01' },
    }]
    renderReport({ '/api/v1/assessment-sessions/sess-report-0001/report': () => jsonResponse(200, body) })
    const header = await screen.findByTestId('report-header')
    expect(within(header).getByText('An interpretation review is pending')).toBeInTheDocument()
    expect(within(header).getByTestId('report-corrected-badge')).toHaveTextContent('Corrected after a review')
    expect(screen.getByTestId('report-review-pending')).toHaveTextContent(/stays as published until they decide/)
    expect(screen.getByTestId('report-corrected')).toHaveTextContent(/earlier version is kept unchanged/)
    expect(screen.getByText('Corrected version 2, replacing version 1')).toBeInTheDocument()
    const next = screen.getByTestId('report-next-practice')
    const rec = within(next).getByTestId('practice-recommendation')
    expect(rec).toHaveAttribute('data-availability', 'AVAILABLE')
    expect(within(rec).getByText('Practice mission')).toBeInTheDocument()
    expect(within(rec).getByText('Find the missing fact')).toBeInTheDocument()
    expect(within(rec).getByText('About 10 minutes')).toBeInTheDocument()
    expect(within(rec).getByText('2 of 3 practice activities left')).toBeInTheDocument()
    expect(within(rec).getByText(/Starting uses one practice activity/)).toBeInTheDocument()
    expect(within(rec).getByRole('link', { name: /^Practise this/ })).toHaveAttribute('href', '/app/development/missions/MIS-CORE-MISSING-FACT-01')
    expect(within(next).getAllByRole('link', { name: /^Practise this/ })).toHaveLength(1)
    expect(within(next).queryByText('Recommended practice missions are not available here yet.')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\d\s*%/)
  })

  it('P5.6 without a reachable reviewed mission the next practice says so and never names the legacy mission', async () => {
    const body = ownerBody()
    body.data.recommendations = [{ kind: 'PRACTICE', capabilityId: 'CAP-A', behaviourIds: [], nextBehavior: 'Weighs two options before deciding.', availability: 'NO_REVIEWED_PRACTICE', allowance: { kind: 'UNLIMITED' }, consumesActivity: false, mission: null }]
    renderReport({ '/api/v1/assessment-sessions/sess-report-0001/report': () => jsonResponse(200, body) })
    const next = await screen.findByTestId('report-next-practice')
    expect(within(next).getByTestId('practice-unavailable')).toHaveTextContent('No reviewed practice is available yet for this.')
    expect(within(next).getByRole('link', { name: /^Practise this/ })).toHaveAttribute('href', '/app/development?source=sess-report-0001&moment=OPP-1')
    expect(document.body.textContent).not.toMatch(/MIS-MKT|marketing experiment/i)
    expect(screen.queryByText('An interpretation review is pending')).not.toBeInTheDocument()
    expect(screen.queryByTestId('report-corrected')).not.toBeInTheDocument()
  })

  it('an evidence item opens its details with how it was reviewed; methodology keeps technical detail behind a disclosure', async () => {
    renderReport({ '/api/v1/assessment-sessions/sess-report-0001/report': ownerBody() })
    await userEvent.click(await screen.findByRole('tab', { name: 'Evidence' }))
    await userEvent.click(screen.getByRole('button', { name: 'Details for Synthetic Reasoning' }))
    const dialog = await screen.findByRole('dialog', { name: 'Synthetic Reasoning' })
    expect(within(dialog).getByText('Reviewed by AI, not yet by a person')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Methodology' }))
    const details = screen.getByText('Technical details').closest('details')
    expect(details).not.toHaveAttribute('open')
    expect(within(details).getByText('sufficiency-rules.v1-provisional')).toBeInTheDocument()
  })

  it('not ready and under review are named states; another person\'s report is not available', async () => {
    const a = renderReport({ '/api/v1/assessment-sessions/sess-report-0001/report': () => jsonResponse(409, { error: { code: 'REPORT_NOT_READY', message: 'x', requestId: 'r' } }) })
    expect(await screen.findByText('Your report is not ready yet')).toBeInTheDocument()
    a.unmount()
    const b = renderReport({ '/api/v1/assessment-sessions/sess-report-0001/report': () => jsonResponse(409, { error: { code: 'REPORT_UNDER_REVIEW', message: 'x', requestId: 'r' } }) })
    expect(await screen.findByText('This report is under review')).toBeInTheDocument()
    b.unmount()
    renderReport({ '/api/v1/assessment-sessions/sess-report-0001/report': () => jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'x', requestId: 'r' } }) })
    expect(await screen.findByRole('heading', { name: /not available|do not have access|can.t see/i })).toBeInTheDocument()
  })

  it('creates a link share (summary, 30 days by default) and shows the link once', async () => {
    const { spy } = renderReport({
      '/api/v1/assessment-sessions/sess-report-0001/report': ownerBody(),
      '/api/v1/me/share-grants': () => jsonResponse(201, { data: { id: 'g1', recipientType: 'LINK', disclosureLevel: 'SUMMARY', expiresAt: '2026-11-01T10:00:00.000Z', token: 'synthetic-token-abcdefghijklmnopqrstuvwxyz' } }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Share' }))
    const dialog = await screen.findByRole('dialog', { name: 'Share this report' })
    expect(within(dialog).getByLabelText('An institution I belong to: Synthetic University'), 'a personal report can be shared with an institution').toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create share' }))
    await waitFor(() => expect(spy.mock.calls.some(([u, init]) => String(u).endsWith('/api/v1/me/share-grants') && init.method === 'POST')).toBe(true))
    const call = spy.mock.calls.find(([u, init]) => String(u).endsWith('/api/v1/me/share-grants') && init.method === 'POST')
    expect(JSON.parse(call[1].body)).toEqual({ recipientType: 'LINK', disclosureLevel: 'SUMMARY', expiresInDays: 30, sessionId: 'sess-report-0001' })
    expect(await within(dialog).findByText(/shown only once/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Private link')).toHaveValue(`${window.location.origin}/shared/synthetic-token-abcdefghijklmnopqrstuvwxyz`)
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByLabelText('Private link')), 'focus stays in the dialog')
  })

  it('a sponsored report offers only a private link (its sponsor already sees it); active shares can be revoked', async () => {
    const { spy } = renderReport({
      '/api/v1/assessment-sessions/sess-report-0001/report': ownerBody({
        report: { scope: 'SPONSORED', sponsor: { name: 'Synthetic University' } },
        privacy: { visibility: 'OWNER_AND_SPONSOR', activeShares: [{ id: '33333333-3333-4333-8333-333333333333', recipientType: 'LINK', organizationName: null, expiresAt: '2026-11-01T10:00:00.000Z', disclosureLevel: 'SUMMARY' }] },
      }),
      '/api/v1/me/share-grants/': () => jsonResponse(200, { data: { id: '33333333-3333-4333-8333-333333333333', revokedAt: '2026-10-03T00:00:00.000Z', status: 'REVOKED' } }),
    }, { campus: true })
    expect(await screen.findByTestId('report-visibility')).toHaveTextContent('Synthetic University can see this sponsored report.')
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))
    const dialog = await screen.findByRole('dialog', { name: 'Share this report' })
    expect(within(dialog).queryByLabelText(/institution I belong to/)).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Revoke private link' }))
    const confirm = await screen.findByRole('dialog', { name: 'Revoke this share?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(spy.mock.calls.some(([u, init]) => String(u).includes('/api/v1/me/share-grants/33333333') && init.method === 'DELETE')).toBe(true))
  })
})

describe('shared report page', () => {
  function renderShared(handler) {
    mockFetch({ '/api/v1/shared/': handler, '/api/v1/me': () => jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'x', requestId: 'r' } }) })
    return renderApp(<Routes><Route path="/shared/:token" element={<SharedReportPage />} /></Routes>, { route: '/shared/synthetic-token-abcdefghijklmnopqrstuvwxyz' })
  }

  it('a summary share has no highlights, priorities or owner-only links in its at-a-glance', async () => {
    renderShared(() => jsonResponse(200, { data: { report: reportFixture({ disclosure: 'SUMMARY' }), version: { number: 1, createdAt: null }, audience: 'SHARE_LINK', share: { expiresAt: '2026-11-01T10:00:00.000Z', disclosureLevel: 'SUMMARY' } } }))
    const glance = await screen.findByTestId('report-glance')
    expect(within(glance).getByTestId('evidence-coverage')).toBeInTheDocument()
    expect(screen.queryByTestId('report-highlights')).not.toBeInTheDocument()
    expect(within(glance).queryByText('Where to focus')).not.toBeInTheDocument()
    expect(within(glance).queryByRole('link', { name: 'Open growth' })).not.toBeInTheDocument()
  })

  it('a summary share shows only the summary and methodology, never quotes or moments', async () => {
    renderShared(() => jsonResponse(200, { data: { report: reportFixture({ disclosure: 'SUMMARY' }), version: { number: 1, createdAt: null }, audience: 'SHARE_LINK', share: { expiresAt: '2026-11-01T10:00:00.000Z', disclosureLevel: 'SUMMARY' } } }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Shared Prism report' })).toBeInTheDocument()
    expect(await screen.findByText('Summary only')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Evidence' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Development' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('report-moments')).not.toBeInTheDocument()
    expect(screen.queryByTestId('report-next-practice')).not.toBeInTheDocument()
    expect(screen.queryByTestId('report-versions')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('capability-map-row')).toHaveLength(2)
    expect(document.body.textContent).not.toContain('check which customers raised the issue')
    await userEvent.click(screen.getByRole('button', { name: /Open details for Working with people/ }))
    expect(screen.getByRole('tab', { name: 'Capabilities' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByTestId('report-capability')).toHaveLength(1)
  })

  it('an invalid or expired link says so', async () => {
    renderShared(() => jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'x', requestId: 'r' } }))
    expect(await screen.findByText('This link is not valid or has expired')).toBeInTheDocument()
  })
})

describe('report PDF', () => {
  it('is built from structured data only: provisional labels, quotes only when present, no score', () => {
    const lines = reportPdfLines(reportFixture()).map((l) => l.text).join('\n')
    expect(lines).toContain('Observed level: Early evidence (provisional label)')
    expect(lines).toContain('Not enough evidence to describe')
    expect(lines).toContain('Your words: "check which customers raised the issue"')
    expect(lines).toContain('In this assessment you were observed doing this: Checked the source of the complaints.')
    expect(lines).toContain('Moments that mattered')
    expect(lines).toContain('Making decisions (Synthetic Reasoning)')
    expect(lines).toContain('Where: Priya (Coordinating colleague): Before we plan, what do you want to check or ask?')
    expect(lines).not.toMatch(/<|>|composite|%|score:|percentile/i)
    const summary = reportPdfLines(reportFixture({ disclosure: 'SUMMARY' })).map((l) => l.text).join('\n')
    expect(summary).not.toContain('Your words')
    expect(summary).not.toContain('Moments that mattered')
  })

  it('P3 journey defect: a scenario titled like its assessment is not repeated in the header', () => {
    const r = reportFixture()
    r.header.scenarioTitle = r.header.assessment.title
    const lines = reportPdfLines(r).map((l) => l.text)
    expect(lines).toContain('Prism Workplace Simulation')
    expect(lines.join('\n')).not.toContain('Prism Workplace Simulation \u2014 Prism Workplace Simulation')
  })
})
