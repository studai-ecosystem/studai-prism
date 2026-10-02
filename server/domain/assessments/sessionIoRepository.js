// Assessment session I/O (0032): idempotent client events + versioned
// artifact writes — memory and Postgres adapters with the same semantics.
import { createHash, randomUUID } from 'node:crypto'
import { ApiError } from '../http/errors.js'
import { iso } from '../campusStore/pgUtil.js'
import { clone } from '../campusStore/memoryDb.js'

const ACTION_KINDS = new Set(['MESSAGE', 'ARTIFACT', 'FINISH'])

// Stable hash of an accepted payload (key order independent) so a replay with
// the same client event id can be told apart from a changed payload.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value === undefined ? null : value)
}
export const payloadHash = (payload) => createHash('sha256').update(canonical(payload ?? null)).digest('hex')

function validateAction({ sessionId, clientEventId, kind }) {
  if (typeof sessionId !== 'string' || !sessionId) throw new ApiError('VALIDATION_FAILED', 'Invalid session.')
  if (typeof clientEventId !== 'string' || !clientEventId) throw new ApiError('VALIDATION_FAILED', 'A client event id is required.')
  if (!ACTION_KINDS.has(kind)) throw new ApiError('VALIDATION_FAILED', 'Invalid action kind.')
}

const STALE = () => new ApiError('CONFLICT', 'This work item is no longer leased by the caller.')
const ERASED = () => new ApiError('NOT_FOUND', 'Not found')

