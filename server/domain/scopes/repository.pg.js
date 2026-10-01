// Assessment session sponsorship scope — Postgres adapter (0029). Rows are immutable.
import { ApiError } from '../http/errors.js'
import { iso } from '../campusStore/pgUtil.js'

const scope = (r) => r && ({
  sessionId: r.session_id, ownerUserId: r.owner_user_id, sponsorType: r.sponsor_type, sponsorOrganizationId: r.sponsor_organization_id,
  workspaceId: r.workspace_id, programId: r.program_id, cohortId: r.cohort_id, visibilityPolicy: r.visibility_policy,
  createdBy: r.created_by, createdAt: iso(r.created_at),
})

export function createScopesRepoPg({ query }) {
  return {
    async createSessionScope(s) {
      try {
        const { rows } = await query(
          `INSERT INTO assessment_session_scopes (session_id, owner_user_id, sponsor_type, sponsor_organization_id, workspace_id, program_id, cohort_id, visibility_policy, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [s.sessionId, s.ownerUserId, s.sponsorType, s.sponsorOrganizationId ?? null, s.workspaceId, s.programId ?? null, s.cohortId ?? null, s.visibilityPolicy, s.createdBy],
        )
        return scope(rows[0])
      } catch (err) {
        if (err.code === '23505') throw new ApiError('CONFLICT', 'This session already has a scope.')
        if (err.code === '23514') throw new ApiError('VALIDATION_FAILED', 'Personal sessions are owner-only.')
        throw err
      }
    },
    async getSessionScope(sessionId) {
      const { rows } = await query('SELECT * FROM assessment_session_scopes WHERE session_id = $1', [String(sessionId)])
      return scope(rows[0]) || null
    },
  }
}
