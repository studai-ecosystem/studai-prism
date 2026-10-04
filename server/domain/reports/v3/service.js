// Student Report V3 service (spec §14, §36; C6.01–C6.04). Three audiences,
// one builder:
//   forOwner   — the student, in the workspace the session belongs to
//   forSponsor — an organization reader authorized by sponsorship or by an
//                explicit share grant (audited in data_access_audit_events)
//   forShare   — a public link grant (hash lookup, expiry/revocation checked,
//                selective disclosure, audited)
// Each distinct rendering is stored once as an immutable version (0033).
// Only the session's owner can create share grants — never staff (§14.5).
import { randomBytes, createHash } from 'node:crypto'
import { ApiError } from '../../http/errors.js'
import { candidateTurnsUnion } from '../claims.js'
import { definitionForScenario } from '../../assessments/catalog.js'
import { evaluateJobKey, draftSegmentFor, isUniversalSnapshot } from '../../assessments/draftSegments.js'
import { coverageReport } from '../../assessments/director.js'
import { hashToken } from '../../memberships/inviteService.js'
import { buildStudentReportV3, reportContentHash, REPORT_V3_BUILDER_VERSION } from './build.js'
import { assertReportSafe } from './schema.js'
import { REVIEW_DECISIONS } from './repository.js'
import { behaviourGaps } from '../../development/recommendations.js'

export const MAX_SHARE_DAYS = 180
export const REVIEW_REASON_MIN = 10
export const REVIEW_REASON_MAX = 2000
const DAY = 86400000

// Hash of the evidence set a published version was built from (P2.7): ids,
// status and level, sorted — a rubric file change alone never changes it.
export function evidenceSetHash(units = []) {
  const rows = units.map((u) => `${u.evidence_id}|${u.evidence_status}|${u.rubric_level ?? ''}`).sort()
  return createHash('sha256').update(rows.join('\n')).digest('hex')
}

