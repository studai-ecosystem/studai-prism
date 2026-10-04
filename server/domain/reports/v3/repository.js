// Student Report V3 versions (0033): append-only, one row per distinct
// rendering (content hash) — memory and Postgres adapters, same semantics.
import { ApiError } from '../../http/errors.js'
import { iso } from '../../campusStore/pgUtil.js'
import { clone } from '../../campusStore/memoryDb.js'

export function createReportVersionsRepoMemory(db) {
  db.reportVersions ||= []
  return {
    async latest(sessionId) {
      const rows = db.reportVersions.filter((v) => v.sessionId === sessionId)
      return clone(rows.sort((a, b) => b.version - a.version)[0]) || null
    },
    async get(sessionId, version) {
      return clone(db.reportVersions.find((v) => v.sessionId === sessionId && v.version === version)) || null
    },
    // Version history without report bodies (P5.1): what exists, when and why.
    async listVersions(sessionId) {
      return db.reportVersions.filter((v) => v.sessionId === sessionId).sort((a, b) => a.version - b.version)
        .map((v) => ({ version: v.version, builderVersion: v.builderVersion, createdAt: v.createdAt, issuedAt: v.issuedAt ?? null, reason: v.reason ?? null, priorVersion: v.priorVersion ?? null }))
    },
    async findByHash(sessionId, contentHash) {
      return clone(db.reportVersions.find((v) => v.sessionId === sessionId && v.contentHash === contentHash)) || null
    },
    async append({ sessionId, version, contentHash, builderVersion, report, evidenceSetHash = null, issuedAt = null, reason = null, priorVersion = null }) {
      if (!Number.isInteger(version) || version < 1) throw new ApiError('VALIDATION_FAILED', 'Invalid version.')
      if (db.reportVersions.some((v) => v.sessionId === sessionId && (v.version === version || v.contentHash === contentHash))) {
        throw new ApiError('CONFLICT', 'This report version already exists.')
      }
      const row = { sessionId, version, contentHash, builderVersion, report: clone(report), evidenceSetHash, issuedAt, reason, priorVersion, createdAt: db.clock().toISOString() }
      db.reportVersions.push(row)
      return clone(row)
    },
  }
}

const row = (r) => r && ({
  sessionId: r.session_id, version: r.version, contentHash: r.content_hash, builderVersion: r.builder_version, report: r.report_json, createdAt: iso(r.created_at),
  // P2.7 publication metadata (0041); null on legacy rows.
  evidenceSetHash: r.evidence_set_hash ?? null, issuedAt: r.issued_at ? iso(r.issued_at) : null, reason: r.reason ?? null, priorVersion: r.prior_version ?? null,
})

