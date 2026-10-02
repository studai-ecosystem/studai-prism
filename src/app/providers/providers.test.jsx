import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { renderApp, mockFetch, meBody, signIn, jsonResponse } from '../../test/utils.jsx'
import { useAuth } from './AuthProvider.jsx'
import { useFlag, useFeatureFlags } from './FeatureFlagProvider.jsx'
import { useWorkspace, wsKey, WorkspaceContent } from './WorkspaceProvider.jsx'
import { api } from '../../api/client.js'
import { clearUser, setToken } from '../../lib/session.js'

function AuthProbe() {
  const { status, user } = useAuth()
  return <p>status:{status} name:{user?.name || '-'}</p>
}

function FlagProbe({ flag }) {
  const { enabled, loading } = useFlag(flag)
  return <p>{loading ? 'loading' : enabled ? 'on' : 'off'}</p>
}

describe('AuthProvider', () => {
  it('an account change on a legacy continuation cannot remount and automatically restart that old action', () => {
    const originalPath = window.location.href
    try {
      window.history.replaceState({}, '', '/assessment?session=synthetic-old-session')
      signIn({ name: 'Account A', email: 'a@test.local' })
      mockFetch({ '/api/v1/me': meBody() })
      const starts = vi.fn()
      function LegacyActionProbe() {
        useEffect(() => { starts() }, [])
        return <p>Synthetic old continuation</p>
      }
      renderApp(<LegacyActionProbe />)
      expect(starts).toHaveBeenCalledTimes(1)
      act(() => {
        signIn({ name: 'Account B', email: 'b@test.local' })
        window.dispatchEvent(new Event('prism-session-change'))
      })
      expect(starts).toHaveBeenCalledTimes(1)
      expect(screen.queryByText('Synthetic old continuation')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Your account changed' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open current account' })).toBeInTheDocument()
    } finally {
      window.history.replaceState({}, '', originalPath)
    }
  })

  it('changing account resets in-memory drafts and known browser artifacts, but preserves an explicit invitation', async () => {
    signIn({ name: 'Account A', email: 'a@test.local' })
    mockFetch({ '/api/v1/me': meBody() })
    function DraftProbe() {
      const [text, setText] = useState('')
      return <input aria-label="Synthetic private draft" value={text} onChange={(event) => setText(event.target.value)} />
    }
    renderApp(<WorkspaceContent><DraftProbe /></WorkspaceContent>)
    await userEvent.type(screen.getByLabelText('Synthetic private draft'), 'Synthetic private text')
    sessionStorage.setItem('prism.draft.synthetic-session', 'Synthetic stored draft')
    sessionStorage.setItem('prism.pending.synthetic-session', 'Synthetic pending response')
    sessionStorage.setItem('prismActiveWorkspace', 'old-campus')
    sessionStorage.setItem('prismInviteToken', 'explicit-invite')
    act(() => {
      signIn({ name: 'Account B', email: 'b@test.local' })
      window.dispatchEvent(new Event('prism-session-change'))
    })
    expect(screen.getByLabelText('Synthetic private draft')).toHaveValue('')
    expect(sessionStorage.getItem('prism.draft.synthetic-session')).toBeNull()
    expect(sessionStorage.getItem('prism.pending.synthetic-session')).toBeNull()
    expect(sessionStorage.getItem('prismActiveWorkspace')).toBeNull()
    expect(sessionStorage.getItem('prismInviteToken')).toBe('explicit-invite')
  })

  it('same-account token renewal does not clear an unsent local draft', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody() })
    function DraftProbe() {
      const [text, setText] = useState('')
      return <input aria-label="Synthetic same-account draft" value={text} onChange={(event) => setText(event.target.value)} />
    }
    renderApp(<WorkspaceContent><DraftProbe /></WorkspaceContent>)
    await userEvent.type(screen.getByLabelText('Synthetic same-account draft'), 'Synthetic retained text')
    sessionStorage.setItem('prism.draft.synthetic-session', 'Synthetic retained text')
    act(() => setToken('synthetic-renewed-token'))
    expect(screen.getByLabelText('Synthetic same-account draft')).toHaveValue('Synthetic retained text')
    expect(sessionStorage.getItem('prism.draft.synthetic-session')).toBe('Synthetic retained text')
  })

  it('reports anonymous without a session and follows session changes', async () => {
    renderApp(<AuthProbe />)
    expect(screen.getByText(/status:anonymous/)).toBeInTheDocument()
    act(() => signIn())
    act(() => { window.dispatchEvent(new Event('prism-session-change')) })
    expect(screen.getByText(/status:authenticated name:Synthetic Student/)).toBeInTheDocument()
    act(() => clearUser())
    expect(screen.getByText(/status:anonymous/)).toBeInTheDocument()
  })
})

