// Session state for the V3 player (spec §12.2, §39.1): the server contract via
// React Query, resumed on refresh, retried with backoff while the connection
// is down, polled while scoring. The transcript only ever grows with turns
// the server returned — nothing is generated locally.
import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace, wsKey } from '../../../app/providers/WorkspaceProvider.jsx'
import { fetchAssessmentSession } from '../api/assessmentSessionApi.js'

const transient = (err) => err?.code === 'NETWORK_ERROR' || err?.status >= 500

export function useAssessmentSession(sessionId, { enabled = true } = {}) {
  const { active } = useWorkspace()
  const queryClient = useQueryClient()
  const key = wsKey(active.id, 'assessment-session', sessionId)
  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchAssessmentSession(sessionId),
    enabled: enabled && Boolean(sessionId),
    retry: (n, err) => transient(err) && n < 6,
    retryDelay: (n) => Math.min(8000, 1000 * 2 ** n),
    refetchInterval: (q) => (q.state.data?.status === 'SCORING' ? 3000 : false),
    refetchOnWindowFocus: false,
  })

  // Append a turn the server confirmed (first delivery only; a replayed reply
  // may already be in the contract, so the contract is re-read instead).
  const applyTurn = useCallback((text, result) => {
    if (result.replayed) return queryClient.invalidateQueries({ queryKey: key })
    queryClient.setQueryData(key, (c) => c && ({
      ...c,
      messages: [...c.messages, { speaker: 'You', role: null, content: text, isUser: true }, ...result.messages.map((m) => ({ ...m, isUser: false }))],
      progress: { ...c.progress, exchanges: result.exchanges },
      // P4.6: the server's task-only stage strip after the Director moved on.
      ...(result.stages ? { stages: result.stages } : {}),
    }))
    return undefined
  }, [queryClient, key])

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: key }), [queryClient, key])

  return { ...query, key, applyTurn, refresh }
}

export default useAssessmentSession
