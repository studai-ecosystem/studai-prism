// PROD-READY Phase 9 on a throwaway PostgreSQL (TEST_DATABASE_URL):
//   * migration 0063: consent_records accepts the two employer consent types
//     (and nothing else new); a sponsored session of an EMPLOYER organization
//     can never carry an individual-visibility policy (trigger); an
//     organization cannot change to or from EMPLOYER; campus is unaffected;
//     down/up is clean;
//   * PostgreSQL repositories: memberships and invitations carry the
//     organization type; listActiveOrgGrants lists only unexpired, unrevoked
//     report shares to that organization in a fixed, result-free order;
//   * the employer workspace end to end on PostgreSQL: an employee's share
//     opens one report, revocation closes it;
//   * law 7: employer consent records go with the account (erasure cascade).
// Synthetic rows are removed at the end: later suites roll migrations back
// through 0063, whose down refuses while employer consent records exist.
// Requires TEST_DATABASE_URL (skips otherwise); run serially.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB
  process.env.PRISM_CAMPUS_ENABLED = 'true'
}

const { migrateUp, migrateDown } = skip ? {} : await import('../db/migrate.js')
const { query, getPool, getSessionLockPool } = skip ? {} : await import('../db/pool.js')
const { createPgCampusRepos } = skip ? {} : await import('../domain/campusStore/index.js')
const { createCampusContext, EMPTY_LEGACY_SOURCES } = skip ? {} : await import('../domain/campusStore/context.js')
const { USER_STATEMENTS } = skip ? {} : await import('../domain/privacy/erasureCascade.js')
const { EMPLOYER_DISCLOSURE_COPY_VERSION, EMPLOYER_ASSESSMENT_DISCLOSURE_COPY_VERSION } = await import('../domain/employer/copy.js')

const tag = randomUUID().slice(0, 8)
const ids = { owner: `syn-emp-owner-${tag}`, employee: `syn-emp-employee-${tag}`, other: `syn-emp-other-${tag}` }
let world = null

async function setup() {
  if (world) return world
  await migrateUp()
  const repos = createPgCampusRepos({ query, getPool, getLockPool: getSessionLockPool })
  const org = await repos.organizations.createOrganization({ name: `Synthetic Employer ${tag}`, slug: `syn-emp-${tag}`, organizationType: 'EMPLOYER', status: 'ACTIVE' })
  const campusOrg = await repos.organizations.createOrganization({ name: `Synthetic College ${tag}`, slug: `syn-col-${tag}`, organizationType: 'COLLEGE', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: ids.owner, role: 'ORG_OWNER', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: ids.employee, role: 'STUDENT', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: ids.other, role: 'STUDENT', status: 'ACTIVE' })
  world = { repos, org, campusOrg }
  return world
}

const scopeRow = (sessionId, orgId, policy, owner = ids.employee) => query(
  `INSERT INTO assessment_session_scopes (session_id, owner_user_id, sponsor_type, sponsor_organization_id, workspace_id, visibility_policy, created_by)
   VALUES ($1, $2, 'INSTITUTION', $3, 'ws', $4, $2)`,
  [sessionId, owner, orgId, policy],
)

test('0063: employer consent types; employer sessions are never individually visible to the sponsor; type immutable', { skip }, async () => {
  const { org, campusOrg } = await setup()
  for (const type of ['EMPLOYER_DEVELOPMENT_DISCLOSURE', 'EMPLOYER_ASSESSMENT_DISCLOSURE', 'CAMPUS_SPONSORSHIP_DISCLOSURE']) {
    await query('INSERT INTO consent_records (user_id, organization_id, consent_type, copy_version, granted_at) VALUES ($1, $2, $3, $4, now())', [ids.other, org.id, type, 'v-test'])
  }
  await assert.rejects(query('INSERT INTO consent_records (user_id, organization_id, consent_type, copy_version, granted_at) VALUES ($1, $2, $3, $4, now())', [ids.other, org.id, 'EMPLOYER_SELECTION', 'v']), /consent_type_check/)

  await assert.rejects(scopeRow(`syn-sess-a-${tag}`, org.id, 'OWNER_AND_SPONSOR'), /PRISM_EMPLOYER_VISIBILITY/)
  await scopeRow(`syn-sess-b-${tag}`, org.id, 'OWNER_AND_SPONSOR_AGGREGATE_ONLY')
  await assert.rejects(query("UPDATE assessment_session_scopes SET visibility_policy = 'OWNER_AND_SPONSOR' WHERE session_id = $1", [`syn-sess-b-${tag}`]), /PRISM_EMPLOYER_VISIBILITY/)
  // Campus sessions are unaffected.
  await scopeRow(`syn-sess-c-${tag}`, campusOrg.id, 'OWNER_AND_SPONSOR', `syn-col-student-${tag}`)

  await assert.rejects(query("UPDATE organizations SET organization_type = 'COLLEGE' WHERE id = $1", [org.id]), /PRISM_EMPLOYER_TYPE/)
  await assert.rejects(query("UPDATE organizations SET organization_type = 'EMPLOYER' WHERE id = $1", [campusOrg.id]), /PRISM_EMPLOYER_TYPE/)
  await query("UPDATE organizations SET organization_type = 'UNIVERSITY' WHERE id = $1", [campusOrg.id])
  await query("UPDATE organizations SET organization_type = 'COLLEGE' WHERE id = $1", [campusOrg.id])
})

