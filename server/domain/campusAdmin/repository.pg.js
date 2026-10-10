// Campus administration store (C7.01–C7.08) — Postgres adapter (0026, 0027,
// 0030, 0034). Same interface and semantics as repository.memory.js.
import { ApiError } from '../http/errors.js'
import { iso, withTransaction } from '../campusStore/pgUtil.js'

// node-pg parses DATE as local midnight: read it back with local getters so a
// server east of UTC does not move the day back (toISOString would).
const pad = (n) => String(n).padStart(2, '0')
const date = (v) => (v == null ? null : (v instanceof Date ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : String(v).slice(0, 10)))
const campus = (r) => r && ({ id: r.id, organizationId: r.organization_id, name: r.name, status: r.status, createdAt: iso(r.created_at) })
const department = (r) => r && ({ ...campus(r), campusId: r.campus_id, code: r.code })
const academicProgram = (r) => r && ({ ...campus(r), departmentId: r.department_id, degreeLevel: r.degree_level, durationYears: r.duration_years })
const batch = (r) => r && ({ ...campus(r), programId: r.program_id, startYear: r.start_year, endYear: r.end_year })
const cohort = (r) => r && ({
  id: r.id, organizationId: r.organization_id, campusId: r.campus_id, departmentId: r.department_id, academicProgramId: r.academic_program_id,
  batchId: r.batch_id, name: r.name, semester: r.semester, tags: r.tags || [], ownerUserId: r.owner_user_id, status: r.status,
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), ...(r.member_count != null ? { memberCount: Number(r.member_count) } : {}),
})
const member = (r) => r && ({ cohortId: r.cohort_id, userId: r.user_id, status: r.status, addedBy: r.added_by, addedAt: iso(r.added_at) })
const membership = (r) => r && ({
  id: r.id, organizationId: r.organization_id, userId: r.user_id, role: r.role, status: r.status, departmentId: r.department_id,
  scope: r.scope || {}, invitedBy: r.invited_by, joinedAt: iso(r.joined_at), createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
})
const invite = (r) => r && ({
  id: r.id, organizationId: r.organization_id, email: r.email, role: r.role, cohortId: r.cohort_id, departmentId: r.department_id,
  status: r.status, invitedBy: r.invited_by, expiresAt: iso(r.expires_at), acceptedBy: r.accepted_by, acceptedAt: iso(r.accepted_at), createdAt: iso(r.created_at),
})
const program = (r) => r && ({
  id: r.id, organizationId: r.organization_id, name: r.name, description: r.description, status: r.status, startsOn: date(r.starts_on), endsOn: date(r.ends_on),
  reportingPolicy: r.reporting_policy, sponsorshipScope: r.sponsorship_scope, createdBy: r.created_by, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
})
const assignment = (r) => r && ({
  id: r.id, definitionId: r.definition_id, formPolicy: r.form_policy, formId: r.form_id, sponsorType: r.sponsor_type, organizationId: r.organization_id,
  programId: r.program_id, windowStart: iso(r.window_start), windowEnd: iso(r.window_end), integrityPolicy: r.integrity_policy,
  accommodationsPolicy: r.accommodations_policy, reminderPolicy: r.reminder_policy, createdBy: r.created_by, status: r.status,
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
})
const student = (r) => r && ({
  assignmentId: r.assignment_id, userId: r.user_id, status: r.status, sessionId: r.session_id, acknowledgedAt: iso(r.acknowledged_at),
  startedAt: iso(r.started_at), completedAt: iso(r.completed_at), createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
})
const job = (r) => r && ({
  id: r.id, organizationId: r.organization_id, uploadedBy: r.uploaded_by, fileName: r.file_name, status: r.status, totals: r.totals,
  commitKey: r.commit_key, committedAt: iso(r.committed_at), createdAt: iso(r.created_at),
})
const importRow = (r) => r && ({ jobId: r.job_id, rowNumber: r.row_number, raw: r.raw, normalized: r.normalized, errors: r.errors, action: r.action, outcome: r.outcome })
const onboarding = (r) => r && ({ organizationId: r.organization_id, completedSteps: r.completed_steps || [], data: r.data, updatedBy: r.updated_by, updatedAt: iso(r.updated_at) })
const notification = (r) => r && ({ id: r.id, userId: r.user_id, organizationId: r.organization_id, kind: r.kind, payload: r.payload, readAt: iso(r.read_at), createdAt: iso(r.created_at) })
const auditEvent = (r) => r && ({
  id: r.id, organizationId: r.organization_id, actorUserId: r.actor_user_id, action: r.action, targetType: r.target_type, targetId: r.target_id,
  details: r.details, requestId: r.request_id, createdAt: iso(r.created_at),
})

