// Development V2 store (C8.01) — Postgres adapter (0035). Same interface and
// semantics as repository.memory.js.
import { ApiError } from '../http/errors.js'
import { iso, withTransaction } from '../campusStore/pgUtil.js'

// node-pg parses DATE as local midnight: read it back with local getters so a
// server east of UTC does not move the day back (toISOString would).
const pad = (n) => String(n).padStart(2, '0')
const date = (v) => (v == null ? null : (v instanceof Date ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : String(v).slice(0, 10)))
const version = (r) => r && ({
  missionId: r.mission_id, version: r.version, status: r.status, schemaVersion: r.schema_version, content: r.content, contentHash: r.content_hash,
  publishedAt: iso(r.published_at), createdAt: iso(r.created_at),
})
const attempt = (r) => r && ({
  id: r.id, userId: r.user_id, missionId: r.mission_id, missionVersion: r.mission_version, organizationId: r.organization_id, interventionId: r.intervention_id,
  status: r.status, work: r.work, version: r.version, hintsUsed: r.hints_used, idempotencyKey: r.idempotency_key, evaluation: r.evaluation,
  origin: r.origin_json || null,
  submittedAt: iso(r.submitted_at), createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
})
const unit = (r) => r && ({
  id: r.id, attemptId: r.attempt_id, userId: r.user_id, organizationId: r.organization_id, missionId: r.mission_id, missionVersion: r.mission_version,
  capabilityId: r.capability_id, behaviorId: r.behavior_id, criterionId: r.criterion_id, sourceType: r.source_type, checkType: r.check_type,
  excerpt: r.excerpt, provenance: r.provenance, createdAt: iso(r.created_at),
})
const intervention = (r) => r && ({
  id: r.id, organizationId: r.organization_id, name: r.name, targetCapabilityId: r.target_capability_id, cohortId: r.cohort_id,
  startsOn: date(r.starts_on), endsOn: date(r.ends_on), status: r.status, missionIds: r.mission_ids || [], reassessmentPlanned: r.reassessment_planned,
  createdBy: r.created_by, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
})

function mapError(err) {
  if (err.code === '23514') return new ApiError('VALIDATION_FAILED', 'Those details are not valid.')
  if (err.code === '23503') return new ApiError('VALIDATION_FAILED', 'That refers to something that does not exist.')
  if (err.code === '23505') return new ApiError('CONFLICT', 'This already exists.')
  return err
}
const run = async (fn) => { try { return await fn() } catch (err) { throw mapError(err) } }

