// PROD-READY Phase 9 — employer development-use (L&D) pages. Proves:
//   - dark: with PRISM_EMPLOYER_LND off (or the campus off) /employer/* never
//     renders and no employer API is called;
//   - every employer page renders on the design system with no ranking,
//     no sortable column, no bulk selection and no individual export, and the
//     requests carry no sort / level / score / threshold parameter;
//   - rendered employer pages carry no selection wording (copy ceiling); the
//     only lines naming ranking or cut-offs are the governed prohibited-use
//     lines, each a negation;
//   - the employee side shows the employer disclosure (invite page, panel),
//     identical to the server's copy.
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route, useLocation } from 'react-router-dom'
import AppRouter from '../../app/AppRouter.jsx'
import { renderApp, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import CampusInvitePage from '../workspaces/pages/CampusInvitePage.jsx'
import { ConsentScopePanel } from '../../components/campus/ConsentScopePanel.jsx'
import { EMPLOYER_CAN_SEE, EMPLOYER_CANNOT_SEE, employerProhibitedUses as clientProhibitedUses, EMPLOYER_DISCLOSURE_VERSION, EMPLOYER_ASSESSMENT_DISCLOSURE_VERSION } from '../../lib/copy/employer.js'
import { EMPLOYER_PAGE_COPY } from '../../lib/copy/employerPages.js'
import { employerJoinDisclosure, employerProhibitedUses, EMPLOYER_STAFF_COPY, EMPLOYER_DISCLOSURE_COPY_VERSION, EMPLOYER_ASSESSMENT_DISCLOSURE_COPY_VERSION } from '../../../server/domain/employer/copy.js'
import { SELECTION_WORDING, prohibitedKeysIn } from '../../../server/domain/employer/prohibitedUse.js'

const ORG = '33333333-3333-4333-8333-333333333333'
const COHORT = '44444444-4444-4444-8444-444444444444'
const ORG_NAME = 'Synthetic Employer Ltd'
const PERMS = ['org.overview.read', 'students.read', 'students.manage', 'cohorts.read', 'assignments.read', 'assignments.write', 'analytics.read', 'interventions.read', 'interventions.write', 'exports.cohort', 'team.read']
const EMPLOYER_WS = { id: 'ws-employer', type: 'EMPLOYER', name: ORG_NAME, organizationId: ORG, organizationName: ORG_NAME, organizationType: 'EMPLOYER', visibilityPolicy: null, permissions: PERMS }
const PERSONAL = meBody().data.workspaces[0]
const FLAGS_ON = { PRISM_APP_SHELL_V3: true, PRISM_CAMPUS_ENABLED: true, PRISM_EMPLOYER_LND: true, PRISM_STUDENT_REPORT_V3: true, PRISM_CAMPUS_ANALYTICS: true, PRISM_DEVELOPMENT_V2: true }
const api = (p = '') => `/api/v1/employer/organizations/${ORG}${p}`

const summary = { data: {
  id: ORG, name: ORG_NAME, organizationType: 'EMPLOYER', roles: [{ role: 'ORG_OWNER', label: 'Workspace owner' }], permissions: PERMS,
  copy: EMPLOYER_STAFF_COPY, prohibitedUses: [...employerProhibitedUses(ORG_NAME)],
  jobFamilyScope: { version: 'job-family-scope-v1', families: [{ id: 'graduate-business-operations', name: 'Graduate Business Operations' }, { id: 'customer-facing-growth', name: 'Customer-Facing Growth' }] },
  invitableRoles: [{ role: 'STUDENT', label: 'Employee' }, { role: 'FACULTY_MENTOR', label: 'Mentor' }],
} }
const overview = { data: { enrolled: 12, invited: 3, cohorts: 2, activeAssignments: 1, completion: { assigned: 12, completed: 7 }, sharedReports: 2, purpose: EMPLOYER_STAFF_COPY.purpose } }
const cohorts = { data: { items: [{ id: COHORT, name: 'Synthetic operations freshers', status: 'ACTIVE', memberCount: 12, jobFamily: { id: 'graduate-business-operations', name: 'Graduate Business Operations' } }] } }
const people = { data: {
  items: [
    { kind: 'MEMBER', userId: 'u-a', name: 'Synthetic Employee A', email: 'a@test.local', status: 'ACTIVE', cohorts: [{ id: COHORT, name: 'Synthetic operations freshers' }], assessmentStatus: 'COMPLETED' },
    { kind: 'MEMBER', userId: 'u-b', name: 'Synthetic Employee B', email: 'b@test.local', status: 'ACTIVE', cohorts: [{ id: COHORT, name: 'Synthetic operations freshers' }], assessmentStatus: 'ASSIGNED' },
  ],
  total: 2, page: 1, pageSize: 25, order: 'NAME', note: EMPLOYER_STAFF_COPY.peopleNote,
} }
const sharedReports = { data: { items: [{ sessionId: 'sess-shared-0001', person: { userId: 'u-a', name: 'Synthetic Employee A' }, disclosureLevel: 'SUMMARY', expiresAt: '2026-11-20T10:00:00.000Z', sharedAt: '2026-10-11T10:00:00.000Z' }], note: EMPLOYER_STAFF_COPY.sharedReportsNote } }
const catalog = { data: { items: [{ id: 'prism-workplace-core', title: 'Prism Workplace Simulation', description: null, durationMinutes: 30, families: [{ id: 'graduate-business-operations', name: 'Graduate Business Operations' }] }], note: EMPLOYER_STAFF_COPY.catalogNote } }
const assignments = { data: { items: [{ id: 'a-1', definitionId: 'prism-workplace-core', title: 'Prism Workplace Simulation', status: 'ACTIVE', windowStart: '2026-10-12T08:00:00.000Z', windowEnd: '2026-10-30T18:00:00.000Z', cohortIds: [COHORT], counts: { total: 12, COMPLETED: 7 } }] } }
const labels = { INSUFFICIENT: 'Insufficient evidence', EARLY: 'Early evidence', DEVELOPING: 'Developing', DEMONSTRATED: 'Demonstrated', STRONG: 'Strongly demonstrated' }
const insights = (suppressed) => ({ data: {
  capabilities: suppressed
    ? { minGroupSize: 10, suppressed: true, bucketLabels: labels, method: 'Method.', assessed: null, items: [], developmentFocus: [] }
    : { minGroupSize: 10, suppressed: false, bucketLabels: labels, method: 'Method.', assessed: 12, items: [{ capabilityId: 'CAP-A', name: 'Structured reasoning', suppressed: false, n: 12, buckets: { INSUFFICIENT: 2, EARLY: 2, DEVELOPING: 3, DEMONSTRATED: 3, STRONG: 2 } }], developmentFocus: [{ capabilityId: 'CAP-A', name: 'Structured reasoning', needs: 7, of: 12 }] },
  completion: { assignments: 1, funnel: { assigned: 12, acknowledged: 10, started: 9, completed: 7 }, notCompleted: { expired: 0, withdrawn: 0 } },
  missions: { minGroupSize: 10, available: true, interventions: [{ interventionId: 'i-1', name: 'Synthetic onboarding practice', suppressed: true, reason: 'SMALL_GROUP' }] },
  note: EMPLOYER_STAFF_COPY.insightsNote,
} })
const missions = { data: { missions: [{ id: 'MIS-SYN-01', title: 'Synthetic practice', targetCapabilityId: 'CAP-A', targetCapabilityName: 'Structured reasoning', estimatedMinutes: 15 }], capabilities: [{ id: 'CAP-A', name: 'Structured reasoning' }] } }
const interventions = { data: { items: [{ id: 'i-1', name: 'Synthetic onboarding practice', status: 'ACTIVE', cohortName: 'Synthetic operations freshers', startsOn: '2026-10-13', endsOn: '2026-11-13' }] } }
const sharedReport = { data: {
  report: {
    builderVersion: 'student-report.v3.0', sessionId: 'sess-shared-0001', disclosure: 'SUMMARY',
    header: { candidateName: 'Synthetic Employee A', assessment: { definitionId: 'prism-workplace-core', title: 'Prism Workplace Simulation', formId: 'prism-workplace-core:syn:1' }, scenarioTitle: 'Synthetic Scenario', sponsor: { organizationId: ORG, name: ORG_NAME }, scope: 'SPONSORED', completedAt: '2026-10-11T10:00:00.000Z', verification: { identityAssurance: 'L1', credentialId: null } },
    summary: {
      capabilities: [{ id: 'CAP-A', name: 'Structured reasoning', displayLabel: 'Making decisions', definition: 'Reasoning definition.', layer: 'PRIMARY', status: 'PROVISIONAL', statusReasons: ['RULES_NOT_APPROVED'], level: { band: 'EARLY', label: 'Early evidence' }, levelDescriptor: 'Describes a first step.', summary: { claimId: 'claim-a', text: 'Checked which customers raised the issue first.', status: 'PROVISIONAL', evidenceIds: ['e1'] } }],
      describedCount: 1, insufficientCount: 0,
    },
    plainStatement: 'In this assessment the person was observed checking the source of the complaints.',
    displayLabels: [{ id: 'CAP-A', name: 'Structured reasoning', displayLabel: 'Making decisions' }],
    moments: [], evidence: [], development: null,
    methodology: { builderVersion: 'student-report.v3.0', sufficiencyRulesVersion: 'sufficiency-rules.v1-provisional', levelLabelsStatus: 'PROVISIONAL', catalogVersion: 'assessment-catalog.v1', assessmentDefinitionId: 'prism-workplace-core', formId: 'prism-workplace-core:syn:1' },
    claims: [],
  },
  version: { number: 1, createdAt: '2026-10-11T10:00:00.000Z' },
  audience: 'SPONSOR',
  privacy: { visibility: 'SHARED_BY_STUDENT', activeShares: [], canShare: false },
  notice: EMPLOYER_STAFF_COPY.reportNotice,
  prohibitedUses: [...employerProhibitedUses(ORG_NAME)],
} }

function Where() { return <p data-testid="where">{useLocation().pathname}</p> }

function mountEmployer(route, { flags = FLAGS_ON, overrides = {} } = {}) {
  signIn()
  sessionStorage.setItem('prismActiveWorkspace', EMPLOYER_WS.id)
  const calls = []
  const routes = {
    '/api/v1/me': meBody({ flags, workspaces: [PERSONAL, EMPLOYER_WS] }),
    [api('/overview')]: overview, [api('/cohorts')]: cohorts, [api('/people/u-a')]: null, [api('/people')]: people,
    [api('/shared-reports/sess-shared-0001')]: sharedReport, [api('/shared-reports')]: sharedReports, [api('/assessment-catalog')]: catalog,
    [api('/assignments')]: assignments, [api('/insights/exports')]: null, [api('/insights')]: insights(false), [api('/development-missions')]: missions,
    [api('/interventions')]: interventions, [api('')]: summary, ...overrides,
  }
  const entries = Object.entries(routes).sort((a, b) => b[0].length - a[0].length)
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
    const raw = String(url?.url || url)
    const parsed = new URL(raw, 'http://test.local')
    const path = `${parsed.pathname}${parsed.search}`
    calls.push({ path, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null })
    for (const [prefix, handler] of entries) {
      if (path === prefix || path.startsWith(`${prefix}?`) || (prefix.length > 12 && path.startsWith(prefix) && !path.slice(prefix.length).startsWith('/'))) {
        if (handler === null) return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Not found' } })
        return typeof handler === 'function' ? handler(path, init) : jsonResponse(200, handler)
      }
    }
    if (path.startsWith('/api/v1/me/notifications')) return jsonResponse(200, { data: { items: [], unread: 0 } })
    return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Not found' } })
  })
  renderApp(<><AppRouter /><Where /></>, { route })
  return calls
}

