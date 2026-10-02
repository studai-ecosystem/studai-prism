import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { renderApp, mockFetch, meBody, signIn } from '../../test/utils.jsx'
import { AuthGuard } from './AuthGuard.jsx'
import { WorkspaceGuard } from './WorkspaceGuard.jsx'
import { RoleGuard } from './RoleGuard.jsx'
import { EntitlementGuard } from './EntitlementGuard.jsx'

function Where() {
  const l = useLocation()
  return <p>at:{l.pathname}{l.search}</p>
}

describe('AuthGuard', () => {
  it('redirects anonymous users to /login with a next parameter', () => {
    renderApp(
      <Routes>
        <Route path="/app/home" element={<AuthGuard><p>secret</p></AuthGuard>} />
        <Route path="/login" element={<Where />} />
      </Routes>,
      { route: '/app/home?tab=x#profile' },
    )
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
    expect(screen.getByText(`at:/login?next=${encodeURIComponent('/app/home?tab=x#profile')}`)).toBeInTheDocument()
  })
  it('renders children when signed in', () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody() })
    renderApp(<AuthGuard><p>secret</p></AuthGuard>)
    expect(screen.getByText('secret')).toBeInTheDocument()
  })
})

describe('WorkspaceGuard', () => {
  const campus = { id: 'ws-c', type: 'CAMPUS_STUDENT', name: 'Synthetic University', organizationId: 'org-1', organizationName: 'Synthetic University' }
  const tree = (
    <Routes>
      <Route path="/app/campus/:organizationId/home" element={<WorkspaceGuard type="CAMPUS_STUDENT"><p>campus home</p></WorkspaceGuard>} />
    </Routes>
  )
  it('denies an organization the caller has no workspace for', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody() })
    renderApp(tree, { route: '/app/campus/org-other/home' })
    expect(await screen.findByText('This page is not available')).toBeInTheDocument()
    expect(screen.queryByText('campus home')).not.toBeInTheDocument()
  })
  it('activates the matching workspace and renders', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody({ workspaces: [meBody().data.workspaces[0], campus] }) })
    renderApp(tree, { route: '/app/campus/org-1/home' })
    expect(await screen.findByText('campus home')).toBeInTheDocument()
  })
})

describe('RoleGuard', () => {
  it('hides content unless the server granted the permission to the active workspace', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody({ permissions: ['admin.console'] }) })
    renderApp(
      <>
        <RoleGuard permission="cohorts.read" fallback={<p>hidden</p>}><p>cohorts</p></RoleGuard>
        <RoleGuard permission="admin.console" fallback={<p>no-admin</p>}><p>admin</p></RoleGuard>
      </>,
    )
    expect(screen.getByText('hidden')).toBeInTheDocument()
    expect(await screen.findByText('admin')).toBeInTheDocument()
  })
})

describe('EntitlementGuard', () => {
  it('renders the expired state for EXPIRED/EXHAUSTED and children otherwise', () => {
    const { rerender } = renderApp(<EntitlementGuard entitlement={{ status: 'EXPIRED' }}><p>start</p></EntitlementGuard>)
    expect(screen.getByText('This access has ended')).toBeInTheDocument()
    rerender(<EntitlementGuard entitlement={{ status: 'ACTIVE' }}><p>start</p></EntitlementGuard>)
    expect(screen.getByText('start')).toBeInTheDocument()
  })
  it('an unknown entitlement never renders the protected children (fail closed)', () => {
    renderApp(<EntitlementGuard entitlement={undefined}><p>start</p></EntitlementGuard>)
    expect(screen.queryByText('start')).not.toBeInTheDocument()
    expect(screen.getByText(/Checking access/)).toBeInTheDocument()
  })
  it('only ACTIVE renders the children; NONE and unrecognised statuses do not', () => {
    const { rerender } = renderApp(<EntitlementGuard entitlement={{ status: 'NONE' }}><p>start</p></EntitlementGuard>)
    expect(screen.queryByText('start')).not.toBeInTheDocument()
    rerender(<EntitlementGuard entitlement={{ status: 'SOMETHING_NEW' }}><p>start</p></EntitlementGuard>)
    expect(screen.queryByText('start')).not.toBeInTheDocument()
    rerender(<EntitlementGuard entitlement={{ status: 'NONE' }} noneFallback={<p>buy</p>}><p>start</p></EntitlementGuard>)
    expect(screen.getByText('buy')).toBeInTheDocument()
  })
})
