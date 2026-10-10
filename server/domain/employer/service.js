// Employer development-use (L&D) workspace (PROD-READY Phase 9; charter
// Phase 9). A thin layer over the campus machinery — organizations,
// memberships, cohorts, invites, sponsored assignments, share grants,
// suppressed analytics and development interventions — that adds the
// employer restrictions and never widens what campus code allows:
//   - people are listed by name with participation only, never results;
//   - an individual report is readable only through the employee's own
//     active share grant (sessionScope.authorizeSponsorRead + migration 0063);
//   - group views come from the campus analytics service (small groups
//     suppressed whole, complementary suppression) and the export is
//     aggregate-only;
//   - sponsorable assessments and cohort job families stay inside
//     JOB_FAMILY_SCOPE_v1;
//   - nothing here sorts, filters or ranks people by level or score.
import { ApiError } from '../http/errors.js'
import { can } from '../permissions/can.js'
import { permissionsForRole } from '../permissions/matrix.js'
import {
  EMPLOYER_STAFF_COPY, employerProhibitedUses, employerAssessmentDisclosure, employerJoinDisclosure,
} from './copy.js'
import {
  definitionInScope, familiesOf, jobFamilyTag, jobFamilyOfCohort, SCOPED_FAMILY_IDS, EMPLOYER_EXPORT_VIEWS,
} from './prohibitedUse.js'
import { JOB_FAMILY_SCOPE } from '../../lib/sharedConstants.js'

// Roles an employer can invite, with the labels its surfaces use. Reuses the
// campus role set (no new role in the database); department coordinators
// need academic departments and are not offered.
export const EMPLOYER_ROLE_LABELS = Object.freeze({
  ORG_OWNER: 'Workspace owner',
  PLACEMENT_DIRECTOR: 'Learning and development lead',
  PLACEMENT_OFFICER: 'Learning and development coordinator',
  FACULTY_MENTOR: 'Mentor',
  STUDENT: 'Employee',
})
export const EMPLOYER_INVITABLE_ROLES = Object.freeze(['ORG_OWNER', 'PLACEMENT_DIRECTOR', 'PLACEMENT_OFFICER', 'FACULTY_MENTOR', 'STUDENT'])
const STAFF = new Set(['ORG_OWNER', 'PLACEMENT_DIRECTOR', 'PLACEMENT_OFFICER', 'FACULTY_MENTOR', 'STUDAI_ADMIN'])

export function isEmployerStaff(actor, organizationId) {
  return (actor?.memberships || []).some((m) => m.organizationId === organizationId && m.status === 'ACTIVE' && STAFF.has(m.role))
}

const decide = (actor, organizationId, permission) => {
  const d = can(actor, permission, { organizationId })
  if (!d.allowed) throw new ApiError('NOT_FOUND', 'Not found')
  return d
}

