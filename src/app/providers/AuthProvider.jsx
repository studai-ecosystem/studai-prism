import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getToken, getUser, clearUser, login, SESSION_EVENT } from '../../api/auth.js'
import { configureClient } from '../../api/client.js'

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

  const sync = useCallback(() => {
    const next = snapshot()
    if (next.token !== tokenRef.current) {
      tokenRef.current = next.token
      queryClient.clear()
    }
    setState(next)
  }, [queryClient])

  useEffect(() => {
    window.addEventListener(SESSION_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
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
        const here = `${window.location.pathname}${window.location.search}`
        if (!window.location.pathname.startsWith('/login')) window.location.assign(`/login?next=${encodeURIComponent(here)}`)
      },
    })
  }, [signOut])

  const value = useMemo(() => ({ ...state, signIn, signOut }), [state, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export default AuthProvider
