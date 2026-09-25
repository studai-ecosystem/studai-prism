// Assessment catalog + assignments — Postgres adapter (0022 + 0030).
import { ApiError } from '../http/errors.js'
import { iso, withTransaction } from '../campusStore/pgUtil.js'

const definition = (r) => r && ({
  id: r.assessment_definition_id, title: r.title, jobFamily: r.job_family, status: r.status, durationMinutes: r.duration,
  description: r.description, measures: r.measures, notMeasured: r.not_measured, integrityModes: r.integrity_modes,
})
const form = (r) => r && ({
  id: r.id, definitionId: r.definition_id, version: r.version, scenarioId: r.scenario_id, jobFamilyId: r.job_family_id,
  capabilityIds: r.capability_ids, status: r.status, frozenAt: iso(r.frozen_at),
})
const assignment = (r) => r && ({
  id: r.id, definitionId: r.definition_id, formPolicy: r.form_policy, formId: r.form_id, sponsorType: r.sponsor_type,
  organizationId: r.organization_id, programId: r.program_id, personalKey: r.personal_key,
  windowStart: iso(r.window_start), windowEnd: iso(r.window_end), integrityPolicy: r.integrity_policy,
  accommodationsPolicy: r.accommodations_policy, reminderPolicy: r.reminder_policy, createdBy: r.created_by,
  status: r.status, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
})
const student = (r) => r && ({
  assignmentId: r.assignment_id, userId: r.user_id, status: r.status, sessionId: r.session_id, consentRecordId: r.consent_record_id,
  acknowledgedAt: iso(r.acknowledged_at), startedAt: iso(r.started_at), completedAt: iso(r.completed_at),
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
})
// Joined rows carry the student columns under s_* aliases.
const joined = (r) => r && ({
  ...assignment(r),
  student: student({
    assignment_id: r.id, user_id: r.s_user_id, status: r.s_status, session_id: r.s_session_id, consent_record_id: r.s_consent_record_id,
    acknowledged_at: r.s_acknowledged_at, started_at: r.s_started_at, completed_at: r.s_completed_at, created_at: r.s_created_at, updated_at: r.s_updated_at,
  }),
})
const JOIN_COLUMNS = `a.*, s.user_id AS s_user_id, s.status AS s_status, s.session_id AS s_session_id, s.consent_record_id AS s_consent_record_id,
  s.acknowledged_at AS s_acknowledged_at, s.started_at AS s_started_at, s.completed_at AS s_completed_at, s.created_at AS s_created_at, s.updated_at AS s_updated_at`

function mapError(err) {
  if (err.code === '23505') return new ApiError('CONFLICT', 'This assignment already exists.')
  if (err.code === '23514') return new ApiError('VALIDATION_FAILED', 'The assignment is not valid.')
  if (err.code === '23503') return new ApiError('VALIDATION_FAILED', 'The assignment references an unknown definition, form or organization.')
  return err
}

const STUDENT_COLUMNS = {
  status: 'status', sessionId: 'session_id', consentRecordId: 'consent_record_id',
  acknowledgedAt: 'acknowledged_at', startedAt: 'started_at', completedAt: 'completed_at',
}

