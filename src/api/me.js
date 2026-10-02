// /api/v1/me — the caller, client-visible flags, permissions and workspaces.
import { z } from 'zod'
import { request } from './client.js'

export const WorkspaceSchema = z.object({
  id: z.string(),
  type: z.enum(['PERSONAL', 'CAMPUS_STUDENT', 'CAMPUS_ADMIN']),
  name: z.string(),
  organizationId: z.string().nullable(),
  organizationName: z.string().nullable().optional(),
  // Staff (CAMPUS_ADMIN) workspaces have no student visibility policy: null.
  visibilityPolicy: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  permissions: z.array(z.string()).optional(),
}).passthrough()

export const MeSchema = z.object({
  user: z.object({ id: z.string(), email: z.string(), name: z.string().nullable().optional(), ageConfirmed: z.boolean().optional() }).passthrough(),
  flags: z.record(z.boolean()),
  permissions: z.object({ global: z.array(z.string()) }).passthrough(),
  workspaces: z.array(WorkspaceSchema),
})

export async function fetchMe() {
  const { data } = await request('/api/v1/me', { workspace: false, schema: MeSchema, on401: 'throw' })
  return data
}
