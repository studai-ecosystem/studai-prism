import { describe, it, expect, beforeEach } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route, useLocation } from 'react-router-dom'
import AppRouter from '../app/AppRouter.jsx'
import { StudentShell } from './StudentShell.jsx'
import { CampusShell } from './CampusShell.jsx'
import { campusNavFor, CAMPUS_NAV, NAV_GROUP_LABELS } from '../components/navigation/navConfig.js'
import { renderApp, mockFetch, meBody, signIn } from '../test/utils.jsx'
import { studentRoutes } from '../test/studentFixtures.js'

const personal = meBody().data.workspaces[0]
const campusAdmin = { id: 'ws-ca', type: 'CAMPUS_ADMIN', name: 'Synthetic University', organizationId: 'org-1', organizationName: 'Synthetic University', permissions: CAMPUS_NAV.map((i) => i.permission) }

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

beforeEach(() => localStorage.removeItem('prism-sidebar-collapsed'))

describe('personal navigation follows the outcome-based IA (P3.2)', () => {
  it('primary items, an honest disabled Prepare, then a labelled More group, then Help and Settings', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody() })
    renderApp(<Routes><Route path="/app/home" element={<StudentShell><p>content</p></StudentShell>} /></Routes>, { route: '/app/home' })
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    expect(within(nav).getAllByRole('link').map((l) => l.textContent.replace(/\s*\(.*\)$/, ''))).toEqual(
      ['Home', 'Assessments', 'My Prism', 'Practice', 'Prepare', 'History', 'Explore', 'Shared reports', 'Help', 'Settings'],
    )
    const hrefs = within(nav).getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(hrefs).toEqual(['/app/home', '/app/assessments', '/app/capabilities', '/app/development', null, '/app/assessments?tab=history', '/app/explore', '/app/sharing', '/contact', '/app/settings'])
    // Evidence and Growth are no longer primary entries: they live under My Prism.
    expect(within(nav).queryByRole('link', { name: 'Evidence' })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Growth' })).not.toBeInTheDocument()
    const prepare = within(nav).getByRole('link', { name: /^Prepare/ })
    expect(prepare).toHaveAttribute('aria-disabled', 'true')
    expect(prepare).toHaveTextContent('Not yet available')
    await userEvent.hover(prepare)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Not yet available')
    const more = within(nav).getByRole('group', { name: NAV_GROUP_LABELS.more })
    expect(within(more).getAllByRole('link').map((l) => l.textContent)).toEqual(['Explore', 'Shared reports'])
  })
})

describe('campus navigation is grouped into sections', () => {
  it('permitted items keep their order and carry their section', () => {
    const items = campusNavFor('org-1', CAMPUS_NAV.map((i) => i.permission))
    expect(items.map((i) => [i.label, i.group || null])).toEqual([
      ['Overview', null], ['Students', 'people'], ['Cohorts', 'people'], ['Programs', 'people'],
      ['Assessments', 'assess'], ['Development', 'assess'], ['Reassessments', 'assess'],
      ['Analytics', 'insight'], ['Reports', 'insight'],
      ['Team', 'admin'], ['Integrations', 'admin'], ['Billing', 'admin'], ['Settings', 'admin'],
    ])
  })

  it('CampusShell renders the section headings as named groups', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody({ flags: { PRISM_CAMPUS_ENABLED: true }, workspaces: [personal, campusAdmin] }) })
    sessionStorage.setItem('prismActiveWorkspace', 'ws-ca')
    renderApp(<Routes><Route path="/campus/:organizationId/*" element={<CampusShell><p>content</p></CampusShell>} /></Routes>, { route: '/campus/org-1/overview' })
    const nav = await screen.findByRole('navigation', { name: 'Campus administration' })
    await waitFor(() => expect(within(nav).getByRole('group', { name: NAV_GROUP_LABELS.people })).toBeInTheDocument())
    expect(within(nav).getByRole('group', { name: NAV_GROUP_LABELS.admin })).toBeInTheDocument()
  })
})

describe('collapsible sidebar', () => {
  it('collapses to icons, keeps every link nameable, remembers the choice, and expands again', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody() })
    renderApp(<Routes><Route path="/app/home" element={<StudentShell><p>content</p></StudentShell>} /></Routes>, { route: '/app/home' })
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    await userEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    expect(localStorage.getItem('prism-sidebar-collapsed')).toBe('1')
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toHaveAttribute('aria-expanded', 'false')
    expect(within(nav).getByRole('link', { name: 'My Prism' })).toHaveAttribute('title', 'My Prism')
    expect(within(nav).queryByText(NAV_GROUP_LABELS.more)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Expand navigation' }))
    expect(localStorage.getItem('prism-sidebar-collapsed')).toBe('0')
    expect(within(nav).getByText(NAV_GROUP_LABELS.more)).toBeInTheDocument()
  })

  it('starts collapsed when that was the saved preference', async () => {
    localStorage.setItem('prism-sidebar-collapsed', '1')
    signIn()
    mockFetch({ '/api/v1/me': meBody() })
    renderApp(<Routes><Route path="/app/home" element={<StudentShell><p>content</p></StudentShell>} /></Routes>, { route: '/app/home' })
    expect(await screen.findByRole('button', { name: 'Expand navigation' })).toBeInTheDocument()
  })
})

describe('one workspace context control', () => {
  it('campus off: a static personal label with its privacy scope, no switcher, no duplicate badges', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody() })
    renderApp(<Routes><Route path="/app/home" element={<StudentShell><p>content</p></StudentShell>} /></Routes>, { route: '/app/home' })
    await screen.findByRole('navigation', { name: 'Primary' })
    expect(screen.queryByRole('button', { name: /Workspace/ })).not.toBeInTheDocument()
    expect(screen.getAllByText('Private to you')).toHaveLength(1)
  })

  it('campus on: the switcher names the workspace and who can see it', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody({ flags: { PRISM_CAMPUS_ENABLED: true } }) })
    renderApp(<Routes><Route path="/app/home" element={<StudentShell><p>content</p></StudentShell>} /></Routes>, { route: '/app/home' })
    const btn = await screen.findByRole('button', { name: /Workspace Personal Private to you/ })
    expect(btn).toBeInTheDocument()
    expect(screen.getAllByText('Private to you')).toHaveLength(1)
  })
})

describe('alias routes keep every public URL working', () => {
  it('/app/missions/:id redirects to the development mission URL', async () => {
    signIn()
    mockFetch({ ...studentRoutes(), '/api/v1/me': meBody({ flags: { PRISM_APP_SHELL_V3: true, PRISM_DEVELOPMENT_V2: true } }), '/api/': () => new Promise(() => {}) })
    renderApp(<><AppRouter /><Where /></>, { route: '/app/missions/m-1' })
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/app/development/missions/m-1'), { timeout: 4000 })
  })
})