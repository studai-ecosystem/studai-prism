// Public evidence surfaces (`/api/evidence/*`). Unauthenticated, read-only.
import { request, ApiError } from './client.js'

// Resolves to the claims registry, or null when the server refuses (legacy contract).
export async function fetchEvidenceClaims() {
  try {
    const { data } = await request('/api/evidence/claims', { legacy: true, auth: false, workspace: false })
    return data
  } catch (err) {
    if (err instanceof ApiError && err.status > 0) return null
    throw err
  }
}
