// C7.09–C7.12 — campus administration pages over mocked /api/v1 responses:
// scoped actions follow server permissions, every page has its states, the
// import wizard shows problems before sending and commits idempotently, the
// assignment wizard validates and shows what students will be told, role
// changes need confirmation, and onboarding resumes where it stopped.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderApp, mockFetch, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import { WorkspaceGuard } from '../../app/guards/WorkspaceGuard.jsx'
import CampusOverviewPage from './pages/CampusOverviewPage.jsx'
import CampusStudentsPage from './pages/CampusStudentsPage.jsx'
import CampusStudentDetailPage from './pages/CampusStudentDetailPage.jsx'
import CampusImportPage from './pages/CampusImportPage.jsx'
import CampusAssignWizardPage from './pages/CampusAssignWizardPage.jsx'
import CampusMembersPage from './pages/CampusMembersPage.jsx'
import CampusOnboardingPage from './pages/CampusOnboardingPage.jsx'

const ORG = '11111111-1111-4111-8111-111111111111'
const COHORT = '22222222-2222-4222-8222-222222222222'
const OWNER_PERMS = ['org.manage', 'team.manage', 'team.read', 'cohorts.read', 'students.read', 'students.manage', 'programs.write', 'programs.read', 'assignments.write', 'assignments.read', 'exports.cohort', 'org.overview.read', 'org.settings.read']
const OFFICER_PERMS = ['team.manage', 'team.read', 'cohorts.read', 'students.read', 'students.manage', 'programs.write', 'programs.read', 'assignments.write', 'assignments.read', 'org.overview.read']
const adminWs = (permissions) => ({ id: 'ws-admin', type: 'CAMPUS_ADMIN', name: 'Synthetic University', organizationId: ORG, organizationName: 'Synthetic University', visibilityPolicy: 'OWNER_AND_SPONSOR', permissions })
const api = (path) => `/api/v1/organizations/${ORG}${path}`
const cohortsBody = { data: { items: [{ id: COHORT, name: 'Commerce 2027', status: 'ACTIVE', memberCount: 2 }] } }

function render(path, element, routes, { permissions = OWNER_PERMS } = {}) {
  signIn()
  sessionStorage.setItem('prismActiveWorkspace', 'ws-admin')
  const spy = mockFetch({
    ...routes,
    '/api/v1/me': meBody({ flags: { PRISM_CAMPUS_ENABLED: true, PRISM_APP_SHELL_V3: true }, workspaces: [meBody().data.workspaces[0], adminWs(permissions)] }),
  })
  const out = renderApp(<Routes><Route path={`/campus/:organizationId/${path}`} element={<WorkspaceGuard type="CAMPUS_ADMIN">{element}</WorkspaceGuard>} /></Routes>, { route: `/campus/${ORG}/${path.replace(/:\w+/g, (m) => ({ ':studentId': 'student-1' }[m] || 'x'))}` })
  return { ...out, spy }
}
const callsTo = (spy, suffix, method = 'GET') => spy.mock.calls.filter(([u, init]) => String(u).includes(suffix) && (init?.method || 'GET') === method)

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear() })

describe('Campus overview', () => {
  it('shows participation counts with meaning and never a percentage or ranking', async () => {
    render('overview', <CampusOverviewPage />, {
      [api('/overview')]: { data: { enrolled: 12, invited: 3, cohorts: 2, activePrograms: 1, activeAssignments: 1, completion: { assigned: 12, completed: 5 }, reportsReady: 5, missionsActive: null, reassessmentsDue: null, scope: 'ALL' } },
      [api('/onboarding')]: { data: { steps: ['profile', 'launch'], completedSteps: ['profile'], data: {}, updatedAt: null } },
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument()
    expect(await screen.findByText('5 of 12')).toBeInTheDocument()
    expect(screen.getByText('Students enrolled').nextSibling).toHaveTextContent('12')
    expect(screen.getByText('Finish setting up')).toBeInTheDocument()
    expect(screen.getAllByText('Not available yet').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/\d\s*%|rank|top performer/i)
  })

  it('shows the unauthorized state when the server says not found', async () => {
    render('overview', <CampusOverviewPage />, {
      [api('/overview')]: () => jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'r' } }),
    }, { permissions: ['org.overview.read'] })
    expect(await screen.findByText('This page is not available')).toBeInTheDocument()
  })
})

