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
} = {}) {
  const campusAvailable = () => isEnabled('PRISM_CAMPUS_ENABLED') && campusStoreAvailable()
  const workspaceService = createWorkspaceService({ repos, campusAvailable })
  return {
    repos,
    campusAvailable,
    workspaceService,
    resolver: createEntitlementResolver({ repos, legacyLookup, clock }),
    ledger: createEntitlementLedger({ repos, clock, ...(audit ? { audit } : {}) }),
    invites: createInviteService({ repos, sendInviteEmail, inviteUrlFor, clock, ...(tokenFactory ? { tokenFactory } : {}), ...(audit ? { audit } : {}) }),
    sessionScopes: createSessionScopeService({ repos, clock, ...(sessionOwner ? { sessionOwner } : {}) }),
    dataAccess: createDataAccessAudit({ repos }),
    requireCampus: createRequireCampus({ campusStoreAvailable }),
    requireOrgPermission: createRequireOrgPermission({ workspaceService }),
    resolveWorkspace: createResolveWorkspace({ workspaceService }),
  }
}
