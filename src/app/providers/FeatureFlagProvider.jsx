import { createContext, useContext, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMe } from '../../api/me.js'
import { useAuth } from './AuthProvider.jsx'

const FlagContext = createContext(null)
export const ME_QUERY_KEY = ['me']

// Flags come ONLY from GET /api/v1/me (server allow-list). Unknown, loading or
// anonymous → every flag reads as off, so the legacy experience is the default.
export function FeatureFlagProvider({ children }) {
  const { status, user, signOut } = useAuth()
  const me = useQuery({
    queryKey: [...ME_QUERY_KEY, user?.email || 'anon'],
    queryFn: fetchMe,
    enabled: status === 'authenticated',
    staleTime: 60_000,
  })

  useEffect(() => {
    if (me.error?.code === 'UNAUTHENTICATED') signOut()
  }, [me.error, signOut])

  const value = useMemo(() => ({
    me: me.data || null,
    flags: me.data?.flags || {},
    loading: status === 'authenticated' && me.isPending,
    error: me.error || null,
    refetch: me.refetch,
  }), [me.data, me.isPending, me.error, me.refetch, status])

  return <FlagContext.Provider value={value}>{children}</FlagContext.Provider>
}

export function useFeatureFlags() {
  const ctx = useContext(FlagContext)
  if (!ctx) throw new Error('useFeatureFlags must be used inside <FeatureFlagProvider>')
  return ctx
}

export function useFlag(key) {
  const { flags, loading } = useFeatureFlags()
  return { enabled: flags[key] === true, loading }
}

export default FeatureFlagProvider
