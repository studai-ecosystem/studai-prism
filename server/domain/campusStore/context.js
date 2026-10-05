// Campus context: repositories + services + guards wired once and injected
// into the /api/v1 routers. Tests pass memory repositories; the app uses the
// Postgres repositories whenever DATABASE_URL is configured.
import { isEnabled } from '../flags/index.js'
import { createWorkspaceService } from '../workspaces/service.js'
import { createResolveWorkspace } from '../workspaces/resolveWorkspace.js'
import { createEntitlementResolver } from '../entitlements/resolver.js'
import { createEntitlementLedger } from '../entitlements/ledger.js'
import { createInviteService } from '../memberships/inviteService.js'
import { createSessionScopeService } from '../scopes/sessionScope.js'
import { createDataAccessAudit } from '../audit/dataAccess.js'
import { createRequireCampus, createRequireOrgPermission } from '../permissions/middleware.js'
import { can } from '../permissions/can.js'
import { createCatalogService } from '../assessments/catalogService.js'
import { createAssignmentService } from '../assessments/assignmentService.js'
import { createSessionDirectory } from '../student/sessionDirectory.js'
import { createStudentReadModels } from '../student/readModels.js'
import { createStudentHistory } from '../student/history.js'
import { createAssessmentSessionService } from '../assessments/sessionService.js'
import { createReportService } from '../reports/v3/service.js'
import { createTelemetryService } from '../telemetry/events.js'
import { createCampusAdminService } from '../campusAdmin/service.js'
import { createDevelopmentService } from '../development/service.js'
import { resolveRecommendations } from '../development/recommendations.js'
import { createGrowthService } from '../growth/service.js'
import { createSessionEntryLoader } from '../growth/entries.js'
import { createAnalyticsService } from '../analytics/service.js'
import { createBillingService } from '../billing/service.js'
import { createValidationService } from '../validation/service.js'
import { createPreparationService } from '../preparation/service.js'
import { createGrantService } from '../commerce/grants.js'
import { createPreviewService } from '../commerce/preview.js'
import { createReleaseGate } from '../release/config.js'
import { buildRunPin } from '../assessments/draftSegments.js'
import { contentRegistry } from '../content/versions.js'
import { auditLog } from '../../lib/telemetry.js'

// Account directory (read-only) for admin views: `{ id, name, email }` or null.
export const EMPTY_USER_DIRECTORY = Object.freeze({
  findById: async () => null,
  findByEmail: async () => null,
})

// Legacy sources the student read models consult (read-only). Tests inject
// synthetic ones; the app wires the v1 store (defaultContext.js).
export const EMPTY_LEGACY_SOURCES = Object.freeze({
  listEntitlements: async () => [],
  listSessionIds: async () => [],
  getSession: async () => null,
  getReport: async () => null,
  getEntitlement: async () => null,
  createEntitlement: async () => null,
  paths: {
    purchase: '/payment',
    start: (sessionId) => `/briefing?session=${encodeURIComponent(sessionId)}`,
    resume: (sessionId, bank) => (bank ? `/workspace/${encodeURIComponent(sessionId)}` : `/assessment?session=${encodeURIComponent(sessionId)}`),
    report: (sessionId, bank) => (bank ? `/report/${encodeURIComponent(sessionId)}/v2` : `/score?session=${encodeURIComponent(sessionId)}`),
  },
})

