// Entitlement resolution (spec §31.1; contract §6). Pure decision over
// repository reads: PERSONAL workspaces only ever see the user's own personal
// sources (V2 rows + legacy records via the adapter); CAMPUS_STUDENT
// workspaces only ever see their organization's sponsorship. The two pools
// never mix.
import { fromLegacyEntitlement } from './legacyAdapter.js'

export const PERSONAL_SOURCES = Object.freeze(['PERSONAL_PURCHASE', 'PROMO', 'ADMIN_GRANT'])
export const SPONSOR_SOURCES = Object.freeze(['INSTITUTION_SPONSORSHIP'])

function inWindow(e, at) {
  const t = at.getTime()
  if (e.validFrom && new Date(e.validFrom).getTime() > t) return false
  if (e.validUntil && new Date(e.validUntil).getTime() <= t) return false
  return true
}
const expired = (e, at) => e.status === 'EXPIRED' || Boolean(e.validUntil && new Date(e.validUntil).getTime() <= at.getTime())
const remaining = (e) => e.quantity - e.consumedQuantity
const matchesDefinition = (e, definitionId) => !definitionId || !e.assessmentDefinitionId || e.assessmentDefinitionId === definitionId
const usable = (e, at) => e.status === 'ACTIVE' && inWindow(e, at) && remaining(e) > 0

function decision(allowed, reason, extra = {}) {
  return { allowed, reason, source: null, entitlementId: null, consumptionRequired: false, expiresAt: null, scope: null, ...extra }
}

export function createEntitlementResolver({ repos, legacyLookup = async () => [], clock = () => new Date() }) {
  async function resolvePersonal({ user, workspace, definitionId, at }) {
    const scope = { workspaceId: workspace.id, organizationId: null, sponsorType: 'PERSONAL' }
    const own = (await repos.entitlements.listEntitlements({ userId: user.id, organizationId: null, sourceTypes: PERSONAL_SOURCES }))
      .filter((e) => matchesDefinition(e, definitionId))
    const pick = own.find((e) => usable(e, at))
    if (pick) return decision(true, 'ALLOWED', { source: pick.sourceType, entitlementId: pick.id, consumptionRequired: true, expiresAt: pick.validUntil, scope })
    const legacy = (await legacyLookup(user)).map(fromLegacyEntitlement).filter((e) => e && e.userId === user.id)
    const open = legacy.find((e) => e.status === 'ACTIVE')
    if (open) return decision(true, 'ALLOWED', { source: open.sourceType, entitlementId: open.id, legacySessionId: open.legacySessionId, consumptionRequired: false, scope })
    if (own.some((e) => expired(e, at))) return decision(false, 'ENTITLEMENT_EXPIRED', { scope })
    return decision(false, 'ENTITLEMENT_REQUIRED', { scope })
  }

  async function resolveCampus({ user, workspace, definitionId, at }) {
    const orgId = workspace.organizationId
    const scope = { workspaceId: workspace.id, organizationId: orgId, sponsorType: 'INSTITUTION' }
    const memberships = await repos.memberships.listMembershipsForUser(user.id)
    const member = memberships.find((m) => m.organizationId === orgId && m.role === 'STUDENT' && m.status === 'ACTIVE')
    if (!member) return decision(false, 'NOT_A_MEMBER', { scope })
    const pool = (await repos.entitlements.listEntitlements({ organizationId: orgId, sourceTypes: SPONSOR_SOURCES }))
      .filter((e) => (e.userId === null || e.userId === user.id) && matchesDefinition(e, definitionId))
    const pick = pool.find((e) => usable(e, at))
    if (pick) return decision(true, 'ALLOWED', { source: pick.sourceType, entitlementId: pick.id, consumptionRequired: true, expiresAt: pick.validUntil, scope })
    if (pool.length && pool.every((e) => expired(e, at) || e.status !== 'ACTIVE') && pool.some((e) => expired(e, at))) {
      return decision(false, 'ENTITLEMENT_EXPIRED', { scope })
    }
    if (pool.some((e) => e.status === 'ACTIVE' && inWindow(e, at) && remaining(e) <= 0)) return decision(false, 'ENTITLEMENT_EXHAUSTED', { scope })
    return decision(false, 'ENTITLEMENT_REQUIRED', { scope })
  }

  return {
    async resolveEntitlement({ user, workspace, action = 'assessment.start', assignment = null }) {
      const at = clock()
      if (action !== 'assessment.start') return decision(false, 'UNKNOWN_ACTION')
      const definitionId = assignment?.assessmentDefinitionId || null
      if (!user?.id || !workspace) return decision(false, 'UNAUTHENTICATED')
      if (workspace.type === 'PERSONAL') return resolvePersonal({ user, workspace, definitionId, at })
      if (workspace.type === 'CAMPUS_STUDENT') return resolveCampus({ user, workspace, definitionId, at })
      return decision(false, 'NOT_APPLICABLE', { scope: { workspaceId: workspace.id, organizationId: workspace.organizationId ?? null, sponsorType: null } })
    },
  }
}