function mapError(err) {
  if (err.code === '23514') return new ApiError('VALIDATION_FAILED', 'Those details are not valid.')
  if (err.code === '23503') return new ApiError('VALIDATION_FAILED', 'That refers to something that does not exist.')
  if (err.code === '23505') return new ApiError('CONFLICT', 'This already exists.')
  return err
}
const run = async (fn) => { try { return await fn() } catch (err) { throw mapError(err) } }

export function createCampusAdminRepoPg({ query, getPool }) {
  const COHORT_COLUMNS = { name: 'name', semester: 'semester', departmentId: 'department_id', academicProgramId: 'academic_program_id', batchId: 'batch_id', campusId: 'campus_id', tags: 'tags', ownerUserId: 'owner_user_id', status: 'status' }
  const PROGRAM_COLUMNS = { name: 'name', description: 'description', status: 'status', startsOn: 'starts_on', endsOn: 'ends_on', reportingPolicy: 'reporting_policy', sponsorshipScope: 'sponsorship_scope' }
  async function update(table, columns, id, patch, map, jsonKeys = []) {
    const sets = []
    const params = [id]
    for (const [k, col] of Object.entries(columns)) {
      if (patch[k] === undefined) continue
      params.push(jsonKeys.includes(k) ? JSON.stringify(patch[k]) : patch[k])
      sets.push(`${col} = $${params.length}${jsonKeys.includes(k) ? '::jsonb' : ''}`)
    }
    if (!sets.length) {
      const { rows } = await query(`SELECT * FROM ${table} WHERE id = $1`, [id])
      return map(rows[0]) || null
    }
    const { rows } = await run(() => query(`UPDATE ${table} SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`, params))
    return map(rows[0]) || null
  }

  return {
    async listStructure(organizationId) {
      const [c, d, p, b] = await Promise.all([
        query("SELECT * FROM campuses WHERE organization_id = $1 AND status = 'ACTIVE' ORDER BY name", [organizationId]),
        query("SELECT * FROM academic_departments WHERE organization_id = $1 AND status = 'ACTIVE' ORDER BY name", [organizationId]),
        query("SELECT * FROM academic_programs WHERE organization_id = $1 AND status = 'ACTIVE' ORDER BY name", [organizationId]),
        query("SELECT * FROM academic_batches WHERE organization_id = $1 AND status = 'ACTIVE' ORDER BY name", [organizationId]),
      ])
      return { campuses: c.rows.map(campus), departments: d.rows.map(department), academicPrograms: p.rows.map(academicProgram), batches: b.rows.map(batch) }
    },
    async createStructure(kind, i) {
      return run(async () => {
        if (kind === 'campus') return campus((await query("INSERT INTO campuses (organization_id, name, status) VALUES ($1, $2, 'ACTIVE') RETURNING *", [i.organizationId, i.name])).rows[0])
        if (kind === 'department') return department((await query("INSERT INTO academic_departments (organization_id, campus_id, name, code, status) VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING *", [i.organizationId, i.campusId || null, i.name, i.code || null])).rows[0])
        if (kind === 'academicProgram') return academicProgram((await query("INSERT INTO academic_programs (organization_id, department_id, name, degree_level, duration_years, status) VALUES ($1, $2, $3, $4, $5, 'ACTIVE') RETURNING *", [i.organizationId, i.departmentId || null, i.name, i.degreeLevel || null, i.durationYears ?? null])).rows[0])
        if (kind === 'batch') return batch((await query("INSERT INTO academic_batches (organization_id, program_id, name, start_year, end_year, status) VALUES ($1, $2, $3, $4, $5, 'ACTIVE') RETURNING *", [i.organizationId, i.programId || null, i.name, i.startYear ?? null, i.endYear ?? null])).rows[0])
        throw new ApiError('VALIDATION_FAILED', 'Unknown structure type.')
      })
    },

    async createCohort({ organizationId, campusId = null, departmentId = null, academicProgramId = null, batchId = null, name, semester = null, tags = [], ownerUserId = null }) {
      return run(async () => cohort((await query(
        `INSERT INTO cohorts (organization_id, campus_id, department_id, academic_program_id, batch_id, name, semester, tags, owner_user_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE') RETURNING *`,
        [organizationId, campusId, departmentId, academicProgramId, batchId, name, semester, tags, ownerUserId],
      )).rows[0]))
    },
    async listCohorts(organizationId) {
      const { rows } = await query(
        `SELECT c.*, (SELECT count(*) FROM cohort_members m WHERE m.cohort_id = c.id AND m.status = 'ACTIVE') AS member_count
         FROM cohorts c WHERE c.organization_id = $1 ORDER BY c.created_at, c.id`,
        [organizationId],
      )
      return rows.map(cohort)
    },
    async updateCohort(id, patch) {
      return update('cohorts', COHORT_COLUMNS, id, patch, cohort)
    },
    async listCohortMembers(cohortId) {
      const { rows } = await query("SELECT * FROM cohort_members WHERE cohort_id = $1 AND status = 'ACTIVE' ORDER BY added_at", [cohortId])
      return rows.map(member)
    },
    // Leaving a cohort also ends the student's membership of that cohort's
    // interventions, in the same transaction (PROD-READY Phase 2, S8): a
    // former member no longer counts in the intervention's totals.
    async removeCohortMember(cohortId, userId) {
      return withTransaction(getPool, async (client) => {
        const { rows } = await client.query("UPDATE cohort_members SET status = 'REMOVED' WHERE cohort_id = $1 AND user_id = $2 RETURNING *", [cohortId, userId])
        if (rows[0]) {
          await client.query('DELETE FROM intervention_memberships WHERE user_id = $2 AND intervention_id IN (SELECT id FROM interventions WHERE cohort_id = $1)', [cohortId, userId])
        }
        return member(rows[0]) || null
      })
    },
    async listCohortMembershipsForOrg(organizationId) {
      const { rows } = await query(
        "SELECT m.* FROM cohort_members m JOIN cohorts c ON c.id = m.cohort_id WHERE c.organization_id = $1 AND m.status = 'ACTIVE'",
        [organizationId],
      )
      return rows.map(member)
    },

    async listOrgMemberships(organizationId) {
      const { rows } = await query('SELECT * FROM organization_memberships WHERE organization_id = $1 ORDER BY created_at, id', [organizationId])
      return rows.map(membership)
    },
    // Staff (non-student, not removed) memberships only (PROD-READY Phase 6):
    // the team list no longer reads every student membership.
    async listStaffMemberships(organizationId) {
      const { rows } = await query("SELECT * FROM organization_memberships WHERE organization_id = $1 AND role <> 'STUDENT' AND status <> 'REMOVED' ORDER BY created_at, id", [organizationId])
      return rows.map(membership)
    },
    // Serialises team changes of one organization inside a repository
    // transaction (PROD-READY Phase 3: the last-owner check cannot race).
    async lockOrganization(organizationId) {
      await query('SELECT id FROM organizations WHERE id = $1 FOR UPDATE', [organizationId])
    },
    async getMembership(id) {
      const { rows } = await query('SELECT * FROM organization_memberships WHERE id = $1', [id])
      return membership(rows[0]) || null
    },
    // A student removed from the organization leaves its interventions in the
    // same transaction (PROD-READY Phase 2, S8), unless another active
    // student membership in that organization remains.
    async setMembershipStatus(id, status) {
      const { rows } = await run(() => withTransaction(getPool, async (client) => {
        const out = await client.query('UPDATE organization_memberships SET status = $2, updated_at = now() WHERE id = $1 RETURNING *', [id, status])
        const m = out.rows[0]
        if (m && status === 'REMOVED' && m.role === 'STUDENT') {
          await client.query(
            `DELETE FROM intervention_memberships WHERE user_id = $2
               AND intervention_id IN (SELECT id FROM interventions WHERE organization_id = $1)
               AND NOT EXISTS (SELECT 1 FROM organization_memberships x WHERE x.organization_id = $1 AND x.user_id = $2 AND x.role = 'STUDENT' AND x.status <> 'REMOVED')`,
            [m.organization_id, m.user_id],
          )
        }
        return out
      }))
      return membership(rows[0]) || null
    },
    async listOrgInvites(organizationId) {
      const { rows } = await query('SELECT * FROM organization_invites WHERE organization_id = $1 ORDER BY created_at, id', [organizationId])
      return rows.map(invite)
    },

    async createProgram({ organizationId, name, description = null, status, startsOn = null, endsOn = null, reportingPolicy, sponsorshipScope, createdBy }) {
      return run(async () => program((await query(
        `INSERT INTO campus_programs (organization_id, name, description, status, starts_on, ends_on, reporting_policy, sponsorship_scope, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9) RETURNING *`,
        [organizationId, name, description, status, startsOn, endsOn, JSON.stringify(reportingPolicy), JSON.stringify(sponsorshipScope), createdBy],
      )).rows[0]))
    },
    async getProgram(id) {
      const { rows } = await query('SELECT * FROM campus_programs WHERE id = $1', [id])
      return program(rows[0]) || null
    },
    async listPrograms(organizationId) {
      const { rows } = await query('SELECT * FROM campus_programs WHERE organization_id = $1 ORDER BY created_at, id', [organizationId])
      return rows.map(program)
    },
    async updateProgram(id, patch) {
      return update('campus_programs', PROGRAM_COLUMNS, id, patch, program, ['reportingPolicy', 'sponsorshipScope'])
    },
    async setProgramCohorts(programId, cohortIds) {
      const ids = [...new Set(cohortIds)]
      await withTransaction(getPool, async (client) => {
        await client.query('DELETE FROM campus_program_cohorts WHERE program_id = $1', [programId])
        for (const cohortId of ids) await client.query('INSERT INTO campus_program_cohorts (program_id, cohort_id) VALUES ($1, $2)', [programId, cohortId])
      }).catch((err) => { throw mapError(err) })
      return ids
    },
    async listProgramCohorts(programId) {
      const { rows } = await query('SELECT cohort_id FROM campus_program_cohorts WHERE program_id = $1 ORDER BY added_at', [programId])
      return rows.map((r) => r.cohort_id)
    },
    async linkProgramAssignment(programId, assignmentId) {
      await run(() => query('INSERT INTO campus_program_assignments (program_id, assignment_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [programId, assignmentId]))
    },
    async listProgramAssignments(programId) {
      const { rows } = await query('SELECT assignment_id FROM campus_program_assignments WHERE program_id = $1 ORDER BY added_at', [programId])
      return rows.map((r) => r.assignment_id)
    },

    async listOrgAssignments(organizationId) {
      const { rows } = await query("SELECT * FROM assessment_assignments WHERE organization_id = $1 AND sponsor_type = 'INSTITUTION' ORDER BY created_at, id", [organizationId])
      return rows.map(assignment)
    },
    // PROD-READY Phase 5 scans (reminders, seat release): institution
    // assignments in the given statuses whose window ends in (after, before].
    async listInstitutionAssignmentsEndingBetween({ after, before, statuses }) {
      const { rows } = await query(
        `SELECT * FROM assessment_assignments
          WHERE sponsor_type = 'INSTITUTION' AND status = ANY($3::text[]) AND window_end > $1::timestamptz AND window_end <= $2::timestamptz
          ORDER BY window_end, id`,
        [after, before, statuses],
      )
      return rows.map(assignment)
    },
    async listAssignmentStudents(assignmentId) {
      const { rows } = await query('SELECT * FROM assessment_assignment_students WHERE assignment_id = $1 ORDER BY created_at, user_id', [assignmentId])
      return rows.map(student)
    },
    // ── Batched reads for admin lists (PROD-READY Phase 6) ────────────────
    // One query instead of one per assignment (and per student).
    async listOrgRosterRows(organizationId, { userId = null, completedOnly = false } = {}) {
      const { rows } = await query(
        `SELECT a.id AS assignment_id, a.definition_id, a.status AS assignment_status, s.user_id, s.status, s.session_id, s.started_at, s.completed_at
           FROM assessment_assignments a JOIN assessment_assignment_students s ON s.assignment_id = a.id
          WHERE a.organization_id = $1 AND a.sponsor_type = 'INSTITUTION' AND ($2::text IS NULL OR s.user_id = $2)
            AND (NOT $3::boolean OR (s.status = 'COMPLETED' AND s.session_id IS NOT NULL))
          ORDER BY a.created_at, a.id, s.created_at, s.user_id`,
        [organizationId, userId, Boolean(completedOnly)],
      )
      return rows.map((r) => ({
        assignmentId: r.assignment_id, definitionId: r.definition_id, assignmentStatus: r.assignment_status, userId: r.user_id, status: r.status,
        sessionId: r.session_id, startedAt: iso(r.started_at), completedAt: iso(r.completed_at),
      }))
    },
    // Analytics reads (PROD-READY Phase 6): only what the views use.
    async listActiveStudentIds(organizationId) {
      const { rows } = await query("SELECT user_id FROM organization_memberships WHERE organization_id = $1 AND role = 'STUDENT' AND status = 'ACTIVE'", [organizationId])
      return rows.map((r) => r.user_id)
    },
    // Each student's latest COMPLETED sponsored session (ties: the earlier
    // assignment, as the in-process scan keeps the first one it meets).
    async latestCompletedSessions(organizationId, { from = null, to = null } = {}) {
      const { rows } = await query(
        `SELECT DISTINCT ON (s.user_id) s.user_id, s.session_id, s.completed_at
           FROM assessment_assignments a JOIN assessment_assignment_students s ON s.assignment_id = a.id
          WHERE a.organization_id = $1 AND a.sponsor_type = 'INSTITUTION' AND s.status = 'COMPLETED' AND s.session_id IS NOT NULL
            AND ($2::timestamptz IS NULL OR (s.completed_at IS NOT NULL AND s.completed_at >= $2::timestamptz))
            AND ($3::timestamptz IS NULL OR (s.completed_at IS NOT NULL AND s.completed_at <= $3::timestamptz))
          ORDER BY s.user_id, s.completed_at DESC NULLS LAST, a.created_at, a.id, s.created_at`,
        [organizationId, from ? new Date(from).toISOString() : null, to ? new Date(to).toISOString() : null],
      )
      return rows.map((r) => ({ userId: r.user_id, sessionId: r.session_id, completedAt: iso(r.completed_at) }))
    },
    async countRosterStatuses(assignmentIds, userIds) {
      if (!assignmentIds.length || !userIds.length) return {}
      const { rows } = await query(
        'SELECT status, count(*)::int AS n FROM assessment_assignment_students WHERE assignment_id = ANY($1::text[]) AND user_id = ANY($2::text[]) GROUP BY status',
        [assignmentIds, userIds],
      )
      return Object.fromEntries(rows.map((r) => [r.status, r.n]))
    },
    async countAssignmentRoster(assignmentIds) {
      const out = new Map((assignmentIds || []).map((id) => [id, { total: 0 }]))
      if (!out.size) return out
      const { rows } = await query(
        'SELECT assignment_id, status, count(*)::int AS n FROM assessment_assignment_students WHERE assignment_id = ANY($1::text[]) GROUP BY assignment_id, status',
        [[...out.keys()]],
      )
      for (const r of rows) {
        const c = out.get(r.assignment_id)
        c.total += r.n
        c[r.status] = r.n
      }
      return out
    },
    async listAssignmentStudentsPage(assignmentId, { userIds = null, offset = 0, limit = 50 } = {}) {
      const params = [assignmentId, userIds]
      const where = 'assignment_id = $1 AND ($2::text[] IS NULL OR user_id = ANY($2::text[]))'
      const [page, counts] = await Promise.all([
        query(`SELECT * FROM assessment_assignment_students WHERE ${where} ORDER BY created_at, user_id OFFSET $3 LIMIT $4`, [...params, offset, limit]),
        query(`SELECT status, count(*)::int AS n FROM assessment_assignment_students WHERE ${where} GROUP BY status`, params),
      ])
      const byStatus = Object.fromEntries(counts.rows.map((r) => [r.status, r.n]))
      return { rows: page.rows.map(student), total: counts.rows.reduce((t, r) => t + r.n, 0), counts: byStatus }
    },
    async listCohortMembersPage(cohortId, { offset = 0, limit = 50 } = {}) {
      const [page, total] = await Promise.all([
        query("SELECT * FROM cohort_members WHERE cohort_id = $1 AND status = 'ACTIVE' ORDER BY added_at, user_id OFFSET $2 LIMIT $3", [cohortId, offset, limit]),
        query("SELECT count(*)::int AS n FROM cohort_members WHERE cohort_id = $1 AND status = 'ACTIVE'", [cohortId]),
      ])
      return { rows: page.rows.map(member), total: total.rows[0].n }
    },
    async listPendingInvites(organizationId, { now, role = null, notRole = null, cohortId = null } = {}) {
      const { rows } = await query(
        `SELECT * FROM organization_invites
          WHERE organization_id = $1 AND status = 'PENDING' AND expires_at > $2::timestamptz
            AND ($3::text IS NULL OR role = $3) AND ($4::text IS NULL OR role <> $4) AND ($5::uuid IS NULL OR cohort_id = $5)
          ORDER BY created_at, id`,
        [organizationId, new Date(now).toISOString(), role, notRole, cohortId],
      )
      return rows.map(invite)
    },
    // Overview counts (§20) in one statement (PROD-READY Phase 6), with the
    // same scope rules as the in-process path (service.visibleStudents).
    async overviewCounts(organizationId, { scopeMode, scopeCohortIds = [], departmentId = null, now }) {
      const { rows: [r] } = await query(
        `WITH org_cohorts AS (
           SELECT id, department_id, status FROM cohorts WHERE organization_id = $1
         ), scope_cohorts AS (
           SELECT id FROM org_cohorts
            WHERE $2 = 'FULL' OR ($2 = 'ASSIGNED' AND id::text = ANY($3::text[]))
               OR ($2 = 'DEPARTMENT' AND department_id IS NOT NULL AND department_id::text = $4)
         ), students AS (
           SELECT m.user_id, m.status FROM organization_memberships m
            WHERE m.organization_id = $1 AND m.role = 'STUDENT' AND m.status IN ('ACTIVE', 'SUSPENDED')
              AND ($2 = 'FULL' OR EXISTS (
                SELECT 1 FROM cohort_members cm JOIN scope_cohorts sc ON sc.id = cm.cohort_id
                 WHERE cm.user_id = m.user_id AND cm.status = 'ACTIVE'))
         )
         SELECT
           (SELECT count(*) FROM students WHERE status = 'ACTIVE')::int AS enrolled,
           (SELECT count(*) FROM organization_invites i
             WHERE i.organization_id = $1 AND i.role = 'STUDENT' AND i.status = 'PENDING' AND i.expires_at > $5::timestamptz
               AND ($2 = 'FULL' OR i.cohort_id IN (SELECT id FROM scope_cohorts)))::int AS invited,
           (SELECT count(*) FROM org_cohorts c WHERE c.status = 'ACTIVE' AND c.id IN (SELECT id FROM scope_cohorts))::int AS cohorts,
           (SELECT count(*) FROM assessment_assignment_students s JOIN assessment_assignments a ON a.id = s.assignment_id
             WHERE a.organization_id = $1 AND a.sponsor_type = 'INSTITUTION' AND a.status NOT IN ('CANCELLED', 'DRAFT')
               AND s.user_id IN (SELECT user_id FROM students))::int AS assigned,
           (SELECT count(*) FROM assessment_assignment_students s JOIN assessment_assignments a ON a.id = s.assignment_id
             WHERE a.organization_id = $1 AND a.sponsor_type = 'INSTITUTION' AND a.status NOT IN ('CANCELLED', 'DRAFT')
               AND s.status = 'COMPLETED' AND s.user_id IN (SELECT user_id FROM students))::int AS completed`,
        [organizationId, scopeMode, scopeCohortIds.map(String), departmentId == null ? null : String(departmentId), new Date(now).toISOString()],
      )
      return { enrolled: r.enrolled, invited: r.invited, cohorts: r.cohorts, assigned: r.assigned, completed: r.completed }
    },
    // Student directory (§21) filtered, sorted and paged in SQL. Used only
    // when accounts live in this database (v1_users under PRISM_PG_STORE);
    // the service keeps an equivalent in-process path for every other store
    // and a DB test proves both return the same pages.
    // scopeMode: FULL | ASSIGNED (scopeCohortIds) | DEPARTMENT (departmentId) | NONE.
    async queryStudentDirectory(organizationId, { scopeMode, scopeCohortIds = [], departmentId = null, now, q = '', cohortId = null, status = null, assessment = null, offset = 0, limit = null }) {
      const params = [organizationId, scopeMode, scopeCohortIds.map(String), departmentId == null ? null : String(departmentId), new Date(now).toISOString(),
        String(q || '').trim().toLowerCase(), status, cohortId, assessment, offset, limit]
      // The page is chosen from names alone; cohorts and the latest
      // assessment are looked up for the rows of the page only — unless the
      // assessment filter needs them for every row.
      const latest = (alias) => `SELECT s.status, s.assignment_id FROM assessment_assignment_students s JOIN assessment_assignments a ON a.id = s.assignment_id
              WHERE s.user_id = ${alias}.user_id AND a.organization_id = $1 AND a.sponsor_type = 'INSTITUTION' AND a.status NOT IN ('CANCELLED', 'DRAFT')
              ORDER BY a.created_at DESC, a.id DESC LIMIT 1`
      const { rows } = await query(
        `WITH org_cohorts AS (
           SELECT id, name, department_id, created_at FROM cohorts WHERE organization_id = $1
         ), scope_cohorts AS (
           SELECT id FROM org_cohorts
            WHERE ($2 = 'ASSIGNED' AND id::text = ANY($3::text[]))
               OR ($2 = 'DEPARTMENT' AND department_id IS NOT NULL AND department_id::text = $4)
         ), base AS (
           SELECT 'MEMBER' AS kind, m.user_id, NULL::text AS invite_id, NULLIF(u.name, '') AS name, NULLIF(u.email, '') AS email, m.status,
                  m.user_id AS row_key, NULL::uuid AS invite_cohort
             FROM organization_memberships m
             LEFT JOIN v1_users u ON u.id = m.user_id
            WHERE m.organization_id = $1 AND m.role = 'STUDENT' AND m.status IN ('ACTIVE', 'SUSPENDED')
              AND ($2 = 'FULL' OR EXISTS (SELECT 1 FROM cohort_members cm JOIN scope_cohorts sc ON sc.id = cm.cohort_id WHERE cm.user_id = m.user_id AND cm.status = 'ACTIVE'))
              AND ($8::uuid IS NULL OR EXISTS (SELECT 1 FROM cohort_members cm JOIN org_cohorts c ON c.id = cm.cohort_id WHERE cm.user_id = m.user_id AND cm.status = 'ACTIVE' AND cm.cohort_id = $8::uuid))
           UNION ALL
           SELECT 'INVITE', NULL, i.id::text, NULL, i.email, 'INVITED', i.id::text, c.id
             FROM organization_invites i
             LEFT JOIN org_cohorts c ON c.id = i.cohort_id
            WHERE i.organization_id = $1 AND i.role = 'STUDENT' AND i.status = 'PENDING' AND i.expires_at > $5::timestamptz
              AND ($2 = 'FULL' OR i.cohort_id IN (SELECT id FROM scope_cohorts))
              AND ($8::uuid IS NULL OR c.id = $8::uuid)
         ), filtered AS (
           SELECT b.* FROM base b
            WHERE ($6 = '' OR strpos(lower(b.name), $6) > 0 OR strpos(lower(b.email), $6) > 0)
              AND ($7::text IS NULL OR b.status = $7)
              AND ($9::text IS NULL OR (CASE WHEN b.kind = 'MEMBER' THEN COALESCE((SELECT x.status FROM (${latest('b')}) x), 'NONE') ELSE 'NONE' END) = $9)
         ), paged AS (
           SELECT f.*, count(*) OVER () AS total FROM filtered f
            ORDER BY lower(COALESCE(f.name, f.email, 'null')) COLLATE "C", COALESCE(f.name, f.email, 'null') COLLATE "C",
                     CASE f.kind WHEN 'MEMBER' THEN 0 ELSE 1 END, f.row_key COLLATE "C"
            OFFSET $10 LIMIT $11
         )
         SELECT p.*, l.status AS assessment_status, l.assignment_id,
                CASE WHEN p.kind = 'MEMBER' THEN
                  (SELECT COALESCE(json_agg(json_build_object('id', c.id, 'name', c.name) ORDER BY c.created_at, c.id), '[]'::json)
                     FROM cohort_members cm JOIN org_cohorts c ON c.id = cm.cohort_id WHERE cm.user_id = p.user_id AND cm.status = 'ACTIVE')
                ELSE (SELECT COALESCE(json_agg(json_build_object('id', c.id, 'name', c.name)), '[]'::json) FROM org_cohorts c WHERE c.id = p.invite_cohort) END AS cohorts,
                CASE WHEN p.kind = 'MEMBER' THEN
                  (SELECT c.department_id::text FROM cohort_members cm JOIN org_cohorts c ON c.id = cm.cohort_id WHERE cm.user_id = p.user_id AND cm.status = 'ACTIVE' ORDER BY c.created_at, c.id LIMIT 1)
                ELSE (SELECT c.department_id::text FROM org_cohorts c WHERE c.id = p.invite_cohort) END AS department_id
           FROM paged p
           LEFT JOIN LATERAL (${latest('p')}) l ON p.kind = 'MEMBER'
          ORDER BY lower(COALESCE(p.name, p.email, 'null')) COLLATE "C", COALESCE(p.name, p.email, 'null') COLLATE "C",
                   CASE p.kind WHEN 'MEMBER' THEN 0 ELSE 1 END, p.row_key COLLATE "C"`,
        params,
      )
      const items = rows.map((r) => (r.kind === 'MEMBER'
        ? { kind: 'MEMBER', userId: r.user_id, name: r.name, email: r.email, status: r.status, cohorts: r.cohorts, departmentId: r.department_id || null, assessment: { status: r.assessment_status || 'NONE', assignmentId: r.assignment_id || null } }
        : { kind: 'INVITE', inviteId: r.invite_id, userId: null, name: null, email: r.email, status: 'INVITED', cohorts: r.cohorts, departmentId: r.department_id || null, assessment: { status: 'NONE', assignmentId: null } }))
      // A page past the end carries no row with the window count.
      let total = rows.length ? Number(rows[0].total) : 0
      if (!rows.length && offset > 0) total = (await this.queryStudentDirectory(organizationId, { scopeMode, scopeCohortIds, departmentId, now, q, cohortId, status, assessment, offset: 0, limit: 1 })).total
      return { items, total }
    },
    // One student's membership and cohorts in this organization (cohort
    // order), for the student detail scope check (PROD-READY Phase 6).
    async getStudentInOrg(organizationId, userId) {
      const [m, c] = await Promise.all([
        query("SELECT * FROM organization_memberships WHERE organization_id = $1 AND user_id = $2 AND role = 'STUDENT' AND status IN ('ACTIVE', 'SUSPENDED') ORDER BY created_at, id LIMIT 1", [organizationId, userId]),
        query(
          `SELECT c.*, NULL AS member_count FROM cohort_members cm JOIN cohorts c ON c.id = cm.cohort_id
            WHERE c.organization_id = $1 AND cm.user_id = $2 AND cm.status = 'ACTIVE' ORDER BY c.created_at, c.id`,
          [organizationId, userId],
        ),
      ])
      if (!m.rows[0]) return null
      return { membership: membership(m.rows[0]), cohorts: c.rows.map(cohort) }
    },
    async setAssignmentStatus(id, status) {
      const { rows } = await run(() => query('UPDATE assessment_assignments SET status = $2, updated_at = now() WHERE id = $1 RETURNING *', [id, status]))
      return assignment(rows[0]) || null
    },

    async createImportJob({ organizationId, uploadedBy, fileName = null, totals, rows }) {
      return withTransaction(getPool, async (client) => {
        const { rows: [j] } = await client.query(
          "INSERT INTO student_import_jobs (organization_id, uploaded_by, file_name, status, totals) VALUES ($1, $2, $3, 'PREVIEW', $4::jsonb) RETURNING *",
          [organizationId, uploadedBy, fileName, JSON.stringify(totals)],
        )
        for (const r of rows) {
          await client.query(
            'INSERT INTO student_import_rows (job_id, row_number, raw, normalized, errors, action) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6)',
            [j.id, r.rowNumber, JSON.stringify(r.raw), r.normalized == null ? null : JSON.stringify(r.normalized), JSON.stringify(r.errors), r.action],
          )
        }
        return job(j)
      }).catch((err) => { throw mapError(err) })
    },
    async getImportJob(id) {
      const { rows } = await query('SELECT * FROM student_import_jobs WHERE id = $1', [id])
      return job(rows[0]) || null
    },
    async listImportRows(jobId) {
      const { rows } = await query('SELECT * FROM student_import_rows WHERE job_id = $1 ORDER BY row_number', [jobId])
      return rows.map(importRow)
    },
    async listImportRowsPage(jobId, { offset = 0, limit = 2000 } = {}) {
      const [page, total] = await Promise.all([
        query('SELECT * FROM student_import_rows WHERE job_id = $1 ORDER BY row_number OFFSET $2 LIMIT $3', [jobId, offset, limit]),
        query('SELECT count(*)::int AS n FROM student_import_rows WHERE job_id = $1', [jobId]),
      ])
      return { rows: page.rows.map(importRow), total: total.rows[0].n }
    },
    async claimImportCommit(id, commitKey) {
      const { rows } = await query(
        "UPDATE student_import_jobs SET commit_key = $2 WHERE id = $1 AND status = 'PREVIEW' AND commit_key IS NULL RETURNING *",
        [id, commitKey],
      )
      if (rows[0]) return { claimed: true, job: job(rows[0]) }
      const current = await this.getImportJob(id)
      if (!current) return null
      return { claimed: false, job: current, inFlight: current.status === 'PREVIEW' && current.commitKey === commitKey }
    },
    // Frees a claim after a failed commit so the same key can retry.
    async releaseImportClaim(id, commitKey) {
      await query("UPDATE student_import_jobs SET commit_key = NULL WHERE id = $1 AND status = 'PREVIEW' AND commit_key = $2", [id, commitKey])
    },
    async commitImportJob(id, { commitKey, totals, outcomes }) {
      return withTransaction(getPool, async (client) => {
        const { rows: [cur] } = await client.query('SELECT * FROM student_import_jobs WHERE id = $1 FOR UPDATE', [id])
        if (!cur) return null
        if (cur.status === 'COMMITTED') return { job: job(cur), replayed: cur.commit_key === commitKey }
        if (cur.status !== 'PREVIEW') throw new ApiError('CONFLICT', 'This import can no longer be committed.')
        for (const [rowNumber, outcome] of Object.entries(outcomes)) {
          await client.query('UPDATE student_import_rows SET outcome = $3 WHERE job_id = $1 AND row_number = $2', [id, Number(rowNumber), outcome])
        }
        const { rows: [done] } = await client.query(
          "UPDATE student_import_jobs SET status = 'COMMITTED', commit_key = $2, totals = $3::jsonb, committed_at = now() WHERE id = $1 RETURNING *",
          [id, commitKey, JSON.stringify(totals)],
        )
        return { job: job(done), replayed: false }
      })
    },

    async getOnboarding(organizationId) {
      const { rows } = await query('SELECT * FROM org_onboarding_progress WHERE organization_id = $1', [organizationId])
      return onboarding(rows[0]) || null
    },
    async saveOnboarding({ organizationId, completedSteps, data, updatedBy }) {
      const { rows } = await run(() => query(
        `INSERT INTO org_onboarding_progress (organization_id, completed_steps, data, updated_by) VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (organization_id) DO UPDATE SET completed_steps = EXCLUDED.completed_steps, data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING *`,
        [organizationId, [...new Set(completedSteps)], JSON.stringify(data), updatedBy],
      ))
      return onboarding(rows[0])
    },

    async createNotification({ userId, organizationId = null, kind, payload }) {
      const { rows } = await run(() => query(
        'INSERT INTO notifications (user_id, organization_id, kind, payload) VALUES ($1, $2, $3, $4::jsonb) RETURNING *',
        [userId, organizationId, kind, JSON.stringify(payload)],
      ))
      return notification(rows[0])
    },
    async listNotifications(userId, { limit = 50 } = {}) {
      const { rows } = await query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT $2', [userId, limit])
      return rows.map(notification)
    },
    async markNotificationRead(id, userId) {
      const { rows } = await query('UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2 RETURNING *', [id, userId])
      return notification(rows[0]) || null
    },

    async appendOrgAudit({ organizationId, actorUserId, action, targetType, targetId = null, details = {}, requestId = null }) {
      const { rows } = await run(() => query(
        `INSERT INTO organization_audit_events (organization_id, actor_user_id, action, target_type, target_id, details, request_id)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING *`,
        [organizationId, actorUserId, action, targetType, targetId == null ? null : String(targetId), JSON.stringify(details), requestId],
      ))
      return auditEvent(rows[0])
    },
    async listOrgAudit(organizationId, { limit = 50, before = null } = {}) {
      const { rows } = before
        ? await query('SELECT * FROM organization_audit_events WHERE organization_id = $1 AND created_at < $2 ORDER BY created_at DESC, id LIMIT $3', [organizationId, before, limit])
        : await query('SELECT * FROM organization_audit_events WHERE organization_id = $1 ORDER BY created_at DESC, id LIMIT $2', [organizationId, limit])
      return rows.map(auditEvent)
    },
  }
}
