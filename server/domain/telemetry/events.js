// Product telemetry (spec §46; C4.13). Events are an allow-list; props are an
// allow-list of ids, enums, counts and timestamps. Anything else is DROPPED,
// never stored: no transcript text, answers, names, emails, report narrative,
// URLs or tokens. The actor is a keyed hash (null when no key is configured).
import { createHmac } from 'node:crypto'
import { ApiError } from '../http/errors.js'
import { clone } from '../campusStore/memoryDb.js'
import { iso } from '../campusStore/pgUtil.js'

export const STUDENT_EVENTS = Object.freeze([
  'invite_received', 'membership_accepted', 'briefing_opened', 'assessment_started', 'assessment_resumed',
  'assessment_completed', 'report_viewed', 'mission_started', 'mission_completed', 'reassessment_started', 'reassessment_completed',
  // P8.9 voluntary-value funnel: preview → offer → purchase. Pseudonymous ids,
  // enums and counts only; never answer text, prices typed by a person, or
  // payment identifiers.
  'preview_started', 'preview_completed', 'preview_claimed', 'offer_viewed', 'checkout_started', 'purchase_completed', 'purchase_failed',
  // P8.9 report → recommendation → practice. Same payload rules; the return
  // funnel is computed in P9 from report_opened / practice events, not a new name.
  'recommendation_viewed', 'recommendation_followed', 'practice_started', 'practice_completed', 'practice_retried',
])
export const CAMPUS_EVENTS = Object.freeze([
  'org_created', 'students_imported', 'program_created', 'assignment_created', 'assignment_launched',
  'cohort_report_viewed', 'intervention_created', 'reassessment_created', 'renewal_intent_recorded',
])
export const PRODUCT_EVENTS = Object.freeze([...STUDENT_EVENTS, ...CAMPUS_EVENTS])

const ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,79}$/
const ENUM = /^[A-Z][A-Z0-9_]{0,39}$/
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
const isCount = (v) => Number.isInteger(v) && v >= 0 && v <= 100000

// prop → validator. A prop not listed here is dropped.
export const PROP_RULES = Object.freeze({
  assignmentId: (v) => typeof v === 'string' && ID.test(v),
  sessionId: (v) => typeof v === 'string' && ID.test(v),
  definitionId: (v) => typeof v === 'string' && ID.test(v),
  missionId: (v) => typeof v === 'string' && ID.test(v),
  cohortId: (v) => typeof v === 'string' && ID.test(v),
  programId: (v) => typeof v === 'string' && ID.test(v),
  scope: (v) => v === 'PERSONAL' || v === 'SPONSORED',
  surface: (v) => typeof v === 'string' && ENUM.test(v),
  outcome: (v) => typeof v === 'string' && ENUM.test(v),
  productCode: (v) => typeof v === 'string' && ENUM.test(v),
  fundingSource: (v) => typeof v === 'string' && ENUM.test(v),
  // P8.9: genuine purchases, refunds, researcher incentives, compulsory
  // assignments and test accounts stay distinguishable in every funnel.
  purchaseKind: (v) => PURCHASE_KINDS.includes(v),
  accountClass: (v) => ACCOUNT_CLASSES.includes(v),
  workspaceClass: (v) => v === 'PERSONAL' || v === 'CAMPUS',
  mode: (v) => RUN_MODES.includes(v),
  version: (v) => typeof v === 'string' && ID.test(v),
  count: isCount,
  at: (v) => typeof v === 'string' && ISO.test(v),
})

export const PURCHASE_KINDS = Object.freeze(['GENUINE', 'REFUND', 'INCENTIVE', 'COMPULSORY', 'TEST'])
export const ACCOUNT_CLASSES = Object.freeze(['GENUINE', 'TEST', 'RESEARCH_PARTICIPANT', 'STAFF'])
export const RUN_MODES = Object.freeze(['FORMAL', 'PRACTICE', 'PREPARATION', 'SELF_REPORT', 'PREVIEW'])

export function sanitizeProps(raw) {
  const props = {}
  const dropped = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { props, dropped }
  for (const [key, value] of Object.entries(raw)) {
    const rule = Object.hasOwn(PROP_RULES, key) ? PROP_RULES[key] : null
    if (rule && rule(value)) props[key] = value
    else dropped.push(key)
  }
  return { props, dropped }
}

export function createActorHasher(key = process.env.PRISM_TELEMETRY_KEY) {
  if (!key) return () => null
  return (userId) => (userId ? createHmac('sha256', key).update(String(userId)).digest('hex').slice(0, 32) : null)
}

export function createTelemetryService({ repos, clock = () => new Date(), hashActor = createActorHasher() }) {
  return {
    async record({ user, workspace, event, props, occurredAt }) {
      if (!PRODUCT_EVENTS.includes(event)) throw new ApiError('VALIDATION_FAILED', 'Unknown event.')
      // Campus funnel events come only from campus administration workspaces.
      if (CAMPUS_EVENTS.includes(event) && workspace?.type !== 'CAMPUS_ADMIN') throw new ApiError('FORBIDDEN', 'This event is not available in this workspace.')
      const clean = sanitizeProps(props)
      const at = typeof occurredAt === 'string' && ISO.test(occurredAt) ? occurredAt : clock().toISOString()
      if (!repos?.productEvents) return { stored: false, dropped: clean.dropped }
      await repos.productEvents.append({
        event,
        actorHash: hashActor(user?.id),
        workspaceType: workspace?.type || null,
        organizationId: workspace?.organizationId || null,
        props: clean.props,
        occurredAt: at,
      })
      return { stored: true, dropped: clean.dropped }
    },
  }
}

export function createProductEventsRepoMemory(db) {
  db.productEvents ||= []
  return {
    async append(e) {
      const row = { id: db.id(), ...clone(e), receivedAt: db.clock().toISOString() }
      db.productEvents.push(row)
      return clone(row)
    },
    async list({ event } = {}) {
      return db.productEvents.filter((e) => !event || e.event === event).map(clone)
    },
  }
}

const row = (r) => r && ({ id: r.id, event: r.event, actorHash: r.actor_hash, workspaceType: r.workspace_type, organizationId: r.organization_id, props: r.props, occurredAt: iso(r.occurred_at), receivedAt: iso(r.received_at) })

export function createProductEventsRepoPg({ query }) {
  return {
    async append(e) {
      const { rows } = await query(
        `INSERT INTO product_events (event, actor_hash, workspace_type, organization_id, props, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [e.event, e.actorHash, e.workspaceType, e.organizationId, JSON.stringify(e.props), e.occurredAt],
      )
      return row(rows[0])
    },
    async list({ event } = {}) {
      const { rows } = event
        ? await query('SELECT * FROM product_events WHERE event = $1 ORDER BY received_at', [event])
        : await query('SELECT * FROM product_events ORDER BY received_at')
      return rows.map(row)
    },
  }
}
