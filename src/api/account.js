// Account + history endpoints used by the legacy launcher and profile pages.
// Legacy (non-envelope) JSON; 401s surface as errors so pages keep their
// existing in-page handling instead of a redirect.
import { request } from './client.js'

const legacy = { legacy: true, workspace: false, on401: 'throw' }

export async function fetchLicence() {
  const { data } = await request('/api/payment/licence', legacy)
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
