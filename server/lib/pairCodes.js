// Phone-proctor pairing codes (PROD-READY Phase 1S, N4). Codes are issued by
// POST /api/device/pair for a session; the proctor socket accepts only an
// issued, unexpired code. Shared by routes/device.js and lib/proctorSocket.js.
export const PAIR_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const PAIR_CODE_LENGTH = 6
export const PAIR_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/
// Long enough for identity check, room scan, briefing and a 35-minute
// assessment with reconnects; a code from yesterday no longer pairs.
export const PAIR_CODE_TTL_MS = 3 * 60 * 60 * 1000

export function isPairCodeUsable(link, now = Date.now(), ttlMs = PAIR_CODE_TTL_MS) {
  if (!link || !link.sessionId) return false
  const created = Date.parse(link.createdAt || '')
  if (!Number.isFinite(created)) return false
  return now - created <= ttlMs && now >= created - 60 * 1000
}
