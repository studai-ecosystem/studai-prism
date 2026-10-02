import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { configureClient, cancelScopedRequests } from '../../api/client.js'
import { useFeatureFlags } from './FeatureFlagProvider.jsx'

const WorkspaceContext = createContext(null)
const STORAGE_KEY = 'prismActiveWorkspace'

export const PERSONAL_FALLBACK = Object.freeze({
  id: 'personal',
  type: 'PERSONAL',
  name: 'Personal',
  organizationId: null,
  organizationName: null,
  visibilityPolicy: 'OWNER_ONLY',
  permissions: [],
})

// Workspace-scoped query keys start with ['ws', workspaceId, ...] so a switch
// can drop every cached result from the previous context (spec §7.2).
export function wsKey(workspaceId, ...rest) {
  return ['ws', workspaceId, ...rest]
}

export function WorkspaceProvider({ children }) {
  const queryClient = useQueryClient()
  const { me } = useFeatureFlags()
  const workspaces = useMemo(() => (me?.workspaces?.length ? me.workspaces : [PERSONAL_FALLBACK]), [me])
  const [activeId, setActiveId] = useState(() => sessionStorage.getItem(STORAGE_KEY) || PERSONAL_FALLBACK.id)
  const active = workspaces.find((w) => w.id === activeId) || workspaces[0]
  const activeRef = useRef(active.id)
  const scopeRef = useRef(active.id)
  activeRef.current = active.id

  useEffect(() => {
    configureClient({ getWorkspaceId: () => activeRef.current })
    return () => {
      cancelScopedRequests(activeRef.current)
      configureClient({ getWorkspaceId: () => null })
    }
  }, [])

  useEffect(() => {
    const previous = scopeRef.current
    if (previous !== active.id) {
      cancelScopedRequests(previous)
      queryClient.removeQueries({ queryKey: ['ws', previous] })
      scopeRef.current = active.id
    }
  }, [active.id, queryClient])

  const switchTo = useCallback((nextId) => {
    const next = workspaces.find((w) => w.id === nextId)
    if (!next || next.id === activeRef.current) return next || null
    const previous = activeRef.current
    cancelScopedRequests(previous)
    queryClient.removeQueries({ queryKey: ['ws', previous] })
    activeRef.current = next.id
    sessionStorage.setItem(STORAGE_KEY, next.id)
    setActiveId(next.id)
    return next
  }, [queryClient, workspaces])

  const value = useMemo(() => ({ workspaces, active, switchTo }), [workspaces, active, switchTo])
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function WorkspaceContent({ children }) {
  const { active } = useWorkspace()
  return <Fragment key={active.id}>{children}</Fragment>
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
}

export default WorkspaceProvider
