// Assessment assignments for the student application (spec §10, §11; C4.02,
// C4.05, C4.06). PERSONAL assignments are derived — one per personal
// entitlement or personal session — with deterministic ids, and mirrored into
// the campus store when it exists (insert-if-absent, so derivation is
// idempotent and never mutates legacy records). Sponsored assignments come
// only from the campus store and only for the workspace's organization.
import { createHash } from 'node:crypto'
import { ApiError } from '../http/errors.js'
import { fromLegacyEntitlement } from '../entitlements/legacyAdapter.js'
import { PERSONAL_SOURCES } from '../entitlements/resolver.js'
import { CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION } from '../sharing/copyVersions.js'
import { CORE_DEFINITION_ID, definitionForScenario, capabilityName } from './catalog.js'
import { isEnabled } from '../flags/index.js'
import { draftContentEnabled } from './draftSegments.js'
import { CORE_TEAMREADY_A_ID } from './universalForm.js'

const workspaceV3 = () => isEnabled('PRISM_ASSESSMENT_WORKSPACE_V3')
// The V3 player URL; sponsored sessions name their workspace so a new tab or
// a refresh resolves the session in the right one.
export const playerPath = (sessionId, workspaceId = null) => `/app/assessment/${encodeURIComponent(sessionId)}${workspaceId ? `?ws=${encodeURIComponent(workspaceId)}` : ''}`
// Report V3 (shell + report flag) or the legacy report page. Sponsored
// reports open inside their organization's campus student workspace.
export const reportV3 = () => isEnabled('PRISM_APP_SHELL_V3') && isEnabled('PRISM_STUDENT_REPORT_V3')
export const reportPath = (legacyPaths, sessionId, bank, organizationId = null) => (reportV3()
  ? (organizationId ? `/app/campus/${encodeURIComponent(organizationId)}/reports/${encodeURIComponent(sessionId)}` : `/app/reports/${encodeURIComponent(sessionId)}`)
  : legacyPaths.report(sessionId, bank))

const PERSONAL_POLICY = Object.freeze({ accommodationsPolicy: { requestable: true }, reminderPolicy: { enabled: false } })
const VISIBLE_SPONSORED = new Set(['SCHEDULED', 'ACTIVE', 'CLOSED'])
const ORDER = { ASSIGNED: 0, ACKNOWLEDGED: 1, IN_PROGRESS: 2, COMPLETED: 3 }

export function personalAssignmentId(userId, sourceKey) {
  return `pa_${createHash('sha256').update(`${userId}\u0000${sourceKey}`).digest('hex').slice(0, 32)}`
}

const usableV2 = (e, at) => e.status === 'ACTIVE' && e.quantity - e.consumedQuantity > 0
  && (!e.validFrom || new Date(e.validFrom) <= at) && (!e.validUntil || new Date(e.validUntil) > at)

// Server-side pinning rule for local/test DRAFT runs: with PRISM_DRAFT_CONTENT
// on (never in production), an unstarted non-production 'dev' session
// entitlement is offered the universal DRAFT form instead of the
// server-selected legacy pool. The request body can never pick or swap the
// form; paid, invite, coupon and dummy entitlements are never affected, and
// with the flag off the legacy default is unchanged.
export function draftPersonalDefinition(record) {
  if (!draftContentEnabled() || process.env.NODE_ENV === 'production') return null
  return record?.mode === 'dev' ? CORE_TEAMREADY_A_ID : null
}