export function createReportVersionsRepoPg({ query }) {
  return {
    async latest(sessionId) {
      const { rows } = await query('SELECT * FROM student_report_versions WHERE session_id = $1 ORDER BY version DESC LIMIT 1', [sessionId])
      return row(rows[0]) || null
    },
    async get(sessionId, version) {
      const { rows } = await query('SELECT * FROM student_report_versions WHERE session_id = $1 AND version = $2', [sessionId, version])
      return row(rows[0]) || null
    },
    async listVersions(sessionId) {
      const { rows } = await query(
        'SELECT version, builder_version, created_at, issued_at, reason, prior_version FROM student_report_versions WHERE session_id = $1 ORDER BY version ASC', [sessionId],
      )
      return rows.map((r) => ({ version: r.version, builderVersion: r.builder_version, createdAt: iso(r.created_at), issuedAt: r.issued_at ? iso(r.issued_at) : null, reason: r.reason ?? null, priorVersion: r.prior_version ?? null }))
    },
    async findByHash(sessionId, contentHash) {
      const { rows } = await query('SELECT * FROM student_report_versions WHERE session_id = $1 AND content_hash = $2', [sessionId, contentHash])
      return row(rows[0]) || null
    },
    async append({ sessionId, version, contentHash, builderVersion, report, evidenceSetHash = null, issuedAt = null, reason = null, priorVersion = null }) {
      try {
        const { rows } = await query(
          `INSERT INTO student_report_versions (session_id, version, content_hash, builder_version, report_json, evidence_set_hash, issued_at, reason, prior_version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [sessionId, version, contentHash, builderVersion, JSON.stringify(report), evidenceSetHash, issuedAt, reason, priorVersion],
        )
        return row(rows[0])
      } catch (err) {
        if (err.code === '23505') throw new ApiError('CONFLICT', 'This report version already exists.')
        if (err.code === '23514') throw new ApiError('VALIDATION_FAILED', 'Invalid version.')
        throw err
      }
    },
  }
}

// Report review requests (0045, P5.7): a learner's request that a person
// reviews a published version. Append-only cases; the version itself is
// never rewritten by a request. Decisions (0051) are an append-only history
// per request; a CORRECT decision names evidence units to withhold, which the
// report service treats as a provenance flag (the units are not mutated).
export const REVIEW_CATEGORIES = Object.freeze(['TRANSCRIPTION', 'ATTRIBUTION', 'SCENARIO_FACT', 'INTERPRETATION', 'OTHER'])
export const REVIEW_DECISIONS = Object.freeze(['UPHOLD', 'CORRECT', 'REJECT'])

const reviewView = (r) => r && ({ id: r.id, sessionId: r.sessionId, version: r.version, category: r.category, momentId: r.momentId ?? null, state: r.state, createdAt: r.createdAt })
// The reviewer's queue view: ids, category and the learner's stated reason —
// never report content, quotes or the learner's identity.
const queueView = (r) => r && ({ ...reviewView(r), reason: r.reason })
const decisionView = (d) => d && ({ id: d.id, reviewId: d.reviewId, reviewerId: d.reviewerId, decision: d.decision, reason: d.reason, correction: d.correction ?? null, createdAt: d.createdAt })

export function createReportReviewsRepoMemory(db) {
  db.reportReviewRequests ||= []
  db.reportReviewDecisions ||= []
  return {
    async create({ sessionId, version, userId, category = 'INTERPRETATION', momentId = null, reason }) {
      if (!db.reportVersions?.some((v) => v.sessionId === sessionId && v.version === version)) throw new ApiError('NOT_FOUND', 'That report version does not exist.')
      const row = { id: db.id(), sessionId, version, userId, category, momentId, reason, state: 'OPEN', createdAt: db.clock().toISOString() }
      db.reportReviewRequests.push(row)
      return reviewView(clone(row))
    },
    async listForSession(sessionId) {
      return db.reportReviewRequests.filter((r) => r.sessionId === sessionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((r) => reviewView(clone(r)))
    },
    async get(id) {
      return queueView(clone(db.reportReviewRequests.find((r) => r.id === id))) || null
    },
    async listOpen() {
      return db.reportReviewRequests.filter((r) => r.state === 'OPEN').sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((r) => queueView(clone(r)))
    },
    async addDecision({ reviewId, reviewerId, decision, reason, correction = null }) {
      const review = db.reportReviewRequests.find((r) => r.id === reviewId)
      if (!review) throw new ApiError('NOT_FOUND', 'That review request does not exist.')
      if (!REVIEW_DECISIONS.includes(decision)) throw new ApiError('VALIDATION_FAILED', 'Invalid decision.')
      const row = { id: db.id(), reviewId, reviewerId, decision, reason, correction: correction ? clone(correction) : null, createdAt: db.clock().toISOString() }
      db.reportReviewDecisions.push(Object.freeze(row))
      review.state = 'RESOLVED'
      return decisionView(clone(row))
    },
    async listDecisions(reviewId) {
      return db.reportReviewDecisions.filter((d) => d.reviewId === reviewId).map((d) => decisionView(clone(d)))
    },
    // Evidence ids withheld from a session's report by CORRECT decisions.
    async listWithheldEvidenceIds(sessionId) {
      const ids = new Set(db.reportReviewRequests.filter((r) => r.sessionId === sessionId).map((r) => r.id))
      return [...new Set(db.reportReviewDecisions.filter((d) => ids.has(d.reviewId) && d.decision === 'CORRECT').flatMap((d) => d.correction?.withholdEvidenceIds || []))].sort()
    },
  }
}

const reviewRow = (r) => r && ({ id: r.id, sessionId: r.session_id, version: r.version, category: r.category, momentId: r.moment_id ?? null, state: r.state, createdAt: iso(r.created_at), ...(r.reason !== undefined ? { reason: r.reason } : {}) })
const decisionRow = (d) => d && ({ id: d.id, reviewId: d.review_id, reviewerId: d.reviewer_id, decision: d.decision, reason: d.reason, correction: d.correction_json ?? null, createdAt: iso(d.created_at) })

export function createReportReviewsRepoPg({ query }) {
  return {
    async create({ sessionId, version, userId, category = 'INTERPRETATION', momentId = null, reason }) {
      try {
        const { rows } = await query(
          `INSERT INTO report_review_requests (session_id, version, user_id, category, moment_id, reason)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, session_id, version, category, moment_id, state, created_at`,
          [sessionId, version, userId, category, momentId, reason],
        )
        return reviewRow(rows[0])
      } catch (err) {
        if (err.code === '23503') throw new ApiError('NOT_FOUND', 'That report version does not exist.')
        if (err.code === '23514') throw new ApiError('VALIDATION_FAILED', 'Describe what you would like reviewed.')
        throw err
      }
    },
    async listForSession(sessionId) {
      const { rows } = await query(
        'SELECT id, session_id, version, category, moment_id, state, created_at FROM report_review_requests WHERE session_id = $1 ORDER BY created_at ASC', [sessionId],
      )
      return rows.map(reviewRow)
    },
    async get(id) {
      const { rows } = await query('SELECT id, session_id, version, category, moment_id, reason, state, created_at FROM report_review_requests WHERE id = $1', [id])
      return reviewRow(rows[0]) || null
    },
    async listOpen() {
      const { rows } = await query("SELECT id, session_id, version, category, moment_id, reason, state, created_at FROM report_review_requests WHERE state = 'OPEN' ORDER BY created_at ASC")
      return rows.map(reviewRow)
    },
    async addDecision({ reviewId, reviewerId, decision, reason, correction = null }) {
      try {
        const { rows } = await query(
          `INSERT INTO report_review_decisions (review_id, reviewer_id, decision, reason, correction_json)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [reviewId, reviewerId, decision, reason, correction ? JSON.stringify(correction) : null],
        )
        await query("UPDATE report_review_requests SET state = 'RESOLVED' WHERE id = $1", [reviewId])
        return decisionRow(rows[0])
      } catch (err) {
        if (err.code === '23503') throw new ApiError('NOT_FOUND', 'That review request does not exist.')
        if (err.code === '23514') throw new ApiError('VALIDATION_FAILED', 'Invalid decision.')
        throw err
      }
    },
    async listDecisions(reviewId) {
      const { rows } = await query('SELECT * FROM report_review_decisions WHERE review_id = $1 ORDER BY created_at ASC', [reviewId])
      return rows.map(decisionRow)
    },
    async listWithheldEvidenceIds(sessionId) {
      const { rows } = await query(
        `SELECT DISTINCT jsonb_array_elements_text(d.correction_json -> 'withholdEvidenceIds') AS evidence_id
           FROM report_review_decisions d JOIN report_review_requests r ON r.id = d.review_id
          WHERE r.session_id = $1 AND d.decision = 'CORRECT' AND jsonb_typeof(d.correction_json -> 'withholdEvidenceIds') = 'array'
          ORDER BY evidence_id`, [sessionId],
      )
      return rows.map((r) => r.evidence_id)
    },
  }
}
