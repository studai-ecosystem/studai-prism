// Data-access audit trail — Postgres adapter (0029; trigger makes it append-only).
import { iso } from '../campusStore/pgUtil.js'

const ev = (r) => r && ({ id: r.id, actorUserId: r.actor_user_id, organizationId: r.organization_id, subjectUserId: r.subject_user_id, resourceType: r.resource_type, resourceId: r.resource_id, action: r.action, purpose: r.purpose, requestId: r.request_id, createdAt: iso(r.created_at) })

export function createAuditRepoPg({ query }) {
  return {
    async recordDataAccess({ actorUserId, organizationId = null, subjectUserId = null, resourceType, resourceId = null, action, purpose = null, requestId = null }) {
      const { rows } = await query(
        `INSERT INTO data_access_audit_events (actor_user_id, organization_id, subject_user_id, resource_type, resource_id, action, purpose, request_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [actorUserId, organizationId, subjectUserId, resourceType, resourceId, action, purpose, requestId],
      )
      return ev(rows[0])
    },
    async listDataAccess({ organizationId, subjectUserId } = {}) {
      const where = []
      const params = []
      if (organizationId !== undefined) { params.push(organizationId); where.push(`organization_id = $${params.length}`) }
      if (subjectUserId !== undefined) { params.push(subjectUserId); where.push(`subject_user_id = $${params.length}`) }
      const { rows } = await query(`SELECT * FROM data_access_audit_events ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at ASC`, params)
      return rows.map(ev)
    },
  }
}
