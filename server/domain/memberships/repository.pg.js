// Organization memberships + org invites — Postgres adapter (0027).
import { iso } from '../campusStore/pgUtil.js'

const membership = (r) => r && ({
  id: r.id, organizationId: r.organization_id, userId: r.user_id, role: r.role, status: r.status,
  departmentId: r.department_id, scope: r.scope || {}, invitedBy: r.invited_by, joinedAt: iso(r.joined_at),
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
  organizationName: r.organization_name ?? null, organizationStatus: r.organization_status ?? null,
})
const invite = (r) => r && ({
  id: r.id, organizationId: r.organization_id, email: r.email, role: r.role, cohortId: r.cohort_id,
  departmentId: r.department_id, tokenHash: r.token_hash, status: r.status, invitedBy: r.invited_by,
  expiresAt: iso(r.expires_at), acceptedBy: r.accepted_by, acceptedAt: iso(r.accepted_at), createdAt: iso(r.created_at),
  organizationName: r.organization_name ?? undefined, organizationStatus: r.organization_status ?? undefined,
})

export function createMembershipsRepoPg({ query }) {
  return {
    async upsertMembership({ organizationId, userId, role, status, departmentId = null, scope = {}, invitedBy = null }) {
      const { rows } = await query(
        `INSERT INTO organization_memberships (organization_id, user_id, role, status, department_id, scope, invited_by, joined_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, CASE WHEN $4 = 'ACTIVE' THEN now() END)
         ON CONFLICT (organization_id, user_id, role) DO UPDATE SET
           status = EXCLUDED.status,
           department_id = COALESCE(EXCLUDED.department_id, organization_memberships.department_id),
           scope = CASE WHEN EXCLUDED.scope = '{}'::jsonb THEN organization_memberships.scope ELSE EXCLUDED.scope END,
           joined_at = COALESCE(organization_memberships.joined_at, CASE WHEN EXCLUDED.status = 'ACTIVE' THEN now() END),
           updated_at = now()
         RETURNING *`,
        [organizationId, userId, role, status, departmentId, JSON.stringify(scope || {}), invitedBy],
      )
      const { rows: named } = await query('SELECT name, status FROM organizations WHERE id = $1', [organizationId])
      return membership({ ...rows[0], organization_name: named[0]?.name, organization_status: named[0]?.status })
    },
    async listMembershipsForUser(userId) {
      const { rows } = await query(
        `SELECT m.*, o.name AS organization_name, o.status AS organization_status
         FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
         WHERE m.user_id = $1 ORDER BY m.created_at ASC`,
        [userId],
      )
      return rows.map(membership)
    },
    async createInvite({ organizationId, email, role, cohortId = null, departmentId = null, tokenHash, invitedBy, expiresAt }) {
      const { rows } = await query(
        `INSERT INTO organization_invites (organization_id, email, role, cohort_id, department_id, token_hash, status, invited_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8) RETURNING *`,
        [organizationId, email, role, cohortId, departmentId, tokenHash, invitedBy, expiresAt],
      )
      return invite(rows[0])
    },
    async findInviteByTokenHash(tokenHash) {
      const { rows } = await query(
        `SELECT i.*, o.name AS organization_name, o.status AS organization_status
         FROM organization_invites i JOIN organizations o ON o.id = i.organization_id WHERE i.token_hash = $1`,
        [tokenHash],
      )
      return invite(rows[0]) || null
    },
    async updateInvite(id, { status, acceptedBy = null, acceptedAt = null }) {
      const { rows } = await query(
        'UPDATE organization_invites SET status = $2, accepted_by = $3, accepted_at = $4 WHERE id = $1 RETURNING *',
        [id, status, acceptedBy, acceptedAt],
      )
      return invite(rows[0]) || null
    },
  }
}
