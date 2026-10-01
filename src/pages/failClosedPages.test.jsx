import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { jsonResponse } from '../test/utils.jsx'
import StudentReportV2 from './StudentReportV2.jsx'
import EmployeeReportV2 from './EmployeeReportV2.jsx'
import ExploreMode from './ExploreMode.jsx'
import DevelopmentMission from './DevelopmentMission.jsx'
import AssessmentWorkspace from './AssessmentWorkspace.jsx'

const NUMERIC_CLAIM = /\d+\s*%|±|\/\s*100|\/\s*5\b|Score:|Rubric Level|Standard Error/

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderAt(path, pattern, element) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={element} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Route fetch by URL prefix; handlers receive (url, init).
function routeFetch(routes) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
    const u = String(url)
    for (const [prefix, handler] of Object.entries(routes)) {
      if (u.startsWith(prefix)) return typeof handler === 'function' ? handler(u, init) : jsonResponse(200, handler)
    }
    throw new Error(`unexpected fetch ${u}`)
  })
}

const insufficientCap = (id, name) => ({
  id, name, definition: `${name} definition`, status: 'INSUFFICIENT_EVIDENCE',
  statusReasons: ['BELOW_MINIMUM_EVIDENCE_UNITS'], level: null, levelDescriptor: null, evidenceIds: [],
  observedEvidence: { quote: null, context: null },
})

const insufficientReport = {
  reportVersion: '2.1.0-fail-closed', status: 'INSUFFICIENT_EVIDENCE', candidate: { name: null },
  claims: [],
  section2_methodologicalIntegrity: { evidenceSufficiency: { coreTransferable: { sufficient: 0, provisional: 0, insufficient: 2, humanReview: 0, total: 2 }, roleCapabilities: { total: 0 } } },
  section3_layer1TransferableCapabilities: [insufficientCap('CAP-A', 'Reasoning'), insufficientCap('CAP-B', 'Communication')],
  section4_layer2RoleCapabilities: [],
  section5_appliedWorkDemonstration: { scenarioTitle: null },
  section7_careerExploration: { roles: [] },
  section8_roleNeighborhood: { edges: [] },
  section9_strengthsAndGrowth: { strengths: [], growthOpportunities: [], insufficient: [] },
  section11_developmentMissions: [],
  section12_verification: { credentialVerificationUrl: null },
}

