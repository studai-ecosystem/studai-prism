// Shared contract for the campus repositories (C3.05). The same assertions run
// against the memory adapter (always) and the Postgres adapter (when a
// throwaway database is configured), so both behave identically.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const uid = () => `user-${randomUUID().slice(0, 8)}`
const slug = () => `org-${randomUUID().slice(0, 8)}`

export function runCampusRepoContract(test, label, getRepos) {
  const day = 86400000

  test(`${label}: organizations, departments, cohorts and cohort members`, async () => {
    const repos = await getRepos()
    const s = slug()
    const org = await repos.organizations.createOrganization({ name: 'Synthetic University', slug: s, organizationType: 'UNIVERSITY', status: 'ACTIVE' })
    assert.equal((await repos.organizations.getOrganization(org.id)).slug, s)
    await assert.rejects(repos.organizations.createOrganization({ name: 'Dup', slug: s, organizationType: 'COLLEGE', status: 'ACTIVE' }), { code: 'CONFLICT' })
    const dept = await repos.organizations.createDepartment({ organizationId: org.id, name: 'Synthetic Department' })
    const cohort = await repos.organizations.createCohort({ organizationId: org.id, departmentId: dept.id, name: 'Synthetic Cohort' })
    assert.equal((await repos.organizations.getCohort(cohort.id)).departmentId, dept.id)
    const user = uid()
    await repos.organizations.addCohortMember({ cohortId: cohort.id, userId: user })
    await repos.organizations.addCohortMember({ cohortId: cohort.id, userId: user })
    const cohorts = await repos.organizations.listCohortsForUser(org.id, user)
    assert.deepEqual(cohorts.map((c) => c.id), [cohort.id])
  })

  test(`${label}: memberships upsert idempotently and invites store only a hash`, async () => {
    const repos = await getRepos()
    const org = await repos.organizations.createOrganization({ name: 'Synthetic College', slug: slug(), organizationType: 'COLLEGE', status: 'ACTIVE' })
    const user = uid()
    const invited = await repos.memberships.upsertMembership({ organizationId: org.id, userId: user, role: 'STUDENT', status: 'INVITED' })
    assert.equal(invited.joinedAt, null)
    const active = await repos.memberships.upsertMembership({ organizationId: org.id, userId: user, role: 'STUDENT', status: 'ACTIVE' })
    assert.equal(active.id, invited.id)
    assert.ok(active.joinedAt)
    const listed = await repos.memberships.listMembershipsForUser(user)
    assert.equal(listed.length, 1)
    assert.equal(listed[0].organizationName, 'Synthetic College')
    assert.equal(listed[0].organizationStatus, 'ACTIVE')

    const hash = `hash-${randomUUID()}`
    const inv = await repos.memberships.createInvite({ organizationId: org.id, email: 'synthetic@test.local', role: 'STUDENT', tokenHash: hash, invitedBy: 'owner', expiresAt: new Date(Date.now() + day).toISOString() })
    assert.equal(inv.status, 'PENDING')
    const found = await repos.memberships.findInviteByTokenHash(hash)
    assert.equal(found.id, inv.id)
    assert.equal(found.organizationName, 'Synthetic College')
    assert.equal(await repos.memberships.findInviteByTokenHash('nope'), null)
    const accepted = await repos.memberships.updateInvite(inv.id, { status: 'ACCEPTED', acceptedBy: user, acceptedAt: new Date().toISOString() })
    assert.equal(accepted.status, 'ACCEPTED')
  })

  test(`${label}: workspaces upsert idempotently per (type, owner, org)`, async () => {
    const repos = await getRepos()
    const org = await repos.organizations.createOrganization({ name: 'Synthetic Institute', slug: slug(), organizationType: 'OTHER', status: 'ACTIVE' })
    const user = uid()
    const a = await repos.workspaces.upsertWorkspace({ type: 'CAMPUS_STUDENT', ownerUserId: user, organizationId: org.id, name: org.name })
    const b = await repos.workspaces.upsertWorkspace({ type: 'CAMPUS_STUDENT', ownerUserId: user, organizationId: org.id, name: org.name })
    assert.equal(a.id, b.id)
    assert.deepEqual((await repos.workspaces.listWorkspacesForUser(user)).map((w) => w.id), [a.id])
    assert.equal((await repos.workspaces.getWorkspace(a.id)).type, 'CAMPUS_STUDENT')
  })

  test(`${label}: entitlement ledger reserves within quantity, replays idempotently, releases`, async () => {
    const repos = await getRepos()
    const org = await repos.organizations.createOrganization({ name: 'Synthetic Sponsor', slug: slug(), organizationType: 'UNIVERSITY', status: 'ACTIVE' })
    const ent = await repos.entitlements.createEntitlement({
      organizationId: org.id, sourceType: 'INSTITUTION_SPONSORSHIP', productCode: 'PRISM_CAMPUS_ASSESSMENT', quantity: 1,
      validFrom: new Date(Date.now() - day).toISOString(), status: 'ACTIVE',
    })
    const first = await repos.entitlements.appendEvent({ entitlementId: ent.id, userId: 'u1', organizationId: org.id, sessionId: 's1', event: 'RESERVED', idempotencyKey: `k-${ent.id}-1` })
    assert.equal(first.entitlement.consumedQuantity, 1)
    const replay = await repos.entitlements.appendEvent({ entitlementId: ent.id, userId: 'u1', organizationId: org.id, sessionId: 's1', event: 'RESERVED', idempotencyKey: `k-${ent.id}-1` })
    assert.equal(replay.replayed, true)
    assert.equal(replay.consumption.id, first.consumption.id)
    await assert.rejects(
      repos.entitlements.appendEvent({ entitlementId: ent.id, userId: 'u2', organizationId: org.id, sessionId: 's2', event: 'RESERVED', idempotencyKey: `k-${ent.id}-2` }),
      { code: 'ENTITLEMENT_REQUIRED' },
    )
    const released = await repos.entitlements.appendEvent({ entitlementId: ent.id, userId: 'u1', organizationId: org.id, sessionId: 's1', event: 'RELEASED', idempotencyKey: `k-${ent.id}-r` })
    assert.equal(released.entitlement.consumedQuantity, 0)
    assert.deepEqual((await repos.entitlements.listConsumptions(ent.id)).map((c) => c.event), ['RESERVED', 'RELEASED'])
    const listed = await repos.entitlements.listEntitlements({ organizationId: org.id, sourceTypes: ['INSTITUTION_SPONSORSHIP'] })
    assert.deepEqual(listed.map((e) => e.id), [ent.id])

    // Closing events need an open reservation, checked inside the write.
    await assert.rejects(
      repos.entitlements.appendEvent({ entitlementId: ent.id, userId: 'u3', organizationId: org.id, sessionId: 's3', event: 'CONSUMED', idempotencyKey: `c-${ent.id}-3`, requireOpenReservation: true }),
      { code: 'CONFLICT' },
    )
    await repos.entitlements.appendEvent({ entitlementId: ent.id, userId: 'u4', organizationId: org.id, sessionId: 's4', event: 'RESERVED', idempotencyKey: `k-${ent.id}-4` })
    await assert.rejects(
      repos.entitlements.appendEvent({ entitlementId: ent.id, userId: 'intruder', organizationId: org.id, sessionId: 's4', event: 'CONSUMED', idempotencyKey: `c-${ent.id}-x`, requireOpenReservation: true }),
      { code: 'CONFLICT' },
      'only the reserving user closes the seat',
    )
    const consumed = await repos.entitlements.appendEvent({ entitlementId: ent.id, userId: 'u4', organizationId: org.id, sessionId: 's4', event: 'CONSUMED', idempotencyKey: `c-${ent.id}-4`, requireOpenReservation: true })
    assert.equal(consumed.replayed, false)
    const lateRelease = await repos.entitlements.appendEvent({ entitlementId: ent.id, userId: 'u4', organizationId: org.id, sessionId: 's4', event: 'RELEASED', idempotencyKey: `r-${ent.id}-4`, requireOpenReservation: true })
    assert.equal(lateRelease.replayed, true, 'a consumed seat is never freed by a late release')
    assert.equal(lateRelease.consumption.event, 'CONSUMED')
    assert.equal((await repos.entitlements.getEntitlement(ent.id)).consumedQuantity, 1)
    await assert.rejects(repos.entitlements.createEntitlement({
      sourceType: 'INSTITUTION_SPONSORSHIP', productCode: 'X', quantity: 1, validFrom: new Date().toISOString(), status: 'ACTIVE',
    }), { code: 'VALIDATION_FAILED' })
  })

  test(`${label}: consents, share grants (expired/revoked excluded), audit trail, session scopes`, async () => {
    const repos = await getRepos()
    const org = await repos.organizations.createOrganization({ name: 'Synthetic Share Org', slug: slug(), organizationType: 'COLLEGE', status: 'ACTIVE' })
    const owner = uid()
    await repos.sharing.recordConsent({ userId: owner, organizationId: org.id, consentType: 'CAMPUS_SPONSORSHIP_DISCLOSURE', copyVersion: 'v-test', grantedAt: new Date().toISOString() })
    assert.equal((await repos.sharing.listConsents(owner)).length, 1)

    const live = await repos.sharing.createShareGrant({ ownerUserId: owner, recipientType: 'ORGANIZATION', recipientOrganizationId: org.id, expiresAt: new Date(Date.now() + day).toISOString(), resources: [{ resourceType: 'ASSESSMENT_REPORT', resourceId: 'sess-a', disclosureLevel: 'SUMMARY' }] })
    const now = new Date().toISOString()
    assert.equal((await repos.sharing.findActiveOrgGrants({ ownerUserId: owner, organizationId: org.id, resourceType: 'ASSESSMENT_REPORT', resourceId: 'sess-a', at: now })).length, 1)
    assert.equal((await repos.sharing.findActiveOrgGrants({ ownerUserId: owner, organizationId: org.id, resourceType: 'ASSESSMENT_REPORT', resourceId: 'sess-b', at: now })).length, 0)
    await repos.sharing.revokeShareGrant(live.id, owner, now)
    assert.equal((await repos.sharing.findActiveOrgGrants({ ownerUserId: owner, organizationId: org.id, resourceType: 'ASSESSMENT_REPORT', resourceId: 'sess-a', at: now })).length, 0)

    await repos.audit.recordDataAccess({ actorUserId: 'admin', organizationId: org.id, subjectUserId: owner, resourceType: 'ASSESSMENT_SESSION', resourceId: 'sess-a', action: 'READ' })
    assert.equal((await repos.audit.listDataAccess({ organizationId: org.id, subjectUserId: owner })).length, 1)

    const sid = `sess-${randomUUID()}`
    const sc = await repos.scopes.createSessionScope({ sessionId: sid, ownerUserId: owner, sponsorType: 'INSTITUTION', sponsorOrganizationId: org.id, workspaceId: 'ws', visibilityPolicy: 'OWNER_AND_SPONSOR', createdBy: owner })
    assert.equal(sc.sponsorOrganizationId, org.id)
    assert.equal((await repos.scopes.getSessionScope(sid)).visibilityPolicy, 'OWNER_AND_SPONSOR')
    await assert.rejects(repos.scopes.createSessionScope({ sessionId: sid, ownerUserId: owner, sponsorType: 'PERSONAL', workspaceId: 'personal', visibilityPolicy: 'OWNER_ONLY', createdBy: owner }), { code: 'CONFLICT' })
    await assert.rejects(repos.scopes.createSessionScope({ sessionId: `${sid}-p`, ownerUserId: owner, sponsorType: 'PERSONAL', sponsorOrganizationId: org.id, workspaceId: 'personal', visibilityPolicy: 'OWNER_AND_SPONSOR', createdBy: owner }), { code: 'VALIDATION_FAILED' })
    assert.equal(await repos.scopes.getSessionScope('never-scoped'), null)
  })
}
