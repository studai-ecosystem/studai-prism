// Practice missions + role exploration (legacy JSON, non-envelope).
import { request } from './client.js'

const legacy = { legacy: true, workspace: false, on401: 'throw' }

export async function fetchMissions() {
  const { data } = await request('/api/missions', {
    ...legacy,
    defaultErrorMessage: 'Practice missions could not be loaded.',
  })
  return Array.isArray(data?.missions) ? data.missions : []
}

export async function fetchMission(missionId) {
  const { data } = await request(`/api/missions/${encodeURIComponent(missionId)}`, {
    ...legacy,
    defaultErrorMessage: 'This mission could not be loaded.',
  })
  return data?.mission || null
}

export async function submitMissionPractice(missionId, candidateInputs) {
  const { data } = await request(`/api/missions/${encodeURIComponent(missionId)}/submit`, {
    ...legacy,
    method: 'POST',
    body: { candidateInputs },
    defaultErrorMessage: 'Your practice could not be submitted.',
  })
  return data
}

/** Roles explained from self-reported interests only (null → no interest reasons). */
export async function exploreRoles({ candidateInterests = null } = {}) {
  const { data } = await request('/api/job-families/explore', {
    ...legacy,
    auth: false,
    method: 'POST',
    body: candidateInterests ? { candidateInterests } : {},
    defaultErrorMessage: 'Roles could not be loaded.',
  })
  return data
}