export function createEmployerService({ campus, clock = () => new Date() }) {
  const admin = () => campus.admin
  const repos = () => campus.store

  async function employerOrganization(organizationId) {
    const org = await campus.repos.organizations.getOrganization(organizationId)
    if (!org || org.status !== 'ACTIVE' || org.organizationType !== 'EMPLOYER') return null
    return org
  }

  // Every person the caller may see (members only, never invitations), in
  // the campus directory's name order.
  async function visiblePeople(actor, organizationId, decision) {
    const all = await admin().listStudents(actor, organizationId, decision, { all: true })
    return all.items.filter((r) => r.kind === 'MEMBER')
  }

  async function sharedGrantsInScope(actor, organizationId, decision) {
    const at = clock().toISOString()
    const grants = await repos().sharing.listActiveOrgGrants(organizationId, at)
    if (!grants.length) return []
    const people = await visiblePeople(actor, organizationId, decision)
    const byId = new Map(people.filter((p) => p.status === 'ACTIVE').map((p) => [String(p.userId), p]))
    const order = new Map(people.map((p, i) => [String(p.userId), i]))
    return grants
      .filter((g) => byId.has(String(g.ownerUserId)))
      .map((g) => ({ ...g, person: byId.get(String(g.ownerUserId)) }))
      .sort((a, b) => order.get(String(a.ownerUserId)) - order.get(String(b.ownerUserId)) || String(a.createdAt).localeCompare(String(b.createdAt)))
  }

  const cohortView = (c) => ({ id: c.id, name: c.name, status: c.status, memberCount: c.memberCount ?? null, jobFamily: jobFamilyOfCohort(c) })

  return {
    employerOrganization,

    async summary(actor, org) {
      const mine = actor.memberships.filter((m) => m.organizationId === org.id && m.status === 'ACTIVE')
      return {
        id: org.id,
        name: org.name,
        organizationType: 'EMPLOYER',
        roles: mine.map((m) => ({ role: m.role, label: EMPLOYER_ROLE_LABELS[m.role] || m.role })),
        permissions: [...new Set(mine.flatMap((m) => permissionsForRole(m.role, m.scope)))],
        copy: EMPLOYER_STAFF_COPY,
        prohibitedUses: employerProhibitedUses(org.name),
        jobFamilyScope: { version: JOB_FAMILY_SCOPE.version, families: SCOPED_FAMILY_IDS.map((id) => ({ id, name: JOB_FAMILY_SCOPE.families[id] })) },
        invitableRoles: EMPLOYER_INVITABLE_ROLES.map((role) => ({ role, label: EMPLOYER_ROLE_LABELS[role] })),
      }
    },

    async overview(actor, org) {
      const base = await admin().overview(actor, org.id)
      const d = can(actor, 'students.read', { organizationId: org.id })
      const shared = d.allowed ? (await sharedGrantsInScope(actor, org.id, d)).length : null
      return {
        enrolled: base.enrolled, invited: base.invited, cohorts: base.cohorts, activeAssignments: base.activeAssignments,
        completion: base.completion, sharedReports: shared, purpose: EMPLOYER_STAFF_COPY.purpose,
      }
    },

    async listCohorts(actor, org, decision) {
      return { items: (await admin().listCohorts(actor, org.id, decision)).map(cohortView) }
    },

    async createCohort(req, actor, org, { name, jobFamily = null }) {
      if (jobFamily && !SCOPED_FAMILY_IDS.includes(jobFamily)) throw new ApiError('VALIDATION_FAILED', 'Choose a job family within the published scope.')
      const row = await admin().createCohort(req, actor, org.id, { name, tags: jobFamily ? [jobFamilyTag(jobFamily)] : [] })
      return cohortView(row)
    },

    async invite(actor, org, { role, emails, cohortId = null }) {
      if (!EMPLOYER_INVITABLE_ROLES.includes(role)) throw new ApiError('VALIDATION_FAILED', 'This role cannot be invited.')
      const out = await campus.invites.createInvites({ actor, orgId: org.id, role, emails, cohortId })
      return out.map((i) => ({ ...i, roleLabel: EMPLOYER_ROLE_LABELS[i.role] || i.role }))
    },

    // Participation only: name, email, membership status, cohorts and the
    // status of the latest assigned assessment. Fixed name order.
    async listPeople(actor, org, decision, { page = 1, pageSize = 25, q = '', cohortId = null } = {}) {
      const out = await admin().listStudents(actor, org.id, decision, { page, pageSize, q, cohortId })
      return {
        items: out.items.map((r) => ({
          kind: r.kind, userId: r.userId, name: r.name, email: r.email, status: r.status,
          cohorts: r.cohorts, assessmentStatus: r.assessment?.status || 'NONE',
        })),
        total: out.total, page: out.page, pageSize: out.pageSize,
        order: 'NAME', note: EMPLOYER_STAFF_COPY.peopleNote,
      }
    },

    async getPerson(req, actor, org, decision, userId) {
      const s = await admin().getStudent(req, actor, org.id, decision, userId)
      const grants = (await repos().sharing.listActiveOrgGrants(org.id, clock().toISOString())).filter((g) => String(g.ownerUserId) === String(userId))
      return {
        person: { userId: s.student.userId, name: s.student.name, email: s.student.email, status: s.student.status, joinedAt: s.student.joinedAt },
        cohorts: s.cohorts,
        assignments: s.assignments.map((a) => ({ assignmentId: a.assignmentId, title: a.title, status: a.status, completedAt: a.completedAt })),
        sharedReports: s.student.status === 'ACTIVE' ? grants.map((g) => ({ sessionId: g.sessionId, disclosureLevel: g.disclosureLevel, expiresAt: g.expiresAt })) : [],
        note: EMPLOYER_STAFF_COPY.sharedReportsNote,
      }
    },

    async listSharedReports(actor, org, decision) {
      const rows = await sharedGrantsInScope(actor, org.id, decision)
      return {
        items: rows.map((g) => ({ sessionId: g.sessionId, person: { userId: g.person.userId, name: g.person.name }, disclosureLevel: g.disclosureLevel, expiresAt: g.expiresAt, sharedAt: g.createdAt })),
        note: EMPLOYER_STAFF_COPY.sharedReportsNote,
      }
    },

    // The employee's shared report. authorizeSponsorRead never grants an
    // EMPLOYER sponsorship access, so only an active share grant opens it.
    async sharedReport(req, actor, org, sessionId, reportVersion = null) {
      const out = await campus.reports.forSponsor({ req, actor, organizationId: org.id, sessionId, reportVersion })
      return { ...out, notice: EMPLOYER_STAFF_COPY.reportNotice, prohibitedUses: employerProhibitedUses(org.name) }
    },

    async catalog() {
      const cat = await campus.catalog.getCatalog()
      const approved = await admin().catalogForAssignment()
      return {
        items: approved.filter((d) => definitionInScope(cat, d.id)).map((d) => ({
          id: d.id, title: d.title, description: d.description, durationMinutes: d.durationMinutes, families: familiesOf(cat, d.id),
        })),
        note: EMPLOYER_STAFF_COPY.catalogNote,
      }
    },

    disclosure(org) {
      return { join: employerJoinDisclosure(org.name), assessment: employerAssessmentDisclosure(org.name) }
    },

    async listAssignments(actor, org, decision) {
      const items = await admin().listAssignments(actor, org.id, decision)
      return { items: items.map((a) => ({ id: a.id, definitionId: a.definitionId, title: a.title, status: a.status, windowStart: a.windowStart, windowEnd: a.windowEnd, cohortIds: a.cohortIds, counts: a.counts })) }
    },

    async createAssignment(req, actor, org, input) {
      const cat = await campus.catalog.getCatalog()
      if (!definitionInScope(cat, input.definitionId)) {
        throw new ApiError('VALIDATION_FAILED', 'Only assessments within the published job-family scope can be sponsored.')
      }
      const a = await admin().createAssignment(req, actor, org.id, { ...input, integrityPolicy: 'STANDARD' })
      return { id: a.id, definitionId: a.definitionId, title: a.title, status: a.status, windowStart: a.windowStart, windowEnd: a.windowEnd, cohortIds: a.cohortIds, rostered: a.rostered }
    },

    // Suppressed group summaries (the campus analytics service, unchanged).
    async insights(actor, org, { development = null } = {}) {
      const analytics = campus.analytics
      const [capabilities, completion, missions] = await Promise.all([
        analytics.capabilities(actor, org.id, {}),
        analytics.completion(actor, org.id, {}),
        analytics.missions(actor, org.id, { development }),
      ])
      return {
        capabilities: {
          minGroupSize: capabilities.minGroupSize, suppressed: capabilities.suppressed, bucketLabels: capabilities.bucketLabels, method: capabilities.method,
          assessed: capabilities.suppressed ? null : capabilities.assessed,
          items: capabilities.capabilities, developmentFocus: capabilities.topNeeds,
        },
        completion,
        missions,
        note: EMPLOYER_STAFF_COPY.insightsNote,
      }
    },

    async exportInsights(req, actor, org, { view }, { development = null } = {}) {
      if (!EMPLOYER_EXPORT_VIEWS.includes(view)) throw new ApiError('VALIDATION_FAILED', 'Only group summaries can be exported.')
      decide(actor, org.id, 'exports.cohort')
      const out = await campus.analytics.exportCsv(req, actor, org.id, { view, filters: {} }, { orgAudit: admin().orgAudit, development, admin: admin() })
      return { ...out, fileName: `prism-group-summary-${view}.csv`, note: EMPLOYER_STAFF_COPY.exportNote }
    },
  }
}
