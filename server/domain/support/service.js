// V3 support paths (PROD-READY Phase 4; CAMPUS_FINAL_REPORT §7; K104).
// The frozen legacy router's /dispute, /accommodation and /verify-identity
// routes are closed for V3 sessions, so a V3 learner gets the same three
// rights through /api/v1, built on the machinery that already exists:
//
//   * Human review (charter §11, APPEALS_SUPERSESSION_POLICY_v1): ONE free
//     human review per assessment. It is a HUMAN_REVIEW request in the
//     existing report review queue (0045/0058), decided by staff through
//     /api/admin/report-reviews (UPHOLD / CORRECT / REJECT; a correction is a
//     new report version, the original is kept). Re-requesting while it is
//     open returns it; after a decision a new request is refused
//     (REVIEW_ALREADY_USED). No paid review offer exists, so none is offered.
//   * Accommodation (ACCOMMODATIONS_POLICY_v1): requested on the assignment
//     BEFORE the assessment starts, decided by a person with
//     accommodations:manage, linked to the session at start (an approved
//     decision is copied into the session's v1_accommodations record, the
//     existing activation path). It never reaches the judge: the evaluator
//     reads the learner's actions and the method, never this record.
//   * Identity check (IDENTITY_ASSURANCE_SPEC_v1): the learner sees their
//     level and may record a Level 1 self-declaration (declared name only).
//     Level 2 is recorded by the institution, never by the learner. Level 3 is
//     not offered here (gated behind HA-007 / PRISM_IDENTITY_L3).
//
// Owner-only: every read and write resolves the caller's own session or
// assignment in the active workspace; anything else is NOT_FOUND. Sponsors and
// staff never read these records through this service (the admin plane has
// its own permissions and audit).
import { ApiError } from '../http/errors.js'
import { ASSURANCE_LEVELS } from '../../lib/sharedConstants.js'
import { NEEDS_MAX, NEEDS_MIN, cleanModes } from './accommodationRepository.js'

export const REVIEW_REASON_MIN = 10
export const REVIEW_REASON_MAX = 2000
export const REVIEW_TARGET_BUSINESS_DAYS = 7
export const DECLARED_NAME_MAX = 120
const START_EVENT = 'start'

// Plain-language outcomes the learner reads (APPEALS policy: a readable
// explanation, never the reviewer's private reasoning).
export const REVIEW_OUTCOME_COPY = Object.freeze({
  UPHOLD: 'A person reviewed your report and it stands as issued.',
  CORRECT: 'A person reviewed your report and issued a corrected version. The original stays in your version history.',
  REJECT: 'A person reviewed your request and made no change to the report.',
})

const normaliseName = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim()

