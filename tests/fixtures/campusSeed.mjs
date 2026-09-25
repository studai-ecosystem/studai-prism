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

async function reposFor(databaseUrl) {
  if (!databaseUrl) throw new Error('campus fixtures need the throwaway e2e database')
  process.env.DATABASE_URL = databaseUrl
  const pool = await import('../../server/db/pool.js')
  const { createPgCampusRepos } = await import('../../server/domain/campusStore/index.js')
  return createPgCampusRepos({ query: pool.query, getPool: pool.getPool })
}

// Student-app journey fixture (C4.14): a synthetic organization with the
// student as an ACTIVE member and one ACTIVE sponsored assignment due in a
// week. The catalog must already be seeded (any /api/v1/me/assessments call
// on the harness server seeds it).
export async function seedSponsoredAssignment({ databaseUrl, ownerUserId, studentUserId, definitionId = 'prism-workplace-core' }) {
  const repos = await reposFor(databaseUrl)
  const suffix = randomUUID().slice(0, 8)
  const org = await repos.organizations.createOrganization({
    name: `Synthetic Campus ${suffix}`, slug: `synthetic-campus-${suffix}`, organizationType: 'UNIVERSITY', status: 'ACTIVE',
  })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: ownerUserId, role: 'ORG_OWNER', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: studentUserId, role: 'STUDENT', status: 'ACTIVE' })
  const day = 86400000
  const assignment = await repos.assessments.createAssignment({
    id: randomUUID(), definitionId, formPolicy: 'SERVER_SELECTED', sponsorType: 'INSTITUTION', organizationId: org.id,
    windowStart: new Date(Date.now() - day).toISOString(), windowEnd: new Date(Date.now() + 7 * day).toISOString(),
    integrityPolicy: 'STANDARD', accommodationsPolicy: { requestable: true }, reminderPolicy: { enabled: false },
    createdBy: ownerUserId, status: 'ACTIVE', targets: [{ targetType: 'USER', targetId: studentUserId }],
  })
  await repos.assessments.addStudent({ assignmentId: assignment.id, userId: studentUserId, status: 'ASSIGNED' })
  return { organizationId: org.id, organizationName: org.name, assignmentId: assignment.id }
}

export async function listConsentRecords({ databaseUrl, userId }) {
  const repos = await reposFor(databaseUrl)
  return repos.sharing.listConsents(userId)
}
