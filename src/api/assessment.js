// Assessment session + report endpoints (legacy JSON, non-envelope). 401s
// surface as errors so the pages can show their own state.
import { request } from './client.js'

const legacy = { legacy: true, workspace: false, on401: 'throw' }

/** Start (or re-open) a session. The server chooses and returns the scenario. */
export async function startAssessment({ sessionId, assessmentId } = {}) {
  const body = { sessionId }
  if (assessmentId) body.scenarioId = assessmentId
  const { data } = await request('/api/assessment/start', {
    ...legacy,
    method: 'POST',
    body,
    defaultErrorMessage: 'This assessment could not be loaded.',
  })
  return data
}

export async function sendAssessmentMessage({ sessionId, text }) {
  const { data } = await request('/api/assessment/message', {
    ...legacy,
    method: 'POST',
    body: { sessionId, text },
    defaultErrorMessage: 'Your answer was not sent.',
  })
  return data
}

/** Save a work artifact's state. Rejects (ApiError) unless the server confirms. */
export async function saveArtifact({ sessionId, artifactId, updates, notes }) {
  const { data } = await request(`/api/assessment/artifacts/${encodeURIComponent(sessionId)}`, {
    ...legacy,
    method: 'POST',
    body: { artifactId, updates, notes },
    defaultErrorMessage: 'Your work was not saved.',
  })
  if (!data?.ok) throw new Error('Your work was not saved.')
  return data
}

/** Submit for scoring. Resolves { state: 'complete' | 'scoring' }. */
export async function submitAssessment(sessionId) {
  const { status } = await request('/api/assessment/evaluate', {
    ...legacy,
    method: 'POST',
    body: { sessionId },
    defaultErrorMessage: 'Your assessment could not be submitted.',
  })
  return { state: status === 202 ? 'scoring' : 'complete' }
}

/** Poll scoring. Resolves { state: 'complete' | 'scoring' | 'failed' | 'idle' }. */
export async function fetchSubmissionStatus(sessionId) {
  const { data } = await request(`/api/assessment/evaluate-status/${encodeURIComponent(sessionId)}`, legacy)
  return { state: data?.status || 'idle' }
}

export async function fetchStudentReportV2(sessionId) {
  const { data } = await request(`/api/assessment/report/${encodeURIComponent(sessionId)}/v2`, {
    ...legacy,
    defaultErrorMessage: 'This report could not be loaded.',
  })
  return data
}

export async function fetchEmployeeReportV2(sessionId) {
  const { data } = await request(`/api/assessment/report/${encodeURIComponent(sessionId)}/employee`, {
    ...legacy,
    defaultErrorMessage: 'This report could not be loaded.',
  })
  return data
}
