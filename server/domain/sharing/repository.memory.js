// Consent records + student share grants — memory adapter.
import { clone } from '../campusStore/memoryDb.js'

export function createSharingRepoMemory(db) {
  return {
    async recordConsent({ userId, organizationId = null, consentType, copyVersion, grantedAt }) {
      const row = { id: db.id(), userId, organizationId, consentType, copyVersion, grantedAt, withdrawnAt: null }
      db.consents.push(row)
      return clone(row)
    },
    async listConsents(userId) {
      return db.consents.filter((c) => c.userId === userId).map(clone)
    },
    async createShareGrant({ ownerUserId, recipientType, recipientOrganizationId = null, tokenHash = null, expiresAt, resources = [] }) {
      const row = { id: db.id(), ownerUserId, recipientType, recipientOrganizationId, tokenHash, expiresAt, revokedAt: null, createdAt: db.clock().toISOString() }
      db.shareGrants.set(row.id, row)
      for (const r of resources) db.shareGrantResources.push({ shareGrantId: row.id, resourceType: r.resourceType, resourceId: String(r.resourceId), disclosureLevel: r.disclosureLevel })
      return { ...clone(row), resources: clone(resources) }
    },
    // Every grant the owner created (newest first), with its resources and recipient org name.
    async listShareGrantsForOwner(ownerUserId) {
      return [...db.shareGrants.values()]
        .filter((g) => g.ownerUserId === ownerUserId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .map((g) => ({
          ...clone(g),
          recipientOrganizationName: g.recipientOrganizationId ? db.organizations.get(g.recipientOrganizationId)?.name || null : null,
          resources: db.shareGrantResources.filter((r) => r.shareGrantId === g.id).map(({ shareGrantId: _s, ...r }) => clone(r)),
        }))
    },
    async revokeShareGrant(id, ownerUserId, revokedAt) {
      const row = db.shareGrants.get(id)
      if (!row || row.ownerUserId !== ownerUserId) return null
      row.revokedAt = row.revokedAt || revokedAt
      return clone(row)
    },
    // Active (unexpired, unrevoked) grants from `ownerUserId` to `organizationId` naming the resource.
    async findActiveOrgGrants({ ownerUserId, organizationId, resourceType, resourceId, at }) {
      return [...db.shareGrants.values()]
        .filter((g) => g.ownerUserId === ownerUserId && g.recipientType === 'ORGANIZATION' && g.recipientOrganizationId === organizationId
          && !g.revokedAt && new Date(g.expiresAt) > new Date(at))
        .filter((g) => db.shareGrantResources.some((r) => r.shareGrantId === g.id && r.resourceType === resourceType && r.resourceId === String(resourceId)))
        .map(clone)
    },
  }
}
