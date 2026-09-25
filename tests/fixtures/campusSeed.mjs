// Test-only campus fixture (Journey B). Writes a synthetic organization,
// an owner membership and a student invitation straight into the THROWAWAY
// e2e database (PRISM_E2E_DATABASE_URL). Never used against real data.
import { randomBytes, randomUUID } from 'node:crypto'

export async function seedCampusFixture({ databaseUrl, ownerUserId, studentEmail }) {
  if (!databaseUrl) throw new Error('seedCampusFixture needs the throwaway e2e database')
  process.env.DATABASE_URL = databaseUrl
  const pool = await import('../../server/db/pool.js')
  const { createPgCampusRepos } = await import('../../server/domain/campusStore/index.js')
  const { hashToken } = await import('../../server/domain/memberships/inviteService.js')
  const repos = createPgCampusRepos({ query: pool.query, getPool: pool.getPool })

  const suffix = randomUUID().slice(0, 8)
  const org = await repos.organizations.createOrganization({
    name: `Synthetic Campus ${suffix}`, slug: `synthetic-campus-${suffix}`, organizationType: 'UNIVERSITY', status: 'ACTIVE',
  })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: ownerUserId, role: 'ORG_OWNER', status: 'ACTIVE' })
  const token = randomBytes(32).toString('base64url')
  await repos.memberships.createInvite({
    organizationId: org.id,
    email: String(studentEmail).toLowerCase(),
    role: 'STUDENT',
    tokenHash: hashToken(token),
    invitedBy: ownerUserId,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  })
  return { organizationId: org.id, organizationName: org.name, token }
}
