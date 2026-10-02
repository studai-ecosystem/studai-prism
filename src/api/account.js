// Account + history endpoints used by the legacy launcher and profile pages.
// Legacy (non-envelope) JSON; 401s surface as errors so pages keep their
// existing in-page handling instead of a redirect.
import { request } from './client.js'
import { z } from 'zod'

const legacy = { legacy: true, workspace: false, on401: 'throw' }
const LicenceSchema = z.object({
  pendingSessionId: z.string().min(1).nullable(),
  completed: z.number().int().nonnegative().optional(),
  canPurchase: z.boolean().optional(),
  mode: z.enum(['dummy', 'paid']).optional(),
}).passthrough()

export async function fetchLicence() {
  const { data } = await request('/api/payment/licence', { ...legacy, schema: LicenceSchema })
  return data
}

export async function confirmAccountAge() {
  const { data } = await request('/api/auth/confirm-age', {
    ...legacy,
    method: 'POST',
    body: { ageConfirmed: true },
    schema: z.object({ ok: z.literal(true), user: z.object({ ageConfirmed: z.literal(true) }).passthrough() }).passthrough(),
    defaultErrorMessage: 'Your age declaration could not be recorded.',
  })
  return data
}

export async function fetchAssessmentHistory() {
  const { data } = await request('/api/assessment/history', { ...legacy, defaultErrorMessage: 'Failed to load your test history.' })
  return data
}

export async function changePassword({ currentPassword, newPassword }) {
  const { data } = await request('/api/auth/change-password', {
    ...legacy,
    method: 'POST',
    body: { currentPassword, newPassword },
    defaultErrorMessage: 'Failed to change password.',
  })
  return data
}

export async function deleteCandidateData() {
  const { data } = await request('/api/assessment/candidate-data', {
    ...legacy,
    method: 'DELETE',
    defaultErrorMessage: 'Deletion failed. Contact support@studaione.com.',
  })
  return data
}
