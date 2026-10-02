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
const VERSION_MISMATCH = () => new ApiError('CONFLICT', 'This assessment changed since you opened it. Refresh and try again.')

// P3.8 run timing: validation shared by both adapters.
function validatePolicy(policy) {
  if (!policy || typeof policy.version !== 'string' || !policy.version) throw new ApiError('VALIDATION_FAILED', 'Invalid timing policy.')
  if (!Number.isFinite(policy.durationMs) || policy.durationMs <= 0) throw new ApiError('VALIDATION_FAILED', 'Invalid timing policy.')
  if (policy.graceMs != null && (!Number.isFinite(policy.graceMs) || policy.graceMs < 0)) throw new ApiError('VALIDATION_FAILED', 'Invalid timing policy.')
}
function validateBegin({ idempotencyKey, expectedVersion }) {
  if (typeof idempotencyKey !== 'string' || !idempotencyKey) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key is required.')
  if (expectedVersion != null && !Number.isInteger(expectedVersion)) throw new ApiError('VALIDATION_FAILED', 'Invalid expected version.')
}
const toMs = (value) => (value instanceof Date ? value.getTime() : new Date(value).getTime())

// P4.5 opportunity ledger: validation shared by both adapters.
const OPPORTUNITY_STATES = new Set(['PLANNED', 'PRESENTED', 'ACTION_RECEIVED', 'EVALUATION_PENDING', 'EVALUATED', 'DELIVERY_FAILED', 'NOT_ACCESSIBLE', 'SKIPPED_BY_POLICY', 'EXPIRED', 'REVIEW_REQUIRED'])
function validateOpportunity({ sessionId, opportunityId, capabilityId, state }) {
  if (typeof sessionId !== 'string' || !sessionId) throw new ApiError('VALIDATION_FAILED', 'Invalid session.')
  if (typeof opportunityId !== 'string' || !opportunityId) throw new ApiError('VALIDATION_FAILED', 'Invalid opportunity.')
  if (typeof capabilityId !== 'string' || !capabilityId) throw new ApiError('VALIDATION_FAILED', 'Invalid capability.')
  if (!OPPORTUNITY_STATES.has(state)) throw new ApiError('VALIDATION_FAILED', 'Invalid opportunity state.')
}
function timedFields(policy, startedAtIso) {
  const start = toMs(startedAtIso)
  const answer = start + policy.durationMs
  // No grace → no grace deadline (legacy policy reports null, not a duplicate).
  const graceMs = policy.graceMs || 0
  return {
    timedStartedAt: new Date(start).toISOString(),
    answerDeadlineAt: new Date(answer).toISOString(),
    graceDeadlineAt: graceMs > 0 ? new Date(answer + graceMs).toISOString() : null,
  }
}

