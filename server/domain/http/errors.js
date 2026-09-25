// Standard /api/v1 envelope (architecture contract §3).
//   success: { data, meta? }      error: { error: { code, message, requestId, details? } }

export const ERROR_STATUS = Object.freeze({
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  ENTITLEMENT_REQUIRED: 402,
  ENTITLEMENT_EXPIRED: 403,
  SCENARIO_NOT_FOUND: 422,
  IDEMPOTENCY_KEY_REQUIRED: 428,
  INVITE_EXPIRED: 410,
  INVITE_EMAIL_MISMATCH: 403,
  RATE_LIMITED: 429,
  CAMPUS_STORE_UNAVAILABLE: 503,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500,
})

export class ApiError extends Error {
  constructor(code, message, { status, details } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status || ERROR_STATUS[code] || 500
    this.details = details
  }
}

export function ok(res, data, status = 200, meta) {
  return res.status(status).json(meta ? { data, meta } : { data })
}

export function list(res, items, meta = {}) {
  return res.status(200).json({ data: items, meta })
}

export function fail(res, status, code, message, details) {
  const error = { code, message, requestId: res.req?.requestId || null }
  if (details !== undefined) error.details = details
  return res.status(status).json({ error })
}

export function notFound(_req, res) {
  return fail(res, 404, 'NOT_FOUND', 'Not found')
}

// Error-handling middleware for /api/v1. Internal details stay in logs.
export function createErrorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return function v1ErrorHandler(err, req, res, _next) {
    if (res.headersSent) return undefined
    if (err instanceof ApiError) return fail(res, err.status, err.code, err.message, err.details)
    if (err?.type === 'entity.parse.failed') return fail(res, 422, 'VALIDATION_FAILED', 'Request body is not valid JSON')
    if (err?.type === 'entity.too.large') return fail(res, 413, 'VALIDATION_FAILED', 'Request body is too large')
    logger?.captureException?.(err, { msg: 'v1_unhandled_error', requestId: req.requestId })
    return fail(res, 500, 'INTERNAL', 'Something went wrong. Please try again.')
  }
}
