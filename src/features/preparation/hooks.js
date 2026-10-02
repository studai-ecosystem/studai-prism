// React Query hooks for private preparation. Keys start with
// ['ws', workspaceId] so a workspace switch drops personal preparation data.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace, wsKey } from '../../app/providers/WorkspaceProvider.jsx'
import { useFeatureFlags } from '../../app/providers/FeatureFlagProvider.jsx'
import {
  fetchPreparations, fetchPreparation, createPreparationIntent, confirmPreparation, sendPreparationTurn, finishPreparation, abandonPreparation,
  fetchCheckins, createCheckin,
} from '../../api/preparation.js'

const noRetry = (count, err) => !['FORBIDDEN', 'NOT_FOUND', 'VALIDATION_FAILED', 'CONFLICT'].includes(err?.code) && err?.status !== 404 && count < 1

// Personal only, and never before the workspace list has loaded: the
// fallback workspace is PERSONAL, so an early query could run in the wrong scope.
function usePersonalScope() {
  const { active } = useWorkspace()
  const { loading } = useFeatureFlags()
  return { active, personal: !loading && active.type === 'PERSONAL' }
}

export function usePreparations() {
  const { active, personal } = usePersonalScope()
  return useQuery({ queryKey: wsKey(active.id, 'preparations'), queryFn: fetchPreparations, retry: noRetry, enabled: personal })
}

export function usePreparation(id) {
  const { active, personal } = usePersonalScope()
  return useQuery({ queryKey: wsKey(active.id, 'preparation', id), queryFn: () => fetchPreparation(id), retry: noRetry, enabled: Boolean(id) && personal })
}

export function useCheckins(options = {}) {
  const { active, personal } = usePersonalScope()
  return useQuery({ queryKey: wsKey(active.id, 'checkins'), queryFn: fetchCheckins, retry: noRetry, enabled: personal, ...options })
}

export function usePreparationActions() {
  const { active } = useWorkspace()
  const queryClient = useQueryClient()
  const put = (attempt) => {
    queryClient.setQueryData(wsKey(active.id, 'preparation', attempt.id), attempt)
    queryClient.invalidateQueries({ queryKey: wsKey(active.id, 'preparations') })
    queryClient.invalidateQueries({ queryKey: wsKey(active.id, 'history') })
  }
  return {
    create: useMutation({ mutationFn: createPreparationIntent, onSuccess: () => queryClient.invalidateQueries({ queryKey: wsKey(active.id, 'preparations') }) }),
    confirm: useMutation({ mutationFn: ({ id, edits }) => confirmPreparation(id, edits), onSuccess: put }),
    send: useMutation({ mutationFn: ({ id, text }) => sendPreparationTurn(id, text), onSuccess: put }),
    finish: useMutation({ mutationFn: (id) => finishPreparation(id), onSuccess: put }),
    abandon: useMutation({ mutationFn: (id) => abandonPreparation(id), onSuccess: put }),
    checkin: useMutation({
      mutationFn: createCheckin,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: wsKey(active.id, 'checkins') })
        queryClient.invalidateQueries({ queryKey: wsKey(active.id, 'history') })
      },
    }),
  }
}
