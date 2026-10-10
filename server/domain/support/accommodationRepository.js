// Pre-start accommodation requests for V3 assignments (PROD-READY Phase 4,
// migration 0058, ACCOMMODATIONS_POLICY_v1). One request per (assignment,
// learner); the needs text can be changed only while the request is still
// REQUESTED and the assessment has not started. A request is linked to its
// session when the assessment starts: an undecided request then LAPSES (the
// session runs the standard administration) and a decided one is frozen.
// Memory and PostgreSQL adapters, same semantics.
import { ApiError } from '../http/errors.js'
import { clone } from '../campusStore/memoryDb.js'
import { iso } from '../campusStore/pgUtil.js'

export const ACCOMMODATION_STATUSES = Object.freeze(['REQUESTED', 'APPROVED', 'DENIED', 'LAPSED'])
export const ACCOMMODATION_MODES = Object.freeze(['textOnly', 'noCamera', 'reducedProctoring'])
export const NEEDS_MIN = 10
export const NEEDS_MAX = 2000

export function cleanModes(modes) {
  return Object.fromEntries(ACCOMMODATION_MODES.map((k) => [k, Boolean(modes?.[k])]))
}

export function createAccommodationRequestsRepoMemory(db) {
  db.accommodationRequests ||= new Map()
  const find = (assignmentId, userId) => [...db.accommodationRequests.values()].find((r) => r.assignmentId === assignmentId && r.userId === userId) || null
  const now = () => db.clock().toISOString()
  return {
    async getForAssignment(assignmentId, userId) {
      return clone(find(assignmentId, userId))
    },
    async get(id) {
      return clone(db.accommodationRequests.get(id) || null)
    },
    async upsertRequest({ assignmentId, userId, organizationId = null, needs }) {
      const existing = find(assignmentId, userId)
      if (existing) {
        if (existing.status !== 'REQUESTED' || existing.sessionId) return { row: clone(existing), created: false, updated: false }
        existing.needs = needs
        existing.updatedAt = now()
        return { row: clone(existing), created: false, updated: true }
      }
      const at = now()
      const row = {
        id: db.id(), assignmentId, userId, organizationId, sessionId: null, needs, status: 'REQUESTED', modes: null, material: false,
        decisionNote: null, decidedBy: null, createdAt: at, updatedAt: at, decidedAt: null, linkedAt: null,
      }
      db.accommodationRequests.set(row.id, row)
      return { row: clone(row), created: true, updated: false }
    },
    async listForUser(userId) {
      return [...db.accommodationRequests.values()].filter((r) => r.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone)
    },
    async listByStatus({ status = null, limit = 50, offset = 0 } = {}) {
      const all = [...db.accommodationRequests.values()].filter((r) => !status || r.status === status).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      return { rows: all.slice(offset, offset + limit).map(clone), total: all.length }
    },
    // Decides a REQUESTED request that is not yet linked to a started session.
    async decide(id, { approved, modes, material, note, decidedBy }) {
      const r = db.accommodationRequests.get(id)
      if (!r || r.status !== 'REQUESTED' || r.sessionId) return null
      const at = now()
      Object.assign(r, {
        status: approved ? 'APPROVED' : 'DENIED', modes: approved ? cleanModes(modes) : null, material: approved ? Boolean(material) : false,
        decisionNote: note, decidedBy, decidedAt: at, updatedAt: at,
      })
      return clone(r)
    },
    // Links the request to the session at start (idempotent for the same session).
    async linkSession({ assignmentId, userId, sessionId }) {
      const r = find(assignmentId, userId)
      if (!r) return null
      if (r.sessionId) return r.sessionId === sessionId ? clone(r) : null
      const at = now()
      r.sessionId = sessionId
      r.linkedAt = at
      r.updatedAt = at
      if (r.status === 'REQUESTED') r.status = 'LAPSED'
      return clone(r)
    },
  }
}

