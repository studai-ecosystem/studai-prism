// /api/admin/quality — P9.1 three independent quality views (system:read).
//
//   GET /quality/operational   accepted-action recovery, jobs, leases, failures, publication
//   GET /quality/measurement   opportunity delivery, judgeability, claim rejection, sufficiency
//   GET /quality/customer      comprehension/practice/return/paid signals from product events
//
// AGGREGATE COUNTS ONLY. No session ids, actor hashes, payloads, report
// bodies or learner text leave this router. Without a configured database it
// answers an honest 503 NO_DB — nothing is estimated or invented. Comprehension
// and transfer are MANUAL_ONLY: the view says so instead of showing a number.
import { Router } from 'express'
import { query as dbQuery, isDbConfigured as dbConfigured } from '../../db/pool.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { METRIC_DEFINITIONS, METRIC_DEFINITIONS_VERSION } from '../../domain/metrics/definitions.js'
import { DEFAULT_THRESHOLDS } from '../../domain/metrics/alerts.js'

const WINDOW_DAYS = 7
const num = (v) => (v === null || v === undefined ? 0 : Number(v))

// Keys that must never appear at any depth of a quality response (a test
// scans every view). Values are aggregate numbers, enums and notes only.
export const QUALITY_FORBIDDEN_RESPONSE_KEYS = Object.freeze([
  'sessionId', 'session_id', 'actorHash', 'actor_hash', 'userId', 'user_id', 'email', 'name',
  'payload', 'payload_json', 'report', 'report_json', 'text', 'excerpt', 'reason_text', 'token', 'token_hash',
  'organizationId', 'organization_id', 'props', 'stimulus', 'candidate_action',
])

async function operational(query, since) {
  const [actions, jobs, submitted, published, reviews, expired] = await Promise.all([
    query(`SELECT state, COUNT(*)::int AS n FROM assessment_candidate_actions WHERE accepted_at >= $1 GROUP BY state`, [since]),
    query(`SELECT state, result_state, SUM(CASE WHEN attempts > 1 THEN 1 ELSE 0 END)::int AS retried, COUNT(*)::int AS n FROM assessment_jobs WHERE created_at >= $1 GROUP BY state, result_state`, [since]),
    query(`SELECT COUNT(DISTINCT session_id)::int AS n FROM assessment_candidate_actions WHERE kind = 'FINISH' AND accepted_at >= $1`, [since]),
    query(`SELECT COUNT(DISTINCT session_id)::int AS n FROM student_report_versions WHERE created_at >= $1`, [since]),
    query(`SELECT COUNT(*)::int AS n FROM report_review_requests WHERE state = 'OPEN'`),
    query(`SELECT COUNT(*)::int AS n FROM assessment_jobs WHERE state = 'LEASED' AND lease_expires_at <= now()`),
  ])
  const byState = Object.fromEntries(actions.rows.map((r) => [r.state, num(r.n)]))
  const acknowledged = num(byState.ACCEPTED) + num(byState.APPLIED) + num(byState.FAILED)
  const jobAgg = { queued: 0, leased: 0, done: 0, failed: 0, technicalFailures: 0, retries: 0 }
  for (const r of jobs.rows) {
    const k = String(r.state || '').toLowerCase()
    if (k in jobAgg) jobAgg[k] += num(r.n)
    if (r.result_state === 'TECHNICAL_FAILURE') jobAgg.technicalFailures += num(r.n)
    jobAgg.retries += num(r.retried)
  }
  const submittedRuns = num(submitted.rows[0]?.n)
  const publishedRuns = num(published.rows[0]?.n)
  return {
    // Every acknowledged row in the durable table is by construction recoverable.
    actions: { acknowledged, applied: num(byState.APPLIED), failed: num(byState.FAILED), recoverable: acknowledged },
    jobs: { ...jobAgg, expiredLeases: num(expired.rows[0]?.n) },
    publication: { submittedRuns, publishedRuns, missingPublication: Math.max(0, submittedRuns - publishedRuns), reviewRequestsOpen: num(reviews.rows[0]?.n) },
  }
}

