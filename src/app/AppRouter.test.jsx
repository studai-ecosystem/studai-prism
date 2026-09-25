import { describe, it, expect } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import AppRouter from './AppRouter.jsx'
import { renderApp, mockFetch, meBody, signIn } from '../test/utils.jsx'

const licence = { email: 'synthetic@test.local', completed: 0, pendingSessionId: null, canPurchase: true, mode: 'dummy' }

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

const app = <><AppRouter /><Where /></>

describe('AppRouter — flags off (default)', () => {
  it('/app renders the legacy launcher unchanged', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody(), '/api/payment/licence': licence })
    renderApp(app, { route: '/app' })
    expect(await screen.findByRole('heading', { name: 'Prism Assessment' })).toBeInTheDocument()
    expect(await screen.findByText('Ready — start when you are')).toBeInTheDocument()
  })
  it('/app/home behaves like any unknown legacy URL (→ /)', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody(), '/api/': () => new Promise(() => {}) })
    renderApp(app, { route: '/app/home' })
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'), { timeout: 4000 })
  })
  it('V3 detail URLs resolve to the legacy pages, preserving params', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody(), '/api/assessment/report/': () => new Promise(() => {}) })
    renderApp(app, { route: '/app/reports/sess-123' })
    await screen.findByText('/report/sess-123/v2', {}, { timeout: 3000 })
  })
  it('campus routes are dark (indistinguishable from unknown URLs)', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody(), '/api/': () => new Promise(() => {}) })
    renderApp(app, { route: '/campus/org-1/overview' })
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'), { timeout: 4000 })
  })
})

describe('AppRouter — mixed and all-on flag combinations never loop and keep legacy reachable', () => {
  const pendingApi = () => new Promise(() => {})

  it('report flag on but shell flag off: /report/:id/v2 stays on the legacy report', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody({ flags: { PRISM_STUDENT_REPORT_V3: true } }), '/api/': pendingApi })
    renderApp(app, { route: '/report/sess-9/v2' })
    await screen.findByText('/report/sess-9/v2', { selector: '[data-testid="where"]' })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByTestId('where')).toHaveTextContent('/report/sess-9/v2')
  })

  it('all flags on: the V3 placeholder links to the legacy page with ?legacy=1, which renders legacy', async () => {
    const flags = { PRISM_APP_SHELL_V3: true, PRISM_STUDENT_REPORT_V3: true, PRISM_ROLE_EXPLORATION_V2: true, PRISM_DEVELOPMENT_V2: true, PRISM_ASSESSMENT_WORKSPACE_V3: true }
    signIn()
    mockFetch({ '/api/v1/me': meBody({ flags }), '/api/': pendingApi })
    renderApp(app, { route: '/report/sess-7/v2' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Report' })).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/app/reports/sess-7')
    const link = screen.getByRole('link', { name: 'Open the current version' })
    expect(link).toHaveAttribute('href', '/report/sess-7/v2?legacy=1')
    await userEvent.click(link)
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByTestId('where')).toHaveTextContent('/report/sess-7/v2')
    expect(screen.queryByRole('heading', { level: 1, name: 'Report' })).not.toBeInTheDocument()
  })

  it('all flags on: explore, mission and workspace placeholders each offer a working legacy link', async () => {
    const flags = { PRISM_APP_SHELL_V3: true, PRISM_ROLE_EXPLORATION_V2: true, PRISM_DEVELOPMENT_V2: true, PRISM_ASSESSMENT_WORKSPACE_V3: true }
    for (const [route, title, href] of [
      ['/explore', 'Explore Roles', '/explore?legacy=1'],
      ['/missions/MIS-1', 'Mission', '/missions/MIS-1?legacy=1'],
      ['/workspace/sess-5', 'Assessment', '/workspace/sess-5?legacy=1'],
    ]) {
      signIn()
      mockFetch({ '/api/v1/me': meBody({ flags }), '/api/': pendingApi })
      const { unmount } = renderApp(app, { route })
      expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Open the current version' })).toHaveAttribute('href', href)
      unmount()
    }
  })

  it('navigating into a V3 route that mounts its own shell still moves focus to its heading', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody({ flags: { PRISM_APP_SHELL_V3: true, PRISM_ROLE_EXPLORATION_V2: true } }), '/api/': pendingApi })
    renderApp(app, { route: '/app/home' })
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    await userEvent.click(within(nav).getByRole('link', { name: 'Explore Roles' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Explore Roles' })).toHaveFocus())
    expect(document.title).toBe('Explore Roles · Prism')
  })

  it('a failing /api/v1/me on a V3 route shows the retryable error too', async () => {
    signIn()
    mockFetch({ '/api/v1/me': () => new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'x', requestId: 'req-me-2' } }), { status: 500 }) })
    renderApp(app, { route: '/app/explore' })
    expect(await screen.findByText('We could not load your workspace', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(document.title).toBe('Workspace unavailable · Prism')
  })

  it('a failing /api/v1/me on a shell route shows a retryable error, not a silent redirect', async () => {
    signIn()
    mockFetch({ '/api/v1/me': () => new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'x', requestId: 'req-me-1' } }), { status: 500 }) })
    renderApp(app, { route: '/app/home' })
    expect(await screen.findByText('We could not load your workspace', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText('Reference: req-me-1')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/app/home')
  })
})

describe('AppRouter — PRISM_APP_SHELL_V3 on', () => {
  const shellOn = () => mockFetch({ '/api/v1/me': meBody({ flags: { PRISM_APP_SHELL_V3: true } }) })

  it('/app moves to /app/home inside the new shell with honest empty states', async () => {
    signIn()
    shellOn()
    renderApp(app, { route: '/app' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/app/home')
    expect(screen.getByText('No assessments yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main')
    expect(document.getElementById('main')).toBeInTheDocument()
  })
  it('the primary nav marks the current page and navigates', async () => {
    signIn()
    shellOn()
    renderApp(app, { route: '/app/home' })
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(within(nav).getByRole('link', { name: 'My Capabilities' }))
    expect(await screen.findByText('You do not have a formal capability profile yet.')).toBeInTheDocument()
  })
  it('every §6.2 section renders a page with an h1', async () => {
    const pages = [
      ['/app/assessments', 'Assessments'],
      ['/app/evidence', 'Evidence'],
      ['/app/development', 'Development'],
      ['/app/growth', 'Growth'],
      ['/app/sharing', 'Sharing'],
      ['/app/settings', 'Settings'],
      ['/app/assessments/any-id/briefing', 'Assessment briefing'],
      ['/app/assessments/any-id/system-check', 'System check'],
    ]
    for (const [route, title] of pages) {
      signIn()
      shellOn()
      const { unmount } = renderApp(app, { route })
      expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
      unmount()
    }
  })
  it('anonymous users on a shell URL behave like any unknown legacy URL', async () => {
    mockFetch({ '/api/': () => new Promise(() => {}) })
    renderApp(app, { route: '/app/capabilities' })
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'), { timeout: 4000 })
  })
  it('legacy /explore stays legacy while PRISM_ROLE_EXPLORATION_V2 is off', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody({ flags: { PRISM_APP_SHELL_V3: true } }), '/api/job-families/explore': { success: true, recommendations: [] } })
    renderApp(app, { route: '/explore' })
    await screen.findByText('/explore')
    expect(screen.getByTestId('where')).toHaveTextContent('/explore')
  })
})
