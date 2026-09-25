// Assessment catalog + assignments — memory adapter (same semantics as 0030).
import { ApiError } from '../http/errors.js'
import { clone } from '../campusStore/memoryDb.js'

const STUDENT_STATUSES = new Set(['ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'WITHDRAWN'])

function checkAssignment(a) {
  if (a.sponsorType === 'PERSONAL' && (a.organizationId || !a.personalKey)) throw new ApiError('VALIDATION_FAILED', 'Personal assignments have no sponsor.')
  if (a.sponsorType === 'INSTITUTION' && (!a.organizationId || a.personalKey)) throw new ApiError('VALIDATION_FAILED', 'Sponsored assignments need an organization.')
  if (a.formPolicy === 'FIXED_FORM' && !a.formId) throw new ApiError('VALIDATION_FAILED', 'A fixed-form assignment needs a form.')
  if (a.windowStart && a.windowEnd && new Date(a.windowEnd) <= new Date(a.windowStart)) throw new ApiError('VALIDATION_FAILED', 'The window must end after it starts.')
}

export function createAssessmentsRepoMemory(db) {
  db.assessmentDefinitions ||= new Map()
  db.assessmentForms ||= new Map()
  db.assignments ||= new Map()
  db.assignmentTargets ||= []
  db.assignmentStudents ||= new Map() // `${assignmentId}:${userId}`

  const now = () => db.clock().toISOString()
  const join = (a, s) => ({ ...clone(a), student: s ? clone(s) : null })

  return {
    async seedCatalog({ definitions = [], forms = [] }) {
      for (const d of definitions) db.assessmentDefinitions.set(d.id, { ...clone(d) })
      for (const f of forms) {
        if (!db.assessmentDefinitions.has(f.definitionId)) throw new ApiError('VALIDATION_FAILED', 'Form references an unknown definition.')
        db.assessmentForms.set(f.id, { ...clone(f) })
      }
      return { definitions: definitions.length, forms: forms.length }
    },
    async listDefinitions() {
      return [...db.assessmentDefinitions.values()].map(clone)
    },
    async listForms(definitionId) {
      return [...db.assessmentForms.values()].filter((f) => f.definitionId === definitionId).map(clone)
    },

    async createAssignment(a) {
      checkAssignment(a)
      if (!db.assessmentDefinitions.has(a.definitionId)) throw new ApiError('VALIDATION_FAILED', 'Unknown assessment definition.')
      if (a.formId && !db.assessmentForms.has(a.formId)) throw new ApiError('VALIDATION_FAILED', 'Unknown assessment form.')
      if (a.personalKey && [...db.assignments.values()].some((x) => x.personalKey === a.personalKey)) {
        throw new ApiError('CONFLICT', 'This personal assignment already exists.')
      }
      if (db.assignments.has(a.id)) throw new ApiError('CONFLICT', 'This assignment already exists.')
      const row = {
        id: a.id,
        definitionId: a.definitionId,
        formPolicy: a.formPolicy,
        formId: a.formId ?? null,
        sponsorType: a.sponsorType,
        organizationId: a.organizationId ?? null,
        programId: a.programId ?? null,
        personalKey: a.personalKey ?? null,
        windowStart: a.windowStart ?? null,
        windowEnd: a.windowEnd ?? null,
        integrityPolicy: a.integrityPolicy,
        accommodationsPolicy: clone(a.accommodationsPolicy),
        reminderPolicy: clone(a.reminderPolicy),
        createdBy: a.createdBy,
        status: a.status,
        createdAt: now(),
        updatedAt: now(),
      }
      db.assignments.set(row.id, row)
      for (const t of a.targets || []) db.assignmentTargets.push({ assignmentId: row.id, targetType: t.targetType, targetId: String(t.targetId) })
      return clone(row)
    },
    // Insert-if-absent keyed by the deterministic id / personal key.
    async ensurePersonalAssignment(a) {
      const existing = db.assignments.get(a.id) || [...db.assignments.values()].find((x) => x.personalKey === a.personalKey)
      if (existing) return clone(existing)
      return this.createAssignment(a)
    },
    async getAssignment(id) {
      return clone(db.assignments.get(id)) || null
    },
    async listTargets(assignmentId) {
      return db.assignmentTargets.filter((t) => t.assignmentId === assignmentId).map(clone)
    },

    async addStudent({ assignmentId, userId, status }) {
      if (!db.assignments.has(assignmentId)) throw new ApiError('NOT_FOUND', 'Not found')
      if (!STUDENT_STATUSES.has(status)) throw new ApiError('VALIDATION_FAILED', 'Unknown assignment status.')
      if (status === 'IN_PROGRESS' || status === 'COMPLETED') throw new ApiError('VALIDATION_FAILED', 'A started assignment needs a session.')
      const key = `${assignmentId}:${userId}`
      if (!db.assignmentStudents.has(key)) {
        db.assignmentStudents.set(key, {
          assignmentId, userId, status, sessionId: null, consentRecordId: null,
          acknowledgedAt: null, startedAt: null, completedAt: null, createdAt: now(), updatedAt: now(),
        })
      }
      return clone(db.assignmentStudents.get(key))
    },
    async updateStudent({ assignmentId, userId, patch }) {
      const row = db.assignmentStudents.get(`${assignmentId}:${userId}`)
      if (!row) return null
      const next = { ...row, ...patch, updatedAt: now() }
      if (!STUDENT_STATUSES.has(next.status)) throw new ApiError('VALIDATION_FAILED', 'Unknown assignment status.')
      if ((next.status === 'IN_PROGRESS' || next.status === 'COMPLETED') && !next.sessionId) throw new ApiError('VALIDATION_FAILED', 'A started assignment needs a session.')
      db.assignmentStudents.set(`${assignmentId}:${userId}`, next)
      return clone(next)
    },
    async getAssignmentForUser(assignmentId, userId) {
      const a = db.assignments.get(assignmentId)
      const s = db.assignmentStudents.get(`${assignmentId}:${userId}`)
      return a && s ? join(a, s) : null
    },
    // organizationId null → the user's PERSONAL assignments; else that org's sponsored ones.
    async listAssignmentsForUser({ userId, organizationId = null }) {
      return [...db.assignmentStudents.values()]
        .filter((s) => s.userId === userId)
        .map((s) => [db.assignments.get(s.assignmentId), s])
        .filter(([a]) => a && (organizationId ? a.sponsorType === 'INSTITUTION' && a.organizationId === organizationId : a.sponsorType === 'PERSONAL'))
        .map(([a, s]) => join(a, s))
        .sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)) || x.id.localeCompare(y.id))
    },
  }
}
