import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { jsonResponse } from '../test/utils.jsx'
import ScoreReport from './ScoreReport.jsx'

const SESSION_ID = 'synthetic-legacy-report'
const REPORT_URL = `/api/assessment/report/${SESSION_ID}`

function storedReport(overrides = {}) {
  return {
    sessionId: SESSION_ID,
    issuedAt: '2023-02-04T11:22:33.000Z',
    completedAt: '2023-02-04T10:52:33.000Z',
    validUntil: '2024-02-04T11:22:33.000Z',
    validityMonths: 12,
    method: 'Synthetic original method v1.2',
    scores: { overall: 63.5, communication: 72.25, criticalThinking: 0, problemSolving: 64, collaboration: 56, aiDigitalFluency: 81 },
    scenario: { title: 'Synthetic original scenario', domain: 'Synthetic domain' },
    feedback: { summary: 'Synthetic stored summary — kept exactly.', communication: 'Synthetic stored feedback — kept exactly.' },
    evidence: { communication: 'Synthetic stored observation — kept exactly.' },
    highlights: ['Synthetic stored strength — kept exactly.'],
    growthAreas: ['Synthetic stored development point — kept exactly.'],
    interviewQuestions: ['Synthetic stored interview prompt — kept exactly?'],
    ...overrides,
  }
}

function renderLegacy({ report, response = () => jsonResponse(200, storedReport()), session = SESSION_ID } = {}) {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url) === '/api/ecosystem/aligned-jobs') return jsonResponse(200, { jobs: [] })
    if (String(url) === REPORT_URL) return response()
    throw new Error('Unexpected synthetic request')
  })
  const entry = { pathname: '/score', search: session ? `?session=${session}` : '', state: report ? { report } : null }
  return {
    fetchSpy,
    ...render(<MemoryRouter initialEntries={[entry]}><ScoreReport /></MemoryRouter>),
  }
}

