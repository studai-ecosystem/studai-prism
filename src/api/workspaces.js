// Workspaces (spec §4.2, §7.2) — list + activate, validated with zod.
import { z } from 'zod'
import { request } from './client.js'
import { WorkspaceSchema } from './me.js'

const ActivationSchema = z.object({
  workspace: WorkspaceSchema,
  permissions: z.array(z.string()),
  entitlements: z.object({
    canStartAssessment: z.boolean(),
    reason: z.string(),
    source: z.string().nullable(),
    expiresAt: z.string().nullable().optional(),
  }).nullable(),
})

export async function fetchWorkspaces() {
  const { data } = await request('/api/v1/workspaces', { workspace: false, schema: z.array(WorkspaceSchema) })
  return data
}

export async function activateWorkspace(workspaceId) {
  const { data } = await request(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/activate`, {
    method: 'POST',
    workspace: false,
    schema: ActivationSchema,
  })
  return data
}
