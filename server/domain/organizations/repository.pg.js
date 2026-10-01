// Organizations + academic structure — Postgres adapter (0026).
import { ApiError } from '../http/errors.js'

const org = (r) => r && ({
  id: r.id, name: r.name, slug: r.slug, organizationType: r.organization_type, status: r.status,
  country: r.country, timezone: r.timezone, createdAt: r.created_at?.toISOString?.() ?? r.created_at, updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at,
})
const cohort = (r) => r && ({
  id: r.id, organizationId: r.organization_id, departmentId: r.department_id, name: r.name, semester: r.semester,
  ownerUserId: r.owner_user_id, tags: r.tags || [], status: r.status,
})

export function createOrganizationsRepoPg({ query }) {
  return {
    async createOrganization({ id, name, slug, organizationType, status, country = null, timezone = null }) {
      try {
        const { rows } = await query(
          `INSERT INTO organizations (id, name, slug, organization_type, status, country, timezone)
           VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7) RETURNING *`,
          [id || null, name, slug, organizationType, status, country, timezone],
        )
        return org(rows[0])
      } catch (err) {
        if (err.code === '23505') throw new ApiError('CONFLICT', 'An organization with this slug already exists.')
        throw err
      }
    },
    async getOrganization(id) {
      const { rows } = await query('SELECT * FROM organizations WHERE id = $1', [id])
      return org(rows[0]) || null
    },
    async listOrganizations() {
      const { rows } = await query('SELECT * FROM organizations ORDER BY name ASC LIMIT 1000')
      return rows.map(org)
    },
    async createDepartment({ id, organizationId, name, code = null }) {
      const { rows } = await query(
        `INSERT INTO academic_departments (id, organization_id, name, code, status)
         VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, 'ACTIVE') RETURNING *`,
        [id || null, organizationId, name, code],
      )
      const r = rows[0]
      return { id: r.id, organizationId: r.organization_id, campusId: r.campus_id, name: r.name, code: r.code, status: r.status }
    },
    async getDepartment(id) {
      if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null
      const { rows } = await query('SELECT * FROM academic_departments WHERE id = $1', [id])
      const r = rows[0]
      return r ? { id: r.id, organizationId: r.organization_id, campusId: r.campus_id, name: r.name, code: r.code, status: r.status } : null
    },
    async createCohort({ id, organizationId, departmentId = null, name, semester = null, ownerUserId = null, tags = [] }) {
      const { rows } = await query(
        `INSERT INTO cohorts (id, organization_id, department_id, name, semester, owner_user_id, tags, status)
         VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, 'ACTIVE') RETURNING *`,
        [id || null, organizationId, departmentId, name, semester, ownerUserId, tags],
      )
      return cohort(rows[0])
    },
    async getCohort(id) {
      const { rows } = await query('SELECT * FROM cohorts WHERE id = $1', [id])
      return cohort(rows[0]) || null
    },
    async addCohortMember({ cohortId, userId, addedBy = null }) {
      const { rows } = await query(
        `INSERT INTO cohort_members (cohort_id, user_id, status, added_by) VALUES ($1, $2, 'ACTIVE', $3)
         ON CONFLICT (cohort_id, user_id) DO UPDATE SET status = 'ACTIVE' RETURNING *`,
        [cohortId, userId, addedBy],
      )
      const r = rows[0]
      return { cohortId: r.cohort_id, userId: r.user_id, status: r.status, addedBy: r.added_by, addedAt: r.added_at?.toISOString?.() ?? r.added_at }
    },
    async listCohortsForUser(organizationId, userId) {
      const { rows } = await query(
        `SELECT c.* FROM cohort_members m JOIN cohorts c ON c.id = m.cohort_id
         WHERE m.user_id = $1 AND m.status = 'ACTIVE' AND c.organization_id = $2`,
        [userId, organizationId],
      )
      return rows.map(cohort)
    },
  }
}
