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
  // Assessment session contract (Phase 5).
  ASSESSMENT_COMPLETED: 409,
  ASSESSMENT_NOT_OPEN: 409,
  ACKNOWLEDGEMENT_REQUIRED: 409,
  FINISH_CONFIRMATION_REQUIRED: 409,
  CONSENT_REQUIRED: 422,
  AGE_CONFIRMATION_REQUIRED: 403,
  SESSION_TIME_LIMIT: 410,
  // P3.8: a draft run accepts formal answers only between Begin and the
  // answer deadline; before Begin the learner is still reading the briefing.
  ASSESSMENT_NOT_BEGUN: 409,
  IF_MATCH_REQUIRED: 428,
  UPSTREAM_UNAVAILABLE: 503,
  // Student Report V3 (Phase 6).
  REPORT_NOT_READY: 409,
  REPORT_UNDER_REVIEW: 409,
  // P2.6/P2.7: the evaluation run failed technically (retry / support), which
  // is never shown as missing evidence.
  REPORT_PROCESSING_FAILED: 409,
  // P6 practice: a bounded allowance is used up / no unfamiliar setting left.
  ALLOWANCE_EXHAUSTED: 409,
  NO_FRESH_CHALLENGE: 409,
  // P7.2: a preparation request Prism will not rehearse (harassment,
  // coercion, deception, unauthorised disclosure, crisis). Bounded refusal.
  PREPARATION_OUT_OF_SCOPE: 422,
  // P10.2/P10.5 release gates: a new run is refused before any credit moves;
  // a pinned run whose method this build no longer carries fails closed
  // (never a legacy-engine fallback).
  RUN_NOT_ALLOCATABLE: 503,
  RUN_VERSION_UNSUPPORTED: 409,
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