export function createAssessmentsRepoPg({ query, getPool }) {
  async function insertAssignment(client, a, { ifAbsent = false } = {}) {
    const { rows } = await client.query(
      `INSERT INTO assessment_assignments (id, definition_id, form_policy, form_id, sponsor_type, organization_id, program_id, personal_key,
         window_start, window_end, integrity_policy, accommodations_policy, reminder_policy, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ${ifAbsent ? 'ON CONFLICT DO NOTHING' : ''} RETURNING *`,
      [a.id, a.definitionId, a.formPolicy, a.formId ?? null, a.sponsorType, a.organizationId ?? null, a.programId ?? null, a.personalKey ?? null,
        a.windowStart ?? null, a.windowEnd ?? null, a.integrityPolicy, JSON.stringify(a.accommodationsPolicy), JSON.stringify(a.reminderPolicy), a.createdBy, a.status],
    )
    return rows[0] || null
  }

  return {
    async seedCatalog({ definitions = [], forms = [] }) {
      return withTransaction(getPool, async (client) => {
        for (const d of definitions) {
          // Legacy catalog columns are only written on first insert; the
          // campus columns always mirror the frozen-bank derivation.
          await client.query(
            `INSERT INTO assessment_definitions (assessment_definition_id, job_family, title, status, duration, description, measures, not_measured, integrity_modes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (assessment_definition_id) DO UPDATE SET description = EXCLUDED.description, measures = EXCLUDED.measures,
               not_measured = EXCLUDED.not_measured, integrity_modes = EXCLUDED.integrity_modes, updated_at = now()`,
            [d.id, d.jobFamily, d.title, d.status, d.durationMinutes, d.description, JSON.stringify(d.measures), JSON.stringify(d.notMeasured), d.integrityModes],
          )
        }
        for (const f of forms) {
          await client.query(
            `INSERT INTO assessment_forms (id, definition_id, version, scenario_id, job_family_id, capability_ids, status, frozen_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
            [f.id, f.definitionId, f.version, f.scenarioId, f.jobFamilyId, f.capabilityIds, f.status, f.frozenAt],
          )
        }
        return { definitions: definitions.length, forms: forms.length }
      }).catch((err) => { throw mapError(err) })
    },
    async listDefinitions() {
      const { rows } = await query('SELECT * FROM assessment_definitions ORDER BY assessment_definition_id')
      return rows.map(definition)
    },
    async listForms(definitionId) {
      const { rows } = await query('SELECT * FROM assessment_forms WHERE definition_id = $1 ORDER BY id', [definitionId])
      return rows.map(form)
    },

    async createAssignment(a) {
      try {
        return await withTransaction(getPool, async (client) => {
          const row = await insertAssignment(client, a)
          for (const t of a.targets || []) {
            await client.query('INSERT INTO assessment_assignment_targets (assignment_id, target_type, target_id) VALUES ($1, $2, $3)', [row.id, t.targetType, String(t.targetId)])
          }
          return assignment(row)
        })
      } catch (err) {
        throw mapError(err)
      }
    },
    async ensurePersonalAssignment(a) {
      try {
        const inserted = await insertAssignment({ query }, a, { ifAbsent: true })
        if (inserted) return assignment(inserted)
        const { rows } = await query('SELECT * FROM assessment_assignments WHERE id = $1 OR personal_key = $2 LIMIT 1', [a.id, a.personalKey])
        return assignment(rows[0])
      } catch (err) {
        throw mapError(err)
      }
    },
    async getAssignment(id) {
      const { rows } = await query('SELECT * FROM assessment_assignments WHERE id = $1', [String(id)])
      return assignment(rows[0]) || null
    },
    async listTargets(assignmentId) {
      const { rows } = await query('SELECT * FROM assessment_assignment_targets WHERE assignment_id = $1 ORDER BY target_type, target_id', [assignmentId])
      return rows.map((r) => ({ assignmentId: r.assignment_id, targetType: r.target_type, targetId: r.target_id }))
    },

    async addStudent({ assignmentId, userId, status }) {
      try {
        await query(
          `INSERT INTO assessment_assignment_students (assignment_id, user_id, status) VALUES ($1, $2, $3)
           ON CONFLICT (assignment_id, user_id) DO NOTHING`,
          [assignmentId, userId, status],
        )
      } catch (err) {
        if (err.code === '23503') throw new ApiError('NOT_FOUND', 'Not found')
        throw mapError(err)
      }
      const { rows } = await query('SELECT * FROM assessment_assignment_students WHERE assignment_id = $1 AND user_id = $2', [assignmentId, userId])
      return student(rows[0])
    },
    async updateStudent({ assignmentId, userId, patch }) {
      const sets = []
      const values = [assignmentId, userId]
      for (const [key, column] of Object.entries(STUDENT_COLUMNS)) {
        if (patch[key] === undefined) continue
        values.push(patch[key])
        sets.push(`${column} = $${values.length}`)
      }
      if (!sets.length) {
        const { rows } = await query('SELECT * FROM assessment_assignment_students WHERE assignment_id = $1 AND user_id = $2', values)
        return student(rows[0]) || null
      }
      try {
        const { rows } = await query(
          `UPDATE assessment_assignment_students SET ${sets.join(', ')}, updated_at = now() WHERE assignment_id = $1 AND user_id = $2 RETURNING *`,
          values,
        )
        return student(rows[0]) || null
      } catch (err) {
        if (err.code === '23514') throw new ApiError('VALIDATION_FAILED', 'A started assignment needs a session.')
        throw mapError(err)
      }
    },
    async getAssignmentForUser(assignmentId, userId) {
      const { rows } = await query(
        `SELECT ${JOIN_COLUMNS} FROM assessment_assignments a JOIN assessment_assignment_students s ON s.assignment_id = a.id
         WHERE a.id = $1 AND s.user_id = $2`,
        [String(assignmentId), userId],
      )
      return joined(rows[0]) || null
    },
    async listAssignmentsForUser({ userId, organizationId = null }) {
      const { rows } = organizationId
        ? await query(
          `SELECT ${JOIN_COLUMNS} FROM assessment_assignments a JOIN assessment_assignment_students s ON s.assignment_id = a.id
           WHERE s.user_id = $1 AND a.sponsor_type = 'INSTITUTION' AND a.organization_id = $2 ORDER BY a.created_at, a.id`,
          [userId, organizationId],
        )
        : await query(
          `SELECT ${JOIN_COLUMNS} FROM assessment_assignments a JOIN assessment_assignment_students s ON s.assignment_id = a.id
           WHERE s.user_id = $1 AND a.sponsor_type = 'PERSONAL' ORDER BY a.created_at, a.id`,
          [userId],
        )
      return rows.map(joined)
    },
  }
}
