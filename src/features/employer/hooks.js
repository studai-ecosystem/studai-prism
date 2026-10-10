// React Query hooks for the employer development workspace (PROD-READY
// Phase 9). Keys start with ['ws', workspaceId, 'employer', orgId] so another
// workspace's data is never shown.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { useWorkspace, wsKey } from '../../app/providers/WorkspaceProvider.jsx'
import { employerApi as api } from '../../api/employer.js'

const noRetry = (count, err) => !['FORBIDDEN', 'NOT_FOUND', 'VALIDATION_FAILED', 'PROHIBITED_USE', 'REPORT_NOT_READY', 'REPORT_UNDER_REVIEW'].includes(err?.code) && err?.status !== 404 && count < 1

export function useEmployerOrg() {
  const { organizationId } = useParams()
  const { active } = useWorkspace()
  const permissions = active.permissions || []
  return {
    orgId: organizationId,
    workspace: active,
    can: (p) => permissions.includes(p),
    key: (...parts) => wsKey(active.id, 'employer', organizationId, ...parts),
  }
}

function useEmployerQuery(parts, fn, options = {}) {
  const { key } = useEmployerOrg()
  return useQuery({ queryKey: key(...parts), queryFn: fn, retry: noRetry, ...options })
}

function useEmployerMutation(fn, invalidate = []) {
  const { key } = useEmployerOrg()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { for (const parts of invalidate) queryClient.invalidateQueries({ queryKey: key(...parts) }) },
  })
}

export const useEmployerSummary = () => { const { orgId } = useEmployerOrg(); return useEmployerQuery(['summary'], () => api.summary(orgId), { staleTime: 5 * 60 * 1000 }) }
export const useEmployerOverview = () => { const { orgId } = useEmployerOrg(); return useEmployerQuery(['overview'], () => api.overview(orgId)) }
export const useEmployerCohorts = () => { const { orgId } = useEmployerOrg(); return useEmployerQuery(['cohorts'], () => api.cohorts(orgId)) }
export function useEmployerPeople(filters) {
  const { orgId } = useEmployerOrg()
  return useEmployerQuery(['people', filters], () => api.people(orgId, filters), { placeholderData: (prev) => prev })
}
export const useEmployerPerson = (userId) => { const { orgId } = useEmployerOrg(); return useEmployerQuery(['person', userId], () => api.person(orgId, userId)) }
export const useSharedReports = () => { const { orgId } = useEmployerOrg(); return useEmployerQuery(['shared-reports'], () => api.sharedReports(orgId)) }
export const useSharedReport = (sessionId) => { const { orgId } = useEmployerOrg(); return useEmployerQuery(['shared-report', sessionId], () => api.sharedReport(orgId, sessionId)) }
export const useEmployerCatalog = () => { const { orgId } = useEmployerOrg(); return useEmployerQuery(['catalog'], () => api.catalog(orgId), { staleTime: 5 * 60 * 1000 }) }
export const useEmployerAssignments = () => { const { orgId } = useEmployerOrg(); return useEmployerQuery(['assignments'], () => api.assignments(orgId)) }
export const useEmployerInsights = () => { const { orgId } = useEmployerOrg(); return useEmployerQuery(['insights'], () => api.insights(orgId)) }
export const useEmployerMissions = () => { const { orgId } = useEmployerOrg(); return useEmployerQuery(['missions'], () => api.missions(orgId), { staleTime: 5 * 60 * 1000 }) }
export const useEmployerInterventions = () => { const { orgId } = useEmployerOrg(); return useEmployerQuery(['interventions'], () => api.interventions(orgId)) }

export function useCreateEmployerCohort() { const { orgId } = useEmployerOrg(); return useEmployerMutation((body) => api.createCohort(orgId, body), [['cohorts'], ['overview']]) }
export function useEmployerInvite() { const { orgId } = useEmployerOrg(); return useEmployerMutation((body) => api.invite(orgId, body), [['people'], ['overview'], ['cohorts']]) }
export function useCreateEmployerAssignment() { const { orgId } = useEmployerOrg(); return useEmployerMutation((body) => api.createAssignment(orgId, body), [['assignments'], ['overview'], ['people']]) }
export function useExportInsights() { const { orgId } = useEmployerOrg(); return useMutation({ mutationFn: (view) => api.exportInsights(orgId, view) }) }
export function useCreateEmployerIntervention() { const { orgId } = useEmployerOrg(); return useEmployerMutation((body) => api.createIntervention(orgId, body), [['interventions']]) }
