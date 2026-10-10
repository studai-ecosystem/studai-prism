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

// Offset cursors for admin lists (PROD-READY Phase 6): the same opaque
// base64url JSON, holding { o: <offset> }. Clients only pass back what they
// were given, so the encoding can move to keyset values without an API change.
export const ADMIN_LIST_DEFAULT_LIMIT = 50
export const ADMIN_LIST_MAX_LIMIT = 100
export function offsetFromCursor(cursor) {
  if (cursor == null || cursor === '') return 0
  let value
  try {
    value = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'))
  } catch {
    throw new ApiError('VALIDATION_FAILED', 'cursor is not valid')
  }
  if (!value || !Number.isInteger(value.o) || value.o < 0 || value.o > 1_000_000) throw new ApiError('VALIDATION_FAILED', 'cursor is not valid')
  return value.o
}
export function adminListWindow({ cursor = null, limit = null } = {}) {
  const n = limit == null ? ADMIN_LIST_DEFAULT_LIMIT : Number(limit)
  if (!Number.isInteger(n) || n < 1) throw new ApiError('VALIDATION_FAILED', 'limit must be a positive integer')
  return { offset: offsetFromCursor(cursor), limit: Math.min(n, ADMIN_LIST_MAX_LIMIT) }
}
export function nextOffsetCursor(offset, limit, total) {
  return offset + limit < total ? encodeCursor({ o: offset + limit }) : null
}