test('PostgreSQL repositories carry the organization type; active org grants are listed without results, in a fixed order', { skip }, async () => {
  const { repos, org } = await setup()
  const ms = await repos.memberships.listMembershipsForUser(ids.employee)
  assert.equal(ms.find((m) => m.organizationId === org.id).organizationType, 'EMPLOYER')
  const up = await repos.memberships.upsertMembership({ organizationId: org.id, userId: ids.employee, role: 'STUDENT', status: 'ACTIVE' })
  assert.equal(up.organizationType, 'EMPLOYER')
  const invite = await repos.memberships.createInvite({ organizationId: org.id, email: `syn-${tag}@test.local`, role: 'STUDENT', tokenHash: `syn-hash-${tag}`, invitedBy: ids.owner, expiresAt: new Date(Date.now() + 864e5).toISOString() })
  assert.equal((await repos.memberships.findInviteByTokenHash(`syn-hash-${tag}`)).organizationType, 'EMPLOYER')
  assert.equal((await repos.memberships.getInviteById(invite.id)).organizationType, 'EMPLOYER')

  const now = Date.now()
  const grant = (owner, sessionId, extra = {}) => repos.sharing.createShareGrant({
    ownerUserId: owner, recipientType: 'ORGANIZATION', recipientOrganizationId: org.id, expiresAt: new Date(now + (extra.days ?? 7) * 864e5).toISOString(),
    resources: [{ resourceType: 'ASSESSMENT_REPORT', resourceId: sessionId, disclosureLevel: 'SUMMARY' }],
  })
  const g1 = await grant(ids.other, `syn-sess-o1-${tag}`)
  await grant(ids.employee, `syn-sess-e1-${tag}`)
  const revoked = await grant(ids.employee, `syn-sess-e2-${tag}`)
  await repos.sharing.revokeShareGrant(revoked.id, ids.employee, new Date().toISOString())
  const listed = await repos.sharing.listActiveOrgGrants(org.id, new Date().toISOString())
  // Ordered by owner id ('syn-emp-employee-…' < 'syn-emp-other-…'), then time.
  assert.deepEqual(listed.map((g) => g.sessionId), [`syn-sess-e1-${tag}`, `syn-sess-o1-${tag}`])
  assert.deepEqual(Object.keys(listed[0]).sort(), ['createdAt', 'disclosureLevel', 'expiresAt', 'id', 'ownerUserId', 'sessionId'])
  // Expired by the clock passed in: not listed.
  assert.deepEqual(await repos.sharing.listActiveOrgGrants(org.id, new Date(now + 30 * 864e5).toISOString()), [])
  await repos.sharing.revokeShareGrant(g1.id, ids.other, new Date().toISOString())
})