export function createSessionIoRepoMemory(db) {
  db.clientEvents ||= new Map() // `${sessionId}\u0000${clientEventId}`
  db.artifactVersions ||= []
  db.candidateActions ||= new Map() // `${sessionId}\u0000${clientEventId}`
  db.assessmentJobs ||= new Map() // taskKey
  db.erasureMarkers ||= new Map() // sessionId
  db.fencingCounter ||= 0
  const key = (s, e) => `${s}\u0000${e}`
  const now = () => db.clock().toISOString()
  const actionById = (id) => [...db.candidateActions.values()].find((a) => a.actionId === id) || null
  return {
    // --- P1.5 durable candidate actions -------------------------------------
    async hasErasureMarker(sessionId) { return db.erasureMarkers.has(sessionId) },
    async markErased(sessionId) {
      if (!db.erasureMarkers.has(sessionId)) db.erasureMarkers.set(sessionId, { sessionId, erasedAt: now() })
      return clone(db.erasureMarkers.get(sessionId))
    },
    async getAction(sessionId, clientEventId) { return clone(db.candidateActions.get(key(sessionId, clientEventId))) || null },
    async acceptAction({ sessionId, clientEventId, kind, payload }) {
      validateAction({ sessionId, clientEventId, kind })
      if (db.erasureMarkers.has(sessionId)) throw ERASED()
      const hash = payloadHash(payload)
      const k = key(sessionId, clientEventId)
      const existing = db.candidateActions.get(k)
      if (existing) {
        if (existing.payloadHash !== hash || existing.kind !== kind) throw new ApiError('CONFLICT', 'This client event id was already used for a different action.')
        return clone(existing)
      }
      const sequence = [...db.candidateActions.values()].filter((a) => a.sessionId === sessionId).length + 1
      const row = {
        actionId: randomUUID(), sessionId, clientEventId, kind, actorKind: 'CANDIDATE', payloadHash: hash, payload: clone(payload ?? null),
        sequence, acceptedAt: now(), state: 'ACCEPTED', result: null, schemaVersion: 1,
      }
      db.candidateActions.set(k, row)
      return clone(row)
    },
    async applyAction(actionId, result) {
      const row = actionById(actionId)
      if (!row) throw new ApiError('NOT_FOUND', 'Not found')
      if (db.erasureMarkers.has(row.sessionId)) throw ERASED()
      if (row.state === 'ACCEPTED' || row.state === 'FAILED') { row.state = 'APPLIED'; row.result = clone(result ?? null) }
      return clone(row)
    },
    async failAction(actionId, code) {
      const row = actionById(actionId)
      if (!row) throw new ApiError('NOT_FOUND', 'Not found')
      if (row.state === 'ACCEPTED') { row.state = 'FAILED'; row.result = { code: String(code || 'FAILED') } }
      return clone(row)
    },
    // --- P1.6 jobs with lease + fencing token ---------------------------------
    async enqueueJob({ taskKey, sessionId = null, kind, availableAt = null }) {
      if (typeof taskKey !== 'string' || !taskKey || typeof kind !== 'string' || !kind) throw new ApiError('VALIDATION_FAILED', 'Invalid job.')
      if (!db.assessmentJobs.has(taskKey)) {
        const t = now()
        db.assessmentJobs.set(taskKey, {
          jobId: randomUUID(), taskKey, sessionId, kind, state: 'QUEUED', attempts: 0, leaseExpiresAt: null, fencingToken: 0,
          nextAvailableAt: availableAt || t, resultState: null, createdAt: t, updatedAt: t,
        })
      }
      return clone(db.assessmentJobs.get(taskKey))
    },
    async getJob(taskKey) { return clone(db.assessmentJobs.get(taskKey)) || null },
    async claimJob(kind, leaseMs) {
      const t = db.clock()
      const candidates = [...db.assessmentJobs.values()]
        .filter((j) => j.kind === kind && new Date(j.nextAvailableAt) <= t
          && (j.state === 'QUEUED' || (j.state === 'LEASED' && j.leaseExpiresAt && new Date(j.leaseExpiresAt) <= t)))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      const job = candidates[0]
      if (!job) return null
      job.state = 'LEASED'
      job.attempts += 1
      job.fencingToken = ++db.fencingCounter
      job.leaseExpiresAt = new Date(t.getTime() + leaseMs).toISOString()
      job.updatedAt = t.toISOString()
      return clone(job)
    },
    async completeJob(jobId, fencingToken, resultState = 'DONE') {
      const job = [...db.assessmentJobs.values()].find((j) => j.jobId === jobId)
      if (!job || job.state !== 'LEASED' || job.fencingToken !== fencingToken) throw STALE()
      job.state = 'DONE'; job.resultState = resultState; job.leaseExpiresAt = null; job.updatedAt = now()
      return clone(job)
    },
    async failJob(jobId, fencingToken, { retryAfterMs = null, resultState = 'FAILED' } = {}) {
      const job = [...db.assessmentJobs.values()].find((j) => j.jobId === jobId)
      if (!job || job.state !== 'LEASED' || job.fencingToken !== fencingToken) throw STALE()
      job.leaseExpiresAt = null; job.updatedAt = now(); job.resultState = resultState
      if (retryAfterMs != null) { job.state = 'QUEUED'; job.nextAvailableAt = new Date(db.clock().getTime() + retryAfterMs).toISOString() }
      else job.state = 'FAILED'
      return clone(job)
    },
    // --- 0032 client events + artifact versions --------------------------------
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
const action = (r) => r && ({
  actionId: r.action_id, sessionId: r.session_id, clientEventId: r.client_event_id, kind: r.kind, actorKind: r.actor_kind,
  payloadHash: r.payload_hash, payload: r.payload_json, sequence: r.sequence, acceptedAt: iso(r.accepted_at), state: r.state,
  result: r.result_json ?? null, schemaVersion: r.schema_version,
})
const job = (r) => r && ({
  jobId: r.job_id, taskKey: r.task_key, sessionId: r.session_id, kind: r.kind, state: r.state, attempts: r.attempts,
  leaseExpiresAt: iso(r.lease_expires_at), fencingToken: Number(r.fencing_token), nextAvailableAt: iso(r.next_available_at),
  resultState: r.result_state, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
})

export function createSessionIoRepoPg({ query }) {
  const erased = async (sessionId) => (await query('SELECT 1 FROM assessment_erasure_markers WHERE session_id = $1', [sessionId])).rows.length > 0
  return {
    async hasErasureMarker(sessionId) { return erased(sessionId) },
    async markErased(sessionId) {
      await query('INSERT INTO assessment_erasure_markers (session_id) VALUES ($1) ON CONFLICT (session_id) DO NOTHING', [sessionId])
      const { rows } = await query('SELECT * FROM assessment_erasure_markers WHERE session_id = $1', [sessionId])
      return rows[0] ? { sessionId: rows[0].session_id, erasedAt: iso(rows[0].erased_at) } : null
    },
    async getAction(sessionId, clientEventId) {
      const { rows } = await query('SELECT * FROM assessment_candidate_actions WHERE session_id = $1 AND client_event_id = $2', [sessionId, clientEventId])
      return action(rows[0]) || null
    },
    // Insert-if-absent in one statement; the stored row decides replay vs conflict.
    async acceptAction({ sessionId, clientEventId, kind, payload }) {
      validateAction({ sessionId, clientEventId, kind })
      if (await erased(sessionId)) throw ERASED()
      const hash = payloadHash(payload)
      await query(
        `INSERT INTO assessment_candidate_actions (session_id, client_event_id, kind, payload_hash, payload_json, sequence)
         SELECT $1, $2, $3, $4, $5, COALESCE((SELECT MAX(sequence) FROM assessment_candidate_actions WHERE session_id = $1), 0) + 1
         ON CONFLICT (session_id, client_event_id) DO NOTHING`,
        [sessionId, clientEventId, kind, hash, JSON.stringify(payload ?? null)],
      )
      const row = await this.getAction(sessionId, clientEventId)
      if (!row) throw new ApiError('UPSTREAM_UNAVAILABLE', 'Your action was not accepted.')
      if (row.payloadHash !== hash || row.kind !== kind) throw new ApiError('CONFLICT', 'This client event id was already used for a different action.')
      return row
    },
    async applyAction(actionId, result) {
      const { rows } = await query(
        `UPDATE assessment_candidate_actions a SET state = 'APPLIED', result_json = $2
         WHERE a.action_id = $1 AND a.state IN ('ACCEPTED', 'FAILED')
           AND NOT EXISTS (SELECT 1 FROM assessment_erasure_markers e WHERE e.session_id = a.session_id)
         RETURNING *`,
        [actionId, JSON.stringify(result ?? null)],
      )
      if (rows[0]) return action(rows[0])
      const { rows: cur } = await query('SELECT * FROM assessment_candidate_actions WHERE action_id = $1', [actionId])
      if (!cur[0]) throw new ApiError('NOT_FOUND', 'Not found')
      if (await erased(cur[0].session_id)) throw ERASED()
      return action(cur[0])
    },
    async failAction(actionId, code) {
      const { rows } = await query(
        `UPDATE assessment_candidate_actions SET state = 'FAILED', result_json = $2 WHERE action_id = $1 AND state = 'ACCEPTED' RETURNING *`,
        [actionId, JSON.stringify({ code: String(code || 'FAILED') })],
      )
      if (rows[0]) return action(rows[0])
      const { rows: cur } = await query('SELECT * FROM assessment_candidate_actions WHERE action_id = $1', [actionId])
      if (!cur[0]) throw new ApiError('NOT_FOUND', 'Not found')
      return action(cur[0])
    },
    async enqueueJob({ taskKey, sessionId = null, kind, availableAt = null }) {
      if (typeof taskKey !== 'string' || !taskKey || typeof kind !== 'string' || !kind) throw new ApiError('VALIDATION_FAILED', 'Invalid job.')
      await query(
        `INSERT INTO assessment_jobs (task_key, session_id, kind, next_available_at) VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()))
         ON CONFLICT (task_key) DO NOTHING`,
        [taskKey, sessionId, kind, availableAt],
      )
      return this.getJob(taskKey)
    },
    async getJob(taskKey) {
      const { rows } = await query('SELECT * FROM assessment_jobs WHERE task_key = $1', [taskKey])
      return job(rows[0]) || null
    },
    // One row at a time, skipping rows other workers hold; the fencing token
    // is a monotonic per-row counter so a stale holder can never complete.
    async claimJob(kind, leaseMs) {
      const { rows } = await query(
        `UPDATE assessment_jobs j SET state = 'LEASED', attempts = j.attempts + 1, fencing_token = j.fencing_token + 1,
           lease_expires_at = now() + ($2::int * interval '1 millisecond'), updated_at = now()
         WHERE j.job_id = (
           SELECT job_id FROM assessment_jobs WHERE kind = $1 AND next_available_at <= now()
             AND (state = 'QUEUED' OR (state = 'LEASED' AND lease_expires_at <= now()))
           ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
         RETURNING *`,
        [kind, leaseMs],
      )
      return job(rows[0]) || null
    },
    async completeJob(jobId, fencingToken, resultState = 'DONE') {
      const { rows } = await query(
        `UPDATE assessment_jobs SET state = 'DONE', result_state = $3, lease_expires_at = NULL, updated_at = now()
         WHERE job_id = $1 AND state = 'LEASED' AND fencing_token = $2 RETURNING *`,
        [jobId, fencingToken, resultState],
      )
      if (!rows[0]) throw STALE()
      return job(rows[0])
    },
    async failJob(jobId, fencingToken, { retryAfterMs = null, resultState = 'FAILED' } = {}) {
      const retry = retryAfterMs != null
      const { rows } = await query(
        `UPDATE assessment_jobs SET state = $4, result_state = $3, lease_expires_at = NULL, updated_at = now(),
           next_available_at = CASE WHEN $5::int IS NULL THEN next_available_at ELSE now() + ($5::int * interval '1 millisecond') END
         WHERE job_id = $1 AND state = 'LEASED' AND fencing_token = $2 RETURNING *`,
        [jobId, fencingToken, resultState, retry ? 'QUEUED' : 'FAILED', retry ? retryAfterMs : null],
      )
      if (!rows[0]) throw STALE()
      return job(rows[0])
    },
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