describe('FeatureFlagProvider', () => {
  it('another account signing in on the same tab never sees the previous account\'s data', async () => {
    signIn({ name: 'Account A', email: 'a@test.local', college: '', year: '' })
    mockFetch({
      '/api/v1/me': () => {
        const who = JSON.parse(localStorage.getItem('prism_user')).email
        return jsonResponse(200, { data: { ...meBody().data, user: { id: who, email: who, name: who } } })
      },
    })
    function MeProbe() {
      const { me } = useFeatureFlags()
      return <p>me:{me ? me.user.email : 'none'}</p>
    }
    const { queryClient } = renderApp(<MeProbe />)
    expect(await screen.findByText('me:a@test.local')).toBeInTheDocument()
    queryClient.setQueryData(wsKey('personal', 'home'), 'A-private-home')
    act(() => clearUser())
    expect(queryClient.getQueryData(wsKey('personal', 'home'))).toBeUndefined()
    act(() => signIn({ name: 'Account B', email: 'b@test.local', college: '', year: '' }))
    act(() => { window.dispatchEvent(new Event('prism-session-change')) })
    expect(screen.queryByText('me:a@test.local')).not.toBeInTheDocument()
    expect(await screen.findByText('me:b@test.local')).toBeInTheDocument()
  })

  it('a direct switch to another account (new token, no sign-out) drops the previous cache', async () => {
    signIn({ name: 'Account A', email: 'a2@test.local', college: '', year: '' })
    mockFetch({ '/api/v1/me': meBody() })
    const { queryClient } = renderApp(<AuthProbe />)
    queryClient.setQueryData(wsKey('personal', 'report'), 'A-report')
    act(() => signIn({ name: 'Account B', email: 'b2@test.local', college: '', year: '' }))
    act(() => { window.dispatchEvent(new Event('prism-session-change')) })
    expect(screen.getByText(/name:Account B/)).toBeInTheDocument()
    expect(queryClient.getQueryData(wsKey('personal', 'report'))).toBeUndefined()
  })

  it('signIn() logs in through the session API and resets the cache', async () => {
    mockFetch({
      '/api/auth/login': () => jsonResponse(200, { token: 'tok-new', user: { name: 'Synthetic', email: 's@test.local', college: '', year: '' } }),
      '/api/v1/me': meBody(),
    })
    function SignInProbe() {
      const { signIn: doSignIn, status } = useAuth()
      return <><p>status:{status}</p><button type="button" onClick={() => doSignIn({ email: 's@test.local', password: 'pw-123456' })}>go</button></>
    }
    const { queryClient } = renderApp(<SignInProbe />)
    queryClient.setQueryData(['ws', 'personal', 'stale'], 'stale')
    await userEvent.click(screen.getByRole('button', { name: 'go' }))
    expect(await screen.findByText('status:authenticated')).toBeInTheDocument()
    expect(localStorage.getItem('prism_token')).toBe('tok-new')
    expect(queryClient.getQueryData(['ws', 'personal', 'stale'])).toBeUndefined()
  })

  it('anonymous → every flag off without calling the server', () => {
    const f = mockFetch({})
    renderApp(<FlagProbe flag="PRISM_APP_SHELL_V3" />)
    expect(screen.getByText('off')).toBeInTheDocument()
    expect(f).not.toHaveBeenCalled()
  })
  it('authenticated → flags come from /api/v1/me', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody({ flags: { PRISM_APP_SHELL_V3: true } }) })
    renderApp(<FlagProbe flag="PRISM_APP_SHELL_V3" />)
    expect(screen.getByText('loading')).toBeInTheDocument()
    expect(await screen.findByText('on')).toBeInTheDocument()
  })
  it('a revoked session (401 on /me) signs the user out', async () => {
    signIn()
    mockFetch({ '/api/v1/me': () => jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }) })
    renderApp(<><AuthProbe /><FlagProbe flag="PRISM_APP_SHELL_V3" /></>)
    await waitFor(() => expect(screen.getByText(/status:anonymous/)).toBeInTheDocument())
    expect(localStorage.getItem('prism_token')).toBeNull()
  })
  it('exposes the me payload', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody() })
    function MeProbe() {
      const { me } = useFeatureFlags()
      return <p>{me ? me.user.email : 'none'}</p>
    }
    renderApp(<MeProbe />)
    expect(await screen.findByText('synthetic@test.local')).toBeInTheDocument()
  })
})

