// React Query hooks for Development V2. Keys start with ['ws', workspaceId]
// so a workspace switch never shows another context's missions or attempts.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace, wsKey } from '../../app/providers/WorkspaceProvider.jsx'
import {
  fetchV2Mission, fetchMissionAttempt, startMissionAttempt, saveMissionWork, revealMissionHint, submitMissionAttempt,
} from '../../api/development.js'

const noRetry = (count, err) => !['FORBIDDEN', 'NOT_FOUND', 'VALIDATION_FAILED', 'CONFLICT'].includes(err?.code) && err?.status !== 404 && count < 1

export function useMission(missionId) {
  const { active } = useWorkspace()
  return useQuery({ queryKey: wsKey(active.id, 'mission', missionId), queryFn: () => fetchV2Mission(missionId), retry: noRetry })
}

export function useMissionAttempt(attemptId) {
  const { active } = useWorkspace()
  return useQuery({ queryKey: wsKey(active.id, 'mission-attempt', attemptId), queryFn: () => fetchMissionAttempt(attemptId), retry: noRetry, enabled: Boolean(attemptId), staleTime: Infinity })
}

export function useMissionActions(missionId) {
  const { active } = useWorkspace()
  const queryClient = useQueryClient()
  const put = (attempt) => queryClient.setQueryData(wsKey(active.id, 'mission-attempt', attempt.id), attempt)
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: wsKey(active.id, 'mission', missionId) })
    queryClient.invalidateQueries({ queryKey: wsKey(active.id, 'development-plan') })
  }
  return {
    start: useMutation({ mutationFn: (opts) => startMissionAttempt(missionId, opts), onSuccess: (a) => { put(a); refresh() } }),
    save: useMutation({ mutationFn: ({ attemptId, version, work }) => saveMissionWork(attemptId, version, work), onSuccess: put }),
    hint: useMutation({ mutationFn: ({ attemptId, version }) => revealMissionHint(attemptId, version), onSuccess: put }),
    submit: useMutation({ mutationFn: (attemptId) => submitMissionAttempt(attemptId), onSuccess: (a) => { put(a); refresh() } }),
  }
}
