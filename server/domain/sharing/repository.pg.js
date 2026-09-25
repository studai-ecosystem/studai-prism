// Consent records + student share grants — Postgres adapter (0029).
import { iso, withTransaction } from '../campusStore/pgUtil.js'

const consent = (r) => r && ({ id: r.id, userId: r.user_id, organizationId: r.organization_id, consentType: r.consent_type, copyVersion: r.copy_version, grantedAt: iso(r.granted_at), withdrawnAt: iso(r.withdrawn_at) })
const grant = (r) => r && ({ id: r.id, ownerUserId: r.owner_user_id, recipientType: r.recipient_type, recipientOrganizationId: r.recipient_organization_id, tokenHash: r.token_hash, expiresAt: iso(r.expires_at), revokedAt: iso(r.revoked_at), createdAt: iso(r.created_at) })

export function createSharingRepoPg({ query, getPool }) {
  return {
    async recordConsent({ userId, organizationId = null, consentType, copyVersion, grantedAt }) {
      const { rows } = await query(
        'INSERT INTO consent_records (user_id, organization_id, consent_type, copy_version, granted_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [userId, organizationId, consentType, copyVersion, grantedAt],
      )
      return consent(rows[0])
    },
    async listConsents(userId) {
      const { rows } = await query('SELECT * FROM consent_records WHERE user_id = $1 ORDER BY granted_at ASC', [userId])
      return rows.map(consent)
    },
    async createShareGrant({ ownerUserId, recipientType, recipientOrganizationId = null, tokenHash = null, expiresAt, resources = [] }) {
      return withTransaction(getPool, async (client) => {
        const { rows } = await client.query(
          'INSERT INTO share_grants (owner_user_id, recipient_type, recipient_organization_id, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [ownerUserId, recipientType, recipientOrganizationId, tokenHash, expiresAt],
        )
        for (const r of resources) {
          await client.query(
            'INSERT INTO share_grant_resources (share_grant_id, resource_type, resource_id, disclosure_level) VALUES ($1, $2, $3, $4)',
            [rows[0].id, r.resourceType, String(r.resourceId), r.disclosureLevel],
          )
        }
        return { ...grant(rows[0]), resources }
      })
    },
    async revokeShareGrant(id, ownerUserId, revokedAt) {
      const { rows } = await query(
        'UPDATE share_grants SET revoked_at = COALESCE(revoked_at, $3) WHERE id = $1 AND owner_user_id = $2 RETURNING *',
        [id, ownerUserId, revokedAt],
      )
      return grant(rows[0]) || null
    },
    async findActiveOrgGrants({ ownerUserId, organizationId, resourceType, resourceId, at }) {
      const { rows } = await query(
        `SELECT g.* FROM share_grants g JOIN share_grant_resources r ON r.share_grant_id = g.id
         WHERE g.owner_user_id = $1 AND g.recipient_type = 'ORGANIZATION' AND g.recipient_organization_id = $2
           AND g.revoked_at IS NULL AND g.expires_at > $5 AND r.resource_type = $3 AND r.resource_id = $4`,
        [ownerUserId, organizationId, resourceType, String(resourceId), at],
      )
      return rows.map(grant)
    },
  }
}