export function createDevelopmentRepoPg({ query, getPool }) {
  return {
    async seedMissionVersion({ missionId, targetCapabilityId, version: v, status, schemaVersion, content, contentHash, publishedAt }) {
      return run(() => withTransaction(getPool, async (c) => {
        await c.query("INSERT INTO mission_definitions (id, target_capability_id, status) VALUES ($1, $2, 'ACTIVE') ON CONFLICT (id) DO NOTHING", [missionId, targetCapabilityId])
        const { rows: [existing] } = await c.query('SELECT * FROM mission_versions WHERE mission_id = $1 AND version = $2', [missionId, v])
        if (existing) {
          if (existing.content_hash !== contentHash) throw new ApiError('CONFLICT', `Mission ${missionId} v${v} is published and cannot change; publish a new version.`)
          return version(existing)
        }
        const { rows: [row] } = await c.query(
          'INSERT INTO mission_versions (mission_id, version, status, schema_version, content, content_hash, published_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7) RETURNING *',
          [missionId, v, status, schemaVersion, JSON.stringify(content), contentHash, publishedAt || null],
        )
        return version(row)
      }))
    },
    async listPublishedMissions() {
      const { rows } = await query(`
        SELECT DISTINCT ON (v.mission_id) v.* FROM mission_versions v
        JOIN mission_definitions d ON d.id = v.mission_id AND d.status = 'ACTIVE'
        WHERE v.status = 'PUBLISHED' ORDER BY v.mission_id, v.version DESC`)
      return rows.map(version)
    },
    async listDraftMissions() {
      const { rows } = await query(`
        SELECT DISTINCT ON (v.mission_id) v.* FROM mission_versions v
        JOIN mission_definitions d ON d.id = v.mission_id AND d.status = 'ACTIVE'
        WHERE v.status = 'DRAFT' ORDER BY v.mission_id, v.version DESC`)
      return rows.map(version)
    },
    async getMissionVersion(missionId, v) {
      const { rows } = await query('SELECT * FROM mission_versions WHERE mission_id = $1 AND version = $2', [missionId, v])
      return version(rows[0]) || null
    },

    async createAttempt(a) {
      return run(async () => {
        const { rows } = await query(`
          INSERT INTO mission_attempts (user_id, mission_id, mission_version, organization_id, intervention_id, status, work, version, hints_used, idempotency_key, origin_json)
          VALUES ($1, $2, $3, $4, $5, 'IN_PROGRESS', $6::jsonb, 1, 0, $7, $8::jsonb)
          ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING *`,
        [a.userId, a.missionId, a.missionVersion, a.organizationId || null, a.interventionId || null, JSON.stringify(a.work), a.idempotencyKey, a.origin ? JSON.stringify(a.origin) : null])
        if (rows[0]) return { attempt: attempt(rows[0]), replayed: false }
        const { rows: [prior] } = await query('SELECT * FROM mission_attempts WHERE user_id = $1 AND idempotency_key = $2', [a.userId, a.idempotencyKey])
        return { attempt: attempt(prior), replayed: true }
      })
    },
    async getAttempt(id) {
      const { rows } = await query('SELECT * FROM mission_attempts WHERE id = $1', [id])
      return attempt(rows[0]) || null
    },
    async listAttempts({ userId, organizationId = null }) {
      const { rows } = await query(
        'SELECT * FROM mission_attempts WHERE user_id = $1 AND organization_id IS NOT DISTINCT FROM $2 ORDER BY created_at DESC',
        [userId, organizationId],
      )
      return rows.map(attempt)
    },
    async listAttemptsForIntervention(interventionId) {
      const { rows } = await query('SELECT * FROM mission_attempts WHERE intervention_id = $1', [interventionId])
      return rows.map(attempt)
    },
    async saveAttemptWork(id, { expectedVersion, work, hintsUsed }) {
      const { rows } = await query(`
        UPDATE mission_attempts SET work = COALESCE($3::jsonb, work), hints_used = COALESCE($4, hints_used), version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $2 AND status = 'IN_PROGRESS' RETURNING *`,
      [id, expectedVersion, work === undefined ? null : JSON.stringify(work), hintsUsed === undefined ? null : hintsUsed])
      if (rows[0]) return { attempt: attempt(rows[0]) }
      const current = await this.getAttempt(id)
      if (!current) return null
      return { conflict: current.status !== 'IN_PROGRESS' ? 'SUBMITTED' : 'VERSION', attempt: current }
    },
    async completeAttempt(id, { status, evaluation, submittedAt }) {
      const { rows } = await query(`
        UPDATE mission_attempts SET status = $2, evaluation = $3::jsonb, submitted_at = $4, version = version + 1, updated_at = now()
        WHERE id = $1 AND status = 'IN_PROGRESS' RETURNING *`,
      [id, status, JSON.stringify(evaluation), submittedAt])
      if (rows[0]) return { attempt: attempt(rows[0]), replayed: false }
      const current = await this.getAttempt(id)
      return current ? { attempt: current, replayed: true } : null
    },

    async appendPracticeUnits(units) {
      const out = []
      for (const u of units) {
        if (u.sourceType !== 'MISSION_PRACTICE') throw new ApiError('VALIDATION_FAILED', 'Practice evidence must be marked as practice.')
        const { rows } = await query(`
          INSERT INTO practice_evidence_units (attempt_id, user_id, organization_id, mission_id, mission_version, capability_id, behavior_id, criterion_id, source_type, check_type, excerpt, provenance)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
          ON CONFLICT (attempt_id, criterion_id) DO NOTHING RETURNING *`,
        [u.attemptId, u.userId, u.organizationId || null, u.missionId, u.missionVersion, u.capabilityId, u.behaviorId, u.criterionId, u.sourceType, u.checkType, u.excerpt ?? null, JSON.stringify(u.provenance)])
        if (rows[0]) out.push(unit(rows[0]))
      }
      return out
    },
    async listPracticeUnits({ userId, organizationId = null }) {
      const { rows } = await query(
        'SELECT * FROM practice_evidence_units WHERE user_id = $1 AND organization_id IS NOT DISTINCT FROM $2 ORDER BY created_at DESC',
        [userId, organizationId],
      )
      return rows.map(unit)
    },

    async upsertPlan({ userId, organizationId = null, sourceSessionId, items }) {
      return withTransaction(getPool, async (c) => {
        const { rows: [inserted] } = await c.query(`
          INSERT INTO development_plans (user_id, organization_id, source_session_id, status) VALUES ($1, $2, $3, 'ACTIVE')
          ON CONFLICT (user_id, source_session_id) DO NOTHING RETURNING *`, [userId, organizationId, sourceSessionId])
        let plan = inserted
        if (inserted) {
          let i = 0
          for (const it of items) {
            i += 1
            await c.query('INSERT INTO development_plan_items (plan_id, capability_id, position) VALUES ($1, $2, $3)', [inserted.id, it.capabilityId, i])
          }
        } else {
          plan = (await c.query('SELECT * FROM development_plans WHERE user_id = $1 AND source_session_id = $2', [userId, sourceSessionId])).rows[0]
        }
        await c.query("UPDATE development_plans SET status = 'SUPERSEDED' WHERE user_id = $1 AND organization_id IS NOT DISTINCT FROM $2 AND id <> $3 AND status = 'ACTIVE'", [userId, organizationId, plan.id])
        await c.query("UPDATE development_plans SET status = 'ACTIVE' WHERE id = $1", [plan.id])
        const { rows: its } = await c.query('SELECT * FROM development_plan_items WHERE plan_id = $1 ORDER BY position', [plan.id])
        return {
          id: plan.id, userId: plan.user_id, organizationId: plan.organization_id, sourceSessionId: plan.source_session_id, status: 'ACTIVE', createdAt: iso(plan.created_at),
          items: its.map((r) => ({ planId: r.plan_id, capabilityId: r.capability_id, position: r.position })),
        }
      })
    },

    async createIntervention(i) {
      return run(async () => {
        const { rows } = await query(`
          INSERT INTO interventions (organization_id, name, target_capability_id, cohort_id, starts_on, ends_on, status, mission_ids, reassessment_planned, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10) RETURNING *`,
        [i.organizationId, i.name, i.targetCapabilityId, i.cohortId, i.startsOn, i.endsOn, i.status, i.missionIds, i.reassessmentPlanned, i.createdBy])
        return intervention(rows[0])
      })
    },
    async getIntervention(id) {
      const { rows } = await query('SELECT * FROM interventions WHERE id = $1', [id])
      return intervention(rows[0]) || null
    },
    async listInterventions(organizationId) {
      const { rows } = await query('SELECT * FROM interventions WHERE organization_id = $1 ORDER BY created_at DESC', [organizationId])
      return rows.map(intervention)
    },
    async setInterventionStatus(id, status) {
      const { rows } = await query('UPDATE interventions SET status = $2, updated_at = now() WHERE id = $1 RETURNING *', [id, status])
      return intervention(rows[0]) || null
    },
    async addInterventionMember(interventionId, userId) {
      const { rows } = await query(`
        INSERT INTO intervention_memberships (intervention_id, user_id) VALUES ($1, $2)
        ON CONFLICT (intervention_id, user_id) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING *`, [interventionId, userId])
      return { interventionId: rows[0].intervention_id, userId: rows[0].user_id, addedAt: iso(rows[0].added_at) }
    },
    async listInterventionMembers(interventionId) {
      const { rows } = await query('SELECT * FROM intervention_memberships WHERE intervention_id = $1', [interventionId])
      return rows.map((r) => ({ interventionId: r.intervention_id, userId: r.user_id, addedAt: iso(r.added_at) }))
    },
    async listInterventionsForUser(userId, organizationId) {
      const { rows } = await query(`
        SELECT i.* FROM interventions i JOIN intervention_memberships m ON m.intervention_id = i.id
        WHERE m.user_id = $1 AND i.organization_id = $2`, [userId, organizationId])
      return rows.map(intervention)
    },
  }
}