export function createSupportService({ repos, assignments, legacy, audit = () => {}, enabled = () => true }) {
  const store = () => {
    if (!repos?.reportReviews || !repos?.accommodationRequests) throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Support requests are temporarily unavailable.')
    return repos
  }

  // The caller's own V3 session in this workspace (or NOT_FOUND): a session
  // the V3 player started, or a sponsored one. Personal legacy sessions keep
  // their (owner-bound) legacy routes.
  async function ownSession(user, workspace, sessionId) {
    const r = store()
    if (r.sessionIo && await r.sessionIo.hasErasureMarker(sessionId)) throw new ApiError('NOT_FOUND', 'Not found')
    const [session, report, scope, start] = await Promise.all([
      legacy.getSession(sessionId), legacy.getReport ? legacy.getReport(sessionId) : null,
      r.scopes.getSessionScope(sessionId), r.sessionIo ? r.sessionIo.getClientEvent(sessionId, START_EVENT) : null,
    ])
    const owner = session?.userId || report?.userId || null
    if (!owner || owner !== user.id) throw new ApiError('NOT_FOUND', 'Not found')
    const sponsored = scope?.sponsorType === 'INSTITUTION'
    if (workspace.type === 'PERSONAL' && sponsored) throw new ApiError('NOT_FOUND', 'Not found')
    if (workspace.type === 'CAMPUS_STUDENT' && !(sponsored && scope.sponsorOrganizationId === workspace.organizationId)) throw new ApiError('NOT_FOUND', 'Not found')
    if (workspace.type !== 'PERSONAL' && workspace.type !== 'CAMPUS_STUDENT') throw new ApiError('NOT_FOUND', 'Not found')
    if (!start && !sponsored) throw new ApiError('NOT_FOUND', 'Not found')
    return { session, sponsored }
  }

  // ── Human review ───────────────────────────────────────────────────────────
  async function reviewView(sessionId, request) {
    const latest = await store().reportVersions.latest(sessionId)
    let outcome = null
    if (request?.state === 'RESOLVED') {
      const decisions = await store().reportReviews.listDecisions(request.id)
      const d = decisions[decisions.length - 1] || null
      if (d) {
        outcome = {
          decision: d.decision, decidedAt: d.createdAt, explanation: REVIEW_OUTCOME_COPY[d.decision] || null,
          correctedVersion: d.decision === 'CORRECT' ? d.correction?.publishedVersion ?? null : null,
        }
      }
    }
    return {
      sessionId,
      reportPublished: Boolean(latest),
      freeReview: { used: Boolean(request), available: Boolean(latest) && !request },
      request: request ? { id: request.id, state: request.state, version: request.version, createdAt: request.createdAt, outcome } : null,
      turnaround: { targetBusinessDays: REVIEW_TARGET_BUSINESS_DAYS, guaranteed: false },
      // No priced further review exists (HA-015); nothing is offered.
      furtherReview: { offered: false },
    }
  }

  async function humanReviewStatus({ user, workspace, sessionId }) {
    await ownSession(user, workspace, sessionId)
    return reviewView(sessionId, await store().reportReviews.findHumanReview(sessionId))
  }

  async function requestHumanReview({ user, workspace, sessionId, reason, version = null, requestId = null }) {
    await ownSession(user, workspace, sessionId)
    const r = store()
    const text = typeof reason === 'string' ? reason.trim() : ''
    if (text.length < REVIEW_REASON_MIN || text.length > REVIEW_REASON_MAX) throw new ApiError('VALIDATION_FAILED', 'Tell us in a few sentences what you would like a person to look at.')
    const answerExisting = async (existing) => {
      if (existing.state === 'OPEN') return { created: false, review: await reviewView(sessionId, existing) }
      audit('support.human_review.refused', sessionId, { sessionId, reviewRequestId: existing.id, reason: 'REVIEW_ALREADY_USED', requestId })
      throw new ApiError('REVIEW_ALREADY_USED', 'Your free human review for this assessment has already been completed. A further review is not offered in the app.', {
        details: { reviewRequestId: existing.id, furtherReview: { offered: false } },
      })
    }
    const existing = await r.reportReviews.findHumanReview(sessionId)
    if (existing) return answerExisting(existing)
    const latest = await r.reportVersions.latest(sessionId)
    if (!latest) throw new ApiError('REPORT_NOT_READY', 'There is no published report to review yet.')
    if (version != null && (version < 1 || version > latest.version)) throw new ApiError('VALIDATION_FAILED', 'Choose a version of your report that exists.')
    let created
    try {
      created = await r.reportReviews.create({ sessionId, version: version ?? latest.version, userId: user.id, kind: 'HUMAN_REVIEW', category: 'OTHER', momentId: null, reason: text })
    } catch (err) {
      // A concurrent request won the one-per-session index: answer with it.
      if (err?.details?.reason === 'HUMAN_REVIEW_EXISTS') return answerExisting(await r.reportReviews.findHumanReview(sessionId))
      throw err
    }
    audit('support.human_review.requested', sessionId, { sessionId, reviewRequestId: created.id, version: created.version, free: true, requestId })
    return { created: true, review: await reviewView(sessionId, created) }
  }

  // ── Accommodation (before the start) ──────────────────────────────────────
  async function ownAssignment(user, workspace, assignmentId) {
    store()
    const resolved = await assignments.resolveItem(user, workspace, assignmentId)
    if (!resolved) throw new ApiError('NOT_FOUND', 'Not found')
    return resolved
  }

  const startedOf = (card) => Boolean(card.sessionId) || ['IN_PROGRESS', 'COMPLETED'].includes(card.status)

  // The learner's view: status, their own words and approved modes — never
  // the material-interpretation judgement or the decision note (internal).
  const requestView = (row) => row && ({
    id: row.id, status: row.status, needs: row.needs, modes: row.status === 'APPROVED' ? cleanModes(row.modes) : null,
    createdAt: row.createdAt, updatedAt: row.updatedAt, decidedAt: row.decidedAt ?? null, linkedToSession: Boolean(row.sessionId),
  })

  function accommodationState(item, card) {
    const policy = item.assignment.accommodationsPolicy || {}
    if (startedOf(card)) return { requestable: false, reason: 'ALREADY_STARTED' }
    if (card.status === 'EXPIRED') return { requestable: false, reason: 'CLOSED' }
    if (policy.requestable === false) return { requestable: false, reason: 'NOT_REQUESTABLE' }
    return { requestable: true, reason: null }
  }

  async function accommodationStatus({ user, workspace, assignmentId }) {
    const { item, card } = await ownAssignment(user, workspace, assignmentId)
    const row = await store().accommodationRequests.getForAssignment(assignmentId, user.id)
    const state = accommodationState(item, card)
    return { assignmentId, requestable: state.requestable && (!row || row.status === 'REQUESTED'), reason: state.reason, request: requestView(row) }
  }

  async function requestAccommodation({ user, workspace, assignmentId, needs, requestId = null }) {
    const { item, card } = await ownAssignment(user, workspace, assignmentId)
    const text = typeof needs === 'string' ? needs.trim() : ''
    if (text.length < NEEDS_MIN || text.length > NEEDS_MAX) throw new ApiError('VALIDATION_FAILED', `Describe what you need in ${NEEDS_MIN} to ${NEEDS_MAX} characters.`)
    const state = accommodationState(item, card)
    const refuse = (code, message) => {
      audit('support.accommodation.refused', card.sessionId || null, { assignmentId, reason: code, requestId })
      throw new ApiError(code, message)
    }
    if (state.reason === 'ALREADY_STARTED') {
      refuse('ASSESSMENT_ALREADY_STARTED', 'Adjustments are arranged before an assessment starts, and this one has already started, so how it runs cannot change now. If something affected your assessment, you can ask for a human review once your report is ready, or write to support@studai.one.')
    }
    if (state.reason === 'CLOSED') refuse('ASSESSMENT_NOT_OPEN', 'This assessment has closed, so an adjustment can no longer be arranged for it.')
    if (state.reason === 'NOT_REQUESTABLE') refuse('ACCOMMODATIONS_NOT_REQUESTABLE', 'Adjustment requests are not switched on for this assessment. Write to support@studai.one and a person will help.')
    const out = await store().accommodationRequests.upsertRequest({
      assignmentId, userId: user.id, organizationId: item.assignment.organizationId || null, needs: text,
    })
    if (!out.created && !out.updated) {
      refuse('ACCOMMODATION_ALREADY_DECIDED', 'A decision on your request has already been made, so it can no longer be changed here. Write to support@studai.one if your needs have changed.')
    }
    // The needs text is never written to an audit row.
    audit(out.created ? 'support.accommodation.requested' : 'support.accommodation.updated', null, { assignmentId, accommodationRequestId: out.row.id, requestId })
    return { created: out.created, accommodation: { assignmentId, requestable: true, reason: null, request: requestView(out.row) } }
  }

  // Called by the session service when a V3 assignment starts, BEFORE the
  // engine is asked to start (so the engine's existing activation reads the
  // decision). Dark while the flag is off.
  async function linkAccommodationAtStart({ assignmentId, user, sessionId, requestId = null }) {
    if (!enabled() || !repos?.accommodationRequests) return null
    const row = await repos.accommodationRequests.getForAssignment(assignmentId, user.id)
    if (!row) return null
    if (row.sessionId && row.sessionId !== sessionId) return null
    // Link first: once linked, no decision can change the request (decide
    // refuses a linked row), so the status read back is final. An undecided
    // request lapses here. A retried start finds the same link and re-writes
    // the (idempotent) activation record.
    const linked = await repos.accommodationRequests.linkSession({ assignmentId, userId: user.id, sessionId })
    if (!linked) return null
    if (linked.status === 'APPROVED' && typeof legacy.recordAccommodationDecision === 'function') {
      await legacy.recordAccommodationDecision(sessionId, {
        needs: linked.needs, modes: cleanModes(linked.modes), material: Boolean(linked.material), note: linked.decisionNote || '', decidedBy: linked.decidedBy,
      })
    }
    if (!row.sessionId) audit('support.accommodation.linked', sessionId, { sessionId, assignmentId, accommodationRequestId: row.id, status: linked.status, requestId })
    return linked
  }

  // ── Identity check ─────────────────────────────────────────────────────────
  function levelView(level) {
    const key = ['L1', 'L2', 'L3'].includes(level) ? level : 'L1'
    return { level: key, label: ASSURANCE_LEVELS[key].label, explanation: ASSURANCE_LEVELS[key].explanation }
  }

  async function identityView(user, sessionId, sponsored) {
    const [assurance, record] = await Promise.all([
      legacy.assuranceFor ? legacy.assuranceFor(sessionId).catch(() => null) : null,
      legacy.getVerification ? legacy.getVerification(sessionId).catch(() => null) : null,
    ])
    const declared = record?.status === 'self_declared'
    return {
      sessionId,
      current: levelView(assurance?.level || 'L1'),
      selfDeclaration: declared ? { recorded: true, declaredAt: record.at || null, nameMatchesAccount: Boolean(record.nameMatch) } : { recorded: false, declaredAt: null, nameMatchesAccount: null },
      otherRecordOnFile: Boolean(record) && !declared,
      options: [
        { ...levelView('L1'), available: !record, how: 'SELF_DECLARATION' },
        { ...levelView('L2'), available: false, how: 'INSTITUTION_RECORD', reason: sponsored ? 'INSTITUTION_RECORDS_THIS' : 'NEEDS_AN_INSTITUTION' },
        { ...levelView('L3'), available: false, how: 'DOCUMENT_CHECK', reason: 'NOT_OFFERED' },
      ],
    }
  }

  async function identityStatus({ user, workspace, sessionId }) {
    const { sponsored } = await ownSession(user, workspace, sessionId)
    return identityView(user, sessionId, sponsored)
  }

  async function declareIdentity({ user, workspace, sessionId, level, declaredName, requestId = null }) {
    const { sponsored } = await ownSession(user, workspace, sessionId)
    if (level === 'L2' || level === 'L3') {
      audit('support.identity.refused', sessionId, { sessionId, level, requestId })
      throw new ApiError('IDENTITY_LEVEL_NOT_AVAILABLE', level === 'L2'
        ? 'Level 2 is recorded by your institution, not by you. Ask your institution if it confirms identities for this assessment.'
        : 'A document-based identity check (Level 3) is not available.', { details: { level, reason: level === 'L2' ? 'INSTITUTION_RECORDS_THIS' : 'NOT_OFFERED' } })
    }
    const name = typeof declaredName === 'string' ? declaredName.trim().replace(/\s+/g, ' ') : ''
    if (name.length < 2 || name.length > DECLARED_NAME_MAX) throw new ApiError('VALIDATION_FAILED', 'Enter your full name as you use it for your studies.')
    const existing = legacy.getVerification ? await legacy.getVerification(sessionId) : null
    if (existing?.status === 'self_declared') return { created: false, identity: await identityView(user, sessionId, sponsored) }
    if (existing) throw new ApiError('CONFLICT', 'An identity check is already on file for this assessment.')
    if (typeof legacy.recordVerification !== 'function') throw new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Identity checks are temporarily unavailable.')
    const nameMatch = Boolean(user.name) && normaliseName(user.name) === normaliseName(name)
    // Minimal record: the declared name and whether it matches the account
    // name. No document number, date of birth, address or device data.
    await legacy.recordVerification(sessionId, { fullName: name, nameMatch, status: 'self_declared', meta: { source: 'api_v1', level: 'L1' } })
    audit('support.identity.declared', sessionId, { sessionId, level: 'L1', nameMatchesAccount: nameMatch, requestId })
    return { created: true, identity: await identityView(user, sessionId, sponsored) }
  }

  // ── The learner's own requests (Settings) ─────────────────────────────────
  async function listForUser({ user, workspace }) {
    const r = store()
    const inWorkspace = async (sessionId) => {
      try { await ownSession(user, workspace, sessionId); return true } catch { return false }
    }
    const reviews = []
    for (const req of await r.reportReviews.listHumanReviewsForUser(user.id)) {
      if (await inWorkspace(req.sessionId)) reviews.push((await reviewView(req.sessionId, req)))
    }
    const org = workspace.type === 'CAMPUS_STUDENT' ? workspace.organizationId : null
    const accommodations = (await r.accommodationRequests.listForUser(user.id))
      .filter((row) => (row.organizationId || null) === org)
      .map((row) => ({ assignmentId: row.assignmentId, ...requestView(row) }))
    return { humanReviews: reviews, accommodations }
  }

  // ── Staff plane (accommodations:read / accommodations:manage; the admin
  // router checks permissions and writes the admin audit row) ───────────────
  // The list never carries the needs text; only the audited detail read does.
  const staffSummary = (row) => row && ({
    id: row.id, assignmentId: row.assignmentId, organizationId: row.organizationId ?? null, status: row.status,
    modes: row.modes ? cleanModes(row.modes) : null, material: Boolean(row.material), createdAt: row.createdAt,
    decidedAt: row.decidedAt ?? null, linkedToSession: Boolean(row.sessionId),
  })

  async function listAccommodationRequests({ status = null, page = 1, pageSize = 50 } = {}) {
    const size = Math.min(Math.max(Number(pageSize) || 50, 1), 200)
    const p = Math.max(Number(page) || 1, 1)
    const { rows, total } = await store().accommodationRequests.listByStatus({ status, limit: size, offset: (p - 1) * size })
    return { rows: rows.map(staffSummary), total, page: p, pageSize: size }
  }

  async function getAccommodationRequest(id) {
    const row = await store().accommodationRequests.get(id)
    if (!row) throw new ApiError('NOT_FOUND', 'Not found')
    return { ...staffSummary(row), needs: row.needs, decisionNote: row.decisionNote ?? null, sessionId: row.sessionId ?? null }
  }

  async function decideAccommodationRequest({ id, approve, modes, material = false, note, decidedBy }) {
    const r = store()
    const row = await r.accommodationRequests.get(id)
    if (!row) throw new ApiError('NOT_FOUND', 'Not found')
    if (row.sessionId || row.status === 'LAPSED') throw new ApiError('CONFLICT', 'The assessment has already started; an accommodation cannot change a session that is running or finished.', { details: { reason: 'SESSION_STARTED' } })
    if (row.status !== 'REQUESTED') throw new ApiError('CONFLICT', `This request was already ${row.status.toLowerCase()}.`, { details: { reason: 'ALREADY_DECIDED' } })
    const decided = await r.accommodationRequests.decide(id, { approved: approve, modes, material, note, decidedBy })
    // Lost a race with the start or another decision.
    if (!decided) throw new ApiError('CONFLICT', 'This request changed while you were deciding it. Reload it.', { details: { reason: 'CHANGED' } })
    audit('accommodation_decided', null, { accommodationRequestId: id, assignmentId: row.assignmentId, approved: approve, modes: decided.modes, material: decided.material, by: 'admin_console', plane: 'v3_pre_start' })
    return staffSummary(decided)
  }

  return {
    humanReviewStatus, requestHumanReview,
    accommodationStatus, requestAccommodation, linkAccommodationAtStart,
    identityStatus, declareIdentity,
    listForUser,
    listAccommodationRequests, getAccommodationRequest, decideAccommodationRequest,
  }
}
