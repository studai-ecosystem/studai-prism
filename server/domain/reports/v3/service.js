// Student Report V3 service (spec §14, §36; C6.01–C6.04). Three audiences,
// one builder:
//   forOwner   — the student, in the workspace the session belongs to
//   forSponsor — an organization reader authorized by sponsorship or by an
//                explicit share grant (audited in data_access_audit_events)
//   forShare   — a public link grant (hash lookup, expiry/revocation checked,
//                selective disclosure, audited)
// Each distinct rendering is stored once as an immutable version (0033).
// Only the session's owner can create share grants — never staff (§14.5).
import { randomBytes } from 'node:crypto'
import { ApiError } from '../../http/errors.js'
import { candidateTurnsFrom } from '../claims.js'
import { definitionForScenario } from '../../assessments/catalog.js'
import { hashToken } from '../../memberships/inviteService.js'
import { buildStudentReportV3, reportContentHash, REPORT_V3_BUILDER_VERSION } from './build.js'
import { assertReportSafe } from './schema.js'

export const MAX_SHARE_DAYS = 180
const DAY = 86400000

export function createReportService({ repos, legacy, catalog, evidence, sessionScopes, dataAccess, scenarioSource, audit = () => {}, clock = () => new Date(), tokenFactory = () => randomBytes(32).toString('base64url') }) {
  function requireStore() {
    if (!repos?.reportVersions || !repos?.sharing) throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Reports are temporarily unavailable.')
  }

  async function load(sessionId) {
    const [session, report, scope, admin] = await Promise.all([
      legacy.getSession(sessionId), legacy.getReport(sessionId), repos.scopes.getSessionScope(sessionId),
      legacy.adminState ? legacy.adminState(sessionId) : null,
    ])
    return { session, report, scope, admin }
  }

  // Builds (and versions) the full report; audiences get views of it. The
  // sponsor shown is always the session's sponsoring organization — never the
  // reader's organization.
  async function build(sessionId, loaded, { disclosure = 'FULL', candidateName = null } = {}) {
    const { session, report, scope, admin } = loaded
    if (!report) throw new ApiError('REPORT_NOT_READY', 'This report is not ready yet.')
    // Held or invalidated sessions are never formal evidence (K59).
    if (admin?.invalid || admin?.reviewState === 'held') throw new ApiError('REPORT_UNDER_REVIEW', 'This report is being reviewed.')
    const [cat, scenarios, units] = await Promise.all([catalog.getCatalog(), scenarioSource(), evidence.units(sessionId)])
    const scenarioId = session?.scenarioId || report.scenarioId || null
    const definitionId = definitionForScenario(cat, scenarioId)
    const definition = cat.definitions.find((d) => d.id === definitionId) || null
    const form = cat.forms.find((f) => f.definitionId === definitionId && f.scenarioId === scenarioId) || null
    const bank = scenarios.bankScenarios?.[scenarioId]
    const general = (scenarios.generalScenarios || []).find((s) => s.id === scenarioId)
    const sponsored = scope?.sponsorType === 'INSTITUTION'
    const sponsorName = sponsored ? (await repos.organizations.getOrganization(scope.sponsorOrganizationId))?.name || null : null
    const header = {
      candidateName: candidateName || report.candidateName || session?.candidateName || null,
      assessmentTitle: definition?.title || null,
      scenarioTitle: bank?.title || general?.title || null,
      completedAt: report.issuedAt ? new Date(report.issuedAt).toISOString() : null,
      sponsorName: sponsored ? sponsorName : null,
      scope: sponsored ? 'SPONSORED' : 'PERSONAL',
      verification: { identityAssurance: report.identityAssurance?.level || 'NOT_RECORDED', credentialId: report.credential?.credentialId || null },
    }
    const full = assertReportSafe(buildStudentReportV3({
      sessionId, definition, formId: form?.id || null, units, turns: candidateTurnsFrom(session?.history || []), header, disclosure: 'FULL',
    }))
    const version = await persist(sessionId, full)
    const view = disclosure === 'FULL' ? full : assertReportSafe(buildStudentReportV3({
      sessionId, definition, formId: form?.id || null, units, turns: candidateTurnsFrom(session?.history || []), header, disclosure,
    }))
    return { report: view, version }
  }

  // The stored version holds report content only: the display name is account
  // data (it can change) and is added per view, so views never fork versions.
  async function persist(sessionId, built) {
    const report = { ...built, header: { ...built.header, candidateName: null } }
    const contentHash = reportContentHash(report)
    const existing = await repos.reportVersions.findByHash(sessionId, contentHash)
    if (existing) return { version: existing.version, createdAt: existing.createdAt }
    const latest = await repos.reportVersions.latest(sessionId)
    try {
      const row = await repos.reportVersions.append({ sessionId, version: (latest?.version || 0) + 1, contentHash, builderVersion: REPORT_V3_BUILDER_VERSION, report })
      audit('report.v3.version_created', sessionId, { sessionId, version: row.version, builderVersion: REPORT_V3_BUILDER_VERSION })
      return { version: row.version, createdAt: row.createdAt }
    } catch (err) {
      if (err?.code !== 'CONFLICT') throw err
      const raced = await repos.reportVersions.findByHash(sessionId, contentHash)
      if (!raced) throw err
      return { version: raced.version, createdAt: raced.createdAt }
    }
  }

  function ownsInWorkspace(loaded, user, workspace) {
    const owner = loaded.session?.userId || loaded.report?.userId || null
    if (!owner || owner !== user.id) return false
    const sponsored = loaded.scope?.sponsorType === 'INSTITUTION'
    if (workspace.type === 'PERSONAL') return !sponsored
    if (workspace.type === 'CAMPUS_STUDENT') return sponsored && loaded.scope.sponsorOrganizationId === workspace.organizationId
    return false
  }

  const activeShares = async (userId, sessionId, at) => (await repos.sharing.listShareGrantsForOwner(userId))
    .filter((g) => !g.revokedAt && new Date(g.expiresAt) > at && g.resources.some((r) => r.resourceType === 'ASSESSMENT_REPORT' && r.resourceId === sessionId))
    .map((g) => ({ id: g.id, recipientType: g.recipientType, organizationName: g.recipientOrganizationName || null, expiresAt: g.expiresAt, disclosureLevel: g.resources.find((r) => r.resourceId === sessionId)?.disclosureLevel || 'SUMMARY' }))

  return {
    async forOwner({ user, workspace, sessionId, requestId }) {
      requireStore()
      const loaded = await load(sessionId)
      if (!ownsInWorkspace(loaded, user, workspace)) throw new ApiError('NOT_FOUND', 'Not found')
      const { report, version } = await build(sessionId, loaded, { candidateName: user.name || null })
      audit('report.v3.viewed', sessionId, { sessionId, audience: 'OWNER', version: version.version, requestId })
      return {
        report,
        version: { number: version.version, createdAt: version.createdAt },
        audience: 'OWNER',
        privacy: {
          visibility: report.header.scope === 'SPONSORED' ? 'OWNER_AND_SPONSOR' : 'OWNER_ONLY',
          activeShares: await activeShares(user.id, sessionId, clock()),
          canShare: true,
        },
      }
    },

    async forSponsor({ req, actor, organizationId, sessionId }) {
      requireStore()
      const access = await sessionScopes.authorizeSponsorRead({ actor, organizationId, sessionId })
      if (!access) throw new ApiError('NOT_FOUND', 'Not found')
      const loaded = await load(sessionId)
      await dataAccess.record({
        req, organizationId, subjectUserId: access.scope.ownerUserId,
        resourceType: 'ASSESSMENT_REPORT', resourceId: sessionId, action: 'READ', purpose: access.via,
      })
      // A student share carries the disclosure level the student chose.
      const disclosure = access.via === 'SHARE_GRANT' ? access.disclosure || 'SUMMARY' : 'FULL'
      const { report, version } = await build(sessionId, loaded, { disclosure })
      audit('report.v3.viewed', sessionId, { sessionId, audience: 'SPONSOR', via: access.via, disclosure, organizationId, version: version.version, requestId: req.requestId })
      return {
        report,
        version: { number: version.version, createdAt: version.createdAt },
        audience: 'SPONSOR',
        privacy: { visibility: access.via === 'SHARE_GRANT' ? 'SHARED_BY_STUDENT' : 'OWNER_AND_SPONSOR', activeShares: [], canShare: false },
      }
    },

    async forShare({ req, token }) {
      requireStore()
      if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw new ApiError('NOT_FOUND', 'This link is not valid or has expired.')
      const grant = await repos.sharing.findGrantByTokenHash(hashToken(token))
      const at = clock()
      const resource = grant?.resources.find((r) => r.resourceType === 'ASSESSMENT_REPORT')
      if (!grant || grant.recipientType !== 'LINK' || grant.revokedAt || new Date(grant.expiresAt) <= at || !resource) {
        throw new ApiError('NOT_FOUND', 'This link is not valid or has expired.')
      }
      const loaded = await load(resource.resourceId)
      const owner = loaded.session?.userId || loaded.report?.userId || null
      if (owner !== grant.ownerUserId) throw new ApiError('NOT_FOUND', 'This link is not valid or has expired.')
      // A link holder never learns why a report is unavailable (e.g. an integrity hold).
      const built = await build(resource.resourceId, loaded, { disclosure: resource.disclosureLevel }).catch((err) => {
        if (err?.code === 'REPORT_UNDER_REVIEW' || err?.code === 'REPORT_NOT_READY') throw new ApiError('NOT_FOUND', 'This link is not valid or has expired.')
        throw err
      })
      const { report, version } = built
      // The anonymous reader is recorded as the link itself.
      await dataAccess.record({
        req: { user: { id: `share-link:${grant.id}` }, requestId: req.requestId }, organizationId: null, subjectUserId: grant.ownerUserId,
        resourceType: 'ASSESSMENT_REPORT', resourceId: resource.resourceId, action: 'READ', purpose: 'SHARE_LINK',
      })
      audit('report.v3.viewed', resource.resourceId, { sessionId: resource.resourceId, audience: 'SHARE_LINK', shareGrantId: grant.id, disclosure: resource.disclosureLevel, version: version.version, requestId: req.requestId })
      return {
        report,
        version: { number: version.version, createdAt: version.createdAt },
        audience: 'SHARE_LINK',
        share: { expiresAt: grant.expiresAt, disclosureLevel: resource.disclosureLevel },
      }
    },

    // The student shares their own completed report: a link (token shown
    // once) or a named organization they belong to. Staff can never call this
    // for a student — ownership is checked against the session itself.
    async createShare({ user, workspace, sessionId, recipientType, recipientOrganizationId = null, disclosureLevel, expiresInDays, requestId }) {
      requireStore()
      const loaded = await load(sessionId)
      if (!ownsInWorkspace(loaded, user, workspace)) throw new ApiError('NOT_FOUND', 'Not found')
      if (!loaded.report) throw new ApiError('REPORT_NOT_READY', 'You can share this report once it is ready.')
      if (loaded.admin?.invalid || loaded.admin?.reviewState === 'held') throw new ApiError('REPORT_UNDER_REVIEW', 'This report is being reviewed and cannot be shared yet.')
      if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > MAX_SHARE_DAYS) {
        throw new ApiError('VALIDATION_FAILED', `Choose an expiry between 1 and ${MAX_SHARE_DAYS} days.`)
      }
      if (recipientType === 'ORGANIZATION') {
        const memberships = await repos.memberships.listMembershipsForUser(user.id)
        if (!memberships.some((m) => m.organizationId === recipientOrganizationId && m.status === 'ACTIVE' && m.role === 'STUDENT')) {
          throw new ApiError('VALIDATION_FAILED', 'You can only share with an institution you belong to.')
        }
      }
      const at = clock()
      const token = recipientType === 'LINK' ? tokenFactory() : null
      const grant = await repos.sharing.createShareGrant({
        ownerUserId: user.id,
        recipientType,
        recipientOrganizationId: recipientType === 'ORGANIZATION' ? recipientOrganizationId : null,
        tokenHash: token ? hashToken(token) : null,
        expiresAt: new Date(at.getTime() + expiresInDays * DAY).toISOString(),
        resources: [{ resourceType: 'ASSESSMENT_REPORT', resourceId: sessionId, disclosureLevel }],
      })
      audit('share_grant.created', sessionId, { shareGrantId: grant.id, recipientType, organizationId: grant.recipientOrganizationId || null, disclosureLevel, expiresInDays, requestId })
      return {
        id: grant.id,
        recipientType,
        disclosureLevel,
        expiresAt: grant.expiresAt,
        // Shown once: only its hash is stored.
        token,
      }
    },
  }
}