export function createSessionIoRepoMemory(db) {
  db.clientEvents ||= new Map() // `${sessionId}\u0000${clientEventId}`
  db.artifactVersions ||= []
  db.candidateActions ||= new Map() // `${sessionId}\u0000${clientEventId}`
  db.assessmentJobs ||= new Map() // taskKey
  db.erasureMarkers ||= new Map() // sessionId
  db.runTiming ||= new Map() // sessionId
  db.opportunities ||= new Map() // `${sessionId}\u0000${opportunityId}`
  db.fencingCounter ||= 0
  const key = (s, e) => `${s}\u0000${e}`
  const now = () => db.clock().toISOString()
  const actionById = (id) => [...db.candidateActions.values()].find((a) => a.actionId === id) || null
  return {
    // --- P4.5 opportunity ledger ------------------------------------------------
    async upsertOpportunity({ sessionId, opportunityId, groupId = null, capabilityId, behaviourIds = [], state = 'PLANNED' }) {
      validateOpportunity({ sessionId, opportunityId, capabilityId, state })
      const k = key(sessionId, opportunityId)
      if (!db.opportunities.has(k)) {
        db.opportunities.set(k, { sessionId, opportunityId, groupId, capabilityId, behaviourIds: [...behaviourIds], state, presentedAt: null, renderHash: null, stimulus: null, actionIds: [], createdAt: now(), updatedAt: now() })
      }
      return clone(db.opportunities.get(k))
    },
    async listOpportunities(sessionId) {
      return [...db.opportunities.values()].filter((o) => o.sessionId === sessionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.opportunityId.localeCompare(b.opportunityId)).map(clone)
    },
    // Transition + attach presentation facts / action ids. Action ids append.
    async setOpportunityState(sessionId, opportunityId, state, { presentedAt = null, renderHash = null, stimulus = null, actionId = null } = {}) {
      validateOpportunity({ sessionId, opportunityId, capabilityId: 'x', state })
      const row = db.opportunities.get(key(sessionId, opportunityId))
      if (!row) throw new ApiError('NOT_FOUND', 'Not found')
      row.state = state
      if (presentedAt) row.presentedAt = new Date(presentedAt).toISOString()
      if (renderHash) row.renderHash = renderHash
      if (stimulus) row.stimulus = clone(stimulus)
      if (actionId && !row.actionIds.includes(actionId)) row.actionIds.push(actionId)
      row.updatedAt = now()
      return clone(row)
    },
    // --- P3.8 run timing ---------------------------------------------------------
    async getRunTiming(sessionId) { return clone(db.runTiming.get(sessionId)) || null },
    // Insert-if-absent. A legacy run passes its engine start so it is "begun"
    // at allocation; a draft run is allocated without a timed start.
    async allocateRunTiming(sessionId, { policy, timedStartedAt = null }) {
      if (typeof sessionId !== 'string' || !sessionId) throw new ApiError('VALIDATION_FAILED', 'Invalid session.')
      validatePolicy(policy)
      if (!db.runTiming.has(sessionId)) {
        const timed = timedStartedAt ? timedFields(policy, timedStartedAt) : { timedStartedAt: null, answerDeadlineAt: null, graceDeadlineAt: null }
        db.runTiming.set(sessionId, {
          sessionId, allocatedAt: now(), ...timed, policyVersion: policy.version,
          policy: { version: policy.version, status: policy.status || null, durationMs: policy.durationMs, graceMs: policy.graceMs || 0, adjustments: clone(policy.adjustments || []) },
          beginIdempotencyKey: null, version: 1, updatedAt: now(),
        })
      }
      return clone(db.runTiming.get(sessionId))
    },
    // One timed start per run: the first begin writes it, every later begin
    // (same or different key, concurrent or not) returns the stored timestamps.
    async beginRun(sessionId, { idempotencyKey, expectedVersion = null, now: at = null }) {
      validateBegin({ idempotencyKey, expectedVersion })
      const row = db.runTiming.get(sessionId)
      if (!row) throw new ApiError('NOT_FOUND', 'Not found')
      if (row.timedStartedAt) return { ...clone(row), replayed: true }
      if (expectedVersion != null && expectedVersion !== row.version) throw VERSION_MISMATCH()
      Object.assign(row, timedFields(row.policy, at || db.clock()), { beginIdempotencyKey: idempotencyKey, version: row.version + 1, updatedAt: now() })
      return { ...clone(row), replayed: false }
    },
    // --- P1.5 durable candidate actions -------------------------------------
    async hasErasureMarker(sessionId) { return db.erasureMarkers.has(sessionId) },
    async markErased(sessionId) {
      if (!db.erasureMarkers.has(sessionId)) db.erasureMarkers.set(sessionId, { sessionId, erasedAt: now() })
      return clone(db.erasureMarkers.get(sessionId))
    },
    async getAction(sessionId, clientEventId) { return clone(db.candidateActions.get(key(sessionId, clientEventId))) || null },
    // Every accepted candidate action of a session in acceptance order (P2.3).
    async listActions(sessionId) {
      return [...db.candidateActions.values()].filter((a) => a.sessionId === sessionId).sort((a, b) => a.sequence - b.sequence).map(clone)
    },
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
    // An explicit retry of a FAILED job (P2.6): back to the queue, same key.
    async retryJob(taskKey) {
      const job = db.assessmentJobs.get(taskKey)
      if (!job) return null
      if (job.state === 'FAILED') { job.state = 'QUEUED'; job.nextAvailableAt = now(); job.updatedAt = now() }
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
const timing = (r) => r && ({
  sessionId: r.session_id, allocatedAt: iso(r.allocated_at), timedStartedAt: iso(r.timed_started_at), answerDeadlineAt: iso(r.answer_deadline_at),
  graceDeadlineAt: iso(r.grace_deadline_at), policyVersion: r.policy_version, policy: r.policy_json, beginIdempotencyKey: r.begin_idempotency_key,
  version: r.version, updatedAt: iso(r.updated_at),
})
const opportunity = (r) => r && ({
  sessionId: r.session_id, opportunityId: r.opportunity_id, groupId: r.group_id, capabilityId: r.capability_id, behaviourIds: r.behaviour_ids || [],
  state: r.state, presentedAt: iso(r.presented_at), renderHash: r.render_hash, stimulus: r.stimulus_json ?? null, actionIds: r.action_ids || [],
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
})

export function createSessionIoRepoPg({ query }) {
  const erased = async (sessionId) => (await query('SELECT 1 FROM assessment_erasure_markers WHERE session_id = $1', [sessionId])).rows.length > 0
  return {
    // --- P4.5 opportunity ledger ------------------------------------------------
    async upsertOpportunity({ sessionId, opportunityId, groupId = null, capabilityId, behaviourIds = [], state = 'PLANNED' }) {
      validateOpportunity({ sessionId, opportunityId, capabilityId, state })
      await query(
        `INSERT INTO assessment_opportunities (session_id, opportunity_id, group_id, capability_id, behaviour_ids, state)
         VALUES ($1, $2, $3, $4, $5::text[], $6) ON CONFLICT (session_id, opportunity_id) DO NOTHING`,
        [sessionId, opportunityId, groupId, capabilityId, behaviourIds, state],
      )
      const { rows } = await query('SELECT * FROM assessment_opportunities WHERE session_id = $1 AND opportunity_id = $2', [sessionId, opportunityId])
      return opportunity(rows[0])
    },
    async listOpportunities(sessionId) {
      const { rows } = await query('SELECT * FROM assessment_opportunities WHERE session_id = $1 ORDER BY created_at ASC, opportunity_id ASC', [sessionId])
      return rows.map(opportunity)
    },
    async setOpportunityState(sessionId, opportunityId, state, { presentedAt = null, renderHash = null, stimulus = null, actionId = null } = {}) {
      validateOpportunity({ sessionId, opportunityId, capabilityId: 'x', state })
      const { rows } = await query(
        `UPDATE assessment_opportunities SET state = $3,
           presented_at = COALESCE($4::timestamptz, presented_at), render_hash = COALESCE($5, render_hash),
           stimulus_json = COALESCE($6::jsonb, stimulus_json),
           action_ids = CASE WHEN $7::text IS NULL OR $7 = ANY(action_ids) THEN action_ids ELSE array_append(action_ids, $7) END,
           updated_at = now()
         WHERE session_id = $1 AND opportunity_id = $2 RETURNING *`,
        [sessionId, opportunityId, state, presentedAt ? new Date(presentedAt).toISOString() : null, renderHash, stimulus ? JSON.stringify(stimulus) : null, actionId],
      )
      if (!rows[0]) throw new ApiError('NOT_FOUND', 'Not found')
      return opportunity(rows[0])
    },
    // --- P3.8 run timing ---------------------------------------------------------
    async getRunTiming(sessionId) {
      const { rows } = await query('SELECT * FROM assessment_run_timing WHERE session_id = $1', [sessionId])
      return timing(rows[0]) || null
    },
    async allocateRunTiming(sessionId, { policy, timedStartedAt = null }) {
      if (typeof sessionId !== 'string' || !sessionId) throw new ApiError('VALIDATION_FAILED', 'Invalid session.')
      validatePolicy(policy)
      const timed = timedStartedAt ? timedFields(policy, timedStartedAt) : { timedStartedAt: null, answerDeadlineAt: null, graceDeadlineAt: null }
      const record = { version: policy.version, status: policy.status || null, durationMs: policy.durationMs, graceMs: policy.graceMs || 0, adjustments: policy.adjustments || [] }
      await query(
        `INSERT INTO assessment_run_timing (session_id, timed_started_at, answer_deadline_at, grace_deadline_at, policy_version, policy_json)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (session_id) DO NOTHING`,
        [sessionId, timed.timedStartedAt, timed.answerDeadlineAt, timed.graceDeadlineAt, policy.version, JSON.stringify(record)],
      )
      return this.getRunTiming(sessionId)
    },
    // The conditional UPDATE lets exactly one concurrent begin write the
    // timed start; everyone else reads the row it wrote.
    async beginRun(sessionId, { idempotencyKey, expectedVersion = null, now: at = null }) {
      validateBegin({ idempotencyKey, expectedVersion })
      const current = await this.getRunTiming(sessionId)
      if (!current) throw new ApiError('NOT_FOUND', 'Not found')
      if (current.timedStartedAt) return { ...current, replayed: true }
      if (expectedVersion != null && expectedVersion !== current.version) throw VERSION_MISMATCH()
      const start = at ? new Date(at).toISOString() : null
      const { rows } = await query(
        `UPDATE assessment_run_timing SET
           timed_started_at = COALESCE($2::timestamptz, now()),
           answer_deadline_at = COALESCE($2::timestamptz, now()) + (((policy_json->>'durationMs')::bigint) * interval '1 millisecond'),
           grace_deadline_at = CASE WHEN COALESCE((policy_json->>'graceMs')::bigint, 0) > 0
             THEN COALESCE($2::timestamptz, now()) + (((policy_json->>'durationMs')::bigint + (policy_json->>'graceMs')::bigint) * interval '1 millisecond')
             ELSE NULL END,
           begin_idempotency_key = $3, version = version + 1, updated_at = now()
         WHERE session_id = $1 AND timed_started_at IS NULL
         RETURNING *`,
        [sessionId, start, idempotencyKey],
      )
      if (rows[0]) return { ...timing(rows[0]), replayed: false }
      const after = await this.getRunTiming(sessionId)
      if (!after?.timedStartedAt) throw new ApiError('UPSTREAM_UNAVAILABLE', 'The assessment could not be started.')
      return { ...after, replayed: true }
    },
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
    async listActions(sessionId) {
      const { rows } = await query('SELECT * FROM assessment_candidate_actions WHERE session_id = $1 ORDER BY sequence ASC', [sessionId])
      return rows.map(action)
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
    async retryJob(taskKey) {
      await query(
        `UPDATE assessment_jobs SET state = 'QUEUED', next_available_at = now(), updated_at = now() WHERE task_key = $1 AND state = 'FAILED'`,
        [taskKey],
      )
      return this.getJob(taskKey)
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
