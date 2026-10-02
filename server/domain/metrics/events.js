// P9.2 (CH-44) canonical product-event catalogue and allow-listed payload.
//
// The canonical names are the source plan's list. Older telemetry names that
// the client already emits (domain/telemetry/events.js) are kept as ALIASES so
// no existing event stops being accepted; `canonicalEventName` maps either
// spelling to the canonical one for metric computation.
//
// Payload rule: a closed allow-list of ids, enums, counts, flags and
// timestamps. Any other key is a hard rejection here (strict schema). No
// response text, private context, names, institution identity, raw audio,
// tokens or payment secrets can be represented at all.
import { z } from 'zod'

export const EVENT_SCHEMA_VERSION = 'v1'

export const CANONICAL_EVENTS = Object.freeze([
  'intent_selected',
  'preview_started',
  'preview_feedback_seen',
  'package_viewed',
  'purchase_verified',
  'formal_begin_acknowledged',
  'candidate_action_saved',
  'opportunity_presented',
  'evaluation_completed',
  'evaluation_failed',
  'report_published',
  'report_opened',
  'moment_opened',
  'practice_recommended',
  'practice_started',
  'practice_feedback_seen',
  'practice_retried',
  'fresh_challenge_completed',
  'application_self_reported',
  'review_requested',
  'share_created',
])

// existing telemetry name → canonical name. Existing names stay accepted by
// the telemetry route; they are folded here for metric computation only.
export const LEGACY_EVENT_ALIASES = Object.freeze({
  assessment_started: 'formal_begin_acknowledged',
  preview_completed: 'preview_feedback_seen',
  offer_viewed: 'package_viewed',
  purchase_completed: 'purchase_verified',
  report_viewed: 'report_opened',
  mission_started: 'practice_started',
})

export function canonicalEventName(name) {
  if (CANONICAL_EVENTS.includes(name)) return name
  return Object.hasOwn(LEGACY_EVENT_ALIASES, name) ? LEGACY_EVENT_ALIASES[name] : null
}

export function isKnownEvent(name) {
  return canonicalEventName(name) !== null
}

const ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,79}$/
const ENUM = /^[A-Z][A-Z0-9_]{0,39}$/
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/

const id = z.string().regex(ID)
const enumeration = z.string().regex(ENUM)
const count = z.number().int().min(0).max(100000)

// The complete payload allow-list. Every key is optional; no key may carry
// free text. `strict()` rejects anything outside this list.
export const EVENT_PAYLOAD_SCHEMA = z.object({
  sessionId: id.optional(),
  assignmentId: id.optional(),
  definitionId: id.optional(),
  formId: id.optional(),
  missionId: id.optional(),
  opportunityId: id.optional(),
  momentId: id.optional(),
  reportVersion: z.number().int().min(1).optional(),
  scope: z.enum(['PERSONAL', 'SPONSORED']).optional(),
  surface: enumeration.optional(),
  outcome: enumeration.optional(),
  method: enumeration.optional(),
  mode: enumeration.optional(),
  productCode: enumeration.optional(),
  fundingSource: z.enum(['PAID', 'SPONSORED', 'DEV', 'INVITE']).optional(),
  channel: z.enum(['VOLUNTARY', 'COMPULSORY', 'UNKNOWN']).optional(),
  availability: z.enum(['AVAILABLE', 'UNAVAILABLE']).optional(),
  reminded: z.boolean().optional(),
  incentivised: z.boolean().optional(),
  refunded: z.boolean().optional(),
  isSynthetic: z.boolean().optional(),
  count: count.optional(),
  at: z.string().regex(ISO).optional(),
}).strict()

export const ALLOWED_PAYLOAD_KEYS = Object.freeze(Object.keys(EVENT_PAYLOAD_SCHEMA.shape))

// Documented examples of what can never appear. The strict schema rejects
// them (and every other unknown key); this list exists for tests and docs.
export const FORBIDDEN_PAYLOAD_KEYS = Object.freeze([
  'text', 'message', 'transcript', 'answer', 'response', 'excerpt', 'quote', 'notes',
  'name', 'email', 'phone', 'userId', 'institution', 'organizationName',
  'audio', 'recording', 'token', 'accessToken', 'authorization', 'card', 'paymentId', 'orderId', 'amount', 'price',
])

export const EVENT_SCHEMA = z.object({
  event: z.string().min(1).max(60).refine(isKnownEvent, { message: 'Unknown event.' }),
  props: EVENT_PAYLOAD_SCHEMA.optional(),
  occurredAt: z.string().regex(ISO).optional(),
}).strict()

// Validate one event. Returns { ok, event (canonical), props, occurredAt } or
// { ok: false, issues }. Nothing is dropped silently: unknown keys fail.
export function validateEvent(input) {
  const parsed = EVENT_SCHEMA.safeParse(input)
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }
  }
  return {
    ok: true,
    event: canonicalEventName(parsed.data.event),
    rawEvent: parsed.data.event,
    props: parsed.data.props || {},
    occurredAt: parsed.data.occurredAt || null,
  }
}