async function measurement(query, since) {
  const [opps, units, methods] = await Promise.all([
    query(`SELECT state, COUNT(*)::int AS n FROM assessment_opportunities WHERE created_at >= $1 GROUP BY state`, [since]),
    query(`SELECT evidence_status, COALESCE(provenance_json->>'reason', '') AS reason, COUNT(*)::int AS n FROM behavioral_evidence_units WHERE created_at >= $1 GROUP BY evidence_status, reason`, [since]),
    query(`SELECT COALESCE(provenance_json->>'methodVersion', 'UNSPECIFIED') AS method, evidence_status, COUNT(*)::int AS n FROM behavioral_evidence_units WHERE created_at >= $1 GROUP BY method, evidence_status`, [since]),
  ])
  const o = Object.fromEntries(opps.rows.map((r) => [r.state, num(r.n)]))
  const scheduled = Object.values(o).reduce((a, b) => a + b, 0)
  const delivered = num(o.PRESENTED) + num(o.ACTION_RECEIVED) + num(o.EVALUATION_PENDING) + num(o.EVALUATED)
  const byStatus = { provisional: 0, sufficient: 0, insufficient: 0, humanReview: 0, quoteMismatch: 0 }
  let total = 0
  for (const r of units.rows) {
    total += num(r.n)
    if (r.evidence_status === 'PROVISIONAL') byStatus.provisional += num(r.n)
    else if (r.evidence_status === 'SUFFICIENT') byStatus.sufficient += num(r.n)
    else if (r.evidence_status === 'INSUFFICIENT_EVIDENCE') byStatus.insufficient += num(r.n)
    else if (r.evidence_status === 'HUMAN_REVIEW_REQUIRED') byStatus.humanReview += num(r.n)
    if (r.reason === 'QUOTE_MISMATCH') byStatus.quoteMismatch += num(r.n)
  }
  const byMethod = {}
  for (const r of methods.rows) {
    byMethod[r.method] ||= { total: 0, sufficient: 0, provisional: 0, insufficient: 0, humanReview: 0 }
    byMethod[r.method].total += num(r.n)
    const key = { SUFFICIENT: 'sufficient', PROVISIONAL: 'provisional', INSUFFICIENT_EVIDENCE: 'insufficient', HUMAN_REVIEW_REQUIRED: 'humanReview' }[r.evidence_status]
    if (key) byMethod[r.method][key] += num(r.n)
  }
  return {
    opportunities: { scheduled, delivered, answered: num(o.ACTION_RECEIVED) + num(o.EVALUATION_PENDING) + num(o.EVALUATED), evaluated: num(o.EVALUATED) },
    evidence: { units: total, byStatus, byMethod, claimRejectionRate: total ? Number((byStatus.quoteMismatch / total).toFixed(4)) : null },
  }
}

async function customer(query, since) {
  const { rows } = await query(
    `SELECT event, COALESCE(props->>'channel', 'UNKNOWN') AS channel, COALESCE(props->>'availability', '') AS availability,
            COALESCE(props->>'refunded', 'false') AS refunded, COUNT(*)::int AS n, COUNT(DISTINCT actor_hash)::int AS actors
       FROM product_events WHERE occurred_at >= $1 AND COALESCE(props->>'isSynthetic', 'false') <> 'true'
      GROUP BY event, channel, availability, refunded`, [since])
  const byEvent = {}
  const practice = { recommendedVoluntaryViewers: 0, voluntaryStarters: 0, compulsoryStarts: 0 }
  const conversion = { offerViewers: 0, verifiedBuyers: 0, refunded: 0 }
  for (const r of rows) {
    byEvent[r.event] ||= { count: 0, actors: 0 }
    byEvent[r.event].count += num(r.n)
    byEvent[r.event].actors += num(r.actors)
    if (r.event === 'practice_recommended' && r.channel === 'VOLUNTARY' && r.availability !== 'UNAVAILABLE') practice.recommendedVoluntaryViewers += num(r.actors)
    if (['practice_started', 'mission_started'].includes(r.event)) {
      if (r.channel === 'COMPULSORY') practice.compulsoryStarts += num(r.n)
      else practice.voluntaryStarters += num(r.actors)
    }
    if (['package_viewed', 'offer_viewed'].includes(r.event)) conversion.offerViewers += num(r.actors)
    if (['purchase_verified', 'purchase_completed'].includes(r.event)) {
      if (r.refunded === 'true') conversion.refunded += num(r.n)
      else conversion.verifiedBuyers += num(r.actors)
    }
  }
  return {
    events: { byEvent },
    practice,
    conversion,
    comprehension: { status: 'MANUAL_ONLY', note: METRIC_DEFINITIONS.comprehension.notes },
    transfer: { status: 'MANUAL_ONLY', note: METRIC_DEFINITIONS.transfer.notes },
  }
}

export function createQualityRouter({ query = dbQuery, isDbConfigured = dbConfigured, clock = () => new Date() } = {}) {
  const router = Router()
  const guard = (req, res, next) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'quality views require a configured database', code: 'NO_DB' })
    next()
  }
  const serve = (view, fn) => async (req, res) => {
    const now = clock()
    const since = new Date(now.getTime() - WINDOW_DAYS * 86400000).toISOString()
    try {
      const body = await fn(query, since)
      res.json({ view, definitionVersion: METRIC_DEFINITIONS_VERSION, windowDays: WINDOW_DAYS, generatedAt: now.toISOString(), thresholds: DEFAULT_THRESHOLDS, ...body })
    } catch {
      res.status(503).json({ error: 'quality view unavailable', code: 'QUALITY_UNAVAILABLE' })
    }
  }
  router.get('/operational', requirePermission('system:read'), guard, serve('OPERATIONAL', operational))
  router.get('/measurement', requirePermission('system:read'), guard, serve('MEASUREMENT', measurement))
  router.get('/customer', requirePermission('system:read'), guard, serve('CUSTOMER', customer))
  return router
}

export default createQualityRouter()
