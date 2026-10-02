// C6.05–C6.08 — Student Report V3 UI: capability cards show only what the
// server validated (level + observed claim, or insufficient evidence), the
// evidence trail, at most three priorities, honest not-yet-available states,
// the share dialog (token shown once), revoke, the public shared page with
// selective disclosure, and a PDF built from structured data only.
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp, mockFetch, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import StudentReportPage from './pages/StudentReportPage.jsx'
import SharedReportPage from './pages/SharedReportPage.jsx'
import { reportPdfLines } from '../../lib/reportPdf.js'
import { ReportCapabilityCard } from './components/ReportCapabilityCard.jsx'

const CAMPUS_WS = { id: '11111111-1111-4111-8111-111111111111', type: 'CAMPUS_STUDENT', name: 'Synthetic University', organizationId: '22222222-2222-4222-8222-222222222222', organizationName: 'Synthetic University', visibilityPolicy: 'OWNER_AND_SPONSOR', permissions: [] }
const PERSONAL_WS = { id: 'personal', type: 'PERSONAL', name: 'Personal', organizationId: null, organizationName: null, visibilityPolicy: 'OWNER_ONLY' }

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
        { id: 'CAP-A', name: 'Synthetic Reasoning', definition: 'Reasoning definition.', layer: 'PRIMARY', status: 'PROVISIONAL', statusReasons: ['RULES_NOT_APPROVED'], level: { band: 'EARLY', label: 'Early evidence' }, levelDescriptor: 'Describes a first step.', summary: { claimId: 'claim-a', text: 'You checked which customers raised the issue first.', status: 'PROVISIONAL', evidenceIds: ['e1', 'e2', 'e3'] } },
        { id: 'CAP-B', name: 'Synthetic Collaboration', definition: null, layer: 'PRIMARY', status: 'INSUFFICIENT_EVIDENCE', statusReasons: ['BELOW_MINIMUM_EVIDENCE_UNITS'], level: null, levelDescriptor: null, summary: { claimId: null, text: 'There was not enough evidence in Prism Workplace Simulation to describe this.', status: 'INSUFFICIENT', evidenceIds: [] } },
      ],
      describedCount: 1,
      insufficientCount: 1,
    },
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
    const cards = screen.getAllByTestId('report-capability')
    expect(cards).toHaveLength(2)
    expect(within(cards[0]).getByText('You checked which customers raised the issue first.')).toBeInTheDocument()
    expect(within(cards[1]).getByText(/not enough evidence/)).toBeInTheDocument()
    expect(within(cards[1]).queryByText('What we observed')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\d\s*%|overall score|composite|rank/i)
  })

  it('links a card to its evidence, lists at most three priorities, and says what is not available yet', async () => {
    renderReport({ '/api/v1/assessment-sessions/sess-report-0001/report': ownerBody() })
    await userEvent.click(await screen.findByRole('button', { name: 'See evidence for Synthetic Reasoning' }))
    expect(screen.getByRole('tab', { name: 'Evidence' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(document.activeElement).toHaveTextContent('Showing evidence for Synthetic Reasoning'))
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

  it('the summary opens with an honest at-a-glance: coverage in words, no invented strengths, evidence highlights only for described capabilities', async () => {
    renderReport({ '/api/v1/assessment-sessions/sess-report-0001/report': ownerBody() })
    const glance = await screen.findByTestId('report-glance')
    expect(within(glance).getByTestId('evidence-coverage')).toHaveTextContent('1 of 2 capabilities have enough evidence to describe.')
    expect(within(glance).getByText(/No capability is described as demonstrated yet/)).toBeInTheDocument()
    expect(screen.queryByTestId('report-strengths')).not.toBeInTheDocument()
    expect(within(glance).getByTestId('report-highlights')).toHaveTextContent('Synthetic Reasoning: Checked the source of the complaints.')
    expect(within(glance).getByText('Synthetic Reasoning')).toBeInTheDocument()
    expect(within(glance).getByText('Change over time is shown only between assessments approved as comparable.')).toBeInTheDocument()
    expect(screen.getByText('Level names are provisional')).toBeInTheDocument()
    await userEvent.click(within(glance).getByRole('button', { name: 'See all evidence' }))
    expect(screen.getByRole('tab', { name: 'Evidence' })).toHaveAttribute('aria-selected', 'true')
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
    expect(await screen.findByText('This report is being reviewed')).toBeInTheDocument()
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

  it('a summary share shows only the summary and methodology, never quotes', async () => {
    renderShared(() => jsonResponse(200, { data: { report: reportFixture({ disclosure: 'SUMMARY' }), version: { number: 1, createdAt: null }, audience: 'SHARE_LINK', share: { expiresAt: '2026-11-01T10:00:00.000Z', disclosureLevel: 'SUMMARY' } } }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Shared Prism report' })).toBeInTheDocument()
    expect(await screen.findByText('Summary only')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Evidence' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Development' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('check which customers raised the issue')
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
    expect(lines).not.toMatch(/<|>|composite|%|score:|percentile/i)
    const summary = reportPdfLines(reportFixture({ disclosure: 'SUMMARY' })).map((l) => l.text).join('\n')
    expect(summary).not.toContain('Your words')
  })
})
