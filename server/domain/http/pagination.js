import { ApiError } from './errors.js'

export const DEFAULT_LIMIT = 25
export const MAX_LIMIT = 100

// Cursor pagination: ?cursor=<opaque>&limit=<1..100>. Cursors are base64url
// JSON produced by encodeCursor; anything else is a validation error.
export function parsePagination(query = {}) {
  let limit = DEFAULT_LIMIT
  if (query.limit !== undefined) {
    const n = Number(query.limit)
    if (!Number.isInteger(n) || n < 1) throw new ApiError('VALIDATION_FAILED', 'limit must be a positive integer')
    limit = Math.min(n, MAX_LIMIT)
  }
  let cursor = null
  if (query.cursor) {
    try {
      cursor = JSON.parse(Buffer.from(String(query.cursor), 'base64url').toString('utf8'))
    } catch {
      throw new ApiError('VALIDATION_FAILED', 'cursor is not valid')
    }
  }
  return { limit, cursor }
}

export function encodeCursor(value) {
  return value == null ? null : Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}
