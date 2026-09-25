// Campus organization invites (spec §37.2).
import { z } from 'zod'
import { request } from './client.js'

export const OrgInviteSchema = z.object({
  organizationId: z.string(),
  organizationName: z.string(),
  role: z.string(),
  status: z.enum(['PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED']),
  expired: z.boolean(),
  expiresAt: z.string(),
  emailHint: z.string().nullable(),
  disclosureVersion: z.string(),
})

const AcceptSchema = z.object({
  workspaceId: z.string(),
  workspaceType: z.enum(['CAMPUS_STUDENT', 'CAMPUS_ADMIN']),
  organizationId: z.string(),
  role: z.string(),
  alreadyAccepted: z.boolean(),
})

const path = (token) => `/api/v1/org-invites/${encodeURIComponent(token)}`

export async function fetchOrgInvite(token) {
  const { data } = await request(path(token), { workspace: false, on401: 'throw', schema: OrgInviteSchema })
  return data
}

export async function acceptOrgInvite(token) {
  const { data } = await request(`${path(token)}/accept`, {
    method: 'POST',
    workspace: false,
    body: { acknowledged: true },
    schema: AcceptSchema,
    defaultErrorMessage: 'We could not accept this invitation.',
  })
  return data
}

export async function declineOrgInvite(token) {
  const { data } = await request(`${path(token)}/decline`, {
    method: 'POST',
    workspace: false,
    defaultErrorMessage: 'We could not decline this invitation.',
  })
  return data
}
