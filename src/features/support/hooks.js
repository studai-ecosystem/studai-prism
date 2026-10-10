// React Query hooks for the V3 support paths (PROD-READY Phase 4). Keys start
// with ['ws', workspaceId] so a workspace switch never shows another
// context's requests. Each mutation sends one Idempotency-Key per attempt
// (the API client retries with the same key).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace, wsKey } from '../../app/providers/WorkspaceProvider.jsx'
import { useFlag } from '../../app/providers/FeatureFlagProvider.jsx'
import {
  fetchHumanReview, requestHumanReview, fetchAccommodation, requestAccommodation, fetchIdentityCheck, declareIdentity, fetchSupportRequests,
} from '../../api/support.js'

const noRetry = (count, err) => !['FORBIDDEN', 'NOT_FOUND', 'VALIDATION_FAILED'].includes(err?.code) && err?.status !== 404 && count < 1

// The entry points exist only while the server flag is on (GET /api/v1/me).
export function useSupportRoutesEnabled() {
  return useFlag('PRISM_V3_SUPPORT_ROUTES').enabled
}

export function useHumanReview(sessionId, { enabled = true } = {}) {
  const { active } = useWorkspace()
  return useQuery({ queryKey: wsKey(active.id, 'support', 'review', sessionId), queryFn: () => fetchHumanReview(sessionId), retry: noRetry, enabled })
}

export function useRequestHumanReview(sessionId) {
  const { active } = useWorkspace()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) => requestHumanReview(sessionId, body),
    onSuccess: (data) => {
      queryClient.setQueryData(wsKey(active.id, 'support', 'review', sessionId), data)
      queryClient.invalidateQueries({ queryKey: wsKey(active.id, 'report', sessionId) })
      queryClient.invalidateQueries({ queryKey: wsKey(active.id, 'support', 'mine') })
    },
  })
}

export function useAccommodation(assignmentId, { enabled = true } = {}) {
  const { active } = useWorkspace()
  return useQuery({ queryKey: wsKey(active.id, 'support', 'accommodation', assignmentId), queryFn: () => fetchAccommodation(assignmentId), retry: noRetry, enabled: enabled && Boolean(assignmentId) })
}

export function useRequestAccommodation(assignmentId) {
  const { active } = useWorkspace()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) => requestAccommodation(assignmentId, body),
    onSuccess: (data) => {
      queryClient.setQueryData(wsKey(active.id, 'support', 'accommodation', assignmentId), data)
      queryClient.invalidateQueries({ queryKey: wsKey(active.id, 'support', 'mine') })
    },
  })
}

export function useIdentityCheck(sessionId, { enabled = true } = {}) {
  const { active } = useWorkspace()
  return useQuery({ queryKey: wsKey(active.id, 'support', 'identity', sessionId), queryFn: () => fetchIdentityCheck(sessionId), retry: noRetry, enabled })
}

export function useDeclareIdentity(sessionId) {
  const { active } = useWorkspace()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) => declareIdentity(sessionId, body),
    onSuccess: (data) => queryClient.setQueryData(wsKey(active.id, 'support', 'identity', sessionId), data),
  })
}

export function useSupportRequests({ enabled = true } = {}) {
  const { active } = useWorkspace()
  return useQuery({ queryKey: wsKey(active.id, 'support', 'mine'), queryFn: fetchSupportRequests, retry: noRetry, enabled })
}
