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
    async findByHash(sessionId, contentHash) {
      return clone(db.reportVersions.find((v) => v.sessionId === sessionId && v.contentHash === contentHash)) || null
    },
    async append({ sessionId, version, contentHash, builderVersion, report }) {
      if (!Number.isInteger(version) || version < 1) throw new ApiError('VALIDATION_FAILED', 'Invalid version.')
      if (db.reportVersions.some((v) => v.sessionId === sessionId && (v.version === version || v.contentHash === contentHash))) {
        throw new ApiError('CONFLICT', 'This report version already exists.')
      }
      const row = { sessionId, version, contentHash, builderVersion, report: clone(report), createdAt: db.clock().toISOString() }
      db.reportVersions.push(row)
      return clone(row)
    },
  }
}

const row = (r) => r && ({
  sessionId: r.session_id, version: r.version, contentHash: r.content_hash, builderVersion: r.builder_version, report: r.report_json, createdAt: iso(r.created_at),
})

export function createReportVersionsRepoPg({ query }) {
  return {
    async latest(sessionId) {
      const { rows } = await query('SELECT * FROM student_report_versions WHERE session_id = $1 ORDER BY version DESC LIMIT 1', [sessionId])
      return row(rows[0]) || null
    },
    async findByHash(sessionId, contentHash) {
      const { rows } = await query('SELECT * FROM student_report_versions WHERE session_id = $1 AND content_hash = $2', [sessionId, contentHash])
      return row(rows[0]) || null
    },
    async append({ sessionId, version, contentHash, builderVersion, report }) {
      try {
        const { rows } = await query(
          `INSERT INTO student_report_versions (session_id, version, content_hash, builder_version, report_json)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [sessionId, version, contentHash, builderVersion, JSON.stringify(report)],
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