export function createCampusContext({
  repos,
  campusStoreAvailable = () => Boolean(repos),
  legacyLookup = async () => [],
  clock = () => new Date(),
  sendInviteEmail,
  inviteUrlFor,
  tokenFactory,
  sessionOwner,
  audit,
  legacy = EMPTY_LEGACY_SOURCES,
  scenarioSource = async () => ({ generalScenarios: [], bankScenarios: {} }),
  evidence = { units: async () => [] },
  practice,
  roles = { evaluate: async () => [] },
  hashActor,
  engine = null,
  limitMs = 35 * 60 * 1000,
  shareTokenFactory,
  users = EMPTY_USER_DIRECTORY,
  sendAssignmentEmail,
  appUrl = '',
  missionEvaluator = null,
  // P2.4 bounded evidence evaluator for draft-segment runs (sliceEvaluator.js).
  sliceEvaluator = null,
  // P7 private preparation: the AI gateway `complete` function (null → the
  // participant and card report themselves unavailable; nothing is guessed).
  preparationComplete = null,
} = {}) {
  const campusAvailable = () => isEnabled('PRISM_CAMPUS_ENABLED') && campusStoreAvailable()
  const workspaceService = createWorkspaceService({ repos, campusAvailable })
  const resolver = createEntitlementResolver({ repos, legacyLookup, clock })
  // Student read models use the store only when it is actually available.
  const liveRepos = () => (repos && campusStoreAvailable() ? repos : null)
  const storeView = new Proxy({}, { get: (_t, key) => liveRepos()?.[key] })
  const catalog = createCatalogService({ repos: storeView, scenarioSource })
  const directory = createSessionDirectory({ repos: storeView, legacy })
  const assignments = createAssignmentService({ repos: storeView, catalog, directory, legacy, resolver, clock })
  const ledger = createEntitlementLedger({ repos, clock, ...(audit ? { audit } : {}) })
  const sessionScopes = createSessionScopeService({ repos, clock, ...(sessionOwner ? { sessionOwner } : {}) })
  const auditWriter = audit || auditLog
  const dataAccess = createDataAccessAudit({ repos })
  const development = createDevelopmentService({ repos: storeView, evaluator: missionEvaluator, clock, audit: auditWriter, sourceSession: async (sessionId) => (legacy.getSession ? legacy.getSession(sessionId) : null) })
  // P10.2 release gate for NEW universal/draft runs. Probes report facts this
  // process can actually observe; anything else stays UNVERIFIED. Migration
  // state is not probed here (the diagnostic script does that read-only).
  const hasFns = (obj, names) => Boolean(obj) && names.every((n) => typeof obj[n] === 'function')
  const releaseGate = createReleaseGate({
    probes: {
      player: ({ scenarioId }) => { try { return Boolean(buildRunPin({ formId: null, scenarioId }).methodVersion) } catch { return false } },
      durableWriter: () => hasFns(liveRepos()?.sessionIo, ['acceptAction', 'enqueueJob', 'allocateRunTiming', 'listOpportunities', 'hasErasureMarker']),
      migrationsApplied: async () => { const r = liveRepos(); return typeof r?.listAppliedMigrations === 'function' ? r.listAppliedMigrations() : null },
      evaluator: () => Boolean(sliceEvaluator),
      publication: () => hasFns(liveRepos()?.reportVersions, ['append', 'latest']),
      contentState: async ({ scenarioId }) => {
        const formId = (await catalog.getCatalog()).forms.find((f) => f.scenarioId === scenarioId)?.id || null
        return formId ? contentRegistry.stateOf(formId) : null
      },
      // Server startup drains durable work; finish uses the same worker.
      worker: () => (sliceEvaluator && hasFns(liveRepos()?.sessionIo, ['claimJob', 'captureEvaluationInput', 'applyEvaluation', 'renewJobLease', 'listPublicationPendingJobs']) ? true : null),
    },
  })
  const developmentOn = () => isEnabled('PRISM_DEVELOPMENT_V2') && Boolean(liveRepos())
  // Practice evidence reaches the student read models only while Development V2 is on.
  const practiceSource = practice || { list: async (user, workspace) => (developmentOn() ? development.listPractice(user, workspace) : []) }
  const recommendFor = async (user, workspace, gaps) => (developmentOn() ? development.recommendFor(user, workspace, gaps) : resolveRecommendations({ gaps, practiceEnabled: false }))
  const developmentPlans = { enabled: developmentOn, planFor: (user, workspace, priorities) => development.planFor(user, workspace, priorities), recommendFor }
  // Late-bound: invites and sessions notify campus admin, which uses invites.
  let admin = null
  const invites = createInviteService({
    repos, sendInviteEmail, inviteUrlFor, clock, ...(tokenFactory ? { tokenFactory } : {}), ...(audit ? { audit } : {}),
    onCohortJoined: ({ organizationId, cohortId, userId }) => admin.syncRoster(organizationId, cohortId, userId),
  })
  admin = createCampusAdminService({
    repos: storeView, users, invites, catalog, clock, audit: auditWriter, appUrl, ledger, ...(sendAssignmentEmail ? { sendAssignmentEmail } : {}),
    onRosterSync: (organizationId, cohortId, userId) => development.syncCohortMember(organizationId, cohortId, userId),
  })
  const growth = createGrowthService({ repos: storeView, catalog, clock, audit: auditWriter, entryFor: createSessionEntryLoader({ catalog, evidence, legacy, reportReviews: { listForSession: (id) => (storeView.reportReviews ? storeView.reportReviews.listForSession(id) : []) } }) })
  // P7: private preparation and SELF_REPORT check-ins (PERSONAL only). Its
  // repository is separate from development/evidence and never read by
  // analytics or reports.
  const preparation = createPreparationService({ repos: storeView, complete: preparationComplete, clock, audit: auditWriter })
  const preparationOn = () => isEnabled('PRISM_PREPARATION_V1') && Boolean(liveRepos())
  const growthOn = () => isEnabled('PRISM_GROWTH_ENABLED') && Boolean(liveRepos())
  const analytics = createAnalyticsService({ repos: storeView, entryFor: createSessionEntryLoader({ catalog, evidence, legacy }), growth })
  // Overview cards that later phases fill (counts only; null while dark).
  const overviewExtras = async (organizationId) => ({
    missionsActive: developmentOn() ? (await liveRepos().development.listInterventions(organizationId)).filter((i) => i.status === 'ACTIVE').length : null,
    reassessmentsDue: growthOn() ? (await liveRepos().growth.listCycles(organizationId)).filter((c) => ['SCHEDULED', 'ACTIVE'].includes(c.status) && new Date(c.windowEnd) > clock()).length : null,
  })
  const growthReads = {
    enabled: growthOn,
    growthFor: (user, workspace, entries) => growth.growthFor(user, workspace, entries),
    reassessmentsFor: (user, workspace) => growth.reassessmentsFor(user, workspace),
    // The student's own intervention timeline in this campus workspace.
    interventionsFor: async (user, workspace) => {
      if (workspace.type !== 'CAMPUS_STUDENT' || !developmentOn()) return []
      return (await liveRepos().development.listInterventionsForUser(user.id, workspace.organizationId))
        .filter((i) => i.status !== 'CANCELLED')
        .map((i) => ({ id: i.id, name: i.name, startsOn: i.startsOn, endsOn: i.endsOn, status: i.status }))
        .sort((a, b) => String(a.startsOn).localeCompare(String(b.startsOn)))
    },
  }
  // Blinded human double-rating of V3 evidence (identity tokenised).
  const validation = createValidationService({
    repos: storeView, evidence,
    candidateNameFor: async (sessionId) => {
      const s = await legacy.getSession(sessionId)
      return s?.userId ? (await users.findById(s.userId))?.name || null : null
    },
    sessionState: async (sessionId) => (legacy.adminState ? legacy.adminState(sessionId) : null),
  })
  // T33: judge disagreement feeds the existing rating queue only when that
  // queue is switched on; otherwise the HUMAN_REVIEW_REQUIRED units stand.
  const ratingQueueOn = () => process.env.PRISM_V3_RATING_QUEUE === 'true'
  const onHumanReviewRequired = async ({ sessionId, reason }) => {
    if (!ratingQueueOn()) return { enqueued: 0, skipped: 'RATING_QUEUE_OFF' }
    return validation.enqueueSession(sessionId, { enqueuedBy: `system:${String(reason).toLowerCase()}` })
  }
  const reports = createReportService({
    repos: storeView, legacy, catalog, evidence, sessionScopes, dataAccess, scenarioSource, audit: auditWriter, clock, ...(shareTokenFactory ? { tokenFactory: shareTokenFactory } : {}),
    // P5.6 read-time recommendations: honest PRACTICE_OFF while Development V2 is dark.
    development: { recommendFor },
  })
  return {
    repos,
    campusAvailable,
    // Account-level features (preferences, share grants) need only the store.
    storeAvailable: () => Boolean(liveRepos()),
    store: storeView,
    // Decision-trail writer for student-initiated privacy actions.
    audit: auditWriter,
    workspaceService,
    resolver,
    catalog,
    assignments,
    student: createStudentReadModels({ directory, catalog, assignments, evidence, practice: practiceSource, development: developmentPlans, growth: growthReads, preparation: { enabled: preparationOn, list: (user, workspace) => preparation.list(user, workspace) }, roles, legacy, clock, repos: storeView }),
    // Authorized history projection (P1.2): formal sessions, legacy reports
    // and practice attempts of the caller in the active workspace.
    history: createStudentHistory({
      directory, catalog, legacy, clock,
      practice: { listAttemptHistory: async (user, workspace) => (developmentOn() ? development.listAttemptHistory(user, workspace) : []) },
      preparation: {
        listAttemptHistory: async (user, workspace) => (preparationOn() ? preparation.listAttemptHistory(user, workspace) : []),
        listCheckinHistory: async (user, workspace) => (preparationOn() ? preparation.listCheckinHistory(user, workspace) : []),
      },
    }),
    telemetry: createTelemetryService({ repos: storeView, clock, ...(hashActor ? { hashActor } : {}) }),
    // P8: product grants over the ledger, and the guest free first experience.
    commerce: createGrantService({ repos: storeView, ledger, clock, audit: auditWriter }),
    preview: createPreviewService({ repos: storeView, clock, telemetry: createTelemetryService({ repos: storeView, clock, ...(hashActor ? { hashActor } : {}) }) }),
    sessions: engine
      ? createAssessmentSessionService({
        repos: storeView, assignments, catalog, scenarioSource, engine, legacy, resolver, ledger, sessionScopes, clock, limitMs, audit: auditWriter, sliceEvaluator, releaseGate, onHumanReviewRequired,
        onSponsoredCompleted: ({ organizationId, assignmentId }) => admin.checkCompletionThresholds(organizationId, assignmentId),
        // Explicit Report V3 publication once a run's evidence is applied.
        publishReport: ({ sessionId, requestId }) => reports.publish(sessionId, { reason: 'INITIAL', requestId }),
      })
      : null,
    ledger,
    reports,
    invites,
    admin,
    development,
    growth,
    preparation,
    analytics,
    billing: createBillingService({ repos: storeView, clock }),
    validation,
    overviewExtras,
    // Effective scope of `permission` for an actor in an organization.
    scopeFor: (actor, organizationId, permission) => can(actor, permission, { organizationId }),
    sessionScopes,
    dataAccess,
    requireCampus: createRequireCampus({ campusStoreAvailable }),
    requireOrgPermission: createRequireOrgPermission({ workspaceService }),
    resolveWorkspace: createResolveWorkspace({ workspaceService }),
  }
}
