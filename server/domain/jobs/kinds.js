// Job kinds of the PostgreSQL-backed queue (PROD-READY Phase 5, migration
// 0059). Every kind declares a zod `.strict()` payload schema of REFERENCES
// ONLY (ids and a time bucket) — never an email address, a name or free text;
// a handler re-reads current state when it runs. A kind that concerns one
// account names it through `subject`, which fills jobs.subject_user_id so
// account erasure can remove the person's jobs (charter law 7).
import { z } from 'zod'

const ref = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9:_.-]+$/)
const uuid = z.string().uuid()
const bucket = z.object({ bucket: z.string().datetime() }).strict()

export const JOB_KINDS = Object.freeze({
  // CSV import invite (one job per invite): issue the link token and send the email.
  'campus.invite_email': { schema: z.object({ inviteId: uuid }).strict(), maxAttempts: 6 },
  // Recurring scan: enqueue one reminder per due recipient (K80 reminder policy).
  'campus.reminders_scan': { schema: bucket, maxAttempts: 3, recurring: true },
  // One reminder email for one student on one assignment window.
  'campus.assignment_reminder': {
    schema: z.object({ assignmentId: ref, userId: ref }).strict(),
    subject: (payload) => payload.userId,
    maxAttempts: 5,
  },
  // Recurring scan: enqueue a seat release for each assignment whose window passed.
  'campus.seat_release_scan': { schema: bucket, maxAttempts: 3, recurring: true },
  // Release the RESERVED seats of unfinished starts of one assignment (K69/K79).
  'campus.seat_release': { schema: z.object({ assignmentId: ref }).strict(), maxAttempts: 5 },
  // Housekeeping: delete finished (SUCCEEDED / CANCELLED) job rows after 30 days.
  'jobs.prune': { schema: bucket, maxAttempts: 3, recurring: true },
  // Retention passes — scheduled ONLY while PRISM_RETENTION_ENFORCEMENT is on (HA-003).
  'retention.enforce': { schema: bucket, maxAttempts: 3, recurring: true, retention: true },
  'retention.import_rows': { schema: bucket, maxAttempts: 3, recurring: true, retention: true },
  'retention.accommodation_requests': { schema: bucket, maxAttempts: 3, recurring: true, retention: true },
})

export const JOB_STATUSES = Object.freeze(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED'])
export const DEFAULT_MAX_ATTEMPTS = 5

export class JobPayloadError extends Error {
  constructor(message) {
    super(message)
    this.code = 'JOB_PAYLOAD_INVALID'
  }
}

// Validates and normalises an enqueue request; throws JobPayloadError.
export function prepareJob({ kind, payload = {}, dedupeKey = null, runAt = null, maxAttempts = null }) {
  const def = JOB_KINDS[kind]
  if (!def) throw new JobPayloadError(`Unknown job kind: ${String(kind).slice(0, 80)}`)
  const parsed = def.schema.safeParse(payload)
  if (!parsed.success) throw new JobPayloadError(`Invalid payload for ${kind}`)
  if (dedupeKey != null && (typeof dedupeKey !== 'string' || !dedupeKey.length || dedupeKey.length > 300)) throw new JobPayloadError('Invalid dedupe key')
  const subjectUserId = def.subject ? String(def.subject(parsed.data)) : null
  const attempts = Number.isInteger(maxAttempts) ? maxAttempts : (def.maxAttempts || DEFAULT_MAX_ATTEMPTS)
  return {
    kind,
    payload: parsed.data,
    subjectUserId,
    dedupeKey: dedupeKey ?? null,
    runAt: runAt ? new Date(runAt).toISOString() : null,
    maxAttempts: Math.min(50, Math.max(1, attempts)),
  }
}

// last_error is shown to operators: an error code and the first line of the
// message with addresses, links (invite links carry a token) and long digit
// runs removed. Handlers throw coded errors, so the code carries the meaning.
export function sanitiseError(err) {
  const code = String(err?.code || err?.name || 'Error').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 60) || 'Error'
  const message = String(err?.message || '').split('\n')[0]
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/[^\s@<>()"',;:[\]]+@[^\s@<>()"',;:[\]]+/g, '[address]')
    .replace(/\+?\d[\d\s-]{6,}\d/g, '[number]')
    .slice(0, 220)
  return message ? `${code}: ${message}`.slice(0, 300) : code
}

// A handler throws this when retrying cannot help (the row goes straight to DEAD).
export class PermanentJobError extends Error {
  constructor(code, message = code) {
    super(message)
    this.code = code
    this.permanent = true
  }
}

// Exponential backoff with equal jitter: attempt n waits between half and the
// whole of min(maxMs, baseMs * 2^(n-1)).
export function backoffMs(attempt, { baseMs = 30_000, maxMs = 6 * 60 * 60 * 1000 } = {}, random = Math.random) {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1))
  return Math.round(exp / 2 + random() * (exp / 2))
}
