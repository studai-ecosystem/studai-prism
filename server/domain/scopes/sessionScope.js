// Assessment session sponsorship scope (spec §4.3; contract §4).
//   resolveSessionScope — a session with no scope row is PERSONAL / OWNER_ONLY.
//   recordSponsoredStart — writes the scope row for a sponsored start (used by
//   the sponsored start path; the legacy start path is always personal).
//   authorizeSponsorRead — can an organization reader see this session?
import { can } from '../permissions/can.js'

export function personalScopeFor(sessionId, ownerUserId) {
  return {
    sessionId,
    ownerUserId,
    sponsorType: 'PERSONAL',
    sponsorOrganizationId: null,
    workspaceId: 'personal',
    programId: null,
    cohortId: null,
    visibilityPolicy: 'OWNER_ONLY',
    createdBy: ownerUserId,
    implicit: true,
  }
}

export function createSessionScopeService({ repos, clock = () => new Date(), sessionOwner = async () => null }) {
  async function resolveSessionScope(sessionId, { ownerUserId = null } = {}) {
    const row = await repos.scopes.getSessionScope(sessionId)
    return row || personalScopeFor(sessionId, ownerUserId)
  }

  return {
    resolveSessionScope,

    async recordSponsoredStart({ sessionId, user, workspace, cohortId = null, programId = null, visibilityPolicy = 'OWNER_AND_SPONSOR' }) {
      if (workspace?.type !== 'CAMPUS_STUDENT') {
        const { implicit: _implicit, ...personal } = personalScopeFor(sessionId, user.id)
        return repos.scopes.createSessionScope(personal)
      }
      return repos.scopes.createSessionScope({
        sessionId,
        ownerUserId: user.id,
        sponsorType: 'INSTITUTION',
        sponsorOrganizationId: workspace.organizationId,
        workspaceId: workspace.id,
        programId,
        cohortId,
        visibilityPolicy,
        createdBy: user.id,
      })
    },

    // Returns the scope when `actor` may read the session individually in
    // `organizationId`, else null (callers answer 404 — no existence leak).
    async authorizeSponsorRead({ actor, organizationId, sessionId }) {
      const row = await repos.scopes.getSessionScope(sessionId)
      let scope = row
      if (!scope) {
        // No scope row = PERSONAL: never readable through sponsorship, only
        // through an explicit share grant from its owner.
        const owner = await sessionOwner(sessionId)
        if (!owner) return null
        scope = personalScopeFor(sessionId, owner)
      }
      const ownedByOrg = scope.sponsorType === 'INSTITUTION' && scope.sponsorOrganizationId === organizationId
      if (ownedByOrg && scope.visibilityPolicy === 'OWNER_AND_SPONSOR') {
        const cohort = scope.cohortId ? await repos.organizations.getCohort(scope.cohortId) : null
        const decision = can(actor, 'students.sponsored_result.read', {
          organizationId,
          ownerUserId: scope.ownerUserId,
          cohortId: scope.cohortId || null,
          departmentId: cohort?.departmentId || null,
        })
        if (decision.allowed) return { scope, via: 'SPONSORSHIP', decision }
      }
      // An explicit, unexpired, unrevoked student share grant to this org —
      // usable only by readers whose own scope covers that student.
      const grants = await repos.sharing.findActiveOrgGrants({
        ownerUserId: scope.ownerUserId, organizationId, resourceType: 'ASSESSMENT_REPORT', resourceId: sessionId, at: clock().toISOString(),
      })
      if (grants.length === 0) return null
      const cohorts = await repos.organizations.listCohortsForUser(organizationId, scope.ownerUserId)
      const targets = cohorts.length ? cohorts : [{ id: null, departmentId: null }]
      const inScope = targets.some((c) => can(actor, 'students.read', {
        organizationId, ownerUserId: scope.ownerUserId, cohortId: c.id, departmentId: c.departmentId,
      }).allowed)
      if (inScope) return { scope, via: 'SHARE_GRANT' }
      return null
    },
  }
}
