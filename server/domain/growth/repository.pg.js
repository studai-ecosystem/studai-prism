// Reassessment + growth store (C9.01) — Postgres adapter (0036). Same
// interface and semantics as repository.memory.js.
import { ApiError } from '../http/errors.js'
import { iso, withTransaction } from '../campusStore/pgUtil.js'

const pair = (r) => r && ({
  formAId: r.form_a_id, formBId: r.form_b_id, status: r.status, evidenceRef: r.evidence_ref, decidedBy: r.decided_by,
  decidedAt: iso(r.decided_at), createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
})
const decision = (r) => r && ({
  id: r.id, formAId: r.form_a_id, formBId: r.form_b_id, status: r.status, evidenceRef: r.evidence_ref, reason: r.reason,
  decidedBy: r.decided_by, approvalId: r.approval_id, decidedAt: iso(r.decided_at),
})
const cycle = (r) => r && ({
  id: r.id, organizationId: r.organization_id, name: r.name, programId: r.program_id, interventionId: r.intervention_id,
  baselineAssignmentId: r.baseline_assignment_id, reassessmentAssignmentId: r.reassessment_assignment_id,
  windowStart: iso(r.window_start), windowEnd: iso(r.window_end), status: r.status, createdBy: r.created_by,
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
})
const snapshot = (r) => r && ({
  id: r.id, userId: r.user_id, organizationId: r.organization_id, capabilityId: r.capability_id,
  baselineSessionId: r.baseline_session_id, reassessmentSessionId: r.reassessment_session_id, formAId: r.form_a_id, formBId: r.form_b_id,
  fromBand: r.from_band, toBand: r.to_band, direction: r.direction, uncertainty: r.uncertainty, rulesVersion: r.rules_version, createdAt: iso(r.created_at),
})

function mapError(err) {
  if (err.code === '23514') return new ApiError('VALIDATION_FAILED', 'Those details are not valid.')
  if (err.code === '23503') return new ApiError('VALIDATION_FAILED', 'That refers to something that does not exist.')
  if (err.code === '23505') return new ApiError('CONFLICT', 'This already exists.')
  return err
}
const run = async (fn) => { try { return await fn() } catch (err) { throw mapError(err) } }

export function createGrowthRepoPg({ query, getPool }) {
  return {
    async seedPendingPairs(pairs) {
      return run(async () => {
        let created = 0
        for (const { formAId, formBId } of pairs) {
          const { rowCount } = await query(
            "INSERT INTO assessment_form_equivalence (form_a_id, form_b_id, status) VALUES ($1, $2, 'PENDING') ON CONFLICT (form_a_id, form_b_id) DO NOTHING",
            [formAId, formBId],
          )
          created += rowCount
        }
        return created
      })
    },
    async listEquivalence() {
      const { rows } = await query('SELECT * FROM assessment_form_equivalence ORDER BY form_a_id, form_b_id')
      return rows.map(pair)
    },
    async getEquivalence(formAId, formBId) {
      const { rows: [r] } = await query('SELECT * FROM assessment_form_equivalence WHERE form_a_id = $1 AND form_b_id = $2', [formAId, formBId])
      return pair(r) || null
    },
    async recordDecision({ formAId, formBId, status, evidenceRef, reason, decidedBy, approvalId = null }) {
      return run(() => withTransaction(getPool, async (c) => {
        const { rows: [current] } = await c.query('SELECT * FROM assessment_form_equivalence WHERE form_a_id = $1 AND form_b_id = $2 FOR UPDATE', [formAId, formBId])
        if (!current) throw new ApiError('NOT_FOUND', 'Not found')
        const { rows: [d] } = await c.query(
          'INSERT INTO assessment_form_equivalence_decisions (form_a_id, form_b_id, status, evidence_ref, reason, decided_by, approval_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING decided_at',
          [formAId, formBId, status, evidenceRef, reason, decidedBy, approvalId],
        )
        const { rows: [row] } = await c.query(
          'UPDATE assessment_form_equivalence SET status = $3, evidence_ref = $4, decided_by = $5, decided_at = $6, updated_at = now() WHERE form_a_id = $1 AND form_b_id = $2 RETURNING *',
          [formAId, formBId, status, evidenceRef, decidedBy, d.decided_at],
        )
        return pair(row)
      }))
    },
    async listDecisions(formAId, formBId) {
      const { rows } = await query('SELECT * FROM assessment_form_equivalence_decisions WHERE form_a_id = $1 AND form_b_id = $2 ORDER BY decided_at, id', [formAId, formBId])
      return rows.map(decision)
    },

    async createCycle(x) {
      return run(async () => {
        const { rows: [r] } = await query(
          `INSERT INTO reassessment_cycles (organization_id, name, program_id, intervention_id, baseline_assignment_id, reassessment_assignment_id, window_start, window_end, status, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
          [x.organizationId, x.name, x.programId || null, x.interventionId || null, x.baselineAssignmentId, x.reassessmentAssignmentId, x.windowStart, x.windowEnd, x.status, x.createdBy],
        )
        return cycle(r)
      })
    },
    async getCycle(id) {
      const { rows: [r] } = await query('SELECT * FROM reassessment_cycles WHERE id = $1', [id])
      return cycle(r) || null
    },
    async listCycles(organizationId) {
      const { rows } = await query('SELECT * FROM reassessment_cycles WHERE organization_id = $1 ORDER BY created_at DESC, id DESC', [organizationId])
      return rows.map(cycle)
    },
    async setCycleStatus(id, status) {
      return run(async () => {
        const { rows: [r] } = await query('UPDATE reassessment_cycles SET status = $2, updated_at = now() WHERE id = $1 RETURNING *', [id, status])
        return cycle(r) || null
      })
    },

    async recordSnapshot(s) {
      return run(async () => {
        const { rows: [r] } = await query(
          `INSERT INTO capability_growth_snapshots (user_id, organization_id, capability_id, baseline_session_id, reassessment_session_id, form_a_id, form_b_id, from_band, to_band, direction, uncertainty, rules_version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
           ON CONFLICT (user_id, capability_id, baseline_session_id, reassessment_session_id) DO NOTHING RETURNING *`,
          [s.userId, s.organizationId || null, s.capabilityId, s.baselineSessionId, s.reassessmentSessionId, s.formAId, s.formBId, s.fromBand, s.toBand, s.direction, s.uncertainty == null ? null : JSON.stringify(s.uncertainty), s.rulesVersion],
        )
        if (r) return { snapshot: snapshot(r), created: true }
        const { rows: [existing] } = await query(
          'SELECT * FROM capability_growth_snapshots WHERE user_id = $1 AND capability_id = $2 AND baseline_session_id = $3 AND reassessment_session_id = $4',
          [s.userId, s.capabilityId, s.baselineSessionId, s.reassessmentSessionId],
        )
        return { snapshot: snapshot(existing), created: false }
      })
    },
    async listSnapshots({ userId, organizationId = null }) {
      const { rows } = await query(
        'SELECT * FROM capability_growth_snapshots WHERE user_id = $1 AND organization_id IS NOT DISTINCT FROM $2 ORDER BY created_at, id',
        [userId, organizationId || null],
      )
      return rows.map(snapshot)
    },
  }
}
