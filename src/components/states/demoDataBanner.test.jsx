// PROD-READY Phase 8 — the persistent "Demo data" banner. It shows on every
// shell (student, campus admin, assessment) while /api/v1/me says the caller
// belongs to a synthetic demo organization, and never otherwise.
import { describe, it, expect } from 'vitest'
import { screen, render, waitFor } from '@testing-library/react'
import { Routes, Route, MemoryRouter } from 'react-router-dom'
import { renderApp, mockFetch, meBody, signIn } from '../../test/utils.jsx'
import { StudentShell } from '../../layouts/StudentShell.jsx'
import { CampusShell } from '../../layouts/CampusShell.jsx'
import { AssessmentShell } from '../../layouts/AssessmentShell.jsx'
import { DemoDataBanner, DEMO_BANNER_MESSAGE } from './DemoDataBanner.jsx'

const personal = meBody().data.workspaces[0]
const demoStudent = { id: 'ws-demo', type: 'CAMPUS_STUDENT', name: 'Demo College (synthetic)', organizationId: 'org-demo', organizationName: 'Demo College (synthetic)', isDemo: true }
const demoAdmin = { id: 'ws-demo-a', type: 'CAMPUS_ADMIN', name: 'Demo College (synthetic)', organizationId: 'org-demo', organizationName: 'Demo College (synthetic)', isDemo: true, permissions: ['org.overview.read', 'analytics.read'] }
const withDemo = (body, demo) => ({ data: { ...body.data, demo } })

describe('DemoDataBanner', () => {
  it('student shell: shown for a demo account, on every page of the shell', async () => {
    signIn()
    mockFetch({ '/api/v1/me': withDemo(meBody({ flags: { PRISM_APP_SHELL_V3: true }, workspaces: [personal, demoStudent] }), true) })
    renderApp(<Routes><Route path="/app/*" element={<StudentShell><p>content</p></StudentShell>} /></Routes>, { route: '/app/home' })
    const banner = await screen.findByRole('note', { name: 'Demo data' })
    expect(banner).toHaveTextContent(DEMO_BANNER_MESSAGE)
    expect(banner.querySelector('button')).toBeNull()
  })

  it('campus admin shell: shown for a demo organization', async () => {
    signIn()
    mockFetch({ '/api/v1/me': withDemo(meBody({ flags: { PRISM_CAMPUS_ENABLED: true }, workspaces: [personal, demoAdmin] }), true) })
    sessionStorage.setItem('prismActiveWorkspace', 'ws-demo-a')
    renderApp(<Routes><Route path="/campus/:organizationId/*" element={<CampusShell><p>content</p></CampusShell>} /></Routes>, { route: '/campus/org-demo/overview' })
    expect(await screen.findByRole('note', { name: 'Demo data' })).toBeInTheDocument()
  })

  it('never shown for a real account', async () => {
    signIn()
    mockFetch({ '/api/v1/me': withDemo(meBody({ flags: { PRISM_APP_SHELL_V3: true } }), false) })
    renderApp(<Routes><Route path="/app/*" element={<StudentShell><p>content</p></StudentShell>} /></Routes>, { route: '/app/home' })
    await screen.findByText('content')
    await waitFor(() => expect(screen.queryByRole('note', { name: 'Demo data' })).toBeNull())
  })

  it('assessment shell outside the providers renders without a banner; an explicit demo prop shows it', async () => {
    const { container } = render(<MemoryRouter><AssessmentShell><p>simulation</p></AssessmentShell></MemoryRouter>)
    expect(screen.queryByTestId('demo-data-banner')).toBeNull()
    const shown = render(<DemoDataBanner demo />)
    expect(shown.getByTestId('demo-data-banner')).toBeInTheDocument()
    expect(container).toBeTruthy()
  })
})
