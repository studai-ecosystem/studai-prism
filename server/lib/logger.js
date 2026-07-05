// Structured JSON logging + optional error monitoring (Sentry).
//
// - Emits one JSON object per line (timestamp, level, msg, ...meta) so logs are
//   machine-parseable by any aggregator (Datadog, Loki, CloudWatch, etc.).
// - LOG_LEVEL env var (error|warn|info|debug) controls verbosity; default info.
// - If SENTRY_DSN is set AND @sentry/node is installed, exceptions are forwarded
//   to Sentry. Both are optional — the app runs fine without them.

import { randomUUID } from 'crypto'

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 }
const currentLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info

// ── Optional Sentry wiring ────────────────────────────────────────────────────
let sentry = null
if (process.env.SENTRY_DSN) {
  try {
    const Sentry = await import('@sentry/node')
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    })
    sentry = Sentry
  } catch {
    // @sentry/node not installed — fall back to console-only logging.
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'warn',
      msg: 'sentry_unavailable',
      detail: 'SENTRY_DSN set but @sentry/node is not installed; using console logging only',
    }))
  }
}

function emit(level, msg, meta) {
  if (LEVELS[level] > currentLevel) return
  const entry = { ts: new Date().toISOString(), level, msg, ...(meta || {}) }
  const line = JSON.stringify(entry)
  // eslint-disable-next-line no-console
  if (level === 'error') console.error(line)
  // eslint-disable-next-line no-console
  else if (level === 'warn') console.warn(line)
  // eslint-disable-next-line no-console
  else console.log(line)
}

const logger = {
  error: (msg, meta) => emit('error', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  debug: (msg, meta) => emit('debug', msg, meta),

  // Log an exception with stack trace and forward it to Sentry when available.
  // Serialises SDK-style errors (e.g. Razorpay: {statusCode, error:{code,
  // description}}) that carry no .message — those previously logged as an
  // empty error line, hiding the real cause (2026-07-05 checkout incident).
  captureException: (err, context = {}) => {
    const detail =
      err?.message ||
      err?.error?.description ||
      (err && typeof err === 'object' ? safeStringify(err) : String(err))
    emit('error', context.msg || detail || 'exception', {
      ...context,
      msg: undefined,
      error: detail,
      statusCode: err?.statusCode,
      stack: err?.stack,
    })
    if (sentry) {
      try { sentry.captureException(err, { extra: context }) } catch { /* never throw from logging */ }
    }
  },
}

function safeStringify(obj) {
  try {
    return JSON.stringify(obj).slice(0, 500)
  } catch {
    return '[unserializable error]'
  }
}

// ── Express request-logging middleware ────────────────────────────────────────
// Adds a request id, then logs method/url/status/duration once the response
// finishes. Mounted before the routers in index.js.
export function requestLogger(req, res, next) {
  const requestId = req.headers['x-request-id'] || randomUUID()
  req.requestId = requestId
  res.setHeader('x-request-id', requestId)
  const start = process.hrtime.bigint()

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
    emit(level, 'http_request', {
      requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
    })
  })

  next()
}

export default logger