export function createReportService({ repos, legacy, catalog, evidence, sessionScopes, dataAccess, scenarioSource, development = null, audit = () => {}, clock = () => new Date(), tokenFactory = () => randomBytes(32).toString('base64url') }) {
  function requireStore() {
    if (!repos?.reportVersions || !repos?.sharing) throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Reports are temporarily unavailable.')
  }

  // Evidence ids withheld from this session's report by reviewed corrections
  // (P5.7). A provenance flag held in the review ledger: the stored evidence
  // units are never mutated, the builder simply never cites these ids.
  async function withheldFor(sessionId) {
    if (!repos?.reportReviews || typeof repos.reportReviews.listWithheldEvidenceIds !== 'function') return []
    return repos.reportReviews.listWithheldEvidenceIds(sessionId)
  }

  async function load(sessionId) {
    const [session, report, scope, admin, job, withheld] = await Promise.all([
      legacy.getSession(sessionId), legacy.getReport(sessionId), repos.scopes.getSessionScope(sessionId),
      legacy.adminState ? legacy.adminState(sessionId) : null,
      // P2.7: an evaluation-run completion record (draft-segment runs).
      repos.sessionIo && typeof repos.sessionIo.getJob === 'function' ? repos.sessionIo.getJob(evaluateJobKey(sessionId)) : null,
      withheldFor(sessionId),
    ])
    return { session, report, scope, admin, job, withheld }
  }

  // Whether a session has a publishable completion record: a legacy report
  // (unchanged path) or a DONE evaluation run. Failed/pending runs are named
  // as such — a technical state is never shown as missing evidence.
  function completion(loaded) {
    if (loaded.report) return { kind: 'LEGACY', completedAt: loaded.report.issuedAt ? new Date(loaded.report.issuedAt).toISOString() : null }
    const job = loaded.job
    if (job?.state === 'DONE') return { kind: 'EVALUATION_RUN', completedAt: job.updatedAt || null }
    if (job?.state === 'FAILED') throw new ApiError('REPORT_PROCESSING_FAILED', 'The review did not finish.')
    if (job) throw new ApiError('REPORT_NOT_READY', 'This report is not ready yet.')
    return null
  }

  async function requiredReviewContext(done, name, read) {
    if (done.kind !== 'EVALUATION_RUN') return typeof read === 'function' ? read() : []
    if (typeof read !== 'function') throw new ApiError('REPORT_PROCESSING_FAILED', `The review is incomplete because its recorded ${name} context is unavailable.`)
    try {
      return await read()
    } catch {
      throw new ApiError('REPORT_PROCESSING_FAILED', `The review is incomplete because its recorded ${name} context could not be loaded.`)
    }
  }

  // Builds (and versions) the full report; audiences get views of it. The
  // sponsor shown is always the session's sponsoring organization — never the
  // reader's organization.
  async function build(sessionId, loaded, { disclosure = 'FULL', candidateName = null, reason = null, withheldOverride = null } = {}) {
    const { session, report, scope, admin } = loaded
    const done = completion(loaded)
    if (!done) throw new ApiError('REPORT_NOT_READY', 'This report is not ready yet.')
    // Held or invalidated sessions are never formal evidence (K59).
    if (admin?.invalid || admin?.reviewState === 'held') throw new ApiError('REPORT_UNDER_REVIEW', 'This report is being reviewed.')
    const [cat, scenarios, allUnits, actions, opportunities] = await Promise.all([
      catalog.getCatalog(), scenarioSource(), evidence.units(sessionId),
      // Accepted candidate actions outlive any history purge (P2.3 / T32).
      requiredReviewContext(done, 'learner action', repos.sessionIo && typeof repos.sessionIo.listActions === 'function' ? () => repos.sessionIo.listActions(sessionId) : null),
      // Opportunity ledger (P4.5): the stimulus each moment answered.
      requiredReviewContext(done, 'stimulus', repos.sessionIo && typeof repos.sessionIo.listOpportunities === 'function' ? () => repos.sessionIo.listOpportunities(sessionId) : null),
    ])
    // P5.7: units withheld by a reviewed correction never reach the builder
    // or the evidence-set hash, so a corrected publication is its own version.
    const withheldIds = [...new Set([...(loaded.withheld || []), ...(withheldOverride || [])])].sort()
    const withheld = new Set(withheldIds)
    const units = allUnits.filter((u) => !withheld.has(u.evidence_id))
    const turns = candidateTurnsUnion(session?.history || [], actions)
    const scenarioId = session?.scenarioId || report?.scenarioId || null
    const definitionId = definitionForScenario(cat, scenarioId)
    const definition = cat.definitions.find((d) => d.id === definitionId) || null
    const form = cat.forms.find((f) => f.definitionId === definitionId && f.scenarioId === scenarioId) || null
    const bank = scenarios.bankScenarios?.[scenarioId]
    const general = (scenarios.generalScenarios || []).find((s) => s.id === scenarioId)
    const sponsored = scope?.sponsorType === 'INSTITUTION'
    const sponsorName = sponsored ? (await repos.organizations.getOrganization(scope.sponsorOrganizationId))?.name || null : null
    const header = {
      candidateName: candidateName || report?.candidateName || session?.candidateName || null,
      assessmentTitle: definition?.title || null,
      scenarioTitle: bank?.title || general?.title || null,
      completedAt: done.completedAt,
      sponsorName: sponsored ? sponsorName : null,
      scope: sponsored ? 'SPONSORED' : 'PERSONAL',
      verification: { identityAssurance: report?.identityAssurance?.level || 'NOT_RECORDED', credentialId: report?.credential?.credentialId || null },
    }
    // P4.5/P4.7: counts-only coverage of a Director-driven run (its pinned
    // form's required opportunities against the ledger); null for legacy runs.
    const pinnedSnapshot = draftSegmentFor(scenarioId)
    const coverage = isUniversalSnapshot(pinnedSnapshot) && (opportunities || []).length ? coverageReport(pinnedSnapshot.form, opportunities) : null
    const render = (level) => assertReportSafe(buildStudentReportV3({
      sessionId, definition, formId: form?.id || null, units: allUnits, turns, header, disclosure: level, opportunities: opportunities || [], coverage, withheldEvidenceIds: withheldIds,
    }))
    let full
    let version
    const latest = await repos.reportVersions.latest(sessionId)
    const publication = (setHash) => ({
      evidenceSetHash: setHash, issuedAt: clock().toISOString(),
      reason: reason || (latest ? 'RE_EVALUATION' : 'INITIAL'), priorVersion: latest?.version || null,
    })
    if (done.kind === 'EVALUATION_RUN') {
      // Immutable publication: the stored version is served while the
      // evidence set it was issued from is unchanged (P2.7).
      const setHash = evidenceSetHash(units)
      if (latest && latest.evidenceSetHash === setHash && !reason) {
        full = { ...latest.report, header: { ...latest.report.header, candidateName: header.candidateName } }
        version = { version: latest.version, createdAt: latest.createdAt, reason: latest.reason ?? null, priorVersion: latest.priorVersion ?? null }
      } else {
        full = render('FULL')
        version = await persist(sessionId, full, publication(setHash))
      }
    } else {
      full = render('FULL')
      version = await persist(sessionId, full, reason ? publication(null) : {})
    }
    const view = disclosure === 'FULL' ? full : render(disclosure)
    return { report: view, version, units: allUnits, withheldIds }
  }

  // The stored version holds report content only: the display name is account
  // data (it can change) and is added per view, so views never fork versions.
  async function persist(sessionId, built, publication = {}) {
    const report = { ...built, header: { ...built.header, candidateName: null } }
    const contentHash = reportContentHash(report)
    const existing = await repos.reportVersions.findByHash(sessionId, contentHash)
    if (existing) return { version: existing.version, createdAt: existing.createdAt, reason: existing.reason ?? null, priorVersion: existing.priorVersion ?? null }
    const latest = await repos.reportVersions.latest(sessionId)
    try {
      const row = await repos.reportVersions.append({ sessionId, version: (latest?.version || 0) + 1, contentHash, builderVersion: REPORT_V3_BUILDER_VERSION, report, ...publication })
      audit('report.v3.version_created', sessionId, { sessionId, version: row.version, builderVersion: REPORT_V3_BUILDER_VERSION, ...(publication.reason ? { reason: publication.reason, priorVersion: publication.priorVersion } : {}) })
      return { version: row.version, createdAt: row.createdAt, reason: row.reason ?? null, priorVersion: row.priorVersion ?? null }
    } catch (err) {
      if (err?.code !== 'CONFLICT') throw err
      const raced = await repos.reportVersions.findByHash(sessionId, contentHash)
      if (!raced) throw err
      return { version: raced.version, createdAt: raced.createdAt, reason: raced.reason ?? null, priorVersion: raced.priorVersion ?? null }
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

  // P5.6: recommendations are a read-time projection beside the stored
  // version — behaviour gaps from the version's own evidence, resolved
  // against the missions this workspace can open today. Never stored, never
  // hashed; a failure here leaves the report intact with no recommendations.
  async function recommendationsFor(user, workspace, report, units) {
    if (!development || typeof development.recommendFor !== 'function') return []
    const gaps = behaviourGaps(report, units)
    if (!gaps.length) return []
    try { return await development.recommendFor(user, workspace, gaps) } catch { return [] }
  }

  async function openReviewCount(sessionId) {
    if (!repos.reportReviews) return 0
    return (await repos.reportReviews.listForSession(sessionId)).filter((r) => r.state === 'OPEN').length
  }

  const versionView = (v) => ({ number: v.version, createdAt: v.createdAt, reason: v.reason ?? null, priorVersion: v.priorVersion ?? null })

  return {
    async forOwner({ user, workspace, sessionId, requestId }) {
      requireStore()
      const loaded = await load(sessionId)
      if (!ownsInWorkspace(loaded, user, workspace)) throw new ApiError('NOT_FOUND', 'Not found')
      const { report, version, units } = await build(sessionId, loaded, { candidateName: user.name || null })
      audit('report.v3.viewed', sessionId, { sessionId, audience: 'OWNER', version: version.version, requestId })
      const [recommendations, openRequests] = await Promise.all([recommendationsFor(user, workspace, report, units), openReviewCount(sessionId)])
      return {
        report,
        version: versionView(version),
        audience: 'OWNER',
        privacy: {
          visibility: report.header.scope === 'SPONSORED' ? 'OWNER_AND_SPONSOR' : 'OWNER_ONLY',
          activeShares: await activeShares(user.id, sessionId, clock()),
          canShare: true,
        },
        // Owner-only: whether a person is currently reviewing this report.
        review: { openRequests, pending: openRequests > 0 },
        recommendations,
      }
    },

    // The owner's version history (P5.1): every immutable version with its
    // reason and supersession, plus open/resolved review requests. Report
    // bodies are not included; nothing here can rebuild or mutate a version.
    async listVersions({ user, workspace, sessionId }) {
      requireStore()
      const loaded = await load(sessionId)
      if (!ownsInWorkspace(loaded, user, workspace)) throw new ApiError('NOT_FOUND', 'Not found')
      const [versions, reviews] = await Promise.all([
        repos.reportVersions.listVersions(sessionId),
        repos.reportReviews ? repos.reportReviews.listForSession(sessionId) : [],
      ])
      return { sessionId, versions, reviews }
    },

    // The owner asks a person to review a published version (P5.7, CH-29).
    // Creates an OPEN case referencing that version; the version is not
    // changed and no outcome is promised. A correction, if one follows,
    // is a new version with its own reason.
    async requestReview({ user, workspace, sessionId, version = null, category = 'INTERPRETATION', momentId = null, reason, requestId }) {
      requireStore()
      if (!repos.reportReviews) throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Review requests are temporarily unavailable.')
      const loaded = await load(sessionId)
      if (!ownsInWorkspace(loaded, user, workspace)) throw new ApiError('NOT_FOUND', 'Not found')
      const text = typeof reason === 'string' ? reason.trim() : ''
      if (text.length < REVIEW_REASON_MIN || text.length > REVIEW_REASON_MAX) throw new ApiError('VALIDATION_FAILED', 'Describe what you would like reviewed in a few sentences.')
      const latest = await repos.reportVersions.latest(sessionId)
      if (!latest) throw new ApiError('REPORT_NOT_READY', 'There is no published report to review yet.')
      const target = Number.isInteger(version) ? version : latest.version
      const created = await repos.reportReviews.create({ sessionId, version: target, userId: user.id, category, momentId, reason: text })
      audit('report.v3.review_requested', sessionId, { sessionId, version: target, reviewRequestId: created.id, category, requestId })
      return created
    },

    // Reviewer queue (P5.7): OPEN cases with ids, category and the learner's
    // stated reason. No report body, no quotes, no learner identity.
    async listOpenReviews() {
      requireStore()
      if (!repos.reportReviews || typeof repos.reportReviews.listOpen !== 'function') throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Review requests are temporarily unavailable.')
      const items = await repos.reportReviews.listOpen()
      return { items: items.map((r) => ({ id: r.id, sessionId: r.sessionId, version: r.version, category: r.category, momentId: r.momentId ?? null, reason: r.reason, state: r.state, createdAt: r.createdAt })) }
    },

    // A reviewer decides an OPEN case (CH-29, T36). UPHOLD and REJECT record
    // the decision only. CORRECT first publishes a NEW version built without
    // the withheld evidence units (reason REVIEW_CORRECTION, prior version
    // set), then records the decision; the original version is untouched.
    // Nothing is decided twice, and no decision is ever edited.
    async decideReview({ reviewer, reviewId, decision, reason, correction = null, requestId }) {
      requireStore()
      if (!repos.reportReviews || typeof repos.reportReviews.addDecision !== 'function') throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Review decisions are temporarily unavailable.')
      if (!REVIEW_DECISIONS.includes(decision)) throw new ApiError('VALIDATION_FAILED', 'Choose UPHOLD, CORRECT or REJECT.')
      const text = typeof reason === 'string' ? reason.trim() : ''
      if (text.length < REVIEW_REASON_MIN || text.length > REVIEW_REASON_MAX) throw new ApiError('VALIDATION_FAILED', 'Give a specific reason for the decision.')
      const review = await repos.reportReviews.get(reviewId)
      if (!review) throw new ApiError('NOT_FOUND', 'Not found')
      if (review.state !== 'OPEN') throw new ApiError('CONFLICT', 'This review request has already been decided.')
      let published = null
      let stored = null
      if (decision === 'CORRECT') {
        const ids = Array.isArray(correction?.withholdEvidenceIds) ? [...new Set(correction.withholdEvidenceIds.filter((x) => typeof x === 'string' && x))].sort() : []
        if (!ids.length) throw new ApiError('VALIDATION_FAILED', 'A correction names at least one evidence unit to withhold.')
        const note = typeof correction?.note === 'string' ? correction.note.trim().slice(0, REVIEW_REASON_MAX) : null
        const loaded = await load(review.sessionId)
        const own = new Set((await evidence.units(review.sessionId)).filter((u) => u.session_id === review.sessionId).map((u) => u.evidence_id))
        if (ids.some((id) => !own.has(id))) throw new ApiError('VALIDATION_FAILED', 'Every withheld id must be an evidence unit of this session.')
        const before = await repos.reportVersions.latest(review.sessionId)
        const { version } = await build(review.sessionId, loaded, { reason: 'REVIEW_CORRECTION', withheldOverride: ids })
        if (before && version.version === before.version) throw new ApiError('CONFLICT', 'This correction would not change the published report.')
        published = { version: version.version, priorVersion: before?.version ?? null, reason: 'REVIEW_CORRECTION' }
        stored = { withholdEvidenceIds: ids, note, publishedVersion: version.version }
      }
      const row = await repos.reportReviews.addDecision({ reviewId, reviewerId: reviewer.id, decision, reason: text, correction: stored })
      audit('report.v3.review_decided', review.sessionId, { sessionId: review.sessionId, reviewRequestId: reviewId, decision, ...(published ? { publishedVersion: published.version, priorVersion: published.priorVersion } : {}), requestId })
      return { decision: { id: row.id, decision: row.decision, createdAt: row.createdAt }, review: { id: reviewId, state: 'RESOLVED' }, publishedVersion: published }
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
        version: versionView(version),
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
        if (err?.code === 'REPORT_UNDER_REVIEW' || err?.code === 'REPORT_NOT_READY' || err?.code === 'REPORT_PROCESSING_FAILED') throw new ApiError('NOT_FOUND', 'This link is not valid or has expired.')
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
        version: versionView(version),
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
      if (!completion(loaded)) throw new ApiError('REPORT_NOT_READY', 'You can share this report once it is ready.')
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
