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
import { createCatalogService } from '../assessments/catalogService.js'
import { createAssignmentService } from '../assessments/assignmentService.js'
import { createSessionDirectory } from '../student/sessionDirectory.js'
import { createStudentReadModels } from '../student/readModels.js'
import { createAssessmentSessionService } from '../assessments/sessionService.js'
import { createReportService } from '../reports/v3/service.js'
import { createTelemetryService } from '../telemetry/events.js'
import { auditLog } from '../../lib/telemetry.js'

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
    student: createStudentReadModels({ directory, catalog, assignments, evidence, practice, roles, legacy, clock }),
    telemetry: createTelemetryService({ repos: storeView, clock, ...(hashActor ? { hashActor } : {}) }),
    sessions: engine
      ? createAssessmentSessionService({
        repos: storeView, assignments, catalog, scenarioSource, engine, legacy, resolver, ledger, sessionScopes, clock, limitMs, audit: auditWriter,
      })
      : null,
    ledger,
    reports: createReportService({
      repos: storeView, legacy, catalog, evidence, sessionScopes, dataAccess, scenarioSource, audit: auditWriter, clock, ...(shareTokenFactory ? { tokenFactory: shareTokenFactory } : {}),
    }),
    invites: createInviteService({ repos, sendInviteEmail, inviteUrlFor, clock, ...(tokenFactory ? { tokenFactory } : {}), ...(audit ? { audit } : {}) }),
    sessionScopes,
    dataAccess,
    requireCampus: createRequireCampus({ campusStoreAvailable }),
    requireOrgPermission: createRequireOrgPermission({ workspaceService }),
    resolveWorkspace: createResolveWorkspace({ workspaceService }),
  }
}
