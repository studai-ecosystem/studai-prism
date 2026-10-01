// Reassessment + growth store (C9.01) — memory adapter. Same interface and
// semantics as repository.pg.js: the form-equivalence registry (every pair
// starts PENDING; decisions are appended to a history and never edited),
// campus reassessment cycles, and immutable capability growth snapshots.
import { ApiError } from '../http/errors.js'
import { clone } from '../campusStore/memoryDb.js'

const pairKey = (a, b) => `${a}|${b}`

export function createGrowthRepoMemory(db) {
  const now = () => db.clock().toISOString()
  db.formEquivalence ||= new Map()
  db.equivalenceDecisions ||= []
  db.reassessmentCycles ||= new Map()
  db.growthSnapshots ||= []

  return {
    // Insert-if-absent; an existing pair keeps its status and decision.
    async seedPendingPairs(pairs) {
      let created = 0
      for (const { formAId, formBId } of pairs) {
        if (!(formAId <= formBId)) throw new ApiError('VALIDATION_FAILED', 'Form pairs are stored in canonical order.')
        const k = pairKey(formAId, formBId)
        if (db.formEquivalence.has(k)) continue
        db.formEquivalence.set(k, { formAId, formBId, status: 'PENDING', evidenceRef: null, decidedBy: null, decidedAt: null, createdAt: now(), updatedAt: now() })
        created += 1
      }
      return created
    },
    async listEquivalence() {
      return [...db.formEquivalence.values()].sort((a, b) => pairKey(a.formAId, a.formBId).localeCompare(pairKey(b.formAId, b.formBId))).map(clone)
    },
    async getEquivalence(formAId, formBId) {
      return clone(db.formEquivalence.get(pairKey(formAId, formBId)) || null)
    },
    async recordDecision({ formAId, formBId, status, evidenceRef, reason, decidedBy, approvalId = null }) {
      const row = db.formEquivalence.get(pairKey(formAId, formBId))
      if (!row) throw new ApiError('NOT_FOUND', 'Not found')
      if (!['APPROVED', 'REJECTED'].includes(status) || String(evidenceRef || '').length < 3 || String(reason || '').length < 10 || !decidedBy) {
        throw new ApiError('VALIDATION_FAILED', 'Those details are not valid.')
      }
      if (status === 'APPROVED' && !approvalId) throw new ApiError('VALIDATION_FAILED', 'Those details are not valid.')
      const at = now()
      db.equivalenceDecisions.push(Object.freeze({ id: db.id(), formAId, formBId, status, evidenceRef, reason, decidedBy, approvalId, decidedAt: at }))
      Object.assign(row, { status, evidenceRef, decidedBy, decidedAt: at, updatedAt: at })
      return clone(row)
    },
    async listDecisions(formAId, formBId) {
      return db.equivalenceDecisions.filter((d) => d.formAId === formAId && d.formBId === formBId).map(clone)
    },

    async createCycle(c) {
      if (!(new Date(c.windowEnd) > new Date(c.windowStart))) throw new ApiError('VALIDATION_FAILED', 'Those details are not valid.')
      if ([...db.reassessmentCycles.values()].some((x) => x.reassessmentAssignmentId === c.reassessmentAssignmentId)) throw new ApiError('CONFLICT', 'This already exists.')
      const row = {
        id: db.id(), organizationId: c.organizationId, name: c.name, programId: c.programId || null, interventionId: c.interventionId || null,
        baselineAssignmentId: c.baselineAssignmentId, reassessmentAssignmentId: c.reassessmentAssignmentId,
        windowStart: c.windowStart, windowEnd: c.windowEnd, status: c.status, createdBy: c.createdBy, createdAt: now(), updatedAt: now(),
      }
      db.reassessmentCycles.set(row.id, row)
      return clone(row)
    },
    async getCycle(id) {
      return clone(db.reassessmentCycles.get(id) || null)
    },
    async listCycles(organizationId) {
      return [...db.reassessmentCycles.values()].filter((c) => c.organizationId === organizationId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || String(b.id).localeCompare(String(a.id))).map(clone)
    },
    async setCycleStatus(id, status) {
      const row = db.reassessmentCycles.get(id)
      if (!row) return null
      Object.assign(row, { status, updatedAt: now() })
      return clone(row)
    },

    // Insert-if-absent per (user, capability, baseline, reassessment).
    async recordSnapshot(s) {
      if (!db.formEquivalence.has(pairKey(s.formAId, s.formBId))) throw new ApiError('VALIDATION_FAILED', 'That refers to something that does not exist.')
      const existing = db.growthSnapshots.find((x) => x.userId === s.userId && x.capabilityId === s.capabilityId
        && x.baselineSessionId === s.baselineSessionId && x.reassessmentSessionId === s.reassessmentSessionId)
      if (existing) return { snapshot: clone(existing), created: false }
      const row = Object.freeze({ id: db.id(), organizationId: null, uncertainty: null, ...clone(s), createdAt: now() })
      db.growthSnapshots.push(row)
      return { snapshot: clone(row), created: true }
    },
    async listSnapshots({ userId, organizationId = null }) {
      return db.growthSnapshots.filter((x) => x.userId === userId && (x.organizationId || null) === (organizationId || null)).map(clone)
    },
  }
}
