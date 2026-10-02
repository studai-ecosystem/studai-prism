// React Query hooks for the student application. Keys start with
// ['ws', workspaceId] so switching workspace drops the previous context's data.
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace, wsKey } from '../../app/providers/WorkspaceProvider.jsx'
import {
  fetchStudentHome, fetchStudentAssessments, fetchStudentCapabilities, fetchStudentEvidence, fetchDevelopmentPlan,
  fetchGrowth, fetchAssignmentBriefing, acknowledgeAssignment, exploreRolesV2, fetchPreferences, savePreferences,
  fetchShareGrants, revokeShareGrant, fetchHistory,
} from '../../api/student.js'

// The API client already retries network failures; React Query adds one more
// attempt, never for access or validation answers.
const noRetryOn = (codes) => (count, err) => !codes.includes(err?.code) && err?.status !== 404 && count < 1

function useScopedQuery(name, fn, extra = [], options = {}) {
  const { active } = useWorkspace()
  return useQuery({ queryKey: wsKey(active.id, name, ...extra), queryFn: fn, retry: noRetryOn(['FORBIDDEN', 'NOT_FOUND', 'VALIDATION_FAILED']), ...options })
}

export const useStudentHome = () => useScopedQuery('home', fetchStudentHome)
export const useStudentAssessments = () => useScopedQuery('assessments', fetchStudentAssessments)
// Paginated history projection (P1.2); pages accumulate until the server
// returns no cursor. Scoped like every other read so workspaces never mix.
export function useStudentHistory() {
  const { active } = useWorkspace()
  return useInfiniteQuery({
    queryKey: wsKey(active.id, 'history'),
    queryFn: ({ pageParam }) => fetchHistory({ cursor: pageParam }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: noRetryOn(['FORBIDDEN', 'NOT_FOUND', 'VALIDATION_FAILED']),
  })
}
export const useStudentCapabilities = () => useScopedQuery('capabilities', fetchStudentCapabilities)
export const useDevelopmentPlan = () => useScopedQuery('development-plan', fetchDevelopmentPlan)
export const useGrowth = () => useScopedQuery('growth', fetchGrowth)
// Previous results stay on screen while filters change (the filter form keeps
// focus) — but never across workspaces.
export function useStudentEvidence(filters) {
  const { active } = useWorkspace()
  return useScopedQuery('evidence', () => fetchStudentEvidence(filters), [filters], {
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey?.[1] === active.id ? keepPreviousData(prev) : undefined),
  })
}
export const useAssignmentBriefing = (id) => useScopedQuery('assignment', () => fetchAssignmentBriefing(id), [id])

export function useAcknowledgeAssignment(id) {
  const { active } = useWorkspace()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (copyVersion) => acknowledgeAssignment(id, copyVersion),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: wsKey(active.id) }),
  })
}

export function useRoleExploration() {
  return useMutation({ mutationFn: (interests) => exploreRolesV2(interests) })
}

const PREFERENCES_KEY = ['account', 'preferences']
export function usePreferences(options = {}) {
  return useQuery({ queryKey: PREFERENCES_KEY, queryFn: fetchPreferences, retry: false, staleTime: 5 * 60 * 1000, ...options })
}
export function useSavePreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: savePreferences,
    onSuccess: (data) => queryClient.setQueryData(PREFERENCES_KEY, data),
  })
}

const GRANTS_KEY = ['account', 'share-grants']
export const useShareGrants = () => useQuery({ queryKey: GRANTS_KEY, queryFn: fetchShareGrants, retry: false })
export function useRevokeShareGrant() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: revokeShareGrant, onSuccess: () => queryClient.invalidateQueries({ queryKey: GRANTS_KEY }) })
}
