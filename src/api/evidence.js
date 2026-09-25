// Public evidence surfaces (`/api/evidence/*`). Unauthenticated, read-only.

export async function fetchEvidenceClaims() {
  const r = await fetch('/api/evidence/claims')
  return r.ok ? r.json() : null
}
