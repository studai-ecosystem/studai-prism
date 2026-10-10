// Campus administration service (spec §19–§25, §29, §37, §43; C7.02–C7.08).
// Every read is filtered to what the caller's role scope covers (ALL, or the
// ASSIGNED cohorts / DEPARTMENT of their membership); every write re-checks
// the target against that scope, writes an organization audit row, and never
// touches personal (unsponsored) data. Institutions pick from the approved
// assessment catalog only — there is no way to edit rubrics or prompts here.
import { randomUUID } from 'node:crypto'
import { ApiError } from '../http/errors.js'
import { can } from '../permissions/can.js'
import { ROLES } from '../permissions/roles.js'
import { CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION } from '../sharing/copyVersions.js'
import { validateImport, IMPORT_LIMITS, csvCell } from './csv.js'
import { csvRosterAdapter } from '../integrations/sis/index.js'
import { contentRegistry } from '../content/versions.js'
import { adminListWindow, nextOffsetCursor, offsetFromCursor } from '../http/pagination.js'

export const ONBOARDING_STEPS = Object.freeze(['profile', 'structure', 'team', 'students', 'program', 'assessment', 'schedule', 'privacy', 'launch'])
export const STAFF_ROLES = Object.freeze(ROLES.filter((r) => !['STUDENT', 'PRISM_REVIEWER', 'STUDAI_ADMIN'].includes(r)))
const APPROVED_DEFINITION_STATUSES = new Set(['active', 'APPROVED'])
// P8.7: governed (universal) content is assignable only once a reviewer has
// moved it to at least APPROVED_FOR_PILOT. Forms unknown to the content
// registry (the frozen legacy bank) are governed by the catalog status alone.
export const ASSIGNABLE_CONTENT_STATES = new Set(['APPROVED_FOR_PILOT', 'APPROVED_FOR_INTENDED_USE'])
export function assertContentAssignable(formId, registry = contentRegistry) {
  if (!formId || !registry.listForms().some((f) => f.formId === formId)) return null
  const state = registry.stateOf(formId)
  if (!ASSIGNABLE_CONTENT_STATES.has(state)) {
    throw new ApiError('CONTENT_NOT_APPROVED', 'This content has not been approved for pilot use and cannot be assigned yet.', { status: 409, details: { formId, state } })
  }
  return state
}
const COMPLETION_THRESHOLDS = [50, 100]

// PROD-READY Phase 5 job runner (K69/K79/K80).
// A window that passed releases the seats of starts that never finished once
// this grace period is over, so a run that was in progress at the deadline is
// never cut off by the release (the student view already shows EXPIRED).
export const SEAT_RELEASE_GRACE_HOURS = 24
// Scans look back this far for windows that passed (older ones were handled).
export const SEAT_RELEASE_LOOKBACK_DAYS = 30
// Reminder policy (stored on the assignment since C7.08): `daysBeforeDue`
// clamped to 1..14; default 2 (the value the launch form stores).
export const REMINDER_MAX_DAYS_BEFORE_DUE = 14
const REMINDER_SKIP_STATUSES = new Set(['COMPLETED', 'WITHDRAWN', 'EXPIRED'])
const SYSTEM_ACTOR = 'system:job-runner'
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
export function reminderDaysBeforeDue(policy) {
  const n = Number(policy?.daysBeforeDue)
  return Number.isInteger(n) ? Math.min(REMINDER_MAX_DAYS_BEFORE_DUE, Math.max(1, n)) : 2
}

// The exact disclosure a student reads before a sponsored assessment
// (mirrors the student briefing copy; version-stamped).
export function consentPreviewFor(organizationName) {
  const org = organizationName || 'Your institution'
  return {
    copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION,
    heading: `This assessment is sponsored by ${org}.`,
    canSee: [`${org} can see that you were assigned this assessment and whether you completed it.`, `${org} can see the report from this sponsored assessment.`],
    cannotSee: ['Your personal Prism assessments and private activity are not shared automatically.', 'Your personal reports, role exploration and practice stay private unless you share them.'],
  }
}