const rowOf = (r) => r && ({
  id: r.id, assignmentId: r.assignment_id, userId: r.user_id, organizationId: r.organization_id ?? null, sessionId: r.session_id ?? null,
  needs: r.needs, status: r.status, modes: r.modes ?? null, material: Boolean(r.material), decisionNote: r.decision_note ?? null,
  decidedBy: r.decided_by ?? null, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), decidedAt: iso(r.decided_at), linkedAt: iso(r.linked_at),
})

export function createAccommodationRequestsRepoPg({ query }) {
  return {
    async getForAssignment(assignmentId, userId) {
      const { rows } = await query('SELECT * FROM assessment_accommodation_requests WHERE assignment_id = $1 AND user_id = $2', [assignmentId, userId])
      return rowOf(rows[0]) || null
    },
    async get(id) {
      const { rows } = await query('SELECT * FROM assessment_accommodation_requests WHERE id = $1', [id])
      return rowOf(rows[0]) || null
    },
    async upsertRequest({ assignmentId, userId, organizationId = null, needs }) {
      try {
        const { rows } = await query(
          `INSERT INTO assessment_accommodation_requests (assignment_id, user_id, organization_id, needs)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (assignment_id, user_id) DO UPDATE SET needs = EXCLUDED.needs, updated_at = now()
             WHERE assessment_accommodation_requests.status = 'REQUESTED' AND assessment_accommodation_requests.session_id IS NULL
           RETURNING *, (xmax = 0) AS inserted`,
          [assignmentId, userId, organizationId, needs],
        )
        if (rows[0]) return { row: rowOf(rows[0]), created: Boolean(rows[0].inserted), updated: !rows[0].inserted }
      } catch (err) {
        if (err.code === '23514') throw new ApiError('VALIDATION_FAILED', `Describe what you need in ${NEEDS_MIN} to ${NEEDS_MAX} characters.`)
        if (err.code === '23503') throw new ApiError('NOT_FOUND', 'Not found')
        throw err
      }
      return { row: await this.getForAssignment(assignmentId, userId), created: false, updated: false }
    },
    async listForUser(userId) {
      const { rows } = await query('SELECT * FROM assessment_accommodation_requests WHERE user_id = $1 ORDER BY created_at DESC', [userId])
      return rows.map(rowOf)
    },
    async listByStatus({ status = null, limit = 50, offset = 0 } = {}) {
      const params = status ? [status] : []
      const where = status ? 'WHERE status = $1' : ''
      const total = await query(`SELECT count(*)::int AS n FROM assessment_accommodation_requests ${where}`, params)
      const { rows } = await query(
        `SELECT * FROM assessment_accommodation_requests ${where} ORDER BY created_at ASC LIMIT ${Number(limit) | 0} OFFSET ${Number(offset) | 0}`, params,
      )
      return { rows: rows.map(rowOf), total: total.rows[0].n }
    },
    async decide(id, { approved, modes, material, note, decidedBy }) {
      const { rows } = await query(
        `UPDATE assessment_accommodation_requests
            SET status = $2, modes = $3, material = $4, decision_note = $5, decided_by = $6, decided_at = now(), updated_at = now()
          WHERE id = $1 AND status = 'REQUESTED' AND session_id IS NULL
          RETURNING *`,
        [id, approved ? 'APPROVED' : 'DENIED', approved ? JSON.stringify(cleanModes(modes)) : null, approved ? Boolean(material) : false, note, decidedBy],
      )
      return rowOf(rows[0]) || null
    },
    async linkSession({ assignmentId, userId, sessionId }) {
      const { rows } = await query(
        `UPDATE assessment_accommodation_requests
            SET session_id = $3, linked_at = now(), updated_at = now(),
                status = CASE WHEN status = 'REQUESTED' THEN 'LAPSED' ELSE status END
          WHERE assignment_id = $1 AND user_id = $2 AND session_id IS NULL
          RETURNING *`,
        [assignmentId, userId, sessionId],
      )
      if (rows[0]) return rowOf(rows[0])
      const existing = await this.getForAssignment(assignmentId, userId)
      return existing && existing.sessionId === sessionId ? existing : null
    },
  }
}
