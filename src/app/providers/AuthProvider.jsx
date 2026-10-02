import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getToken, getUser, clearUser, clearSessionArtifacts, sessionOwnerKey, login, SESSION_EVENT } from '../../api/auth.js'
import { configureClient, cancelScopedRequests } from '../../api/client.js'
import { ErrorState } from '../../components/states/ErrorState.jsx'
import { Button } from '../../components/ui/Button.jsx'

const AuthContext = createContext(null)

function snapshot() {
  const token = getToken()
  const user = getUser()
  return { token, user, status: token && user ? 'authenticated' : 'anonymous' }
}

// The single token accessor for the new app (spec §32.1). Legacy pages keep
// writing through lib/session.js, which emits SESSION_EVENT so this stays in
// step. Any change of session (sign-in, sign-out, another account) drops the
// whole query cache so one person's data can never render for another.
export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState(snapshot)
  const tokenRef = useRef(state.token)
  const ownerRef = useRef(sessionOwnerKey(state.user))
  const legacyRecovery = useRef(false)

  const sync = useCallback(() => {
    const next = snapshot()
    if (next.token !== tokenRef.current) {
      tokenRef.current = next.token
      cancelScopedRequests()
      queryClient.clear()
    }
    const owner = sessionOwnerKey(next.user)
    if (owner !== ownerRef.current) {
      if (ownerRef.current && /^\/(?:assessment|briefing|verify-identity|link-phone|room-scan|score|workspace|report|missions)(?:\/|$)/.test(window.location.pathname)) {
        legacyRecovery.current = true
      }
      ownerRef.current = owner
      clearSessionArtifacts()
    }
    setState(next)
  }, [queryClient])

  useEffect(() => {
    window.addEventListener(SESSION_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      cancelScopedRequests()
      window.removeEventListener(SESSION_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [sync])

  const signOut = useCallback(() => {
    clearUser()
    sync()
  }, [sync])

  const signIn = useCallback(async ({ email, password }) => {
    const user = await login({ email, password })
    sync()
    return user
  }, [sync])

  useEffect(() => {
    configureClient({
      onUnauthenticated: () => {
        signOut()
        const here = `${window.location.pathname}${window.location.search}${window.location.hash}`
        if (!window.location.pathname.startsWith('/login')) window.location.assign(`/login?next=${encodeURIComponent(here)}`)
      },
    })
  }, [signOut])

  const value = useMemo(() => ({ ...state, signIn, signOut }), [state, signIn, signOut])
  return (
    <AuthContext.Provider key={sessionOwnerKey(state.user) || state.status} value={value}>
      {legacyRecovery.current ? (
        <main id="main" className="prism-app min-h-screen bg-prism-canvas px-4 py-10">
          <ErrorState headingLevel={1} title="Your account changed" description="Open your current account before returning to an assessment or report."
            action={<Button onClick={() => window.location.assign('/app')}>Open current account</Button>} />
        </main>
      ) : children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export default AuthProvider