export function createAssignmentService({ repos, catalog, directory, legacy, resolver, clock = () => new Date() }) {
  const paths = legacy.paths

  async function derivePersonal(user) {
    const cat = await catalog.ensureSeeded()
    const workspace = { id: 'personal', type: 'PERSONAL', organizationId: null }
    const sessions = await directory.listSessions(user, workspace)
    const byId = new Map(sessions.map((s) => [s.sessionId, s]))
    const covered = new Set()
    const sources = []
    for (const record of await legacy.listEntitlements(user.id)) {
      const e = fromLegacyEntitlement(record)
      if (!e || e.userId !== user.id) continue
      const session = byId.get(e.legacySessionId) || null
      if (!session && e.status !== 'ACTIVE') continue
      covered.add(e.legacySessionId)
      sources.push({ key: e.id, legacySessionId: e.legacySessionId, session, definitionId: session ? null : draftPersonalDefinition(record) })
    }
    if (repos?.entitlements) {
      const at = clock()
      const own = await repos.entitlements.listEntitlements({ userId: user.id, organizationId: null, sourceTypes: PERSONAL_SOURCES })
      for (const e of own.filter((x) => usableV2(x, at))) {
        sources.push({ key: `entitlement:${e.id}`, legacySessionId: null, session: null, definitionId: e.assessmentDefinitionId || null })
      }
    }
    for (const s of sessions) {
      if (!covered.has(s.sessionId)) sources.push({ key: `session:${s.sessionId}`, legacySessionId: s.sessionId, session: s, definitionId: null })
    }

    const out = []
    for (const src of sources) {
      const definitionId = src.session
        ? definitionForScenario(cat, src.session.scenarioId)
        : (src.definitionId && cat.definitions.some((d) => d.id === src.definitionId) ? src.definitionId : CORE_DEFINITION_ID)
      const definition = cat.definitions.find((d) => d.id === definitionId)
      if (!definition) continue
      const status = src.session ? (src.session.hasReport ? 'COMPLETED' : 'IN_PROGRESS') : 'ASSIGNED'
      const id = personalAssignmentId(user.id, src.key)
      const assignment = {
        id,
        definitionId,
        formPolicy: definition.formPolicy,
        formId: definition.formPolicy === 'FIXED_FORM' ? cat.forms.find((f) => f.definitionId === definitionId)?.id || null : null,
        sponsorType: 'PERSONAL',
        organizationId: null,
        personalKey: id,
        integrityPolicy: 'STANDARD',
        ...PERSONAL_POLICY,
        // Derived by the platform, not authored by anyone (no raw user id here).
        createdBy: 'SYSTEM',
        status: 'ACTIVE',
      }
      let student = { status, sessionId: src.session?.sessionId || null, startedAt: src.session?.startedAt || null, completedAt: src.session?.completedAt || null, acknowledgedAt: null }
      if (repos?.assessments) {
        await repos.assessments.ensurePersonalAssignment(assignment)
        const stored = await repos.assessments.addStudent({ assignmentId: id, userId: user.id, status: 'ASSIGNED' })
        // State only moves forward, mirroring the legacy session.
        if (stored && ORDER[status] > (ORDER[stored.status] ?? -1)) {
          student = await repos.assessments.updateStudent({ assignmentId: id, userId: user.id, patch: { status, sessionId: student.sessionId, startedAt: student.startedAt, completedAt: student.completedAt } })
        } else if (stored) {
          student = { ...stored, sessionId: stored.sessionId || student.sessionId, startedAt: stored.startedAt || student.startedAt, completedAt: stored.completedAt || student.completedAt }
        }
      }
      out.push({ assignment, student, definition, legacySessionId: src.legacySessionId, session: src.session })
    }
    return out
  }

  async function listSponsored(user, workspace) {
    if (!repos?.assessments) return []
    const cat = await catalog.ensureSeeded()
    const rows = await repos.assessments.listAssignmentsForUser({ userId: user.id, organizationId: workspace.organizationId })
    const sessions = new Map((await directory.listSessions(user, workspace)).map((s) => [s.sessionId, s]))
    return rows
      .filter((a) => VISIBLE_SPONSORED.has(a.status) && a.student && a.student.status !== 'WITHDRAWN')
      .map((a) => {
        const definition = cat.definitions.find((d) => d.id === a.definitionId)
        const session = a.student.sessionId ? sessions.get(a.student.sessionId) || null : null
        const student = session?.hasReport && a.student.status !== 'COMPLETED'
          ? { ...a.student, status: 'COMPLETED', completedAt: session.completedAt }
          : a.student
        const { student: _s, ...assignment } = a
        return definition ? { assignment, student, definition, legacySessionId: null, session } : null
      })
      .filter(Boolean)
  }

  function view(item, workspace, at) {
    const { assignment: a, student: s, definition: d, session } = item
    const sponsored = a.sponsorType === 'INSTITUTION'
    const opensAt = a.windowStart || null
    const dueAt = a.windowEnd || null
    let status
    if (s.status === 'COMPLETED') status = 'COMPLETED'
    else if (sponsored && (a.status === 'CLOSED' || (dueAt && new Date(dueAt) <= at) || s.status === 'EXPIRED')) status = 'EXPIRED'
    else if (s.status === 'IN_PROGRESS') status = 'IN_PROGRESS'
    // A SCHEDULED window opens by itself at windowStart (K77); without a
    // start time it stays closed until an admin opens it.
    else if (sponsored && ((opensAt && new Date(opensAt) > at) || (a.status === 'SCHEDULED' && !opensAt))) status = 'UPCOMING'
    else status = 'NOT_STARTED'
    const tab = status === 'COMPLETED' || status === 'EXPIRED' ? 'COMPLETED' : status === 'UPCOMING' ? 'UPCOMING' : 'ACTIVE'
    const base = sponsored ? `/app/campus/${workspace.organizationId}/assignments/${a.id}` : `/app/assessments/${a.id}`
    const bank = d.id !== CORE_DEFINITION_ID
    let cta = { kind: 'NONE', to: null }
    if (status === 'NOT_STARTED') cta = { kind: 'START', to: `${base}/briefing` }
    else if (status === 'UPCOMING') cta = { kind: 'VIEW_BRIEFING', to: `${base}/briefing` }
    else if (status === 'IN_PROGRESS' && s.sessionId && workspaceV3()) cta = { kind: 'RESUME', to: playerPath(s.sessionId, sponsored ? workspace.id : null) }
    else if (status === 'IN_PROGRESS' && s.sessionId && !sponsored) cta = { kind: 'RESUME', to: paths.resume(s.sessionId, bank) }
    else if (status === 'COMPLETED' && s.sessionId && session?.hasReport) cta = { kind: 'VIEW_REPORT', to: reportPath(paths, s.sessionId, bank, sponsored ? workspace.organizationId : null) }
    return {
      id: a.id,
      definitionId: d.id,
      title: d.title,
      description: d.description || null,
      scope: sponsored ? 'SPONSORED' : 'PERSONAL',
      sponsor: sponsored ? { organizationId: a.organizationId, name: workspace.organizationName || workspace.name || null } : null,
      durationMinutes: d.durationMinutes,
      integrityMode: a.integrityPolicy,
      opensAt,
      dueAt,
      status,
      tab,
      sessionId: s.sessionId || null,
      startedAt: s.startedAt || null,
      completedAt: s.completedAt || null,
      // A held or invalidated session is shown, but never counts as evidence.
      underReview: Boolean(session && session.integrity && session.integrity !== 'OK'),
      acknowledgementRequired: sponsored,
      acknowledged: Boolean(s.acknowledgedAt),
      cta,
    }
  }

  async function itemsFor(user, workspace) {
    if (workspace.type === 'PERSONAL') return derivePersonal(user)
    if (workspace.type === 'CAMPUS_STUDENT') return listSponsored(user, workspace)
    return []
  }

  async function findItem(user, workspace, assignmentId) {
    const items = await itemsFor(user, workspace)
    return items.find((i) => i.assignment.id === assignmentId) || null
  }

  return {
    // The caller's assignment in this workspace with its card, or null.
    async resolveItem(user, workspace, assignmentId) {
      const item = await findItem(user, workspace, assignmentId)
      return item ? { item, card: view(item, workspace, clock()) } : null
    },

    async listForWorkspace(user, workspace) {
      const at = clock()
      const views = (await itemsFor(user, workspace)).map((i) => view(i, workspace, at))
      const byDue = (x, y) => String(x.dueAt || '9999').localeCompare(String(y.dueAt || '9999')) || x.title.localeCompare(y.title)
      const byRecent = (x, y) => String(y.completedAt || y.dueAt || '').localeCompare(String(x.completedAt || x.dueAt || ''))
      return {
        active: views.filter((v) => v.tab === 'ACTIVE').sort(byDue),
        completed: views.filter((v) => v.tab === 'COMPLETED').sort(byRecent),
        upcoming: views.filter((v) => v.tab === 'UPCOMING').sort((x, y) => String(x.opensAt || '').localeCompare(String(y.opensAt || ''))),
      }
    },

    async getBriefing(user, workspace, assignmentId) {
      const item = await findItem(user, workspace, assignmentId)
      if (!item) throw new ApiError('NOT_FOUND', 'Not found')
      const at = clock()
      const card = view(item, workspace, at)
      const d = item.definition
      let start
      if (card.status === 'COMPLETED') start = { allowed: false, reason: 'COMPLETED', to: null }
      else if (card.status === 'EXPIRED') start = { allowed: false, reason: 'CLOSED', to: null }
      else if (card.status === 'UPCOMING') start = { allowed: false, reason: 'NOT_OPEN', to: null }
      else if (card.status === 'IN_PROGRESS') start = { allowed: Boolean(card.cta.to), reason: card.cta.to ? 'RESUME' : 'IN_PROGRESS', to: card.cta.to, mode: workspaceV3() ? 'V3' : 'LEGACY' }
      else if (card.scope === 'PERSONAL') {
        // With Workspace V3 on, a paid personal session starts in the V3
        // player (the client POSTs /start); otherwise the legacy flow (K52).
        start = item.legacySessionId
          ? (workspaceV3() ? { allowed: true, reason: 'ALLOWED', to: null, mode: 'V3' } : { allowed: true, reason: 'ALLOWED', to: paths.start(item.legacySessionId), mode: 'LEGACY' })
          : { allowed: true, reason: 'ALLOWED', to: paths.purchase, mode: 'LEGACY' }
      } else if (!card.acknowledged) {
        start = { allowed: false, reason: 'ACKNOWLEDGEMENT_REQUIRED', to: null }
      } else {
        const decision = await resolver.resolveEntitlement({ user, workspace, action: 'assessment.start', assignment: { assessmentDefinitionId: d.id } })
        if (!decision.allowed) start = { allowed: false, reason: decision.reason, to: null }
        else if (workspaceV3()) start = { allowed: true, reason: 'ALLOWED', to: null, mode: 'V3' }
        // Sponsored sessions start only in the V3 workspace; while it is dark
        // the briefing says so rather than offering a dead button.
        else start = { allowed: false, reason: 'SPONSORED_START_UNAVAILABLE', to: null }
      }
      return {
        assignment: card,
        definition: {
          id: d.id,
          title: d.title,
          description: d.description || null,
          durationMinutes: d.durationMinutes,
          measures: d.measures.map((id) => ({ id, name: capabilityName(id) })).filter((c) => c.name),
          notMeasured: d.notMeasured,
          hasArtifacts: Boolean(d.hasArtifacts),
          integrityModes: d.integrityModes,
        },
        sponsorship: card.scope === 'SPONSORED'
          ? { scope: 'SPONSORED', sponsorName: card.sponsor?.name || null, disclosureCopyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: card.acknowledged, acknowledgedAt: item.student.acknowledgedAt || null }
          : { scope: 'PERSONAL', sponsorName: null, disclosureCopyVersion: null, acknowledged: false, acknowledgedAt: null },
        start,
      }
    },

    async acknowledge(user, workspace, assignmentId, { copyVersion } = {}) {
      const item = await findItem(user, workspace, assignmentId)
      if (!item) throw new ApiError('NOT_FOUND', 'Not found')
      if (item.assignment.sponsorType !== 'INSTITUTION') throw new ApiError('VALIDATION_FAILED', 'Personal assessments do not need a sponsorship acknowledgement.')
      if (copyVersion !== CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION) {
        throw new ApiError('CONFLICT', 'The disclosure has changed. Please read it again.', { details: { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION } })
      }
      if (item.student.acknowledgedAt) return { acknowledged: true, acknowledgedAt: item.student.acknowledgedAt, copyVersion }
      const card = view(item, workspace, clock())
      if (card.status === 'COMPLETED' || card.status === 'EXPIRED') throw new ApiError('CONFLICT', 'This assessment has ended.')
      const grantedAt = clock().toISOString()
      // One consent record per sponsor and disclosure version: a retry after a
      // partial failure reuses it instead of writing a second one.
      const existing = (await repos.sharing.listConsents(user.id)).find((c) => c.consentType === 'CAMPUS_ASSESSMENT_DISCLOSURE'
        && c.organizationId === item.assignment.organizationId && c.copyVersion === copyVersion && !c.withdrawnAt)
      const consent = existing || await repos.sharing.recordConsent({
        userId: user.id, organizationId: item.assignment.organizationId, consentType: 'CAMPUS_ASSESSMENT_DISCLOSURE', copyVersion, grantedAt,
      })
      const patch = { consentRecordId: consent.id, acknowledgedAt: grantedAt }
      if (item.student.status === 'ASSIGNED') patch.status = 'ACKNOWLEDGED'
      await repos.assessments.updateStudent({ assignmentId, userId: user.id, patch })
      return { acknowledged: true, acknowledgedAt: grantedAt, copyVersion }
    },
  }
}
