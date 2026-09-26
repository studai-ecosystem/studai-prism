// React Query hooks for Student Report V3. Report keys start with
// ['ws', workspaceId] so a workspace switch never shows another context's report.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkspace, wsKey } from '../../app/providers/WorkspaceProvider.jsx'
import { fetchStudentReport, fetchSharedReport, createReportShare, deleteShareGrant } from '../../api/reports.js'

const noRetry = (count, err) => !['FORBIDDEN', 'NOT_FOUND', 'VALIDATION_FAILED', 'REPORT_NOT_READY', 'REPORT_UNDER_REVIEW'].includes(err?.code) && err?.status !== 404 && count < 1

export function useStudentReport(sessionId, { enabled = true } = {}) {
  const { active } = useWorkspace()
  return useQuery({ queryKey: wsKey(active.id, 'report', sessionId), queryFn: () => fetchStudentReport(sessionId), retry: noRetry, enabled })
}

export function useSharedReport(token) {
  return useQuery({ queryKey: ['shared-report', token], queryFn: () => fetchSharedReport(token), retry: noRetry })
}

export function useCreateShare(sessionId) {
  const { active } = useWorkspace()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) => createReportShare({ ...body, sessionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wsKey(active.id, 'report', sessionId) })
      queryClient.invalidateQueries({ queryKey: ['account', 'share-grants'] })
    },
  })
}

export function useDeleteShare(sessionId) {
  const { active } = useWorkspace()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => deleteShareGrant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wsKey(active.id, 'report', sessionId) })
      queryClient.invalidateQueries({ queryKey: ['account', 'share-grants'] })
    },
  })
}