describe('StudentReportV2 (fail closed)', () => {
  it('insufficient evidence → explanatory state, no strengths, roles or numbers', async () => {
    routeFetch({ '/api/assessment/report/s-1/v2': insufficientReport })
    const { container } = renderAt('/report/s-1/v2', '/report/:sessionId/v2', <StudentReportV2 />)
    expect(await screen.findByRole('heading', { name: /Not enough evidence yet to describe your capabilities/ })).toBeInTheDocument()
    expect(screen.getAllByText('Insufficient evidence').length).toBeGreaterThan(0)
    expect(screen.getByText(/No strengths or development areas are described/)).toBeInTheDocument()
    expect(screen.getByText(/Roles are suggested here only when your assessment evidence supports them/)).toBeInTheDocument()
    expect(screen.getByText('0 of 2 core capabilities have enough evidence to describe.')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(NUMERIC_CLAIM)
    expect(container.textContent).not.toMatch(/PRISM NEXT|Prism Next/i)
  })

  it('a provisional capability shows its label (marked provisional) and only a verbatim quote', async () => {
    const report = {
      ...insufficientReport,
      status: 'PROVISIONAL',
      section3_layer1TransferableCapabilities: [{
        ...insufficientCap('CAP-A', 'Reasoning'), status: 'PROVISIONAL', statusReasons: ['RULES_NOT_APPROVED'],
        level: { band: 'DEMONSTRATED', label: 'Demonstrated', rubricMedian: 4 }, levelDescriptor: 'Weighs trade-offs.',
        observedEvidence: { quote: 'I compared both channels first.', context: 'Observed at exchange 2.' },
      }],
    }
    routeFetch({ '/api/assessment/report/s-2/v2': report })
    const { container } = renderAt('/report/s-2/v2', '/report/:sessionId/v2', <StudentReportV2 />)
    expect(await screen.findByText('Demonstrated (provisional)')).toBeInTheDocument()
    expect(screen.getByText('Provisional report')).toBeInTheDocument()
    expect(screen.getByText(/I compared both channels first\./)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(NUMERIC_CLAIM)
  })

  it('404 → report not found (no fabricated content)', async () => {
    routeFetch({ '/api/assessment/report/': () => jsonResponse(404, { error: 'Report not found', code: 'NOT_FOUND' }) })
    renderAt('/report/nope/v2', '/report/:sessionId/v2', <StudentReportV2 />)
    expect(await screen.findByRole('heading', { name: 'Report not found' })).toBeInTheDocument()
  })
})

describe('EmployeeReportV2 (fail closed)', () => {
  it('shows statuses without readiness or percentages', async () => {
    routeFetch({
      '/api/assessment/report/s-3/employee': {
        ...insufficientReport,
        currentRole: { title: null },
        targetRoleEvaluation: { targetRoleTitle: null, capabilityStatus: [{ capability: 'CAP-R', name: 'Budget judgement', status: 'INSUFFICIENT_EVIDENCE', level: null, evidenceIds: [] }] },
        internalMobilityPathways: [{ role: 'Operations', edgeType: 'ADJACENT', bridgeCompetency: 'Planning' }],
      },
    })
    const { container } = renderAt('/report/s-3/employee', '/report/:sessionId/employee', <EmployeeReportV2 />)
    expect(await screen.findByText('Budget judgement')).toBeInTheDocument()
    expect(screen.getByText(/This is not a judgement of readiness/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/Readiness Level|% Match|Ramp/)
    expect(container.textContent).not.toMatch(NUMERIC_CLAIM)
  })
})

describe('ExploreMode (fail closed)', () => {
  it('starts blank, never evaluates on mount, and stays disabled until an interest is chosen', async () => {
    const spy = routeFetch({})
    renderAt('/explore', '/explore', <ExploreMode />)
    const button = screen.getByRole('button', { name: 'Show roles' })
    expect(button).toBeDisabled()
    for (const select of screen.getAllByRole('combobox')) expect(select).toHaveValue('')
    await new Promise((r) => setTimeout(r, 20))
    expect(spy).not.toHaveBeenCalled()
  })

  it('sends only answered interests and labels every reason by its source', async () => {
    const user = userEvent.setup()
    const spy = routeFetch({
      '/api/job-families/explore': {
        success: true,
        basis: 'SELF_REPORTED_INTERESTS',
        recommendations: [
          { roleId: 'JF-1', title: 'Growth Associate', basis: 'SELF_REPORTED', whyShown: [{ type: 'SELF_REPORTED_INTEREST', statement: 'You said you enjoy Enterprising work.' }], unknowns: [{ capabilityId: 'C1', name: 'Budget judgement' }], nextStep: { label: 'Complete an assessment.' } },
          { roleId: 'JF-2', title: 'Unrelated Role', basis: 'NONE', whyShown: [], unknowns: [], nextStep: null },
        ],
      },
    })
    renderAt('/explore', '/explore', <ExploreMode />)
    await user.selectOptions(screen.getByLabelText('Enterprising'), '1')
    await user.click(screen.getByRole('button', { name: 'Show roles' }))
    expect(await screen.findByText('Growth Associate')).toBeInTheDocument()
    expect(screen.queryByText('Unrelated Role')).not.toBeInTheDocument()
    expect(screen.getByText('Self-reported')).toBeInTheDocument()
    expect(screen.getByText(/no assessment evidence yet for Budget judgement/)).toBeInTheDocument()
    const body = JSON.parse(spy.mock.calls[0][1].body)
    expect(body).toEqual({ candidateInterests: { E: 1 } })
  })
})

describe('DevelopmentMission (practice only)', () => {
  it('reports only the checks that ran — never a level', async () => {
    const user = userEvent.setup()
    routeFetch({
      '/api/missions/MIS-1/submit': {
        attemptId: 'att-1', missionId: 'MIS-1', status: 'PRACTICE_FEEDBACK_UNAVAILABLE', evidenceType: 'PRACTICE',
        criteria: [{ criterionId: 'HYPOTHESIS_FRAME', description: 'Hypothesis is written as "If … then … because …".', check: 'DETERMINISTIC', observed: false }],
        summary: '0 of 1 structural checks passed. Full practice feedback is not available yet.',
      },
      '/api/missions/MIS-1': { mission: { mission_id: 'MIS-1', title: 'Synthetic mission', challenge_briefing: { context: 'Synthetic context.' } } },
    })
    const { container } = renderAt('/missions/MIS-1', '/missions/:missionId', <DevelopmentMission />)
    expect(await screen.findByRole('heading', { name: 'Synthetic mission' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Your hypothesis or plan'), 'A long answer that is not framed')
    await user.click(screen.getByRole('button', { name: 'Submit practice' }))
    expect(await screen.findByText('Full practice feedback is not available yet')).toBeInTheDocument()
    expect(screen.getByText('Not found')).toBeInTheDocument()
    expect(container.textContent).toMatch(/never changes your formal assessment results/)
    expect(container.textContent).not.toMatch(/Level \d|Achieved/)
  })

  it('unknown mission → not found', async () => {
    routeFetch({ '/api/missions/': () => jsonResponse(404, { error: 'Development mission not found' }) })
    renderAt('/missions/NOPE', '/missions/:missionId', <DevelopmentMission />)
    expect(await screen.findByRole('heading', { name: 'Mission not found' })).toBeInTheDocument()
  })
})

const startBody = {
  messages: [{ speaker: 'Asha', role: 'Manager', content: 'Synthetic opening line.' }],
  scenario: { title: 'Synthetic scenario', context: 'Synthetic context', participants: [{ name: 'Asha', role: 'Manager' }], interactiveArtifacts: [] },
  interactiveArtifacts: [],
}

describe('AssessmentWorkspace (fail closed)', () => {
  it('no scenario in the session payload → "could not be loaded" with retry', async () => {
    const user = userEvent.setup()
    let calls = 0
    routeFetch({ '/api/assessment/start': () => { calls += 1; return jsonResponse(200, calls === 1 ? { messages: [] } : startBody) } })
    renderAt('/workspace/s-9', '/workspace/:sessionId', <AssessmentWorkspace />)
    expect(await screen.findByRole('heading', { name: 'This assessment could not be loaded' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Synthetic opening line.')).toBeInTheDocument()
  })

  it('never sends a hard-coded scenario; forwards only an explicit ?assessment id', async () => {
    const spy = routeFetch({ '/api/assessment/start': startBody })
    renderAt('/workspace/s-10?assessment=abc', '/workspace/:sessionId', <AssessmentWorkspace />)
    await screen.findByText('Synthetic opening line.')
    expect(JSON.parse(spy.mock.calls[0][1].body)).toEqual({ sessionId: 's-10', scenarioId: 'abc' })
  })

  it('a failed send keeps the draft and says "Not sent — retry"; no dialogue is invented', async () => {
    const user = userEvent.setup()
    routeFetch({
      '/api/assessment/start': startBody,
      '/api/assessment/message': () => jsonResponse(500, { error: 'Failed to get AI response' }),
    })
    renderAt('/workspace/s-11', '/workspace/:sessionId', <AssessmentWorkspace />)
    await screen.findByText('Synthetic opening line.')
    await user.type(screen.getByLabelText('Your answer'), 'My synthetic answer')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText(/Not sent — retry/)).toBeInTheDocument()
    expect(screen.getByLabelText('Your answer')).toHaveValue('My synthetic answer')
    expect(screen.getAllByText(/Synthetic opening line\./)).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('an empty reply adds no participant line', async () => {
    const user = userEvent.setup()
    routeFetch({ '/api/assessment/start': startBody, '/api/assessment/message': { messages: [] } })
    renderAt('/workspace/s-12', '/workspace/:sessionId', <AssessmentWorkspace />)
    await screen.findByText('Synthetic opening line.')
    await user.type(screen.getByLabelText('Your answer'), 'Hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText(/No reply was received/)).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByLabelText('Your answer')).toHaveValue('')
  })

  it('finishing needs the server acknowledgement: failure stays on the page', async () => {
    const user = userEvent.setup()
    let ok = false
    routeFetch({
      '/api/assessment/start': startBody,
      '/api/assessment/evaluate': () => (ok ? jsonResponse(200, { sessionId: 's-13' }) : jsonResponse(500, { error: 'Evaluation failed' })),
    })
    renderAt('/workspace/s-13', '/workspace/:sessionId', <AssessmentWorkspace />)
    await screen.findByText('Synthetic opening line.')
    await user.click(screen.getByRole('button', { name: 'Finish assessment' }))
    expect(await screen.findByText('Your assessment was not submitted')).toBeInTheDocument()
    expect(screen.queryByTestId('where')).not.toBeInTheDocument()
    ok = true
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/report/s-13/v2'))
  })
})
