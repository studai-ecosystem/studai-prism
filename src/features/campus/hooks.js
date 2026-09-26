// React Query hooks for campus administration. Keys start with
// ['ws', workspaceId, 'campus', orgId] so switching workspace or organization
// never shows another context's data.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { useWorkspace, wsKey } from '../../app/providers/WorkspaceProvider.jsx'
import { campusAdminApi as api } from '../../api/campusAdmin.js'
import { fetchSponsorReport } from '../../api/reports.js'

const noRetry = (count, err) => !['FORBIDDEN', 'NOT_FOUND', 'VALIDATION_FAILED', 'REPORT_NOT_READY', 'REPORT_UNDER_REVIEW'].includes(err?.code) && err?.status !== 404 && count < 1

export function useCampusOrg() {
  const { organizationId } = useParams()
  const { active } = useWorkspace()
  const permissions = active.permissions || []
  return {
    orgId: organizationId,
    workspace: active,
    can: (p) => permissions.includes(p),
    key: (...parts) => wsKey(active.id, 'campus', organizationId, ...parts),
  }
}

function useCampusQuery(parts, fn, options = {}) {
  const { key } = useCampusOrg()
  return useQuery({ queryKey: key(...parts), queryFn: fn, retry: noRetry, ...options })
}

function useCampusMutation(fn, invalidate = []) {
  const { key } = useCampusOrg()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const parts of invalidate) queryClient.invalidateQueries({ queryKey: key(...parts) })
    },
  })
}

export const useOverview = () => { const { orgId } = useCampusOrg(); return useCampusQuery(['overview'], () => api.overview(orgId)) }
export function useStudents(filters) {
  const { orgId } = useCampusOrg()
  return useCampusQuery(['students', filters], () => api.students(orgId, filters), { placeholderData: (prev) => prev })
}
export const useStudent = (userId) => { const { orgId } = useCampusOrg(); return useCampusQuery(['student', userId], () => api.student(orgId, userId)) }
export const useStructure = () => { const { orgId } = useCampusOrg(); return useCampusQuery(['structure'], () => api.structure(orgId)) }
export const useCohorts = () => { const { orgId } = useCampusOrg(); return useCampusQuery(['cohorts'], () => api.cohorts(orgId)) }
export const useCohort = (id) => { const { orgId } = useCampusOrg(); return useCampusQuery(['cohort', id], () => api.cohort(orgId, id)) }
export const usePrograms = () => { const { orgId } = useCampusOrg(); return useCampusQuery(['programs'], () => api.programs(orgId)) }
export const useProgram = (id) => { const { orgId } = useCampusOrg(); return useCampusQuery(['program', id], () => api.program(orgId, id)) }
export const useCatalog = () => { const { orgId } = useCampusOrg(); return useCampusQuery(['catalog'], () => api.catalog(orgId), { staleTime: 5 * 60 * 1000 }) }
export const useConsentPreview = () => { const { orgId } = useCampusOrg(); return useCampusQuery(['consent-preview'], () => api.consentPreview(orgId), { staleTime: 5 * 60 * 1000 }) }
export const useAssignments = () => { const { orgId } = useCampusOrg(); return useCampusQuery(['assignments'], () => api.assignments(orgId)) }
export const useCompletion = (id) => { const { orgId } = useCampusOrg(); return useCampusQuery(['completion', id], () => api.completion(orgId, id)) }
export const useMembers = () => { const { orgId } = useCampusOrg(); return useCampusQuery(['members'], () => api.members(orgId)) }
export const useAuditLog = () => { const { orgId } = useCampusOrg(); return useCampusQuery(['audit'], () => api.audit(orgId, { limit: 50 })) }
export const useOnboarding = (options = {}) => { const { orgId } = useCampusOrg(); return useCampusQuery(['onboarding'], () => api.onboarding(orgId), options) }
export const useSponsorReport = (sessionId) => { const { orgId } = useCampusOrg(); return useCampusQuery(['report', sessionId], () => fetchSponsorReport(orgId, sessionId)) }

export function useCreateCohort() {
  const { orgId } = useCampusOrg()
  return useCampusMutation((body) => api.createCohort(orgId, body), [['cohorts'], ['overview']])
}
export function useUpdateCohort(id) {
  const { orgId } = useCampusOrg()
  return useCampusMutation((body) => api.updateCohort(orgId, id, body), [['cohorts'], ['cohort', id], ['overview']])
}
export function useRemoveFromCohort(id) {
  const { orgId } = useCampusOrg()
  return useCampusMutation((userId) => api.removeFromCohort(orgId, id, userId), [['cohort', id], ['cohorts'], ['students']])
}
export function useMoveStudents() {
  const { orgId } = useCampusOrg()
  return useCampusMutation((body) => api.moveStudents(orgId, body), [['students'], ['cohorts'], ['cohort']])
}
export function useCreateStructure() {
  const { orgId } = useCampusOrg()
  return useCampusMutation(({ kind, ...body }) => api.createStructure(orgId, kind, body), [['structure']])
}
export function usePreviewImport() {
  const { orgId } = useCampusOrg()
  return useMutation({ mutationFn: (body) => api.previewImport(orgId, body) })
}
export function useCommitImport() {
  const { orgId } = useCampusOrg()
  return useCampusMutation(({ jobId, key }) => api.commitImport(orgId, jobId, key), [['students'], ['cohorts'], ['cohort'], ['overview']])
}
export function useCreateProgram() {
  const { orgId } = useCampusOrg()
  return useCampusMutation((body) => api.createProgram(orgId, body), [['programs'], ['overview']])
}
export function useUpdateProgram(id) {
  const { orgId } = useCampusOrg()
  return useCampusMutation((body) => api.updateProgram(orgId, id, body), [['programs'], ['program', id], ['overview']])
}
export function useCreateAssignment() {
  const { orgId } = useCampusOrg()
  return useCampusMutation((body) => api.createAssignment(orgId, body), [['assignments'], ['overview'], ['program'], ['students']])
}
export function useSetAssignmentStatus(id) {
  const { orgId } = useCampusOrg()
  return useCampusMutation((status) => api.setAssignmentStatus(orgId, id, status), [['assignments'], ['completion', id], ['overview']])
}
export function useChangeRole() {
  const { orgId } = useCampusOrg()
  return useCampusMutation(({ membershipId, role }) => api.changeRole(orgId, membershipId, role), [['members'], ['audit']])
}
export function useRemoveMember() {
  const { orgId } = useCampusOrg()
  return useCampusMutation((membershipId) => api.removeMember(orgId, membershipId), [['members'], ['audit']])
}
export function useInvite() {
  const { orgId } = useCampusOrg()
  return useCampusMutation((body) => api.invite(orgId, body), [['members'], ['students'], ['cohort'], ['overview']])
}
export function useResendInvite() {
  const { orgId } = useCampusOrg()
  return useCampusMutation((inviteId) => api.resendInvite(orgId, inviteId), [['members'], ['students'], ['cohort']])
}
export function useSaveOnboarding() {
  const { orgId } = useCampusOrg()
  return useCampusMutation((body) => api.saveOnboarding(orgId, body), [['onboarding']])
}
