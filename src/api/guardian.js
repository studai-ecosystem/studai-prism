// Under-18 guardian consent (PROD-READY Phase 8). DARK: the server answers 404
// unless PRISM_UNDER18_PATH is on. The guardian is not signed in: the link
// token is the only credential and stays in the URL path.
import { request } from './client.js'

const open = { legacy: true, workspace: false, auth: false, on401: 'throw' }

export async function fetchGuardianConsent(token) {
  const { data } = await request(`/api/guardian-consent/${encodeURIComponent(token)}`, open)
  return data
}

export async function decideGuardianConsent(token, decision) {
  const { data } = await request(`/api/guardian-consent/${encodeURIComponent(token)}`, { ...open, method: 'POST', body: { decision } })
  return data
}

export async function withdrawGuardianConsent(token) {
  const { data } = await request(`/api/guardian-consent/${encodeURIComponent(token)}/withdraw`, { ...open, method: 'POST' })
  return data
}