describe('Students directory', () => {
  const page = { data: { items: [
    { kind: 'MEMBER', userId: 'student-1', name: 'Student One', email: 's1@test.local', status: 'ACTIVE', cohorts: [{ id: COHORT, name: 'Commerce 2027' }], assessment: { status: 'COMPLETED', assignmentId: 'a1' } },
    { kind: 'INVITE', inviteId: '33333333-3333-4333-8333-333333333333', userId: null, name: null, email: 'new@test.local', status: 'INVITED', cohorts: [], assessment: { status: 'NONE', assignmentId: null } },
  ], total: 2, page: 1, pageSize: 25 } }

  it('lists scoped students, filters on the server, and shows export only with permission', async () => {
    const { spy } = render('students', <CampusStudentsPage />, { [api('/students/export')]: { data: { fileName: 'students.csv', contentType: 'text/csv', csv: 'name\n' } }, [api('/students')]: page, [api('/cohorts')]: cohortsBody })
    await screen.findByRole('link', { name: 'Student One' })
    const table = screen.getByRole('table', { name: 'Students' })
    expect(within(table).getByRole('link', { name: 'Student One' })).toHaveAttribute('href', `/campus/${ORG}/students/student-1`)
    expect(within(table).getByText('Completed')).toBeInTheDocument()
    expect(within(table).getByRole('button', { name: 'Resend invite' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument()
    await screen.findByRole('option', { name: 'Commerce 2027' })
    await userEvent.selectOptions(screen.getByLabelText('Cohort'), COHORT)
    await waitFor(() => expect(callsTo(spy, `/students?cohortId=${COHORT}`).length).toBeGreaterThan(0))
    expect(screen.getByText(/Personal Prism activity is never shown/)).toBeInTheDocument()
  })

  it('hides export for a role without exports.cohort', async () => {
    render('students', <CampusStudentsPage />, { [api('/students')]: page, [api('/cohorts')]: cohortsBody }, { permissions: OFFICER_PERMS })
    await screen.findByRole('link', { name: 'Student One' })
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument()
  })

  it('student detail carries the privacy note and links only to sponsored reports', async () => {
    render('students/:studentId', <CampusStudentDetailPage />, {
      [api('/students/student-1')]: { data: {
        student: { userId: 'student-1', name: 'Student One', email: 's1@test.local', status: 'ACTIVE', joinedAt: null },
        cohorts: [{ id: COHORT, name: 'Commerce 2027' }],
        assignments: [{ assignmentId: 'a1', definitionId: 'd1', title: 'Prism Workplace Simulation', status: 'COMPLETED', completedAt: '2026-10-06T10:00:00Z' }],
        completedSponsoredSessions: [{ assignmentId: 'a1', sessionId: 'sess-a1' }],
        sharedWithOrganization: [],
        privacyNote: 'x',
      } },
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Student One' })).toBeInTheDocument()
    expect(screen.getByText(/Personal Prism activity is excluded unless the student explicitly shares it/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open report' })).toHaveAttribute('href', `/campus/${ORG}/reports/sess-a1`)
    expect(screen.getByText('Nothing shared.')).toBeInTheDocument()
  })
})

describe('Import wizard', () => {
  it('shows problem rows before sending, then commits once with an idempotency key', async () => {
    const job = { id: '44444444-4444-4444-8444-444444444444', status: 'PREVIEW', fileName: 'students.csv', totals: { rows: 2, invite: 1, alreadyMember: 0, errors: 1 } }
    const rows = [
      { rowNumber: 2, raw: { email: 'ok@test.local', cohort: 'Commerce 2027' }, normalized: { email: 'ok@test.local', name: null, cohortName: 'Commerce 2027' }, errors: [], action: 'INVITE' },
      { rowNumber: 3, raw: { email: 'broken', cohort: 'Commerce 2027' }, normalized: null, errors: ['EMAIL_INVALID'], action: 'ERROR' },
    ]
    const { spy } = render('cohorts/import', <CampusImportPage />, {
      [api(`/imports/${job.id}/commit`)]: () => jsonResponse(201, { data: { job: { ...job, status: 'COMMITTED', totals: { ...job.totals, invited: 1, skipped: 1, failed: 0 } }, replayed: false } }),
      [api(`/imports/${job.id}`)]: { data: { job: { ...job, status: 'COMMITTED' }, rows: rows.map((r, i) => ({ ...r, outcome: i === 0 ? 'INVITED' : 'SKIPPED' })) } },
      [api('/imports/students')]: () => jsonResponse(201, { data: { job, rows } }),
      [api('/cohorts')]: cohortsBody,
    })
    await screen.findByRole('heading', { level: 1, name: 'Import students' })
    await userEvent.click(screen.getByRole('button', { name: 'Check file' }))
    expect(await screen.findByText('Choose a CSV file first.')).toBeInTheDocument()
    const file = new File(['email,cohort\nok@test.local,Commerce 2027\nbroken,Commerce 2027\n'], 'students.csv', { type: 'text/csv' })
    await userEvent.upload(screen.getByLabelText('CSV file'), file)
    await userEvent.click(screen.getByRole('button', { name: 'Check file' }))
    expect(await screen.findByRole('heading', { name: 'Check the rows before sending' })).toBeInTheDocument()
    const post = callsTo(spy, '/imports/students', 'POST')[0]
    expect(JSON.parse(post[1].body)).toMatchObject({ fileName: 'students.csv', csv: expect.stringContaining('broken') })
    const table = screen.getByRole('table', { name: 'Rows in the file' })
    const bodyRows = within(table).getAllByRole('row').slice(1)
    expect(bodyRows[0]).toHaveTextContent('Email is not valid')
    expect(screen.getByText(/1 row has a problem and will be skipped/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Invite 1 student' }))
    expect(await screen.findByRole('heading', { name: 'Import complete' })).toBeInTheDocument()
    const commit = callsTo(spy, '/commit', 'POST')[0]
    expect(commit[1].headers['Idempotency-Key']).toMatch(/^import-/)
    expect(within(screen.getByRole('table', { name: 'Rows in the file' })).getByText('Invited')).toBeInTheDocument()
  })
})

describe('Assignment wizard', () => {
  it('validates each step, shows the student notice, and sends only approved choices', async () => {
    const { spy } = render('assessments/assign', <CampusAssignWizardPage />, {
      [api('/assessment-catalog')]: { data: { items: [{ id: 'prism-sim-gbo-l1', title: 'Prism Workplace Simulation', description: 'A conversation.', durationMinutes: 35, measures: ['CAP-A'], notMeasured: [], integrityModes: ['STANDARD', 'PROCTORED'], formPolicy: 'SERVER_SELECTED' }] } },
      [api('/cohorts')]: cohortsBody,
      [api('/programs')]: { data: { items: [] } },
      [api('/consent-preview')]: { data: { copyVersion: 'v1', heading: 'This assessment is sponsored by Synthetic University.', canSee: ['Synthetic University can see the report from this sponsored assessment.'], cannotSee: ['Your personal Prism assessments and private activity are not shared automatically.'] } },
      [api('/assignments')]: () => jsonResponse(201, { data: { id: 'a-new', definitionId: 'prism-sim-gbo-l1', title: 'Prism Workplace Simulation', status: 'ACTIVE', windowStart: null, windowEnd: null, integrityPolicy: 'STANDARD', programId: null, cohortIds: [COHORT], counts: { total: 2 }, rostered: 2 } }),
    })
    await screen.findByRole('heading', { level: 1, name: 'Assign an assessment' })
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Choose an assessment.')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText(/Prism Workplace Simulation/))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Choose at least one cohort.')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Commerce 2027'))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await userEvent.click(screen.getByLabelText(/Proctored/))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('What students will be told')).toBeInTheDocument()
    expect(screen.getByText(/not shared automatically/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Assign and notify students' }))
    await waitFor(() => expect(callsTo(spy, '/assignments', 'POST').length).toBe(1))
    const body = JSON.parse(callsTo(spy, '/assignments', 'POST')[0][1].body)
    expect(body).toMatchObject({ definitionId: 'prism-sim-gbo-l1', cohortIds: [COHORT], integrityPolicy: 'PROCTORED', programId: null })
    expect(new Date(body.windowEnd) > new Date(body.windowStart)).toBe(true)
  })
})

describe('Team', () => {
  it('a role change needs confirmation and is sent to the server', async () => {
    const { spy } = render('members', <CampusMembersPage />, {
      [api('/members/')]: () => jsonResponse(200, { data: { membershipId: 'm2', role: 'PLACEMENT_OFFICER' } }),
      [api('/members')]: { data: { members: [
        { membershipId: 'm1', id: 'owner-a', name: 'Synthetic Owner', email: 'o@test.local', role: 'ORG_OWNER', status: 'ACTIVE', departmentId: null, cohortIds: [], joinedAt: null, isSelf: true },
        { membershipId: 'm2', id: 'mentor-a', name: 'Synthetic Mentor', email: 'm@test.local', role: 'FACULTY_MENTOR', status: 'ACTIVE', departmentId: null, cohortIds: [], joinedAt: null, isSelf: false },
      ], pendingInvites: [], viewer: { canInvite: true, canManageRoles: true } } },
      [api('/cohorts')]: cohortsBody,
      [api('/structure')]: { data: { campuses: [], departments: [], academicPrograms: [], batches: [] } },
    })
    const select = await screen.findByLabelText('Role for Synthetic Mentor')
    expect(screen.queryByLabelText('Role for Synthetic Owner'), 'no controls on your own row').not.toBeInTheDocument()
    expect(screen.getByText('(you)')).toBeInTheDocument()
    await userEvent.selectOptions(select, 'PLACEMENT_OFFICER')
    const dialog = await screen.findByRole('dialog', { name: 'Change role?' })
    expect(callsTo(spy, '/members/m2', 'PATCH')).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change role' }))
    await waitFor(() => expect(callsTo(spy, '/members/m2', 'PATCH')).toHaveLength(1))
    expect(JSON.parse(callsTo(spy, '/members/m2', 'PATCH')[0][1].body)).toEqual({ role: 'PLACEMENT_OFFICER' })
  })

  it('an invite-only role can invite mentors but sees no role or remove controls', async () => {
    render('members', <CampusMembersPage />, {
      [api('/members')]: { data: { members: [{ membershipId: 'm1', id: 'owner-a', name: 'Synthetic Owner', email: 'o@test.local', role: 'ORG_OWNER', status: 'ACTIVE', departmentId: null, cohortIds: [], joinedAt: null, isSelf: false }], pendingInvites: [], viewer: { canInvite: true, canManageRoles: false } } },
      [api('/cohorts')]: cohortsBody,
      [api('/structure')]: { data: { campuses: [], departments: [], academicPrograms: [], batches: [] } },
    }, { permissions: OFFICER_PERMS })
    expect(await screen.findByText('Organization owner')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Invite team members' }))
    const dialog = await screen.findByRole('dialog', { name: 'Invite team members' })
    expect(within(within(dialog).getByLabelText('Role')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Faculty mentor'])
  })

  it('a read-only role sees roles as text, with no invite or remove actions', async () => {
    render('members', <CampusMembersPage />, {
      [api('/members')]: { data: { members: [{ membershipId: 'm1', id: 'owner-a', name: 'Synthetic Owner', email: 'o@test.local', role: 'ORG_OWNER', status: 'ACTIVE', departmentId: null, cohortIds: [], joinedAt: null, isSelf: false }], pendingInvites: [], viewer: { canInvite: false, canManageRoles: false } } },
    }, { permissions: ['team.read', 'org.overview.read'] })
    expect(await screen.findByText('Organization owner')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invite team members' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
  })
})

describe('Onboarding', () => {
  it('resumes at the saved step and saves progress on the server', async () => {
    const steps = ['profile', 'structure', 'team', 'students', 'program', 'assessment', 'schedule', 'privacy', 'launch']
    const { spy } = render('setup', <CampusOnboardingPage />, {
      [api('/onboarding')]: (u) => jsonResponse(200, { data: { steps, completedSteps: ['profile'], data: { lastStep: 'team' }, updatedAt: null } }),
      [api('/consent-preview')]: { data: { copyVersion: 'v1', heading: 'h', canSee: [], cannotSee: [] } },
    })
    expect(await screen.findByRole('heading', { level: 2, name: 'Invite your team' })).toBeInTheDocument()
    expect(screen.getByText('1 of 9 done')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open team' })).toHaveAttribute('href', `/campus/${ORG}/members`)
    await userEvent.click(screen.getByRole('button', { name: 'Mark as done' }))
    await waitFor(() => expect(callsTo(spy, '/onboarding', 'PUT').length).toBeGreaterThan(0))
    const body = JSON.parse(callsTo(spy, '/onboarding', 'PUT').at(-1)[1].body)
    expect(body.completedSteps).toEqual(['profile', 'team'])
    expect(body.data.lastStep).toBe('structure')
  })
})
