import { describe, it, expect, vi } from 'vitest'
import { screen, within, waitFor, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route, useLocation, MemoryRouter } from 'react-router-dom'
import { campusNavFor, CAMPUS_NAV } from '../components/navigation/navConfig.js'
import { renderApp, mockFetch, meBody, signIn } from '../test/utils.jsx'
import { WorkspaceSwitcher } from '../features/workspaces/components/WorkspaceSwitcher.jsx'
import { AssessmentShell } from './AssessmentShell.jsx'
import { CampusShell } from './CampusShell.jsx'
import { StudentShell } from './StudentShell.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'

const personal = meBody().data.workspaces[0]
const campusStudent = { id: 'ws-cs', type: 'CAMPUS_STUDENT', name: 'Synthetic University', organizationId: 'org-1', organizationName: 'Synthetic University' }
const campusAdmin = { id: 'ws-ca', type: 'CAMPUS_ADMIN', name: 'Synthetic University', organizationId: 'org-1', organizationName: 'Synthetic University', permissions: ['org.overview.read', 'students.read', 'analytics.read'] }

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

describe('campus navigation is filtered by server permissions', () => {
  it('no permissions → no items; some → only those; all → every §19.1 item', () => {
    expect(campusNavFor('org-1', [])).toEqual([])
    const some = campusNavFor('org-1', ['students.read', 'billing.read'])
    expect(some.map((i) => i.label)).toEqual(['Students', 'Billing'])
    expect(some[0].to).toBe('/campus/org-1/students')
    const all = campusNavFor('org-1', CAMPUS_NAV.map((i) => i.permission))
    expect(all.map((i) => i.label)).toEqual(['Overview', 'Students', 'Cohorts', 'Programs', 'Assessments', 'Development', 'Reassessments', 'Analytics', 'Reports', 'Team', 'Integrations', 'Billing', 'Settings'])
  })

  it('CampusShell renders only permitted items, and the mobile drawer lists the same items', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody({ flags: { PRISM_CAMPUS_ENABLED: true }, workspaces: [personal, campusAdmin] }) })
    sessionStorage.setItem('prismActiveWorkspace', 'ws-ca')
    renderApp(
      <Routes><Route path="/campus/:organizationId/*" element={<CampusShell><p>content</p></CampusShell>} /></Routes>,
      { route: '/campus/org-1/overview' },
    )
    const nav = await screen.findByRole('navigation', { name: 'Campus administration' })
    await waitFor(() => expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Overview', 'Students', 'Analytics', 'Help']))
    expect(within(nav).queryByRole('link', { name: 'Billing' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    const drawer = screen.getByRole('dialog', { name: 'Navigation' })
    expect(within(drawer).getAllByRole('link').map((l) => l.textContent)).toEqual(['Overview', 'Students', 'Analytics', 'Help'])
  })
})

describe('StudentShell workspace scoping', () => {
  it('inside a campus student workspace only the sponsored sections are offered, scoped to the org', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody({ workspaces: [personal, campusStudent] }) })
    sessionStorage.setItem('prismActiveWorkspace', 'ws-cs')
    renderApp(
      <Routes><Route path="/app/campus/:organizationId/*" element={<StudentShell><p>content</p></StudentShell>} /></Routes>,
      { route: '/app/campus/org-1/home' },
    )
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/app/campus/org-1/home', '/app/campus/org-1/assignments', '/app/campus/org-1/development', '/app/campus/org-1/growth', '/contact'])
  })

  it('personal routes switch a campus workspace back to PERSONAL', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody({ workspaces: [personal, campusStudent] }) })
    sessionStorage.setItem('prismActiveWorkspace', 'ws-cs')
    renderApp(<Routes><Route path="/app/home" element={<StudentShell><PageHeader title="Home" context={personal} /></StudentShell>} /></Routes>, { route: '/app/home' })
    await screen.findByRole('navigation', { name: 'Primary' })
    await waitFor(() => expect(sessionStorage.getItem('prismActiveWorkspace')).toBe('personal'))
  })
})

describe('WorkspaceSwitcher', () => {
  it('lists server workspaces, is keyboard operable, switches context, navigates home and confirms', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody({ workspaces: [personal, campusStudent] }) })
    renderApp(<><WorkspaceSwitcher /><Where /></>, { route: '/app/home' })
    const btn = await screen.findByRole('button', { name: /Workspace Personal/ })
    await waitFor(() => expect(btn).toBeEnabled())
    await userEvent.click(btn)
    const list = await screen.findByRole('listbox')
    await waitFor(() => expect(within(list).getAllByRole('option')).toHaveLength(2))
    expect(within(list).getByRole('option', { name: /Personal/ })).toHaveAttribute('aria-selected', 'true')
    list.focus()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/app/campus/org-1/home'))
    expect(screen.getByRole('status')).toHaveTextContent('Now viewing: Synthetic University')
    expect(screen.getByRole('button', { name: /Workspace Synthetic University/ })).toHaveFocus()
  })

  it('Escape closes the list and returns focus', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody() })
    renderApp(<WorkspaceSwitcher />)
    const btn = await screen.findByRole('button', { name: /Workspace/ })
    await userEvent.click(btn)
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(btn).toHaveFocus()
  })
})

describe('AssessmentShell', () => {
  it('uses the dark assessment theme and has no product navigation', () => {
    const { container } = render(<MemoryRouter><AssessmentShell><p>simulation</p></AssessmentShell></MemoryRouter>)
    expect(container.firstChild).toHaveClass('theme-assessment')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('simulation')
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeInTheDocument()
  })
})

describe('page title and route focus', () => {
  it('PageHeader sets a distinct document title', () => {
    render(<MemoryRouter><PageHeader title="Evidence" /></MemoryRouter>)
    expect(document.title).toBe('Evidence · Prism')
  })
  it('after in-shell navigation focus moves to the new page heading', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody() })
    renderApp(
      <Routes>
        <Route element={<StudentShell />}>
          <Route path="/app/home" element={<PageHeader title="Home" />} />
          <Route path="/app/capabilities" element={<PageHeader title="Capabilities" />} />
        </Route>
      </Routes>,
      { route: '/app/home' },
    )
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    await userEvent.click(within(nav).getByRole('link', { name: 'My Prism' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Capabilities' })).toHaveFocus())
    vi.restoreAllMocks()
  })
})