// Visible text outside the governed prohibited-use lines.
function visibleTextOutsideRules() {
  const clone = document.body.cloneNode(true)
  for (const el of clone.querySelectorAll('[data-testid="employer-usage-rules"], [data-testid="employer-prohibited-uses"]')) el.remove()
  return clone.textContent
}
function expectNoSelectionWording() {
  const text = visibleTextOutsideRules()
  for (const re of SELECTION_WORDING) expect(text, `selection wording ${re}`).not.toMatch(re)
}
function expectNoSelectionControls() {
  expect(document.querySelector('[aria-sort]')).toBeNull()
  expect(screen.queryByRole('checkbox', { name: /select all/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /sort|rank|order by/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /export (people|students|individual|results)/i })).toBeNull()
  expect(screen.queryByRole('link', { name: /export/i })).toBeNull()
}
const noProhibitedParams = (calls) => {
  for (const c of calls.filter((x) => x.path.startsWith('/api/v1/employer'))) {
    const params = Object.fromEntries(new URL(c.path, 'http://test.local').searchParams)
    expect(prohibitedKeysIn(params), c.path).toEqual([])
    if (c.body && !Array.isArray(c.body)) expect(prohibitedKeysIn(c.body), c.path).toEqual([])
  }
}

beforeAll(async () => {
  await Promise.all([
    import('../../pages/LandingPage.jsx'),
    import('./pages/EmployerOverviewPage.jsx'), import('./pages/EmployerPeoplePage.jsx'), import('./pages/EmployerInsightsPage.jsx'),
    import('./pages/EmployerReportPage.jsx'), import('./pages/EmployerAssessmentsPage.jsx'), import('./pages/EmployerSharedReportsPage.jsx'),
    import('./pages/EmployerDevelopmentPage.jsx'),
  ])
})
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear() })

