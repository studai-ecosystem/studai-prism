// Campus administration store (C7.01–C7.08) — memory adapter. Same
// interface and semantics as repository.pg.js: academic structure, cohorts
// and their members, organization memberships and invites (admin views),
// programs and their links, CSV import jobs, onboarding progress,
// notifications and the append-only organization audit trail.
import { ApiError } from '../http/errors.js'
import { clone } from '../campusStore/memoryDb.js'

export function createCampusAdminRepoMemory(db) {
  const now = () => db.clock().toISOString()
  db.campuses ||= new Map()
  db.academicPrograms ||= new Map()
  db.batches ||= new Map()
  db.programs ||= new Map()
  db.programCohorts ||= []
  db.programAssignments ||= []
  db.importJobs ||= new Map()
  db.importRows ||= []
  db.onboarding ||= new Map()
  db.notifications ||= []
  db.orgAudit ||= [] // append-only
  db.assignments ||= new Map()
  db.assignmentTargets ||= []
  db.assignmentStudents ||= new Map()
  const inOrg = (map, orgId) => [...map.values()].filter((r) => r.organizationId === orgId)
  const active = (r) => r.status === 'ACTIVE'

  return {
    // ── Academic structure ────────────────────────────────────────────────
    async listStructure(organizationId) {
      return {
        campuses: inOrg(db.campuses, organizationId).filter(active).map(clone),
        departments: inOrg(db.departments, organizationId).filter(active).map(clone),
        academicPrograms: inOrg(db.academicPrograms, organizationId).filter(active).map(clone),
        batches: inOrg(db.batches, organizationId).filter(active).map(clone),
      }
    },
    async createStructure(kind, input) {
      const base = { id: db.id(), organizationId: input.organizationId, name: input.name, status: 'ACTIVE', createdAt: now() }
      if (kind === 'campus') { const row = base; db.campuses.set(row.id, row); return clone(row) }
      if (kind === 'department') { const row = { ...base, campusId: input.campusId || null, code: input.code || null }; db.departments.set(row.id, row); return clone(row) }
      if (kind === 'academicProgram') { const row = { ...base, departmentId: input.departmentId || null, degreeLevel: input.degreeLevel || null, durationYears: input.durationYears ?? null }; db.academicPrograms.set(row.id, row); return clone(row) }
      if (kind === 'batch') {
        if (input.startYear != null && input.endYear != null && input.endYear < input.startYear) throw new ApiError('VALIDATION_FAILED', 'The end year is before the start year.')
        const row = { ...base, programId: input.programId || null, startYear: input.startYear ?? null, endYear: input.endYear ?? null }
        db.batches.set(row.id, row)
        return clone(row)
      }
      throw new ApiError('VALIDATION_FAILED', 'Unknown structure type.')
    },

    // ── Cohorts ───────────────────────────────────────────────────────────
    async createCohort({ organizationId, campusId = null, departmentId = null, academicProgramId = null, batchId = null, name, semester = null, tags = [], ownerUserId = null }) {
      const row = { id: db.id(), organizationId, campusId, departmentId, academicProgramId, batchId, name, semester, tags, ownerUserId, status: 'ACTIVE', createdAt: now(), updatedAt: now() }
      db.cohorts.set(row.id, row)
      return clone(row)
    },
    async listCohorts(organizationId) {
      return inOrg(db.cohorts, organizationId).map((c) => ({
        ...clone(c),
        memberCount: [...db.cohortMembers.values()].filter((m) => m.cohortId === c.id && m.status === 'ACTIVE').length,
      }))
    },
    async updateCohort(id, patch) {
      const row = db.cohorts.get(id)
      if (!row) return null
      Object.assign(row, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), { updatedAt: now() })
      return clone(row)
    },
    async listCohortMembers(cohortId) {
      return [...db.cohortMembers.values()].filter((m) => m.cohortId === cohortId && m.status === 'ACTIVE').map(clone)
    },
    async removeCohortMember(cohortId, userId) {
      const row = db.cohortMembers.get(`${cohortId}:${userId}`)
      if (!row) return null
      row.status = 'REMOVED'
      return clone(row)
    },
    async listCohortMembershipsForOrg(organizationId) {
      const ids = new Set(inOrg(db.cohorts, organizationId).map((c) => c.id))
      return [...db.cohortMembers.values()].filter((m) => ids.has(m.cohortId) && m.status === 'ACTIVE').map(clone)
    },

    // ── Memberships + invites (admin views) ───────────────────────────────
    async listOrgMemberships(organizationId) {
      return [...db.memberships.values()].filter((m) => m.organizationId === organizationId).map(clone)
    },
    async getMembership(id) {
      return clone(db.memberships.get(id) || null)
    },
    async setMembershipStatus(id, status) {
      const row = db.memberships.get(id)
      if (!row) return null
      Object.assign(row, { status, updatedAt: now() })
      return clone(row)
    },
    async listOrgInvites(organizationId) {
      return [...db.invites.values()].filter((i) => i.organizationId === organizationId).map(clone)
    },

    // ── Programs ──────────────────────────────────────────────────────────
    async createProgram({ organizationId, name, description = null, status, startsOn = null, endsOn = null, reportingPolicy, sponsorshipScope, createdBy }) {
      if (startsOn && endsOn && endsOn < startsOn) throw new ApiError('VALIDATION_FAILED', 'The end date is before the start date.')
      const row = { id: db.id(), organizationId, name, description, status, startsOn, endsOn, reportingPolicy, sponsorshipScope, createdBy, createdAt: now(), updatedAt: now() }
      db.programs.set(row.id, row)
      return clone(row)
    },
    async getProgram(id) {
      return clone(db.programs.get(id) || null)
    },
    async listPrograms(organizationId) {
      return inOrg(db.programs, organizationId).map(clone)
    },
    async updateProgram(id, patch) {
      const row = db.programs.get(id)
      if (!row) return null
      const next = { ...row, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) }
      if (next.startsOn && next.endsOn && next.endsOn < next.startsOn) throw new ApiError('VALIDATION_FAILED', 'The end date is before the start date.')
      Object.assign(row, next, { updatedAt: now() })
      return clone(row)
    },
    async setProgramCohorts(programId, cohortIds) {
      db.programCohorts = db.programCohorts.filter((x) => x.programId !== programId)
      for (const cohortId of new Set(cohortIds)) db.programCohorts.push({ programId, cohortId, addedAt: now() })
      return [...new Set(cohortIds)]
    },
    async listProgramCohorts(programId) {
      return db.programCohorts.filter((x) => x.programId === programId).map((x) => x.cohortId)
    },
    async linkProgramAssignment(programId, assignmentId) {
      if (!db.programAssignments.some((x) => x.programId === programId && x.assignmentId === assignmentId)) db.programAssignments.push({ programId, assignmentId, addedAt: now() })
    },
    async listProgramAssignments(programId) {
      return db.programAssignments.filter((x) => x.programId === programId).map((x) => x.assignmentId)
    },

    // ── Sponsored assignments (admin views) ───────────────────────────────
    async listOrgAssignments(organizationId) {
      return [...db.assignments.values()].filter((a) => a.organizationId === organizationId && a.sponsorType === 'INSTITUTION').map(clone)
    },
    async listAssignmentStudents(assignmentId) {
      return [...db.assignmentStudents.values()].filter((s) => s.assignmentId === assignmentId).map(clone)
    },
    async setAssignmentStatus(id, status) {
      const row = db.assignments.get(id)
      if (!row) return null
      Object.assign(row, { status, updatedAt: now() })
      return clone(row)
    },

    // ── CSV imports ───────────────────────────────────────────────────────
    async createImportJob({ organizationId, uploadedBy, fileName = null, totals, rows }) {
      const job = { id: db.id(), organizationId, uploadedBy, fileName, status: 'PREVIEW', totals, commitKey: null, committedAt: null, createdAt: now() }
      db.importJobs.set(job.id, job)
      for (const r of rows) db.importRows.push({ jobId: job.id, rowNumber: r.rowNumber, raw: r.raw, normalized: r.normalized ?? null, errors: r.errors, action: r.action, outcome: null })
      return clone(job)
    },
    async getImportJob(id) {
      return clone(db.importJobs.get(id) || null)
    },
    async listImportRows(jobId) {
      return db.importRows.filter((r) => r.jobId === jobId).sort((a, b) => a.rowNumber - b.rowNumber).map(clone)
    },
    // Moves PREVIEW → COMMITTED once; a second call with the same key replays.
    async commitImportJob(id, { commitKey, totals, outcomes }) {
      const job = db.importJobs.get(id)
      if (!job) return null
      if (job.status === 'COMMITTED') return { job: clone(job), replayed: job.commitKey === commitKey }
      if (job.status !== 'PREVIEW') throw new ApiError('CONFLICT', 'This import can no longer be committed.')
      for (const r of db.importRows.filter((x) => x.jobId === id)) r.outcome = outcomes[r.rowNumber] || null
      Object.assign(job, { status: 'COMMITTED', commitKey, totals, committedAt: now() })
      return { job: clone(job), replayed: false }
    },
    async claimImportCommit(id, commitKey) {
      const job = db.importJobs.get(id)
      if (!job) return null
      if (job.status !== 'PREVIEW') return { claimed: false, job: clone(job) }
      if (job.commitKey && job.commitKey !== commitKey) return { claimed: false, job: clone(job) }
      if (job.commitKey === commitKey) return { claimed: false, job: clone(job), inFlight: true }
      job.commitKey = commitKey
      return { claimed: true, job: clone(job) }
    },
    async releaseImportClaim(id, commitKey) {
      const job = db.importJobs.get(id)
      if (job && job.status === 'PREVIEW' && job.commitKey === commitKey) job.commitKey = null
    },

    // ── Onboarding ────────────────────────────────────────────────────────
    async getOnboarding(organizationId) {
      return clone(db.onboarding.get(organizationId) || null)
    },
    async saveOnboarding({ organizationId, completedSteps, data, updatedBy }) {
      const row = { organizationId, completedSteps: [...new Set(completedSteps)], data, updatedBy, updatedAt: now() }
      db.onboarding.set(organizationId, row)
      return clone(row)
    },

    // ── Notifications ─────────────────────────────────────────────────────
    async createNotification({ userId, organizationId = null, kind, payload }) {
      const row = { id: db.id(), userId, organizationId, kind, payload, readAt: null, createdAt: now() }
      db.notifications.push(row)
      return clone(row)
    },
    async listNotifications(userId, { limit = 50 } = {}) {
      return db.notifications.filter((n) => n.userId === userId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit).map(clone)
    },
    async markNotificationRead(id, userId) {
      const row = db.notifications.find((n) => n.id === id && n.userId === userId)
      if (!row) return null
      row.readAt = row.readAt || now()
      return clone(row)
    },

    // ── Organization audit trail ──────────────────────────────────────────
    async appendOrgAudit({ organizationId, actorUserId, action, targetType, targetId = null, details = {}, requestId = null }) {
      const row = Object.freeze({ id: db.id(), organizationId, actorUserId, action, targetType, targetId: targetId == null ? null : String(targetId), details: clone(details), requestId, createdAt: now() })
      db.orgAudit.push(row)
      return clone(row)
    },
    async listOrgAudit(organizationId, { limit = 50, before = null } = {}) {
      return db.orgAudit
        .filter((e) => e.organizationId === organizationId && (!before || e.createdAt < before))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, limit)
        .map(clone)
    },
  }
}
