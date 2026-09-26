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
// on the harness server seeds it). `workMaterials` pins the first frozen
// fixed-form definition that has work materials (C5.11); `seat` adds a
// synthetic sponsorship entitlement so the V3 start can reserve a place.
export async function seedSponsoredAssignment({ databaseUrl, ownerUserId, studentUserId, definitionId = 'prism-workplace-core', workMaterials = false, seat = false }) {
  const repos = await reposFor(databaseUrl)
  const suffix = randomUUID().slice(0, 8)
  const org = await repos.organizations.createOrganization({
    name: `Synthetic Campus ${suffix}`, slug: `synthetic-campus-${suffix}`, organizationType: 'UNIVERSITY', status: 'ACTIVE',
  })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: ownerUserId, role: 'ORG_OWNER', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: studentUserId, role: 'STUDENT', status: 'ACTIVE' })
  const day = 86400000
  let form = { definitionId, formPolicy: 'SERVER_SELECTED', formId: null }
  if (workMaterials) {
    // Governed-bank definitions are the fixed-form ones (every form carries
    // its job family); the spec asserts the session really has materials.
    let pinned = null
    for (const d of await repos.assessments.listDefinitions()) {
      if (d.id === 'prism-workplace-core') continue
      pinned = (await repos.assessments.listForms(d.id)).find((f) => f.jobFamilyId) || null
      if (pinned) break
    }
    if (!pinned) throw new Error('no fixed-form definition in the catalog')
    form = { definitionId: pinned.definitionId, formPolicy: 'FIXED_FORM', formId: pinned.id }
  }
  const assignment = await repos.assessments.createAssignment({
    id: randomUUID(), ...form, sponsorType: 'INSTITUTION', organizationId: org.id,
    windowStart: new Date(Date.now() - day).toISOString(), windowEnd: new Date(Date.now() + 7 * day).toISOString(),
    integrityPolicy: 'STANDARD', accommodationsPolicy: { requestable: true }, reminderPolicy: { enabled: false },
    createdBy: ownerUserId, status: 'ACTIVE', targets: [{ targetType: 'USER', targetId: studentUserId }],
  })
  await repos.assessments.addStudent({ assignmentId: assignment.id, userId: studentUserId, status: 'ASSIGNED' })
  let entitlementId = null
  if (seat) {
    const ent = await repos.entitlements.createEntitlement({
      organizationId: org.id, sourceType: 'INSTITUTION_SPONSORSHIP', productCode: 'PRISM_CAMPUS_ASSESSMENT', quantity: 5,
      validFrom: new Date(Date.now() - day).toISOString(), validUntil: new Date(Date.now() + 30 * day).toISOString(), status: 'ACTIVE',
    })
    entitlementId = ent.id
  }
  return { organizationId: org.id, organizationName: org.name, assignmentId: assignment.id, entitlementId }
}

export async function listConsumptions({ databaseUrl, entitlementId }) {
  const repos = await reposFor(databaseUrl)
  return repos.entitlements.listConsumptions(entitlementId)
}

export async function listConsentRecords({ databaseUrl, userId }) {
  const repos = await reposFor(databaseUrl)
  return repos.sharing.listConsents(userId)
}

// Journey C: invitation emails are not delivered in the harness, so the test
// writes one extra cohort invitation with a known token (hash stored only).
export async function seedCohortInvite({ databaseUrl, organizationId, cohortId, email, invitedBy }) {
  const repos = await reposFor(databaseUrl)
  const { hashToken } = await import('../../server/domain/memberships/inviteService.js')
  const token = randomBytes(32).toString('base64url')
  await repos.memberships.createInvite({
    organizationId, email: String(email).toLowerCase(), role: 'STUDENT', cohortId, tokenHash: hashToken(token), invitedBy,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  })
  return { token }
}

// Journey C: an owner-only organization (no student invitation).
export async function seedOrganization({ databaseUrl, ownerUserId }) {
  const repos = await reposFor(databaseUrl)
  const suffix = randomUUID().slice(0, 8)
  const org = await repos.organizations.createOrganization({
    name: `Synthetic Campus ${suffix}`, slug: `synthetic-campus-${suffix}`, organizationType: 'UNIVERSITY', status: 'ACTIVE',
  })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: ownerUserId, role: 'ORG_OWNER', status: 'ACTIVE' })
  return { organizationId: org.id, organizationName: org.name }
}