describe('WorkspaceProvider', () => {
  const campus = { id: 'ws-campus', type: 'CAMPUS_STUDENT', name: 'Synthetic University', organizationId: 'org-1', organizationName: 'Synthetic University' }

  it('switching workspace resets in-memory input state rather than reusing the previous workspace draft', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody({ workspaces: [meBody().data.workspaces[0], campus] }) })
    function DraftProbe() {
      const { switchTo, workspaces } = useWorkspace()
      const [text, setText] = useState('')
      return <><p>count:{workspaces.length}</p><input aria-label="Synthetic workspace draft" value={text} onChange={(event) => setText(event.target.value)} /><button onClick={() => switchTo('ws-campus')}>switch</button></>
    }
    renderApp(<WorkspaceContent><DraftProbe /></WorkspaceContent>)
    await screen.findByText('count:2')
    await userEvent.type(screen.getByLabelText('Synthetic workspace draft'), 'Synthetic private input')
    await userEvent.click(screen.getByRole('button', { name: 'switch' }))
    expect(screen.getByLabelText('Synthetic workspace draft')).toHaveValue('')
  })

  it('defaults to the personal workspace and sends it as X-Prism-Workspace', async () => {
    signIn()
    const f = mockFetch({ '/api/v1/me': meBody(), '/api/v1/thing': { data: 1 } })
    function Probe() {
      const { active } = useWorkspace()
      return <><p>active:{active.id}</p><button type="button" onClick={() => api.get('/api/v1/thing')}>call</button></>
    }
    renderApp(<Probe />)
    expect(screen.getByText('active:personal')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'call' }))
    const call = f.mock.calls.find(([u]) => String(u) === '/api/v1/thing')
    expect(call[1].headers['X-Prism-Workspace']).toBe('personal')
  })

  it('switching drops the previous workspace queries and never merges datasets', async () => {
    signIn()
    mockFetch({ '/api/v1/me': meBody({ workspaces: [meBody().data.workspaces[0], campus] }) })
    function Probe() {
      const { active, switchTo, workspaces } = useWorkspace()
      const qc = useQueryClient()
      useQuery({ queryKey: wsKey(active.id, 'home'), queryFn: async () => `home-of-${active.id}` })
      return (
        <>
          <p>active:{active.id} count:{workspaces.length}</p>
          <p>cachedPersonal:{String(Boolean(qc.getQueryData(wsKey('personal', 'home'))))}</p>
          <button type="button" onClick={() => switchTo('ws-campus')}>switch</button>
        </>
      )
    }
    const { queryClient } = renderApp(<Probe />)
    await screen.findByText(/count:2/)
    await waitFor(() => expect(queryClient.getQueryData(wsKey('personal', 'home'))).toBe('home-of-personal'))
    await userEvent.click(screen.getByRole('button', { name: 'switch' }))
    expect(screen.getByText(/active:ws-campus/)).toBeInTheDocument()
    expect(queryClient.getQueryData(wsKey('personal', 'home'))).toBeUndefined()
    await waitFor(() => expect(queryClient.getQueryData(wsKey('ws-campus', 'home'))).toBe('home-of-ws-campus'))
    expect(sessionStorage.getItem('prismActiveWorkspace')).toBe('ws-campus')
  })

  it('an unknown stored workspace falls back to the first server workspace', async () => {
    sessionStorage.setItem('prismActiveWorkspace', 'ws-from-another-user')
    signIn()
    mockFetch({ '/api/v1/me': meBody() })
    function Probe() {
      const { active } = useWorkspace()
      return <p>active:{active.id}</p>
    }
    renderApp(<Routes><Route path="*" element={<Probe />} /></Routes>)
    expect(screen.getByText('active:personal')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('active:personal')).toBeInTheDocument())
    vi.restoreAllMocks()
  })
})