test('employer workspace on PostgreSQL: participation views, share-only report access, aggregate-only workspace', { skip }, async () => {
  const { repos, org } = await setup()
  process.env.PRISM_EMPLOYER_LND = 'true'
  try {
    const campus = createCampusContext({ repos, legacy: EMPTY_LEGACY_SOURCES, scenarioSource: async () => ({ generalScenarios: [{ id: 'group-project' }], bankScenarios: {} }) })
    const owner = { id: ids.owner, email: `${ids.owner}@test.local` }
    const employee = { id: ids.employee, email: `${ids.employee}@test.local` }
    const ws = (await campus.workspaceService.listWorkspaces(owner)).find((w) => w.organizationId === org.id)
    assert.equal(ws.type, 'EMPLOYER')
    const ews = (await campus.workspaceService.listWorkspaces(employee)).find((w) => w.organizationId === org.id)
    assert.equal(ews.type, 'CAMPUS_STUDENT')
    assert.equal(ews.visibilityPolicy, 'OWNER_AND_SPONSOR_AGGREGATE_ONLY')
    // The real sponsored-start path writes a scope the 0063 trigger accepts.
    const rec = await campus.sessionScopes.recordSponsoredStart({ sessionId: `syn-sess-start-${tag}`, user: employee, workspace: ews })
    assert.equal(rec.visibilityPolicy, 'OWNER_AND_SPONSOR_AGGREGATE_ONLY')
    const actor = await campus.workspaceService.actorFor(owner)
    assert.equal(await campus.sessionScopes.authorizeSponsorRead({ actor, organizationId: org.id, sessionId: `syn-sess-start-${tag}` }), null, 'no grant: no read')
    const g = await repos.sharing.createShareGrant({
      ownerUserId: ids.employee, recipientType: 'ORGANIZATION', recipientOrganizationId: org.id, expiresAt: new Date(Date.now() + 864e5).toISOString(),
      resources: [{ resourceType: 'ASSESSMENT_REPORT', resourceId: `syn-sess-start-${tag}`, disclosureLevel: 'SUMMARY' }],
    })
    const access = await campus.sessionScopes.authorizeSponsorRead({ actor, organizationId: org.id, sessionId: `syn-sess-start-${tag}` })
    assert.equal(access.via, 'SHARE_GRANT')
    await repos.sharing.revokeShareGrant(g.id, ids.employee, new Date().toISOString())
    assert.equal(await campus.sessionScopes.authorizeSponsorRead({ actor, organizationId: org.id, sessionId: `syn-sess-start-${tag}` }), null, 'revoked: closed at once')
  } finally { delete process.env.PRISM_EMPLOYER_LND }
})

test('law 7: employer consent records are erased with the account', { skip }, async () => {
  const { org } = await setup()
  await query('INSERT INTO consent_records (user_id, organization_id, consent_type, copy_version, granted_at) VALUES ($1, $2, $3, $4, now()), ($1, $2, $5, $6, now())',
    [ids.employee, org.id, 'EMPLOYER_DEVELOPMENT_DISCLOSURE', EMPLOYER_DISCLOSURE_COPY_VERSION, 'EMPLOYER_ASSESSMENT_DISCLOSURE', EMPLOYER_ASSESSMENT_DISCLOSURE_COPY_VERSION])
  const [, stmt] = USER_STATEMENTS.find(([t]) => t === 'consent_records')
  await stmt((sql, params) => query(sql, params), { uid: ids.employee })
  assert.equal((await query('SELECT count(*)::int AS n FROM consent_records WHERE user_id = $1', [ids.employee])).rows[0].n, 0)
})

test('0063: down/up is clean; the down refuses while employer consent records exist', { skip }, async () => {
  await setup()
  const latest = async () => (await query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1')).rows[0].name
  assert.equal(await latest(), '0063_employer_lnd')
  // A remaining employer consent (inserted above for ids.other) blocks the down: evidence is never deleted by a rollback.
  await assert.rejects(migrateDown(), /Rollback 0063_employer_lnd failed/)
  assert.equal(await latest(), '0063_employer_lnd')
  await query("DELETE FROM consent_records WHERE consent_type LIKE 'EMPLOYER\\_%'")
  await migrateDown()
  assert.equal(await latest(), '0062_guardian_consents')
  assert.equal((await query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname IN ('assessment_session_scopes_employer_visibility', 'organizations_employer_type_immutable')")).rows[0].n, 0)
  await migrateUp()
  assert.equal(await latest(), '0063_employer_lnd')
})

test('teardown', { skip }, async () => {
  if (!world) return
  await query("DELETE FROM consent_records WHERE consent_type LIKE 'EMPLOYER\\_%'")
  await query('DELETE FROM consent_records WHERE user_id = ANY($1::text[])', [Object.values(ids)])
  await query('DELETE FROM share_grants WHERE owner_user_id = ANY($1::text[])', [Object.values(ids)])
  await query('DELETE FROM assessment_session_scopes WHERE session_id LIKE $1', [`syn-sess-%-${tag}`])
  await query('DELETE FROM workspaces WHERE organization_id = ANY($1::uuid[])', [[world.org.id, world.campusOrg.id]])
  await query('DELETE FROM organizations WHERE id = ANY($1::uuid[])', [[world.org.id, world.campusOrg.id]])
})