describe('employer workspace: dark', () => {
  it.each([
    ['flag off', { ...FLAGS_ON, PRISM_EMPLOYER_LND: false }],
    ['campus off', { ...FLAGS_ON, PRISM_CAMPUS_ENABLED: false }],
  ])('%s: /employer/* never renders and no employer API is called', async (_label, flags) => {
    const calls = mountEmployer(`/employer/${ORG}/overview`, { flags })
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/))
    expect(screen.queryByRole('heading', { name: EMPLOYER_PAGE_COPY.overview.title })).toBeNull()
    expect(calls.some((c) => c.path.startsWith('/api/v1/employer'))).toBe(false)
  })
})

describe('employer workspace: pages', () => {
  it('overview: participation counts and how the workspace may be used', async () => {
    mountEmployer(`/employer/${ORG}/overview`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument()
    expect(await screen.findByText('People who joined')).toBeInTheDocument()
    expect(screen.getByText('7 of 12 assigned assessments completed')).toBeInTheDocument()
    const rules = await screen.findByTestId('employer-usage-rules')
    expect(rules).toHaveTextContent('sole or primary basis')
    for (const li of within(rules).getAllByRole('listitem')) expect(li.textContent).toMatch(/may not|no ranking/)
    const nav = screen.getByRole('navigation', { name: 'Employer development workspace' })
    expect(within(nav).getAllByRole('link').map((l) => l.textContent).slice(0, 6)).toEqual(['Overview', 'People', 'Shared reports', 'Assessments', 'Development', 'Group summaries'])
    expectNoSelectionWording()
    expectNoSelectionControls()
  })

  it('people: roster in fixed name order with participation only; filters never by result; invitations', async () => {
    const calls = mountEmployer(`/employer/${ORG}/people`)
    const table = await screen.findByRole('table', { name: 'People' })
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Name', 'Email', 'Group', 'Membership', 'Latest assessment'])
    expect(within(table).getByText('Synthetic Employee A')).toBeInTheDocument()
    expect(within(table).getByText('Completed')).toBeInTheDocument()
    expectNoSelectionControls()
    await userEvent.selectOptions(within(screen.getByRole('search')).getByLabelText('Group'), COHORT)
    await waitFor(() => expect(calls.some((c) => c.path.includes(`cohortId=${COHORT}`))).toBe(true))
    const inviteForm = screen.getByRole('form', { name: 'Invite people' })
    await userEvent.type(within(inviteForm).getByLabelText(/Email addresses/), 'new.one@test.local')
    await userEvent.click(within(inviteForm).getByRole('button', { name: 'Send invitations' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === api('/invites'))).toBe(true))
    expect(calls.find((c) => c.path === api('/invites')).body).toEqual({ role: 'STUDENT', emails: ['new.one@test.local'] })
    noProhibitedParams(calls)
    expectNoSelectionWording()
  })

  it('shared reports: listed only while shared, with who shared and until when', async () => {
    mountEmployer(`/employer/${ORG}/shared-reports`)
    const table = await screen.findByRole('table', { name: 'Shared reports' })
    expect(within(table).getByText('Synthetic Employee A')).toBeInTheDocument()
    expectNoSelectionControls()
    expectNoSelectionWording()
  })

  it('shared report: the employee-shared report with how it may be used', async () => {
    mountEmployer(`/employer/${ORG}/shared-reports/sess-shared-0001`)
    expect(await screen.findByText(EMPLOYER_STAFF_COPY.reportNotice)).toBeInTheDocument()
    expect(screen.getByTestId('employer-prohibited-uses')).toHaveTextContent('may not rank people')
    expect(await screen.findByText(/chose to share this report with your organization/)).toBeInTheDocument()
    expectNoSelectionControls()
  })

  it('shared report: a share that ended reads as not shared, never as an error about the person', async () => {
    mountEmployer(`/employer/${ORG}/shared-reports/sess-shared-0001`, { overrides: { [api('/shared-reports/sess-shared-0001')]: null } })
    expect(await screen.findByText(EMPLOYER_PAGE_COPY.report.gone)).toBeInTheDocument()
  })

  it('group summaries: suppressed groups say hidden; export offers group summaries only', async () => {
    const calls = mountEmployer(`/employer/${ORG}/insights`, { overrides: { [api('/insights/exports')]: { data: { fileName: 'prism-group-summary-capabilities.csv', contentType: 'text/csv', csv: 'Capability\r\n', note: EMPLOYER_STAFF_COPY.exportNote } } } })
    expect(await screen.findByRole('heading', { level: 1, name: 'Group summaries' })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Capabilities across your people' })).toBeInTheDocument()
    expect(screen.getByText(/Synthetic onboarding practice: Hidden/)).toBeInTheDocument()
    const form = screen.getByRole('form', { name: 'Export group summaries' })
    const options = within(form).getAllByRole('option').map((o) => o.value)
    expect(options).toEqual(['capabilities', 'completion', 'missions'])
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    await userEvent.click(within(form).getByRole('button', { name: 'Export CSV' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === api('/insights/exports'))).toBe(true))
    expect(calls.find((c) => c.path === api('/insights/exports')).body).toEqual({ view: 'capabilities' })
    expectNoSelectionControls()
    expectNoSelectionWording()
    noProhibitedParams(calls)
  })

  it('group summaries: a small organization sees the whole view hidden', async () => {
    mountEmployer(`/employer/${ORG}/insights`, { overrides: { [api('/insights')]: insights(true) } })
    expect(await screen.findByText(EMPLOYER_PAGE_COPY.insights.hidden)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Capabilities across your people' })).toBeNull()
  })

  it('assessments: only in-scope assessments, no proctoring or threshold options', async () => {
    const calls = mountEmployer(`/employer/${ORG}/assessments`)
    const form = await screen.findByRole('form', { name: 'Sponsor an assessment' })
    expect(await within(form).findByRole('option', { name: /Prism Workplace Simulation \(Graduate Business Operations\)/ })).toBeInTheDocument()
    expect(within(form).queryByLabelText(/integrity|proctor|minimum|threshold|level/i)).toBeNull()
    expect(await screen.findByText('7 of 12')).toBeInTheDocument()
    expectNoSelectionControls()
    expectNoSelectionWording()
    noProhibitedParams(calls)
  })

  it('development: practice plans for a group', async () => {
    mountEmployer(`/employer/${ORG}/development`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Development' })).toBeInTheDocument()
    expect(await screen.findByText('Synthetic onboarding practice')).toBeInTheDocument()
    expectNoSelectionWording()
    expectNoSelectionControls()
  })
})

describe('employee side: employer disclosure', () => {
  it('the client lists, prohibited-use lines and versions are identical to the server copy', () => {
    const server = employerJoinDisclosure(ORG_NAME)
    expect([...EMPLOYER_CAN_SEE]).toEqual([...server.canSee])
    expect([...EMPLOYER_CANNOT_SEE]).toEqual([...server.cannotSee])
    expect([...clientProhibitedUses(ORG_NAME)]).toEqual([...employerProhibitedUses(ORG_NAME)])
    expect(EMPLOYER_DISCLOSURE_VERSION).toBe(EMPLOYER_DISCLOSURE_COPY_VERSION)
    expect(EMPLOYER_ASSESSMENT_DISCLOSURE_VERSION).toBe(EMPLOYER_ASSESSMENT_DISCLOSURE_COPY_VERSION)
  })

  it('the invitation shows what the employer can and cannot see and how it may use Prism', async () => {
    signIn()
    const disclosure = JSON.parse(JSON.stringify(employerJoinDisclosure(ORG_NAME)))
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const u = String(url)
      if (u.startsWith('/api/v1/me')) return jsonResponse(200, meBody({ flags: FLAGS_ON }))
      if (u.startsWith('/api/v1/org-invites/')) {
        return jsonResponse(200, { data: { organizationId: ORG, organizationName: ORG_NAME, organizationType: 'EMPLOYER', role: 'STUDENT', status: 'PENDING', expired: false, expiresAt: '2026-10-30T00:00:00.000Z', emailHint: 's****@test.local', disclosureVersion: disclosure.copyVersion, disclosure } })
      }
      return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Not found' } })
    })
    renderApp(<Routes><Route path="/app/campus-invite/:token" element={<CampusInvitePage />} /></Routes>, { route: '/app/campus-invite/synthetic-employer-invite-token-000000001' })
    expect(await screen.findByText(disclosure.heading)).toBeInTheDocument()
    expect(screen.getByText(/You have been invited as: Employee/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: `${ORG_NAME} can see` })).toBeInTheDocument()
    expect(screen.getByTestId('employer-prohibited-uses')).toHaveTextContent('sole or primary basis for any selection, employment, promotion or termination decision')
    expect(screen.getByLabelText(disclosure.acknowledge)).toBeInTheDocument()
    expect(screen.getByText(disclosure.draftNotice)).toBeInTheDocument()
    expectNoSelectionWording()
  })

  it('the campus panel is unchanged; the employer panel adds the usage lines', () => {
    const { container, rerender } = renderApp(<ConsentScopePanel organizationName="Synthetic University" />)
    expect(container.querySelector('[data-testid="employer-prohibited-uses"]')).toBeNull()
    rerender(<ConsentScopePanel organizationName={ORG_NAME} organizationType="EMPLOYER" />)
    expect(screen.getByTestId('employer-prohibited-uses')).toHaveTextContent('may not rank people by their Prism results')
    expect(screen.getByText(EMPLOYER_CANNOT_SEE[0])).toBeInTheDocument()
  })
})