export function createCampusAdminService({
  repos, users, invites, catalog, clock = () => new Date(), audit = () => {},
  sendAssignmentEmail = async () => false, appUrl = '', ledger = null,
  // PROD-READY Phase 5: CSV-import invites go through the job queue while
  // this returns true (PRISM_JOB_WORKER on and a store with a jobs table).
  queueImportInvites = () => false,
  sendReminderEmail = async () => false,
  // P8.7 content approval registry (tests inject one with a known state).
  contentRegistry: registry = contentRegistry,
  // Called whenever a student is (re)attached to a cohort (Phase 8 interventions).
  onRosterSync = async () => {},
}) {
  const store = () => repos.campusAdmin
  // Multi-write unit (PROD-READY Phase 3): the store's transaction when it
  // has one (both campus stores do), otherwise the plain repositories.
  const inTransaction = (fn) => (typeof repos.transaction === 'function' ? repos.transaction(fn) : fn(repos))
  const nowIso = () => clock().toISOString()

  // ── scope helpers ──────────────────────────────────────────────────────
  const cohortInScope = (decision, cohort) => {
    if (!decision?.allowed || !cohort) return false
    if (decision.scope === 'ALL' || decision.scope === 'LIMITED') return true
    if (decision.scope === 'ASSIGNED') return (decision.cohortIds || []).includes(String(cohort.id))
    if (decision.scope === 'DEPARTMENT') return Boolean(cohort.departmentId) && String(cohort.departmentId) === String(decision.departmentId)
    return false
  }
  const decide = (actor, organizationId, permission, resource = {}) => can(actor, permission, { organizationId, ...resource })
  function requireDecision(actor, organizationId, permission, resource) {
    const d = decide(actor, organizationId, permission, resource)
    if (!d.allowed) throw new ApiError('NOT_FOUND', 'Not found')
    return d
  }
  const requireFullScope = (d, message) => {
    if (d.scope !== 'ALL') throw new ApiError('FORBIDDEN', message)
  }
  // LIMITED writers (e.g. department coordinators) act only on cohorts they can read.
  const inReach = (actor, organizationId, cohort) => Boolean(cohort) && cohortInScope(decide(actor, organizationId, 'cohorts.read'), cohort)

  async function checkCohortRefs(organizationId, input) {
    const refs = await store().listStructure(organizationId)
    const has = (list, id) => !id || list.some((x) => x.id === id)
    if (!has(refs.campuses, input.campusId) || !has(refs.departments, input.departmentId) || !has(refs.academicPrograms, input.academicProgramId) || !has(refs.batches, input.batchId)) {
      throw new ApiError('VALIDATION_FAILED', 'That refers to something that does not exist in this organization.')
    }
    if (input.ownerUserId) {
      const staff = (await store().listOrgMemberships(organizationId)).some((m) => m.userId === input.ownerUserId && m.status === 'ACTIVE' && m.role !== 'STUDENT')
      if (!staff) throw new ApiError('VALIDATION_FAILED', 'The cohort owner must be an active team member.')
    }
  }

  // Import jobs are readable/committable by their uploader or by ALL-scope managers.
  async function importJobFor(actor, organizationId, decision, jobId) {
    const job = await store().getImportJob(jobId)
    if (!job || job.organizationId !== organizationId) throw new ApiError('NOT_FOUND', 'Not found')
    if (job.uploadedBy !== actor.userId && decision.scope !== 'ALL') throw new ApiError('NOT_FOUND', 'Not found')
    return job
  }

  async function orgAudit(req, organizationId, action, targetType, targetId, details = {}) {
    await store().appendOrgAudit({ organizationId, actorUserId: req.user.id, action, targetType, targetId, details, requestId: req.requestId || null })
    audit(`campus.${action}`, null, { organizationId, targetType, targetId: targetId == null ? null : String(targetId), requestId: req.requestId || null })
  }

  async function getOrg(organizationId) {
    const org = await repos.organizations.getOrganization(organizationId)
    if (!org || org.status !== 'ACTIVE') throw new ApiError('NOT_FOUND', 'Not found')
    return org
  }

  async function cohortOf(organizationId, cohortId) {
    const c = cohortId ? await repos.organizations.getCohort(cohortId) : null
    if (!c || c.organizationId !== organizationId) throw new ApiError('NOT_FOUND', 'Not found')
    return c
  }

  async function userCard(userId) {
    const u = users ? await users.findById(userId).catch(() => null) : null
    return { id: userId, name: u?.name || null, email: u?.email || null }
  }
  // Batched user-directory lookup (PROD-READY Phase 6): one directory read
  // for a whole list instead of one per row. A directory without a batch
  // method (test doubles) is read per id, a bounded number at a time.
  // Map id → { id, name, email }; unknown ids get null name and email.
  async function userCards(ids) {
    const list = [...new Set((ids || []).filter((x) => x != null).map(String))]
    const out = new Map()
    if (!list.length) return out
    let found = new Map()
    if (users && typeof users.findManyByIds === 'function') {
      found = await users.findManyByIds(list).catch(() => new Map())
    } else if (users) {
      for (let i = 0; i < list.length; i += 25) {
        const chunk = list.slice(i, i + 25)
        const rows = await Promise.all(chunk.map((id) => users.findById(id).catch(() => null)))
        chunk.forEach((id, k) => { if (rows[k]) found.set(id, rows[k]) })
      }
    }
    for (const id of list) {
      const u = found.get(id)
      out.set(id, { id, name: u?.name || null, email: u?.email || null })
    }
    return out
  }
  async function usersByEmail(emails) {
    const list = [...new Set((emails || []).filter(Boolean).map((e) => String(e).trim().toLowerCase()))]
    const out = new Map()
    if (!list.length || !users) return out
    if (typeof users.findManyByEmails === 'function') return users.findManyByEmails(list).catch(() => out)
    for (const email of list) {
      const u = await users.findByEmail(email).catch(() => null)
      if (u) out.set(email, u)
    }
    return out
  }
  // Directory order for both the SQL and in-process paths: name (or email)
  // compared lower-cased by code unit, then exact, members before invites,
  // then id — deterministic, so pages never overlap.
  const sortKey = (r) => String(r.name || r.email)
  const directoryOrder = (a, b) => {
    const ka = sortKey(a)
    const kb = sortKey(b)
    const la = ka.toLowerCase()
    const lb = kb.toLowerCase()
    if (la !== lb) return la < lb ? -1 : 1
    if (ka !== kb) return ka < kb ? -1 : 1
    if (a.kind !== b.kind) return a.kind === 'MEMBER' ? -1 : 1
    const ia = String(a.userId || a.inviteId)
    const ib = String(b.userId || b.inviteId)
    return ia < ib ? -1 : ia > ib ? 1 : 0
  }
  const sqlDirectory = () => Boolean(users?.inDatabase) && typeof store().queryStudentDirectory === 'function'
  const scopeModeOf = (decision) => {
    if (decision.scope === 'ALL' || decision.scope === 'LIMITED') return 'FULL'
    if (decision.scope === 'ASSIGNED' || decision.scope === 'DEPARTMENT') return decision.scope
    return 'NONE'
  }
  const pendingInvites = async (organizationId, filter = {}) => (typeof store().listPendingInvites === 'function'
    ? store().listPendingInvites(organizationId, { now: clock().toISOString(), ...filter })
    : (await store().listOrgInvites(organizationId)).filter((i) => i.status === 'PENDING' && new Date(i.expiresAt) > clock()
      && (!filter.role || i.role === filter.role) && (!filter.notRole || i.role !== filter.notRole) && (!filter.cohortId || i.cohortId === filter.cohortId)))

  // Students (ACTIVE memberships + pending invites) visible to `decision`.
  async function visibleStudents(organizationId, decision) {
    const [memberships, cohortRows, cohorts, invitesAll] = await Promise.all([
      store().listOrgMemberships(organizationId),
      store().listCohortMembershipsForOrg(organizationId),
      store().listCohorts(organizationId),
      pendingInvites(organizationId, { role: 'STUDENT' }),
    ])
    const cohortById = new Map(cohorts.map((c) => [c.id, c]))
    const cohortRank = new Map(cohorts.map((c, i) => [c.id, i]))
    const cohortsOf = new Map()
    for (const r of cohortRows) {
      const c = cohortById.get(r.cohortId)
      if (!c) continue
      if (!cohortsOf.has(r.userId)) cohortsOf.set(r.userId, [])
      cohortsOf.get(r.userId).push(c)
    }
    // A student's cohorts in the organization's cohort order (created, id).
    for (const list of cohortsOf.values()) list.sort((a, b) => cohortRank.get(a.id) - cohortRank.get(b.id))
    const full = decision.scope === 'ALL' || decision.scope === 'LIMITED'
    const students = memberships.filter((m) => m.role === 'STUDENT' && ['ACTIVE', 'SUSPENDED'].includes(m.status))
      .map((m) => ({ membership: m, userId: m.userId, cohorts: cohortsOf.get(m.userId) || [] }))
      .filter((s) => full || s.cohorts.some((c) => cohortInScope(decision, c)))
    const at = clock()
    const pending = invitesAll.filter((i) => i.role === 'STUDENT' && i.status === 'PENDING' && new Date(i.expiresAt) > at)
      .filter((i) => full || (i.cohortId && cohortInScope(decision, cohortById.get(i.cohortId))))
    return { students, pending, cohorts, cohortById }
  }

  // Roster rows of the organization's assignments in one read (PROD-READY
  // Phase 6), in assignment order then roster order. Stores without the
  // batched read fall back to one read per assignment.
  async function orgRosterRows(organizationId, { userId = null } = {}) {
    if (typeof store().listOrgRosterRows === 'function') return store().listOrgRosterRows(organizationId, { userId })
    const out = []
    for (const a of await store().listOrgAssignments(organizationId)) {
      for (const s of await store().listAssignmentStudents(a.id)) {
        if (userId && s.userId !== userId) continue
        out.push({ assignmentId: a.id, definitionId: a.definitionId, assignmentStatus: a.status, userId: s.userId, status: s.status, sessionId: s.sessionId, startedAt: s.startedAt, completedAt: s.completedAt })
      }
    }
    return out
  }

  async function assignmentStatusByUser(organizationId, { userId = null } = {}) {
    const out = new Map()
    for (const r of await orgRosterRows(organizationId, { userId })) {
      if (r.assignmentStatus === 'CANCELLED' || r.assignmentStatus === 'DRAFT') continue
      if (!out.has(r.userId)) out.set(r.userId, [])
      out.get(r.userId).push({ assignmentId: r.assignmentId, definitionId: r.definitionId, status: r.status, completedAt: r.completedAt })
    }
    return out
  }

  // Live assignments (ACTIVE/SCHEDULED) per target cohort, read once for a
  // batch of roster syncs (an import, a move) instead of per student.
  async function rosterPlan(organizationId, r = repos) {
    const live = (await r.campusAdmin.listOrgAssignments(organizationId)).filter((a) => ['ACTIVE', 'SCHEDULED'].includes(a.status))
    const targets = typeof r.assessments.listTargetsForAssignments === 'function'
      ? await r.assessments.listTargetsForAssignments(live.map((a) => a.id))
      : (await Promise.all(live.map((a) => r.assessments.listTargets(a.id)))).flat()
    const byCohort = new Map()
    const order = new Map(live.map((a, i) => [a.id, i]))
    for (const t of targets) {
      if (t.targetType !== 'COHORT' || !order.has(t.assignmentId)) continue
      if (!byCohort.has(t.targetId)) byCohort.set(t.targetId, [])
      byCohort.get(t.targetId).push(t.assignmentId)
    }
    for (const list of byCohort.values()) list.sort((a, b) => order.get(a) - order.get(b))
    return byCohort
  }

  // Adds the student to every live assignment that targets `cohortId`.
  // `tx` (optional): repositories bound to the caller's open transaction
  // (invite acceptance, PROD-READY Phase 3), so the roster rows commit or
  // roll back with it.
  // `plan` (optional): a rosterPlan() read once for many students.
  async function syncRoster(organizationId, cohortId, userId, tx = null, plan = null) {
    const r = tx || repos
    const byCohort = plan || await rosterPlan(organizationId, r)
    for (const assignmentId of byCohort.get(String(cohortId)) || []) {
      await r.assessments.addStudent({ assignmentId, userId, status: 'ASSIGNED' })
    }
    await onRosterSync(organizationId, cohortId, userId, tx)
  }

  async function notify({ userId, organizationId, kind, payload }) {
    return store().createNotification({ userId, organizationId, kind, payload })
  }

  // Seats reserved by starts that never finished go back to the pool
  // (K69 follow-up, K79): the ledger only releases an OPEN reservation, so a
  // CONSUMED seat is never touched and a second pass releases nothing.
  async function releaseUnfinishedSeats(assignmentId) {
    let released = 0
    if (!ledger || !repos.sessionIo) return released
    for (const s of await store().listAssignmentStudents(assignmentId)) {
      if (s.status === 'COMPLETED' || !s.sessionId) continue
      const start = await repos.sessionIo.getClientEvent(s.sessionId, 'start').catch(() => null)
      const entitlementId = start?.response?.entitlementId
      if (!entitlementId) continue
      const out = await ledger.release({ entitlementId, user: { id: s.userId }, sessionId: s.sessionId }).catch((err) => {
        if (err?.code === 'CONFLICT') return null
        throw err
      })
      if (out && !out.replayed) released += 1
    }
    return released
  }

  function summaryOf(a, counts, targets, cat) {
    // Effective status: windows open and close by time (K77).
    const at = clock()
    let status = a.status
    if (status === 'SCHEDULED' && a.windowStart && new Date(a.windowStart) <= at) status = 'ACTIVE'
    if (status === 'ACTIVE' && a.windowEnd && new Date(a.windowEnd) <= at) status = 'CLOSED'
    return {
      id: a.id, definitionId: a.definitionId, title: cat.definitions.find((d) => d.id === a.definitionId)?.title || null, status,
      windowStart: a.windowStart, windowEnd: a.windowEnd, integrityPolicy: a.integrityPolicy, programId: a.programId || null,
      cohortIds: targets.filter((t) => t.targetType === 'COHORT').map((t) => t.targetId), counts: { ...counts },
    }
  }

  async function runCommit(req, actor, organizationId, decision, job, commitKey) {
    const rows = await store().listImportRows(job.id)
    const outcomes = {}
    const byCohort = new Map()
    const org = await getOrg(organizationId)
    // Re-checked at commit time: scoped uploaders link only students they can see.
    const visible = decision.scope === 'ALL' ? null : new Set((await visibleStudents(organizationId, decision)).students.map((s) => s.userId))
    const invite = (cohort, r) => {
      if (!byCohort.has(cohort.id)) byCohort.set(cohort.id, [])
      byCohort.get(cohort.id).push(r)
    }
    // Read once for the whole file (PROD-READY Phase 6): the organization's
    // cohorts, the accounts behind ALREADY_MEMBER rows and the live
    // assignments per cohort — instead of per row.
    const cohortById = new Map((await store().listCohorts(organizationId)).map((c) => [c.id, c]))
    const existingByEmail = await usersByEmail(rows.filter((r) => r.action === 'ALREADY_MEMBER').map((r) => r.normalized.email))
    let plan = null
    for (const r of rows) {
      if (r.action === 'ERROR') { outcomes[r.rowNumber] = 'SKIPPED'; continue }
      const cohort = cohortById.get(r.normalized.cohortId)
      if (!cohort || cohort.organizationId !== organizationId || cohort.status !== 'ACTIVE' || !cohortInScope(decision, cohort)) { outcomes[r.rowNumber] = 'FAILED'; continue }
      if (r.action === 'ALREADY_MEMBER') {
        // One identity: an existing student is linked to the cohort, never duplicated.
        const existing = existingByEmail.get(String(r.normalized.email).trim().toLowerCase()) || null
        if (existing && (!visible || visible.has(existing.id))) {
          await repos.organizations.addCohortMember({ cohortId: cohort.id, userId: existing.id, addedBy: actor.userId })
          plan ||= await rosterPlan(organizationId)
          await syncRoster(organizationId, cohort.id, existing.id, null, plan)
          outcomes[r.rowNumber] = 'SKIPPED'
        } else invite(cohort, r)
        continue
      }
      invite(cohort, r)
    }
    // Only invites the uploader can reach are replaced; other teams' links stay.
    const before = (await pendingInvites(organizationId, { role: 'STUDENT' }))
      .filter((i) => decision.scope === 'ALL' || (i.cohortId && cohortInScope(decision, cohortById.get(i.cohortId))))
    const revoked = []
    for (const [cohortId, list] of byCohort) {
      const emails = list.map((r) => r.normalized.email)
      try {
        await invites.createInvites({ actor, orgId: organizationId, role: 'STUDENT', emails, cohortId, delivery: queueImportInvites() ? 'QUEUE' : 'SEND' })
        for (const r of list) outcomes[r.rowNumber] = 'INVITED'
        // A re-imported student keeps one working link: the new one.
        for (const old of before.filter((i) => emails.includes(i.email) && !revoked.includes(i.id))) {
          await repos.memberships.updateInvite(old.id, { status: 'REVOKED' })
          revoked.push(old.id)
        }
      } catch {
        for (const r of list) outcomes[r.rowNumber] = 'FAILED'
      }
    }
    const values = Object.values(outcomes)
    const totals = { ...job.totals, invited: values.filter((v) => v === 'INVITED').length, skipped: values.filter((v) => v === 'SKIPPED').length, failed: values.filter((v) => v === 'FAILED').length }
    const out = await store().commitImportJob(job.id, { commitKey, totals, outcomes })
    await orgAudit(req, organizationId, 'import.committed', 'IMPORT_JOB', job.id, { ...totals, replacedInvites: revoked })
    await notify({ userId: actor.userId, organizationId, kind: 'IMPORT_COMPLETE', payload: { jobId: job.id, organizationName: org.name, ...totals } })
    return { job: out.job, replayed: out.replayed }
  }

  return {
    syncRoster,
    rosterPlan,
    // Shared with other campus services (development interventions).
    cohortOf,
    orgAudit,
    cohortInScope,

    // ── Overview (§20): counts only, within the caller's student scope ─────
    async overview(actor, organizationId) {
      await getOrg(organizationId)
      const studentsDecision = decide(actor, organizationId, 'students.read')
      // Roles without student access see organization-level counts only.
      const decision = studentsDecision.allowed ? studentsDecision : { allowed: true, scope: 'NONE' }
      // PROD-READY Phase 6: counted in SQL on PostgreSQL (one statement);
      // the in-process path below is the reference (DB test: equal results).
      if (typeof store().overviewCounts === 'function') {
        const [counts, assignments, programs] = await Promise.all([
          store().overviewCounts(organizationId, { scopeMode: scopeModeOf(decision), scopeCohortIds: decision.cohortIds || [], departmentId: decision.departmentId ?? null, now: clock().toISOString() }),
          store().listOrgAssignments(organizationId),
          store().listPrograms(organizationId),
        ])
        return {
          enrolled: counts.enrolled,
          invited: counts.invited,
          cohorts: counts.cohorts,
          activePrograms: programs.filter((p) => p.status === 'ACTIVE').length,
          activeAssignments: assignments.filter((a) => (a.status === 'ACTIVE' || a.status === 'SCHEDULED') && !(a.windowEnd && new Date(a.windowEnd) <= clock())).length,
          completion: { assigned: counts.assigned, completed: counts.completed },
          missionsActive: null,
          reassessmentsDue: null,
          scope: decision.scope,
        }
      }
      return this.overviewInProcess(organizationId, decision)
    },
    // The reference implementation (memory store, and the DB equivalence test).
    async overviewInProcess(organizationId, decision) {
      const { students, pending, cohorts } = await visibleStudents(organizationId, decision)
      const visibleCohorts = cohorts.filter((c) => c.status === 'ACTIVE' && cohortInScope(decision, c))
      const visibleIds = new Set(students.map((s) => s.userId))
      let assigned = 0
      let completed = 0
      let activeAssignments = 0
      const [assignments, rosterRows] = await Promise.all([store().listOrgAssignments(organizationId), orgRosterRows(organizationId)])
      for (const a of assignments) {
        if ((a.status === 'ACTIVE' || a.status === 'SCHEDULED') && !(a.windowEnd && new Date(a.windowEnd) <= clock())) activeAssignments += 1
      }
      for (const s of rosterRows) {
        if (s.assignmentStatus === 'CANCELLED' || s.assignmentStatus === 'DRAFT' || !visibleIds.has(s.userId)) continue
        assigned += 1
        if (s.status === 'COMPLETED') completed += 1
      }
      const programs = (await store().listPrograms(organizationId)).filter((p) => p.status === 'ACTIVE').length
      return {
        enrolled: students.filter((s) => s.membership.status === 'ACTIVE').length,
        invited: pending.length,
        cohorts: visibleCohorts.length,
        activePrograms: programs,
        activeAssignments,
        completion: { assigned, completed },
        missionsActive: null,
        reassessmentsDue: null,
        scope: decision.scope,
      }
    },

    // ── Students (§21): server pagination + filters; no capability detail ──
    // PROD-READY Phase 6: filtered, sorted and paged in SQL when accounts
    // live in the campus database; otherwise one batched directory read and
    // one roster read, then the same filters and order in process. `all`
    // (export) returns every matching row.
    async listStudents(actor, organizationId, decision, { page = 1, pageSize = 25, q = '', cohortId = null, status = null, assignmentStatus = null, all = false } = {}) {
      await getOrg(organizationId)
      const size = Math.min(100, Math.max(1, pageSize))
      const current = Math.max(1, page)
      if (sqlDirectory()) {
        const out = await store().queryStudentDirectory(organizationId, {
          scopeMode: scopeModeOf(decision), scopeCohortIds: decision.cohortIds || [], departmentId: decision.departmentId ?? null, now: clock().toISOString(),
          q, cohortId: cohortId || null, status: status || null, assessment: assignmentStatus || null,
          offset: all ? 0 : (current - 1) * size, limit: all ? null : size,
        })
        return { items: out.items, total: out.total, page: all ? 1 : current, pageSize: all ? out.total : size }
      }
      const { students, pending, cohortById } = await visibleStudents(organizationId, decision)
      const [statusByUser, cards] = await Promise.all([assignmentStatusByUser(organizationId), userCards(students.map((s) => s.userId))])
      const rows = []
      for (const s of students) {
        const card = cards.get(String(s.userId))
        const assignments = statusByUser.get(s.userId) || []
        const latest = assignments[assignments.length - 1] || null
        rows.push({
          kind: 'MEMBER',
          userId: s.userId,
          name: card.name,
          email: card.email,
          status: s.membership.status,
          cohorts: s.cohorts.map((c) => ({ id: c.id, name: c.name })),
          departmentId: s.cohorts[0]?.departmentId || null,
          assessment: latest ? { status: latest.status, assignmentId: latest.assignmentId } : { status: 'NONE', assignmentId: null },
        })
      }
      for (const i of pending) {
        const c = cohortById.get(i.cohortId)
        rows.push({ kind: 'INVITE', inviteId: i.id, userId: null, name: null, email: i.email, status: 'INVITED', cohorts: c ? [{ id: c.id, name: c.name }] : [], departmentId: c?.departmentId || null, assessment: { status: 'NONE', assignmentId: null } })
      }
      const needle = String(q || '').trim().toLowerCase()
      const filtered = rows.filter((r) => (!needle || [r.name, r.email].some((v) => v && v.toLowerCase().includes(needle)))
        && (!cohortId || r.cohorts.some((c) => c.id === cohortId))
        && (!status || r.status === status)
        && (!assignmentStatus || r.assessment.status === assignmentStatus))
        .sort(directoryOrder)
      if (all) return { items: filtered, total: filtered.length, page: 1, pageSize: filtered.length }
      const start = (current - 1) * size
      return { items: filtered.slice(start, start + size), total: filtered.length, page: current, pageSize: size }
    },

    async exportStudents(req, actor, organizationId, decision, filters = {}) {
      // One read of the whole filtered directory (it was re-read per page).
      const all = (await this.listStudents(actor, organizationId, decision, { ...filters, all: true })).items
      await orgAudit(req, organizationId, 'report.exported', 'STUDENT_DIRECTORY', null, { rows: all.length, fields: ['name', 'email', 'status', 'cohorts', 'assessment_status'] })
      const lines = [['name', 'email', 'status', 'cohorts', 'assessment_status'].join(',')]
      for (const r of all) lines.push([r.name, r.email, r.status, r.cohorts.map((c) => c.name).join('; '), r.assessment.status].map(csvCell).join(','))
      return `${lines.join('\r\n')}\r\n`
    },

    // ── Student detail (§22): sponsored data only ─────────────────────────
    async getStudent(req, actor, organizationId, decision, studentId) {
      await getOrg(organizationId)
      // PROD-READY Phase 6: only this student's membership and cohorts are
      // read for the scope check (the whole visible set was loaded before).
      let s
      if (typeof store().getStudentInOrg === 'function') {
        const found = await store().getStudentInOrg(organizationId, studentId)
        const full = decision.scope === 'ALL' || decision.scope === 'LIMITED'
        s = found && (full || found.cohorts.some((c) => cohortInScope(decision, c))) ? { membership: found.membership, userId: studentId, cohorts: found.cohorts } : null
      } else {
        s = (await visibleStudents(organizationId, decision)).students.find((x) => x.userId === studentId)
      }
      if (!s) throw new ApiError('NOT_FOUND', 'Not found')
      await repos.audit.recordDataAccess({ actorUserId: actor.userId, organizationId, subjectUserId: studentId, resourceType: 'CAMPUS_STUDENT', resourceId: studentId, action: 'READ', purpose: 'STUDENT_DETAIL', requestId: req.requestId || null })
      const card = await userCard(studentId)
      // This student's roster rows only, in one read (PROD-READY Phase 6).
      const rows = await orgRosterRows(organizationId, { userId: studentId })
      const cat = await catalog.getCatalog()
      const assignments = rows.filter((r) => r.assignmentStatus !== 'CANCELLED' && r.assignmentStatus !== 'DRAFT').map((r) => ({
        assignmentId: r.assignmentId, definitionId: r.definitionId, status: r.status, completedAt: r.completedAt,
        title: cat.definitions.find((d) => d.id === r.definitionId)?.title || null,
      }))
      const sessions = rows.filter((r) => r.sessionId && r.status === 'COMPLETED')
        .map((r) => ({ assignmentId: r.assignmentId, sessionId: r.sessionId, reportPath: `/api/v1/organizations/${organizationId}/sessions/${r.sessionId}/report` }))
      const grants = (await repos.sharing.listShareGrantsForOwner(studentId))
        .filter((g) => g.recipientType === 'ORGANIZATION' && g.recipientOrganizationId === organizationId && !g.revokedAt && new Date(g.expiresAt) > clock())
        .map((g) => ({ id: g.id, expiresAt: g.expiresAt, resources: g.resources.map((r) => ({ resourceType: r.resourceType, disclosureLevel: r.disclosureLevel })) }))
      return {
        student: { userId: studentId, name: card.name, email: card.email, status: s.membership.status, joinedAt: s.membership.joinedAt },
        cohorts: s.cohorts.map((c) => ({ id: c.id, name: c.name })),
        assignments,
        completedSponsoredSessions: sessions,
        sharedWithOrganization: grants,
        privacyNote: 'This view contains only data available to this organization. Personal Prism activity is excluded unless explicitly shared.',
      }
    },

    // ── Academic structure + cohorts (§23) ────────────────────────────────
    async structure(organizationId) {
      await getOrg(organizationId)
      return store().listStructure(organizationId)
    },
    async createStructure(req, actor, organizationId, kind, input) {
      await getOrg(organizationId)
      requireDecision(actor, organizationId, 'org.manage')
      const refs = await store().listStructure(organizationId)
      const has = (list, id) => !id || list.some((x) => x.id === id)
      if (!has(refs.campuses, input.campusId) || !has(refs.departments, input.departmentId) || !has(refs.academicPrograms, input.programId)) {
        throw new ApiError('VALIDATION_FAILED', 'That refers to something that does not exist in this organization.')
      }
      const row = await store().createStructure(kind, { ...input, organizationId })
      await orgAudit(req, organizationId, 'structure.created', kind.toUpperCase(), row.id, { name: row.name })
      return row
    },

    async listCohorts(actor, organizationId, decision) {
      await getOrg(organizationId)
      return (await store().listCohorts(organizationId)).filter((c) => cohortInScope(decision, c))
    },
    async createCohort(req, actor, organizationId, input) {
      await getOrg(organizationId)
      const d = requireDecision(actor, organizationId, 'students.manage')
      if (d.scope === 'ASSIGNED') throw new ApiError('FORBIDDEN', 'Your role manages assigned cohorts only; ask a director to create cohorts.')
      if (d.scope === 'DEPARTMENT' && String(input.departmentId || '') !== String(d.departmentId)) throw new ApiError('FORBIDDEN', 'You can create cohorts in your own department only.')
      await checkCohortRefs(organizationId, input)
      const row = await store().createCohort({ ...input, organizationId })
      await orgAudit(req, organizationId, 'cohort.created', 'COHORT', row.id, { name: row.name })
      return row
    },
    // PROD-READY Phase 6: members and pending invitations are paged
    // (`cursor`/`limit` for members, `invitesCursor` for invitations; the same
    // `limit`). Totals and next cursors are additive fields.
    async getCohort(actor, organizationId, decision, cohortId, { cursor = null, invitesCursor = null, limit = null } = {}) {
      const c = await cohortOf(organizationId, cohortId)
      if (!cohortInScope(decision, c)) throw new ApiError('NOT_FOUND', 'Not found')
      const win = adminListWindow({ cursor, limit })
      const inv = adminListWindow({ cursor: invitesCursor, limit })
      let members
      if (typeof store().listCohortMembersPage === 'function') members = await store().listCohortMembersPage(c.id, win)
      else {
        const all = await store().listCohortMembers(c.id)
        members = { rows: all.slice(win.offset, win.offset + win.limit), total: all.length }
      }
      const [cards, pending] = await Promise.all([userCards(members.rows.map((m) => m.userId)), pendingInvites(organizationId, { cohortId: c.id })])
      return {
        cohort: { ...c, memberCount: members.total },
        members: members.rows.map((m) => ({ ...cards.get(String(m.userId)), addedAt: m.addedAt })),
        membersTotal: members.total,
        nextCursor: nextOffsetCursor(win.offset, win.limit, members.total),
        pendingInvites: pending.slice(inv.offset, inv.offset + inv.limit).map((i) => ({ id: i.id, email: i.email, expiresAt: i.expiresAt })),
        pendingInvitesTotal: pending.length,
        nextInvitesCursor: nextOffsetCursor(inv.offset, inv.limit, pending.length),
      }
    },
    async updateCohort(req, actor, organizationId, cohortId, patch) {
      const c = await cohortOf(organizationId, cohortId)
      const d = requireDecision(actor, organizationId, 'students.manage', { cohortId: c.id, departmentId: c.departmentId || null })
      if (d.scope === 'ASSIGNED' && Object.keys(patch).some((k) => !['name', 'semester', 'tags'].includes(k))) {
        throw new ApiError('FORBIDDEN', 'Your role can rename a cohort and edit its semester and tags only.')
      }
      if (d.scope === 'DEPARTMENT' && patch.departmentId !== undefined && String(patch.departmentId || '') !== String(d.departmentId)) {
        throw new ApiError('FORBIDDEN', 'You cannot move a cohort to another department.')
      }
      await checkCohortRefs(organizationId, patch)
      const row = await store().updateCohort(c.id, patch)
      await orgAudit(req, organizationId, patch.status === 'ARCHIVED' ? 'cohort.archived' : 'cohort.updated', 'COHORT', c.id, { fields: Object.keys(patch) })
      return row
    },
    async moveStudents(req, actor, organizationId, { userIds, fromCohortId = null, toCohortId }) {
      const to = await cohortOf(organizationId, toCohortId)
      const d = requireDecision(actor, organizationId, 'students.manage', { cohortId: to.id, departmentId: to.departmentId || null })
      const from = fromCohortId ? await cohortOf(organizationId, fromCohortId) : null
      if (from) requireDecision(actor, organizationId, 'students.manage', { cohortId: from.id, departmentId: from.departmentId || null })
      // Scoped roles move only students they can already see; nobody is pulled
      // into a staff member's reach from outside it.
      const eligible = d.scope === 'ALL'
        ? new Set((await store().listOrgMemberships(organizationId)).filter((m) => m.role === 'STUDENT' && m.status === 'ACTIVE').map((m) => m.userId))
        : new Set((await visibleStudents(organizationId, decide(actor, organizationId, 'students.manage'))).students.filter((s) => s.membership.status === 'ACTIVE').map((s) => s.userId))
      const moved = []
      const plan = await rosterPlan(organizationId)
      for (const userId of [...new Set(userIds)]) {
        if (!eligible.has(userId)) continue
        if (from) await store().removeCohortMember(from.id, userId)
        await repos.organizations.addCohortMember({ cohortId: to.id, userId, addedBy: actor.userId })
        await syncRoster(organizationId, to.id, userId, null, plan)
        moved.push(userId)
      }
      await orgAudit(req, organizationId, 'cohort.members_moved', 'COHORT', to.id, { count: moved.length, fromCohortId: from?.id || null })
      return { moved: moved.length }
    },
    async removeFromCohort(req, actor, organizationId, cohortId, userId) {
      const c = await cohortOf(organizationId, cohortId)
      requireDecision(actor, organizationId, 'students.manage', { cohortId: c.id, departmentId: c.departmentId || null })
      const out = await store().removeCohortMember(c.id, userId)
      if (!out) throw new ApiError('NOT_FOUND', 'Not found')
      await orgAudit(req, organizationId, 'cohort.member_removed', 'COHORT', c.id, {})
      return { removed: true }
    },

    // ── CSV import (§23): preview → commit; existing accounts linked ───────
    async previewImport(req, actor, organizationId, decision, { fileName = null, csv, defaultCohortId = null }) {
      await getOrg(organizationId)
      if (typeof csv !== 'string' || !csv.trim()) throw new ApiError('VALIDATION_FAILED', 'Choose a CSV file with a header row and at least one student.')
      if (Buffer.byteLength(csv, 'utf8') > IMPORT_LIMITS.maxBytes) throw new ApiError('VALIDATION_FAILED', 'This file is larger than 1 MB. Split it into smaller files.')
      const cohorts = (await store().listCohorts(organizationId)).filter((c) => c.status === 'ACTIVE' && cohortInScope(decision, c))
      const defaultCohort = defaultCohortId ? cohorts.find((c) => c.id === defaultCohortId) || null : null
      if (defaultCohortId && !defaultCohort) throw new ApiError('NOT_FOUND', 'Not found')
      // Scoped uploaders only learn about (and link) students they can already
      // see; anyone else is invited and must accept with the disclosure.
      const known = decision.scope === 'ALL'
        ? (await store().listOrgMemberships(organizationId)).filter((x) => x.role === 'STUDENT' && x.status === 'ACTIVE').map((m) => m.userId)
        : (await visibleStudents(organizationId, decision)).students.filter((s) => s.membership.status === 'ACTIVE').map((s) => s.userId)
      const memberEmails = new Set()
      for (const card of (await userCards(known)).values()) if (card.email) memberEmails.add(card.email.toLowerCase())
      const pendingEmails = new Set((decision.scope === 'ALL'
        ? await pendingInvites(organizationId, { role: 'STUDENT' })
        : (await visibleStudents(organizationId, decision)).pending).map((i) => i.email))
      const result = validateImport(csvRosterAdapter.readRows(csv), { cohortsByName: new Map(cohorts.map((c) => [c.name.toLowerCase(), c])), defaultCohort, memberEmails, pendingEmails })
      if (result.error) {
        const messages = { EMPTY_FILE: 'This file has no rows.', MISSING_EMAIL_COLUMN: 'The file needs an "email" column.', TOO_MANY_ROWS: `Import up to ${IMPORT_LIMITS.maxRows} students at a time.` }
        throw new ApiError('VALIDATION_FAILED', messages[result.error], { details: { reason: result.error } })
      }
      const job = await store().createImportJob({ organizationId, uploadedBy: actor.userId, fileName: fileName ? String(fileName).slice(0, 200) : null, totals: result.totals, rows: result.rows })
      await orgAudit(req, organizationId, 'import.previewed', 'IMPORT_JOB', job.id, result.totals)
      return { job, rows: result.rows }
    },
    // An import has at most IMPORT_LIMITS.maxRows rows, so by default every
    // row is returned as before; `cursor`/`limit` page them (PROD-READY Phase 6).
    async getImport(actor, organizationId, decision, jobId, { cursor = null, limit = null } = {}) {
      const job = await importJobFor(actor, organizationId, decision, jobId)
      const offset = offsetFromCursor(cursor)
      const size = Math.min(IMPORT_LIMITS.maxRows, Math.max(1, Number(limit) || IMPORT_LIMITS.maxRows))
      const page = typeof store().listImportRowsPage === 'function'
        ? await store().listImportRowsPage(jobId, { offset, limit: size })
        : await store().listImportRows(jobId).then((all) => ({ rows: all.slice(offset, offset + size), total: all.length }))
      return { job, rows: page.rows, rowsTotal: page.total, nextCursor: nextOffsetCursor(offset, size, page.total) }
    },
    async commitImport(req, actor, organizationId, decision, jobId, commitKey) {
      if (!commitKey) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key is required.')
      const job = await importJobFor(actor, organizationId, decision, jobId)
      if (job.status === 'COMMITTED') {
        if (job.commitKey === commitKey) return { job, replayed: true }
        throw new ApiError('CONFLICT', 'This import has already been committed.')
      }
      const claim = await store().claimImportCommit(jobId, commitKey)
      if (!claim?.claimed) {
        if (claim?.inFlight) throw new ApiError('CONFLICT', 'This import is already being committed. Refresh in a moment.')
        throw new ApiError('CONFLICT', 'This import can no longer be committed.')
      }
      try {
        return await runCommit(req, actor, organizationId, decision, job, commitKey)
      } catch (err) {
        // A failed commit frees its claim so the same key can be retried.
        await store().releaseImportClaim(jobId, commitKey).catch(() => null)
        throw err
      }
    },

    // ── Programs (§24) ────────────────────────────────────────────────────
    async listPrograms(actor, organizationId, decision) {
      await getOrg(organizationId)
      const programs = await store().listPrograms(organizationId)
      if (decision.scope === 'ALL' || decision.scope === 'LIMITED') return programs
      const cohorts = await store().listCohorts(organizationId)
      const out = []
      for (const p of programs) {
        const ids = await store().listProgramCohorts(p.id)
        if (ids.some((id) => cohortInScope(decision, cohorts.find((c) => c.id === id)))) out.push(p)
      }
      return out
    },
    async createProgram(req, actor, organizationId, input) {
      await getOrg(organizationId)
      const d = requireDecision(actor, organizationId, 'programs.write')
      const cohorts = await store().listCohorts(organizationId)
      for (const id of input.cohortIds || []) {
        const c = cohorts.find((x) => x.id === id)
        if (!c) throw new ApiError('VALIDATION_FAILED', 'Unknown cohort.')
        if (d.scope === 'LIMITED' && !cohortInScope(decide(actor, organizationId, 'cohorts.read'), c)) throw new ApiError('FORBIDDEN', 'You can add cohorts from your own department only.')
      }
      const program = await store().createProgram({
        organizationId, name: input.name, description: input.description || null, status: input.status || 'DRAFT',
        startsOn: input.startsOn || null, endsOn: input.endsOn || null,
        reportingPolicy: input.reportingPolicy || { shareSponsoredReports: true, aggregateOnly: false },
        sponsorshipScope: input.sponsorshipScope || { assessments: true, development: false, reassessment: false },
        createdBy: actor.userId,
      })
      await store().setProgramCohorts(program.id, input.cohortIds || [])
      await orgAudit(req, organizationId, 'program.created', 'PROGRAM', program.id, { name: program.name, cohorts: (input.cohortIds || []).length })
      return { ...program, cohortIds: input.cohortIds || [] }
    },
    async getProgram(actor, organizationId, decision, programId) {
      const p = await store().getProgram(programId)
      if (!p || p.organizationId !== organizationId) throw new ApiError('NOT_FOUND', 'Not found')
      const cohortIds = await store().listProgramCohorts(p.id)
      const cohorts = (await store().listCohorts(organizationId)).filter((c) => cohortIds.includes(c.id))
      if (!(decision.scope === 'ALL' || decision.scope === 'LIMITED') && !cohorts.some((c) => cohortInScope(decision, c))) throw new ApiError('NOT_FOUND', 'Not found')
      const assignmentIds = await store().listProgramAssignments(p.id)
      const assignments = (await store().listOrgAssignments(organizationId)).filter((a) => assignmentIds.includes(a.id))
      return { program: p, cohorts: cohorts.map((c) => ({ id: c.id, name: c.name, memberCount: c.memberCount })), assignments: await this.assignmentSummaries(assignments) }
    },
    async updateProgram(req, actor, organizationId, programId, patch) {
      const d = requireDecision(actor, organizationId, 'programs.write')
      const p = await store().getProgram(programId)
      if (!p || p.organizationId !== organizationId) throw new ApiError('NOT_FOUND', 'Not found')
      const cohorts = await store().listCohorts(organizationId)
      if (d.scope === 'LIMITED') {
        // Coordinators edit only programs whose cohorts are all within their reach.
        const current = (await store().listProgramCohorts(p.id)).map((id) => cohorts.find((c) => c.id === id))
        if (!current.length || current.some((c) => !inReach(actor, organizationId, c))) throw new ApiError('NOT_FOUND', 'Not found')
      }
      const { cohortIds, ...fields } = patch
      if (cohortIds) {
        for (const id of cohortIds) {
          const c = cohorts.find((x) => x.id === id)
          if (!c) throw new ApiError('VALIDATION_FAILED', 'Unknown cohort.')
          if (d.scope === 'LIMITED' && !inReach(actor, organizationId, c)) throw new ApiError('FORBIDDEN', 'You can add cohorts from your own department only.')
        }
      }
      const row = await store().updateProgram(p.id, fields)
      if (cohortIds) await store().setProgramCohorts(p.id, cohortIds)
      await orgAudit(req, organizationId, 'program.updated', 'PROGRAM', p.id, { fields: Object.keys(patch) })
      return row
    },

    // ── Assessment assignments (§25) ──────────────────────────────────────
    async catalogForAssignment() {
      const cat = await catalog.ensureSeeded()
      return cat.definitions.filter((d) => APPROVED_DEFINITION_STATUSES.has(d.status)).map((d) => ({
        id: d.id, title: d.title, description: d.description, durationMinutes: d.durationMinutes, measures: d.measures, notMeasured: d.notMeasured,
        integrityModes: d.integrityModes, formPolicy: d.formPolicy,
      }))
    },
    consentPreview: consentPreviewFor,
    async assignmentSummary(a) {
      return (await this.assignmentSummaries([a]))[0]
    },
    // Summaries of many assignments with one count query and one target
    // query (PROD-READY Phase 6) instead of loading every roster.
    async assignmentSummaries(list) {
      if (!list.length) return []
      const ids = list.map((a) => a.id)
      const [countsById, targets, cat] = await Promise.all([
        typeof store().countAssignmentRoster === 'function'
          ? store().countAssignmentRoster(ids)
          : Promise.all(list.map(async (a) => {
            const roster = await store().listAssignmentStudents(a.id)
            const c = { total: roster.length }
            for (const s of roster) c[s.status] = (c[s.status] || 0) + 1
            return [a.id, c]
          })).then((pairs) => new Map(pairs)),
        typeof repos.assessments.listTargetsForAssignments === 'function'
          ? repos.assessments.listTargetsForAssignments(ids)
          : Promise.all(list.map((a) => repos.assessments.listTargets(a.id))).then((x) => x.flat()),
        catalog.getCatalog(),
      ])
      return list.map((a) => summaryOf(a, countsById.get(a.id) || { total: 0 }, targets.filter((t) => t.assignmentId === a.id), cat))
    },
    async listAssignments(actor, organizationId, decision) {
      await getOrg(organizationId)
      const [cohorts, assignments] = await Promise.all([store().listCohorts(organizationId), store().listOrgAssignments(organizationId)])
      const byId = new Map(cohorts.map((c) => [c.id, c]))
      return (await this.assignmentSummaries(assignments))
        .filter((summary) => decision.scope === 'ALL' || decision.scope === 'LIMITED' || summary.cohortIds.some((id) => cohortInScope(decision, byId.get(id))))
    },
    async createAssignment(req, actor, organizationId, input) {
      const org = await getOrg(organizationId)
      const d = requireDecision(actor, organizationId, 'assignments.write')
      const approved = await this.catalogForAssignment()
      const def = approved.find((x) => x.id === input.definitionId)
      if (!def) throw new ApiError('VALIDATION_FAILED', 'Choose an approved assessment.')
      if (input.integrityPolicy && !def.integrityModes.includes(input.integrityPolicy)) throw new ApiError('VALIDATION_FAILED', 'That integrity mode is not available for this assessment.')
      const windowStart = new Date(input.windowStart)
      const windowEnd = new Date(input.windowEnd)
      if (!(windowEnd > windowStart)) throw new ApiError('VALIDATION_FAILED', 'The window must end after it starts.')
      const cohorts = []
      for (const id of [...new Set(input.cohortIds || [])]) {
        const c = await cohortOf(organizationId, id).catch(() => null)
        if (!c || c.status !== 'ACTIVE') throw new ApiError('VALIDATION_FAILED', 'Unknown cohort.')
        if (d.scope === 'LIMITED' && !cohortInScope(decide(actor, organizationId, 'cohorts.read'), c)) throw new ApiError('FORBIDDEN', 'You can assign cohorts from your own department only.')
        cohorts.push(c)
      }
      if (!cohorts.length) throw new ApiError('VALIDATION_FAILED', 'Choose at least one cohort.')
      let programId = null
      if (input.programId) {
        const p = await store().getProgram(input.programId)
        if (!p || p.organizationId !== organizationId) throw new ApiError('VALIDATION_FAILED', 'Unknown program.')
        if (d.scope === 'LIMITED') {
          const all = await store().listCohorts(organizationId)
          const programCohorts = (await store().listProgramCohorts(p.id)).map((id) => all.find((c) => c.id === id))
          if (!programCohorts.length || programCohorts.some((c) => !inReach(actor, organizationId, c))) throw new ApiError('FORBIDDEN', 'You can add assessments only to programs of your own department.')
        }
        programId = p.id
      }
      const cat = await catalog.getCatalog()
      const form = def.formPolicy === 'FIXED_FORM' ? cat.forms.find((f) => f.definitionId === def.id && f.status === 'FROZEN') : null
      assertContentAssignable(form?.id, registry)
      const status = windowStart > clock() ? 'SCHEDULED' : 'ACTIVE'
      const a = await repos.assessments.createAssignment({
        id: randomUUID(), definitionId: def.id, formPolicy: def.formPolicy, formId: form?.id || null, sponsorType: 'INSTITUTION', organizationId, programId,
        windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString(), integrityPolicy: input.integrityPolicy || 'STANDARD',
        accommodationsPolicy: { requestable: input.accommodationsRequestable !== false, extraTimeAllowed: Boolean(input.extraTimeAllowed) },
        reminderPolicy: { enabled: Boolean(input.reminders), daysBeforeDue: input.reminders ? 2 : null, participation: ['COMPULSORY', 'VOLUNTARY'].includes(input.participation) ? input.participation : 'UNKNOWN', incentive: typeof input.incentive === 'string' && input.incentive.trim() ? input.incentive.trim().slice(0, 200) : null },
        createdBy: actor.userId, status, targets: cohorts.map((c) => ({ targetType: 'COHORT', targetId: c.id })),
      })
      if (programId) await store().linkProgramAssignment(programId, a.id)
      let rostered = 0
      {
        const url = appUrl ? `${appUrl}/app/campus/${organizationId}/assignments` : null
        const notified = new Set()
        const memberLists = []
        for (const c of cohorts) memberLists.push(await store().listCohortMembers(c.id))
        const cards = url ? await userCards(memberLists.flat().map((m) => m.userId)) : new Map()
        for (const members of memberLists) {
          for (const m of members) {
            if (notified.has(m.userId)) continue
            await repos.assessments.addStudent({ assignmentId: a.id, userId: m.userId, status: 'ASSIGNED' })
            notified.add(m.userId)
            rostered += 1
            await notify({ userId: m.userId, organizationId, kind: 'ASSIGNMENT_LAUNCHED', payload: { assignmentId: a.id, title: def.title, organizationName: org.name, windowEnd: a.windowEnd } })
            const card = cards.get(String(m.userId))
            if (card?.email && url) await sendAssignmentEmail({ to: card.email, organizationName: org.name, assessmentTitle: def.title, dueAt: a.windowEnd, url }).catch(() => false)
          }
        }
      }
      await orgAudit(req, organizationId, 'assignment.launched', 'ASSIGNMENT', a.id, { definitionId: def.id, status, cohorts: cohorts.length, rostered })
      return { ...(await this.assignmentSummary(a)), rostered }
    },
    // PROD-READY Phase 6: the roster is paged (`cursor`, `limit`; roster
    // order). `statusCounts` and `total` cover every student the caller can
    // see, so completion figures no longer depend on the page.
    async assignmentCompletion(actor, organizationId, decision, assignmentId, { cursor = null, limit = null } = {}) {
      const a = await repos.assessments.getAssignment(assignmentId)
      if (!a || a.organizationId !== organizationId || a.sponsorType !== 'INSTITUTION') throw new ApiError('NOT_FOUND', 'Not found')
      const win = adminListWindow({ cursor, limit })
      const summary = await this.assignmentSummary(a)
      const cohorts = await store().listCohorts(organizationId)
      const full = decision.scope === 'ALL' || decision.scope === 'LIMITED'
      if (!full && !summary.cohortIds.some((id) => cohortInScope(decision, cohorts.find((c) => c.id === id)))) throw new ApiError('NOT_FOUND', 'Not found')
      const visible = full ? null : (await visibleStudents(organizationId, decision)).students.map((s) => s.userId)
      let page
      if (typeof store().listAssignmentStudentsPage === 'function') page = await store().listAssignmentStudentsPage(a.id, { userIds: visible, ...win })
      else {
        const allowed = visible ? new Set(visible) : null
        const all = (await store().listAssignmentStudents(a.id)).filter((s) => !allowed || allowed.has(s.userId))
        const counts = {}
        for (const s of all) counts[s.status] = (counts[s.status] || 0) + 1
        page = { rows: all.slice(win.offset, win.offset + win.limit), total: all.length, counts }
      }
      const cards = await userCards(page.rows.map((s) => s.userId))
      const students = page.rows.map((s) => {
        const card = cards.get(String(s.userId))
        return { userId: s.userId, name: card.name, email: card.email, status: s.status, startedAt: s.startedAt, completedAt: s.completedAt, reportAvailable: s.status === 'COMPLETED' && Boolean(s.sessionId), sessionId: s.status === 'COMPLETED' ? s.sessionId : null }
      })
      return { assignment: summary, students, total: page.total, statusCounts: page.counts, nextCursor: nextOffsetCursor(win.offset, win.limit, page.total) }
    },
    async closeAssignment(req, actor, organizationId, assignmentId, status) {
      const d = requireDecision(actor, organizationId, 'assignments.write')
      const a = await repos.assessments.getAssignment(assignmentId)
      if (!a || a.organizationId !== organizationId || a.sponsorType !== 'INSTITUTION') throw new ApiError('NOT_FOUND', 'Not found')
      if (d.scope === 'LIMITED') {
        const cohorts = await store().listCohorts(organizationId)
        const targets = (await repos.assessments.listTargets(a.id)).filter((t) => t.targetType === 'COHORT')
        if (!targets.length || targets.some((t) => !inReach(actor, organizationId, cohorts.find((c) => c.id === t.targetId)))) throw new ApiError('NOT_FOUND', 'Not found')
      }
      if (!['CLOSED', 'CANCELLED'].includes(status)) throw new ApiError('VALIDATION_FAILED', 'Choose close or cancel.')
      const row = await store().setAssignmentStatus(a.id, status)
      const released = await releaseUnfinishedSeats(a.id)
      await orgAudit(req, organizationId, `assignment.${status.toLowerCase()}`, 'ASSIGNMENT', a.id, { seatsReleased: released })
      return row
    },
    // Completion notifications (§43) once 50% / 100% of the roster finished.
    async checkCompletionThresholds(organizationId, assignmentId) {
      const a = await repos.assessments.getAssignment(assignmentId)
      if (!a) return
      const roster = await store().listAssignmentStudents(a.id)
      if (!roster.length) return
      const pct = Math.floor((roster.filter((s) => s.status === 'COMPLETED').length / roster.length) * 100)
      const reached = COMPLETION_THRESHOLDS.filter((t) => pct >= t)
      if (!reached.length) return
      const already = (await store().listNotifications(a.createdBy, { limit: 200 })).filter((n) => n.kind === 'COMPLETION_THRESHOLD' && n.payload?.assignmentId === a.id).map((n) => n.payload.threshold)
      for (const t of reached.filter((x) => !already.includes(x))) await notify({ userId: a.createdBy, organizationId, kind: 'COMPLETION_THRESHOLD', payload: { assignmentId: a.id, threshold: t } })
    },

    // ── Background jobs (PROD-READY Phase 5; called by the job handlers) ──
    // Reminder scan (K80): for each live institution assignment whose policy
    // enables reminders and whose window ends within `daysBeforeDue`, one
    // reminder job per student who has not finished. The dedupe key
    // (assignment, student, window end) sends a reminder once per recipient
    // per window; moving the window end allows one more.
    async scanReminders({ enqueue }) {
      const now = clock()
      const due = await store().listInstitutionAssignmentsEndingBetween({
        after: now.toISOString(), before: new Date(now.getTime() + REMINDER_MAX_DAYS_BEFORE_DUE * DAY_MS).toISOString(), statuses: ['ACTIVE', 'SCHEDULED'],
      })
      let assignments = 0
      let enqueued = 0
      for (const a of due) {
        if (!a.reminderPolicy?.enabled) continue
        if (a.windowStart && new Date(a.windowStart) > now) continue
        if (new Date(a.windowEnd).getTime() - reminderDaysBeforeDue(a.reminderPolicy) * DAY_MS > now.getTime()) continue
        assignments += 1
        for (const s of await store().listAssignmentStudents(a.id)) {
          if (REMINDER_SKIP_STATUSES.has(s.status)) continue
          const out = await enqueue({ kind: 'campus.assignment_reminder', payload: { assignmentId: a.id, userId: s.userId }, dedupeKey: `${a.id}:${s.userId}:${a.windowEnd}` })
          if (out.created) enqueued += 1
        }
      }
      return { assignments, enqueued }
    },
    // One reminder (idempotent re-checks): still live, window still open,
    // the student is still an active member and has not finished.
    async sendAssignmentReminder({ assignmentId, userId }) {
      const now = clock()
      const a = await repos.assessments.getAssignment(assignmentId)
      if (!a || a.sponsorType !== 'INSTITUTION') return { outcome: 'GONE' }
      if (!['ACTIVE', 'SCHEDULED'].includes(a.status)) return { outcome: 'NOT_LIVE' }
      if (!a.windowEnd || new Date(a.windowEnd) <= now) return { outcome: 'WINDOW_PASSED' }
      const s = (await store().listAssignmentStudents(a.id)).find((x) => x.userId === userId)
      if (!s || REMINDER_SKIP_STATUSES.has(s.status)) return { outcome: 'NOT_DUE' }
      const member = (await store().listOrgMemberships(a.organizationId)).some((m) => m.userId === userId && m.role === 'STUDENT' && m.status === 'ACTIVE')
      if (!member) return { outcome: 'NOT_MEMBER' }
      const org = await repos.organizations.getOrganization(a.organizationId)
      if (!org || org.status !== 'ACTIVE') return { outcome: 'ORGANIZATION_INACTIVE' }
      const card = await userCard(userId)
      if (!card.email || !appUrl) return { outcome: 'NOT_SENT' }
      const title = (await catalog.getCatalog()).definitions.find((d) => d.id === a.definitionId)?.title || null
      const sent = await sendReminderEmail({ to: card.email, organizationName: org.name, assessmentTitle: title, dueAt: a.windowEnd, url: `${appUrl}/app/campus/${a.organizationId}/assignments` })
      return { outcome: sent ? 'SENT' : 'NOT_SENT' }
    },
    // Seat-release scan (K69/K79): one release job per live institution
    // assignment whose window ended more than the grace period ago.
    async scanSeatReleases({ enqueue }) {
      const now = clock().getTime()
      const ended = await store().listInstitutionAssignmentsEndingBetween({
        after: new Date(now - SEAT_RELEASE_LOOKBACK_DAYS * DAY_MS).toISOString(), before: new Date(now - SEAT_RELEASE_GRACE_HOURS * HOUR_MS).toISOString(), statuses: ['ACTIVE', 'SCHEDULED'],
      })
      let enqueued = 0
      for (const a of ended) {
        const out = await enqueue({ kind: 'campus.seat_release', payload: { assignmentId: a.id }, dedupeKey: `${a.id}:${a.windowEnd}` })
        if (out.created) enqueued += 1
      }
      return { assignments: ended.length, enqueued }
    },
    // Releases RESERVED seats of unfinished starts once the window passed
    // (+ grace); never touches a CONSUMED seat; billing is unaffected. The
    // assignment status is not changed (closing stays an admin action).
    async releaseWindowSeats({ assignmentId }) {
      const a = await repos.assessments.getAssignment(assignmentId)
      if (!a || a.sponsorType !== 'INSTITUTION') return { outcome: 'GONE', released: 0 }
      if (!['ACTIVE', 'SCHEDULED'].includes(a.status)) return { outcome: 'NOT_LIVE', released: 0 }
      if (!a.windowEnd || new Date(a.windowEnd).getTime() + SEAT_RELEASE_GRACE_HOURS * HOUR_MS > clock().getTime()) return { outcome: 'NOT_DUE', released: 0 }
      const released = await releaseUnfinishedSeats(a.id)
      if (released) {
        await store().appendOrgAudit({ organizationId: a.organizationId, actorUserId: SYSTEM_ACTOR, action: 'assignment.seats_released', targetType: 'ASSIGNMENT', targetId: a.id, details: { seatsReleased: released, reason: 'WINDOW_PASSED' }, requestId: null })
      }
      return { outcome: 'RELEASED', released }
    },

    // ── Team (§29) ────────────────────────────────────────────────────────
    // PROD-READY Phase 6: one directory read for the page of members
    // (`cursor`/`limit`; `total` and `nextCursor` are additive).
    async listMembers(actor, organizationId, { cursor = null, limit = null } = {}) {
      await getOrg(organizationId)
      const win = adminListWindow({ cursor, limit })
      const all = typeof store().listStaffMemberships === 'function'
        ? await store().listStaffMemberships(organizationId)
        : (await store().listOrgMemberships(organizationId)).filter((m) => m.role !== 'STUDENT' && m.status !== 'REMOVED')
      const rows = all.slice(win.offset, win.offset + win.limit)
      const cards = await userCards(rows.map((m) => m.userId))
      const out = rows.map((m) => ({ membershipId: m.id, ...cards.get(String(m.userId)), role: m.role, status: m.status, departmentId: m.departmentId, cohortIds: m.scope?.cohortIds || [], joinedAt: m.joinedAt, isSelf: m.userId === actor.userId }))
      const pending = await pendingInvites(organizationId, { notRole: 'STUDENT' })
      const team = decide(actor, organizationId, 'team.manage')
      return {
        members: out,
        total: all.length,
        nextCursor: nextOffsetCursor(win.offset, win.limit, all.length),
        pendingInvites: pending.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt })),
        // UI visibility only; every change is re-checked on the server.
        viewer: { canInvite: team.allowed, canManageRoles: team.allowed && team.scope === 'ALL' },
      }
    },
    async changeRole(req, actor, organizationId, membershipId, role) {
      const d = requireDecision(actor, organizationId, 'team.manage')
      requireFullScope(d, 'Your role cannot change team roles.')
      if (!STAFF_ROLES.includes(role)) throw new ApiError('VALIDATION_FAILED', 'Choose a staff role.')
      const m = await store().getMembership(membershipId)
      if (!m || m.organizationId !== organizationId || m.role === 'STUDENT' || m.status === 'REMOVED') throw new ApiError('NOT_FOUND', 'Not found')
      if (m.userId === actor.userId) throw new ApiError('FORBIDDEN', 'You cannot change your own role.')
      const actorIsOwner = actor.memberships.some((x) => x.organizationId === organizationId && x.status === 'ACTIVE' && x.role === 'ORG_OWNER')
      if ((role === 'ORG_OWNER' || m.role === 'ORG_OWNER') && !actorIsOwner) throw new ApiError('FORBIDDEN', 'Only an organization owner can grant or remove owner access.')
      if (m.role === role) return { membershipId: m.id, role }
      // PROD-READY Phase 3: the old role's removal, the new role, the org
      // audit row and the notification commit together or not at all. The
      // membership is re-read under the transaction, so a concurrent change
      // or removal is not applied twice.
      const next = await inTransaction(async (tx) => {
        await tx.campusAdmin.lockOrganization(organizationId)
        const current = await tx.campusAdmin.getMembership(m.id)
        if (!current || current.status === 'REMOVED' || current.role !== m.role) throw new ApiError('CONFLICT', 'This member changed while you were editing. Reload and try again.')
        await this.assertNotLastOwner(organizationId, m, tx)
        await tx.campusAdmin.setMembershipStatus(m.id, 'REMOVED')
        const created = await tx.memberships.upsertMembership({ organizationId, userId: m.userId, role, status: 'ACTIVE', departmentId: m.departmentId, scope: m.scope || {}, invitedBy: actor.userId })
        await tx.campusAdmin.appendOrgAudit({ organizationId, actorUserId: req.user.id, action: 'role.changed', targetType: 'MEMBERSHIP', targetId: created.id, details: { from: m.role, to: role }, requestId: req.requestId || null })
        await tx.campusAdmin.createNotification({ userId: m.userId, organizationId, kind: 'ROLE_CHANGED', payload: { from: m.role, to: role } })
        return created
      })
      audit('campus.role.changed', null, { organizationId, targetType: 'MEMBERSHIP', targetId: String(next.id), requestId: req.requestId || null })
      return { membershipId: next.id, role: next.role }
    },
    async removeMember(req, actor, organizationId, membershipId) {
      const d = requireDecision(actor, organizationId, 'team.manage')
      requireFullScope(d, 'Your role cannot remove team members.')
      const m = await store().getMembership(membershipId)
      if (!m || m.organizationId !== organizationId || m.status === 'REMOVED') throw new ApiError('NOT_FOUND', 'Not found')
      if (m.userId === actor.userId) throw new ApiError('FORBIDDEN', 'You cannot remove yourself.')
      const actorIsOwner = actor.memberships.some((x) => x.organizationId === organizationId && x.status === 'ACTIVE' && x.role === 'ORG_OWNER')
      if (m.role === 'ORG_OWNER' && !actorIsOwner) throw new ApiError('FORBIDDEN', 'Only an organization owner can remove another owner.')
      // Same unit as a role change: the last-owner check, the removal and its
      // audit row commit together, serialised per organization.
      await inTransaction(async (tx) => {
        await tx.campusAdmin.lockOrganization(organizationId)
        const current = await tx.campusAdmin.getMembership(m.id)
        if (!current || current.status === 'REMOVED') throw new ApiError('NOT_FOUND', 'Not found')
        await this.assertNotLastOwner(organizationId, m, tx)
        await tx.campusAdmin.setMembershipStatus(m.id, 'REMOVED')
        await tx.campusAdmin.appendOrgAudit({ organizationId, actorUserId: req.user.id, action: 'member.removed', targetType: 'MEMBERSHIP', targetId: m.id, details: { role: m.role }, requestId: req.requestId || null })
      })
      audit('campus.member.removed', null, { organizationId, targetType: 'MEMBERSHIP', targetId: String(m.id), requestId: req.requestId || null })
      return { removed: true }
    },
    async assertNotLastOwner(organizationId, m, tx = null) {
      if (m.role !== 'ORG_OWNER') return
      const owners = (await (tx ? tx.campusAdmin : store()).listOrgMemberships(organizationId)).filter((x) => x.role === 'ORG_OWNER' && x.status === 'ACTIVE')
      if (owners.length <= 1) throw new ApiError('CONFLICT', 'An organization needs at least one owner.')
    },
    async resendInvite(req, actor, organizationId, inviteId) {
      const invite = (await store().listOrgInvites(organizationId)).find((i) => i.id === inviteId)
      if (!invite || invite.status !== 'PENDING') throw new ApiError('NOT_FOUND', 'Not found')
      // Same holder as sending it: students.manage for students, team.manage for staff.
      requireDecision(actor, organizationId, invite.role === 'STUDENT' ? 'students.manage' : 'team.manage')
      const results = await invites.createInvites({ actor, orgId: organizationId, role: invite.role, emails: [invite.email], cohortId: invite.cohortId || null, departmentId: invite.departmentId || null })
      // The old link stops working once a fresh one has been issued.
      await repos.memberships.updateInvite(invite.id, { status: 'REVOKED' })
      await orgAudit(req, organizationId, 'invite.resent', 'INVITE', inviteId, { role: invite.role })
      return results[0]
    },

    // ── Org audit log (limited fields) ────────────────────────────────────
    async auditLog(organizationId, { limit = 50, before = null } = {}) {
      await getOrg(organizationId)
      const rows = await store().listOrgAudit(organizationId, { limit: Math.min(100, Math.max(1, limit)), before })
      const cards = await userCards(rows.map((e) => e.actorUserId))
      const out = []
      for (const e of rows) {
        const actorCard = cards.get(String(e.actorUserId)) || { name: null, email: null }
        out.push({ id: e.id, at: e.createdAt, actor: { name: actorCard.name, email: actorCard.email }, action: e.action, targetType: e.targetType, targetId: e.targetId, details: e.details })
      }
      return { items: out, nextBefore: rows.length ? rows[rows.length - 1].createdAt : null }
    },

    // ── Onboarding (§37.1): resumable ─────────────────────────────────────
    async getOnboarding(organizationId) {
      await getOrg(organizationId)
      const row = await store().getOnboarding(organizationId)
      return { steps: ONBOARDING_STEPS, completedSteps: row?.completedSteps || [], data: row?.data || {}, updatedAt: row?.updatedAt || null }
    },
    async saveOnboarding(req, actor, organizationId, { completedSteps, data }) {
      await getOrg(organizationId)
      const unknown = completedSteps.filter((s) => !ONBOARDING_STEPS.includes(s))
      if (unknown.length) throw new ApiError('VALIDATION_FAILED', 'Unknown onboarding step.')
      const row = await store().saveOnboarding({ organizationId, completedSteps, data: data || {}, updatedBy: actor.userId })
      if (completedSteps.includes('launch')) await orgAudit(req, organizationId, 'onboarding.completed', 'ORGANIZATION', organizationId, {})
      return { steps: ONBOARDING_STEPS, completedSteps: row.completedSteps, data: row.data, updatedAt: row.updatedAt }
    },

    // ── Notifications (§43) ───────────────────────────────────────────────
    async listNotifications(user) {
      return { items: await store().listNotifications(user.id, { limit: 50 }) }
    },
    async markNotificationRead(user, id) {
      const row = await store().markNotificationRead(id, user.id)
      if (!row) throw new ApiError('NOT_FOUND', 'Not found')
      return row
    },
    now: nowIso,
  }
}
