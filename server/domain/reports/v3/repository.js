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
// never rewritten by a request.
export const REVIEW_CATEGORIES = Object.freeze(['TRANSCRIPTION', 'ATTRIBUTION', 'SCENARIO_FACT', 'INTERPRETATION', 'OTHER'])

const reviewView = (r) => r && ({ id: r.id, sessionId: r.sessionId, version: r.version, category: r.category, momentId: r.momentId ?? null, state: r.state, createdAt: r.createdAt })

export function createReportReviewsRepoMemory(db) {
  db.reportReviewRequests ||= []
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
  }
}

const reviewRow = (r) => r && ({ id: r.id, sessionId: r.session_id, version: r.version, category: r.category, momentId: r.moment_id ?? null, state: r.state, createdAt: iso(r.created_at) })

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
  }
}