describe('original legacy report presentation', () => {
  it('displays stored scores, narratives, method and dates exactly without changing the frozen report', async () => {
    const report = storedReport()
    const original = structuredClone(report)
    renderLegacy({ report })
    expect(screen.getByText('Original report · Legacy method')).toBeInTheDocument()
    expect(screen.getByText(report.method)).toBeInTheDocument()
    for (const date of [report.issuedAt, report.completedAt, report.validUntil]) {
      expect(screen.getByText(date, { exact: false })).toBeInTheDocument()
    }
    expect(within(screen.getByRole('group', { name: 'Communication' })).getByText('72.25', { exact: true })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Critical Thinking' })).getByText('0', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('63.5%', { exact: true })).toBeInTheDocument()
    for (const text of [report.evidence.communication, report.feedback.summary, ...report.highlights, ...report.growthAreas, ...report.interviewQuestions]) {
      expect(screen.getByText(text, { exact: true })).toBeInTheDocument()
    }
    expect(screen.getByText('Synthetic original scenario · Synthetic domain')).toBeInTheDocument()
    expect(screen.queryByText(report.feedback.communication)).not.toBeInTheDocument()
    expect(screen.getByText(SESSION_ID, { exact: true })).toBeInTheDocument()
    await waitFor(() => expect(report).toEqual(original))
  })

  it('reads the durable original blob on refresh using the existing GET endpoint', async () => {
    const { fetchSpy } = renderLegacy()
    expect(screen.getByRole('status')).toHaveTextContent('Loading your report')
    expect(await screen.findByText('Synthetic stored summary — kept exactly.')).toBeInTheDocument()
    const reads = fetchSpy.mock.calls.filter(([url]) => url === REPORT_URL)
    expect(reads).toHaveLength(1)
    expect(reads[0][1].method).toBeUndefined()
  })

  it('does not substitute an issue date for a missing assessment date or invent an expiry date', () => {
    renderLegacy({ report: storedReport({ completedAt: undefined, validUntil: undefined }) })
    expect(screen.getByText('Assessment date not recorded')).toBeInTheDocument()
    expect(screen.getByText('Validity end date not recorded', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Issued 2023-02-04T11:22:33.000Z', { exact: false })).toBeInTheDocument()
  })

  it('leaves all missing historical dates and method metadata explicitly unknown', () => {
    renderLegacy({ report: storedReport({ issuedAt: null, completedAt: null, validUntil: null, validityMonths: null, method: null }) })
    expect(screen.getByText('Issue date not recorded', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Assessment date not recorded')).toBeInTheDocument()
    expect(screen.getByText('Validity end date not recorded', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Method details not recorded')).toBeInTheDocument()
    expect(screen.getByText('Validity period not recorded in this report.', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(/Issued October/)).not.toBeInTheDocument()
    expect(screen.queryByText(/PSRM-DEMO/)).not.toBeInTheDocument()
  })

  it('keeps stored method metadata and profile-first policy text, without translating scores into a new report', () => {
    renderLegacy({ report: storedReport({
      method: { version: 'Synthetic-method.v0', rubric: 'Synthetic-rubric.v0', sufficiencyRules: 'Synthetic-rules.v0' },
      reportPolicy: 'profile-first-v1',
      scoring: { language: 'en', status: 'Synthetic original scoring status' },
      scores: { communication: 29.75 },
    }) })
    expect(screen.getByText('Original report · Stored method')).toBeInTheDocument()
    for (const text of ['Synthetic-method.v0', 'Synthetic-rubric.v0', 'Synthetic-rules.v0', 'profile-first-v1', 'en', 'Synthetic original scoring status']) {
      expect(screen.getByText(text, { exact: true })).toBeInTheDocument()
    }
    expect(within(screen.getByRole('group', { name: 'Communication' })).getByText('29.75', { exact: true })).toBeInTheDocument()
    expect(screen.queryByText('Overall Prism Score')).not.toBeInTheDocument()
  })

  it('shows honest missing narratives, scenario and interview questions instead of client-authored observations', () => {
    renderLegacy({ report: storedReport({ feedback: {}, evidence: {}, highlights: [], growthAreas: [], scenario: null, interviewQuestions: null }) })
    expect(screen.getByText('Summary not recorded in this report.')).toBeInTheDocument()
    expect(screen.getByText('Strengths not recorded in this report.')).toBeInTheDocument()
    expect(screen.getByText('Growth areas not recorded in this report.')).toBeInTheDocument()
    expect(screen.getAllByText('Narrative not recorded in this report.')).toHaveLength(5)
    expect(screen.getByText('Scenario not recorded in this report.')).toBeInTheDocument()
    expect(screen.getByText('Interview questions not recorded in this report.')).toBeInTheDocument()
    for (const text of [/When Avatar/, /signature critical thinking/, /Credit others' ideas/, /Tell me about a time/, /Product Manager at a growing EdTech/]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument()
    }
  })

  it('keeps stored feedback when there is no separate evidence narrative', () => {
    const report = storedReport({ evidence: {} })
    renderLegacy({ report })
    expect(screen.getByText(report.feedback.communication, { exact: true })).toBeInTheDocument()
  })

  it('treats blank or absent narratives as unrecorded rather than generating a replacement', () => {
    renderLegacy({ report: storedReport({
      evidence: { communication: '  ' },
      feedback: { summary: '  ', communication: '  ' },
      highlights: null,
      growthAreas: ['  '],
      interviewQuestions: [],
    }) })
    expect(screen.getByText('Summary not recorded in this report.')).toBeInTheDocument()
    expect(screen.getByText('Strengths not recorded in this report.')).toBeInTheDocument()
    expect(screen.getByText('Growth areas not recorded in this report.')).toBeInTheDocument()
    expect(screen.getByText('Interview questions not recorded in this report.')).toBeInTheDocument()
    expect(screen.getAllByText('Narrative not recorded in this report.')).toHaveLength(5)
  })

  it.each([undefined, null, {}])('handles an absent scores object (%s) without fabrication or a crash', (scores) => {
    renderLegacy({ report: storedReport({ scores }) })
    expect(screen.getAllByText('Score not recorded')).toHaveLength(5)
    expect(screen.queryByText('Overall Prism Score')).not.toBeInTheDocument()
    expect(screen.getByText('Synthetic stored summary — kept exactly.')).toBeInTheDocument()
    expect(screen.queryByText('Early Stage', { exact: false })).not.toBeInTheDocument()
    expect(screen.queryByText('0', { exact: true })).not.toBeInTheDocument()
  })

  it('does not turn a missing score into zero or discard a stored narrative in a partial composite report', () => {
    renderLegacy({ report: storedReport({
      scores: { overall: 63.5, communication: null, criticalThinking: 0 },
      insufficientEvidence: ['communication'],
    }) })
    const card = screen.getByRole('group', { name: 'Communication' })
    expect(within(card).getByText('Insufficient evidence')).toBeInTheDocument()
    expect(within(card).getByText('Synthetic stored observation — kept exactly.')).toBeInTheDocument()
    const calculation = screen.getByRole('group', { name: 'Original score breakdown' })
    expect(within(calculation).getAllByText('Not recorded')).toHaveLength(8)
    expect(within(calculation).getAllByText('0', { exact: true })).toHaveLength(1)
    expect(within(calculation).getByText('63.5%', { exact: true })).toBeInTheDocument()
  })

  it('does not render non-finite score values as a measurement', () => {
    renderLegacy({ report: storedReport({
      scores: { overall: NaN, communication: Infinity, criticalThinking: undefined, problemSolving: -Infinity },
    }) })
    expect(screen.getAllByText('Score not recorded')).toHaveLength(5)
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument()
    expect(screen.queryByText('Overall Prism Score')).not.toBeInTheDocument()
  })

  it('uses the stored session ID rather than a demo ID when opened from navigation state', () => {
    renderLegacy({ report: storedReport(), session: null })
    expect(screen.getByText(SESSION_ID, { exact: true })).toBeInTheDocument()
    expect(screen.queryByText(/PSRM-DEMO/)).not.toBeInTheDocument()
  })

  it('shows a missing verification reference without fabricating a link or enabling link sharing', () => {
    renderLegacy({ report: storedReport({ sessionId: null }), session: null })
    expect(screen.getByText('Verification ID not recorded')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share', exact: true })).toBeDisabled()
    expect(screen.queryByRole('link', { name: /Verify this/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument()
    expect(screen.queryByText(/PSRM-DEMO|\/verify\/null|\/verify\/undefined/)).not.toBeInTheDocument()
  })
})

describe('legacy report read states', () => {
  it.each([401, 403, 404])('shows a non-disclosing explicit read error for HTTP %s', async (status) => {
    renderLegacy({ response: () => jsonResponse(status, { error: 'Synthetic private backend detail' }) })
    expect(await screen.findByRole('alert')).toHaveTextContent('Report unavailable')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to history' })).toBeInTheDocument()
    expect(screen.queryByText(/private backend detail|expired|complete an assessment first/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Overall Prism Score')).not.toBeInTheDocument()
  })

  it.each([
    ['server', () => jsonResponse(500, { error: 'Synthetic private backend detail' })],
    ['network', () => Promise.reject(new Error('Synthetic private network detail'))],
    ['invalid response', () => jsonResponse(200, null)],
    ['malformed response', () => jsonResponse(200, [])],
    ['invalid JSON', () => new Response('synthetic-not-json', { status: 200 })],
  ])('distinguishes a %s read failure from an empty or insufficient report and supports a read-only retry', async (_name, failure) => {
    let failed = true
    const { fetchSpy } = renderLegacy({ response: () => failed ? failure() : jsonResponse(200, storedReport()) })
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load report')
    expect(screen.queryByText(/Score not found|Insufficient evidence|private (backend|network) detail/)).not.toBeInTheDocument()
    failed = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Synthetic stored summary — kept exactly.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const reads = fetchSpy.mock.calls.filter(([url]) => url === REPORT_URL)
    expect(reads).toHaveLength(2)
    expect(reads.every(([, options]) => !options.method || options.method === 'GET')).toBe(true)
  })

  it('does not claim history was deleted or an assessment must be purchased when no report was selected', () => {
    const { fetchSpy } = renderLegacy({ session: null })
    expect(screen.getByRole('heading', { name: 'Report not selected' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to history' })).toBeInTheDocument()
    expect(fetchSpy.mock.calls.filter(([url]) => String(url).startsWith('/api/assessment/report/'))).toHaveLength(0)
  })
})
