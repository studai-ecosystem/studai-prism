// Development V2 store (C8.01) — memory adapter. Same interface and
// semantics as repository.pg.js: governed mission versions (immutable once
// published), attempts with optimistic versioning, the append-only PRACTICE
// evidence ledger (kept apart from formal evidence), development plans and
// campus interventions.
import { ApiError } from '../http/errors.js'
import { clone } from '../campusStore/memoryDb.js'

export function createDevelopmentRepoMemory(db) {
  const now = () => db.clock().toISOString()
  db.missionDefinitions ||= new Map()
  db.missionVersions ||= new Map() // `${id}:${version}`
  db.missionAttempts ||= new Map()
  db.practiceUnits ||= []
  db.developmentPlans ||= new Map()
  db.planItems ||= []
  db.interventions ||= new Map()
  db.interventionMembers ||= new Map() // `${interventionId}:${userId}`
  const vkey = (id, v) => `${id}:${v}`

  return {
    // Insert-if-absent; a different body for an existing version is refused.
    async seedMissionVersion({ missionId, targetCapabilityId, version, status, schemaVersion, content, contentHash, publishedAt }) {
      if (!db.missionDefinitions.has(missionId)) db.missionDefinitions.set(missionId, { id: missionId, targetCapabilityId, status: 'ACTIVE', createdAt: now() })
      const existing = db.missionVersions.get(vkey(missionId, version))
      if (existing) {
        if (existing.contentHash !== contentHash) throw new ApiError('CONFLICT', `Mission ${missionId} v${version} is published and cannot change; publish a new version.`)
        return clone(existing)
      }
      const row = { missionId, version, status, schemaVersion, content: clone(content), contentHash, publishedAt: publishedAt || null, createdAt: now() }
      db.missionVersions.set(vkey(missionId, version), row)
      return clone(row)
    },
    async listPublishedMissions() {
      const latest = new Map()
      for (const v of db.missionVersions.values()) {
        if (v.status !== 'PUBLISHED' || db.missionDefinitions.get(v.missionId)?.status !== 'ACTIVE') continue
        if (!latest.has(v.missionId) || latest.get(v.missionId).version < v.version) latest.set(v.missionId, v)
      }
      return [...latest.values()].map(clone)
    },
    // Latest DRAFT version per mission that has no published version (P2.8;
    // reachable only behind PRISM_DRAFT_CONTENT).
    async listDraftMissions() {
      const latest = new Map()
      for (const v of db.missionVersions.values()) {
        if (v.status !== 'DRAFT' || db.missionDefinitions.get(v.missionId)?.status !== 'ACTIVE') continue
        if (!latest.has(v.missionId) || latest.get(v.missionId).version < v.version) latest.set(v.missionId, v)
      }
      return [...latest.values()].map(clone)
    },
    async getMissionVersion(missionId, version) {
      return clone(db.missionVersions.get(vkey(missionId, version)) || null)
    },

    async createAttempt(a) {
      const replay = [...db.missionAttempts.values()].find((x) => x.userId === a.userId && x.idempotencyKey === a.idempotencyKey)
      if (replay) return { attempt: clone(replay), replayed: true }
      if (!db.missionVersions.has(vkey(a.missionId, a.missionVersion))) throw new ApiError('NOT_FOUND', 'Not found')
      const row = {
        id: db.id(), userId: a.userId, missionId: a.missionId, missionVersion: a.missionVersion, organizationId: a.organizationId || null,
        interventionId: a.interventionId || null, status: 'IN_PROGRESS', work: clone(a.work), version: 1, hintsUsed: 0,
        origin: a.origin ? clone(a.origin) : null,
        idempotencyKey: a.idempotencyKey, evaluation: null, submittedAt: null, createdAt: now(), updatedAt: now(),
      }
      db.missionAttempts.set(row.id, row)
      return { attempt: clone(row), replayed: false }
    },
    async getAttempt(id) {
      return clone(db.missionAttempts.get(id) || null)
    },
    async listAttempts({ userId, organizationId = null }) {
      return [...db.missionAttempts.values()]
        .filter((a) => a.userId === userId && (a.organizationId || null) === (organizationId || null))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .map(clone)
    },
    async listAttemptsForIntervention(interventionId) {
      return [...db.missionAttempts.values()].filter((a) => a.interventionId === interventionId).map(clone)
    },
    // Optimistic write: only when the stored version matches.
    async saveAttemptWork(id, { expectedVersion, work, hintsUsed }) {
      const row = db.missionAttempts.get(id)
      if (!row) return null
      if (row.status !== 'IN_PROGRESS') return { conflict: 'SUBMITTED', attempt: clone(row) }
      if (row.version !== expectedVersion) return { conflict: 'VERSION', attempt: clone(row) }
      Object.assign(row, { work: work === undefined ? row.work : clone(work), hintsUsed: hintsUsed === undefined ? row.hintsUsed : hintsUsed, version: row.version + 1, updatedAt: now() })
      return { attempt: clone(row) }
    },
    async completeAttempt(id, { status, evaluation, submittedAt }) {
      const row = db.missionAttempts.get(id)
      if (!row) return null
      if (row.status !== 'IN_PROGRESS') return { attempt: clone(row), replayed: true }
      Object.assign(row, { status, evaluation: clone(evaluation), submittedAt, version: row.version + 1, updatedAt: now() })
      return { attempt: clone(row), replayed: false }
    },

    async appendPracticeUnits(units) {
      const out = []
      for (const u of units) {
        if (u.sourceType !== 'MISSION_PRACTICE') throw new ApiError('VALIDATION_FAILED', 'Practice evidence must be marked as practice.')
        if (db.practiceUnits.some((x) => x.attemptId === u.attemptId && x.criterionId === u.criterionId)) continue
        const row = Object.freeze({ id: db.id(), ...clone(u), createdAt: now() })
        db.practiceUnits.push(row)
        out.push(clone(row))
      }
      return out
    },
    async listPracticeUnits({ userId, organizationId = null }) {
      return db.practiceUnits.filter((u) => u.userId === userId && (u.organizationId || null) === (organizationId || null))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(clone)
    },

    async upsertPlan({ userId, organizationId = null, sourceSessionId, items }) {
      const scopeMatch = (p) => p.userId === userId && (p.organizationId || null) === (organizationId || null)
      let plan = [...db.developmentPlans.values()].find((p) => p.userId === userId && p.sourceSessionId === sourceSessionId)
      if (!plan) {
        plan = { id: db.id(), userId, organizationId, sourceSessionId, status: 'ACTIVE', createdAt: now() }
        db.developmentPlans.set(plan.id, plan)
        items.forEach((it, i) => db.planItems.push({ planId: plan.id, capabilityId: it.capabilityId, position: i + 1 }))
      }
      for (const p of db.developmentPlans.values()) if (scopeMatch(p) && p.id !== plan.id && p.status === 'ACTIVE') p.status = 'SUPERSEDED'
      plan.status = 'ACTIVE'
      return { ...clone(plan), items: db.planItems.filter((x) => x.planId === plan.id).sort((a, b) => a.position - b.position).map(clone) }
    },

    async createIntervention(i) {
      const row = { id: db.id(), ...clone(i), createdAt: now(), updatedAt: now() }
      db.interventions.set(row.id, row)
      return clone(row)
    },
    async getIntervention(id) {
      return clone(db.interventions.get(id) || null)
    },
    async listInterventions(organizationId) {
      return [...db.interventions.values()].filter((x) => x.organizationId === organizationId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(clone)
    },
    async setInterventionStatus(id, status) {
      const row = db.interventions.get(id)
      if (!row) return null
      Object.assign(row, { status, updatedAt: now() })
      return clone(row)
    },
    async addInterventionMember(interventionId, userId) {
      const key = `${interventionId}:${userId}`
      if (!db.interventionMembers.has(key)) db.interventionMembers.set(key, { interventionId, userId, addedAt: now() })
      return clone(db.interventionMembers.get(key))
    },
    async listInterventionMembers(interventionId) {
      return [...db.interventionMembers.values()].filter((m) => m.interventionId === interventionId).map(clone)
    },
    async listInterventionsForUser(userId, organizationId) {
      const ids = new Set([...db.interventionMembers.values()].filter((m) => m.userId === userId).map((m) => m.interventionId))
      return [...db.interventions.values()].filter((x) => ids.has(x.id) && x.organizationId === organizationId).map(clone)
    },
  }
}
