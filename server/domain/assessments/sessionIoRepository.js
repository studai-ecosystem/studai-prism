// Assessment session I/O (0032): idempotent client events + versioned
// artifact writes — memory and Postgres adapters with the same semantics.
import { ApiError } from '../http/errors.js'
import { iso } from '../campusStore/pgUtil.js'
import { clone } from '../campusStore/memoryDb.js'

export function createSessionIoRepoMemory(db) {
  db.clientEvents ||= new Map() // `${sessionId}\u0000${clientEventId}`
  db.artifactVersions ||= []
  const key = (s, e) => `${s}\u0000${e}`
  return {
    async getClientEvent(sessionId, clientEventId) {
      return clone(db.clientEvents.get(key(sessionId, clientEventId))) || null
    },
    // Insert-if-absent: the first writer wins and every caller gets the stored row.
    async putClientEvent({ sessionId, clientEventId, kind, response }) {
      const k = key(sessionId, clientEventId)
      if (!db.clientEvents.has(k)) db.clientEvents.set(k, { sessionId, clientEventId, kind, response: clone(response), createdAt: db.clock().toISOString() })
      return clone(db.clientEvents.get(k))
    },
    async latestArtifactVersion(sessionId, artifactId) {
      const rows = db.artifactVersions.filter((v) => v.sessionId === sessionId && v.artifactId === artifactId)
      return clone(rows.sort((a, b) => b.version - a.version)[0]) || null
    },
    async listLatestArtifactVersions(sessionId) {
      const latest = new Map()
      for (const v of db.artifactVersions.filter((x) => x.sessionId === sessionId)) {
        if (!latest.has(v.artifactId) || latest.get(v.artifactId).version < v.version) latest.set(v.artifactId, v)
      }
      return [...latest.values()].map(clone)
    },
    async appendArtifactVersion({ sessionId, artifactId, version, content, savedBy }) {
      if (!Number.isInteger(version) || version < 1) throw new ApiError('VALIDATION_FAILED', 'Invalid version.')
      if (db.artifactVersions.some((v) => v.sessionId === sessionId && v.artifactId === artifactId && v.version === version)) {
        throw new ApiError('CONFLICT', 'This work material was changed elsewhere.')
      }
      const row = { sessionId, artifactId, version, content: clone(content), savedBy, savedAt: db.clock().toISOString() }
      db.artifactVersions.push(row)
      return clone(row)
    },
  }
}

const event = (r) => r && ({ sessionId: r.session_id, clientEventId: r.client_event_id, kind: r.kind, response: r.response_json, createdAt: iso(r.created_at) })
const version = (r) => r && ({ sessionId: r.session_id, artifactId: r.artifact_id, version: r.version, content: r.content_json, savedBy: r.saved_by, savedAt: iso(r.saved_at) })

export function createSessionIoRepoPg({ query }) {
  return {
    async getClientEvent(sessionId, clientEventId) {
      const { rows } = await query('SELECT * FROM assessment_client_events WHERE session_id = $1 AND client_event_id = $2', [sessionId, clientEventId])
      return event(rows[0]) || null
    },
    async putClientEvent({ sessionId, clientEventId, kind, response }) {
      await query(
        `INSERT INTO assessment_client_events (session_id, client_event_id, kind, response_json) VALUES ($1, $2, $3, $4)
         ON CONFLICT (session_id, client_event_id) DO NOTHING`,
        [sessionId, clientEventId, kind, JSON.stringify(response)],
      )
      return this.getClientEvent(sessionId, clientEventId)
    },
    async latestArtifactVersion(sessionId, artifactId) {
      const { rows } = await query(
        'SELECT * FROM assessment_artifact_versions WHERE session_id = $1 AND artifact_id = $2 ORDER BY version DESC LIMIT 1',
        [sessionId, artifactId],
      )
      return version(rows[0]) || null
    },
    async listLatestArtifactVersions(sessionId) {
      const { rows } = await query(
        `SELECT DISTINCT ON (artifact_id) * FROM assessment_artifact_versions WHERE session_id = $1 ORDER BY artifact_id, version DESC`,
        [sessionId],
      )
      return rows.map(version)
    },
    async appendArtifactVersion({ sessionId, artifactId, version: v, content, savedBy }) {
      try {
        const { rows } = await query(
          `INSERT INTO assessment_artifact_versions (session_id, artifact_id, version, content_json, saved_by) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [sessionId, artifactId, v, JSON.stringify(content), savedBy],
        )
        return version(rows[0])
      } catch (err) {
        if (err.code === '23505') throw new ApiError('CONFLICT', 'This work material was changed elsewhere.')
        if (err.code === '23514') throw new ApiError('VALIDATION_FAILED', 'Invalid version.')
        throw err
      }
    },
  }
}
