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

  test(`${label}: assessment catalog seeds idempotently; assignments enforce sponsor and roster rules`, async () => {
    const repos = await getRepos()
    const defId = `syn-def-${randomUUID().slice(0, 8)}`
    const catalog = {
      definitions: [{ id: defId, title: 'Synthetic Definition', jobFamily: 'GENERAL', status: 'active', durationMinutes: 35, description: 'Synthetic.', measures: ['CAP-L1-REASONING'], notMeasured: ['PERSONALITY'], integrityModes: ['STANDARD'] }],
      forms: [{ id: `${defId}:syn-scn:1.0.0`, definitionId: defId, version: '1.0.0', scenarioId: 'syn-scn', jobFamilyId: null, capabilityIds: ['CAP-L1-REASONING'], status: 'FROZEN', frozenAt: new Date().toISOString() }],
    }
    await repos.assessments.seedCatalog(catalog)
    await repos.assessments.seedCatalog(catalog)
    assert.equal((await repos.assessments.listDefinitions()).filter((d) => d.id === defId).length, 1)
    assert.equal((await repos.assessments.listForms(defId)).length, 1)

    const owner = uid()
    const pid = `pa_${randomUUID().replace(/-/g, '')}`
    const personal = { id: pid, definitionId: defId, formPolicy: 'SERVER_SELECTED', sponsorType: 'PERSONAL', personalKey: pid, integrityPolicy: 'STANDARD', accommodationsPolicy: {}, reminderPolicy: {}, createdBy: owner, status: 'ACTIVE' }
    const a1 = await repos.assessments.ensurePersonalAssignment(personal)
    const a2 = await repos.assessments.ensurePersonalAssignment(personal)
    assert.equal(a1.id, a2.id)
    await assert.rejects(repos.assessments.createAssignment({ ...personal, id: `${pid}x`, personalKey: `${pid}x`, organizationId: null, sponsorType: 'INSTITUTION' }), { code: 'VALIDATION_FAILED' })
    await assert.rejects(repos.assessments.createAssignment({ ...personal, id: `${pid}y`, personalKey: `${pid}y`, formPolicy: 'FIXED_FORM' }), { code: 'VALIDATION_FAILED' })

    const s1 = await repos.assessments.addStudent({ assignmentId: pid, userId: owner, status: 'ASSIGNED' })
    const s2 = await repos.assessments.addStudent({ assignmentId: pid, userId: owner, status: 'ASSIGNED' })
    assert.equal(s1.status, 'ASSIGNED')
    assert.equal(s2.createdAt, s1.createdAt)
    await assert.rejects(repos.assessments.updateStudent({ assignmentId: pid, userId: owner, patch: { status: 'IN_PROGRESS' } }), { code: 'VALIDATION_FAILED' })
    const started = await repos.assessments.updateStudent({ assignmentId: pid, userId: owner, patch: { status: 'IN_PROGRESS', sessionId: 'sess-syn', startedAt: new Date().toISOString() } })
    assert.equal(started.sessionId, 'sess-syn')

    const org = await repos.organizations.createOrganization({ name: 'Synthetic Assign Org', slug: slug(), organizationType: 'COLLEGE', status: 'ACTIVE' })
    const sponsored = await repos.assessments.createAssignment({
      id: randomUUID(), definitionId: defId, formPolicy: 'SERVER_SELECTED', sponsorType: 'INSTITUTION', organizationId: org.id,
      windowStart: new Date().toISOString(), windowEnd: new Date(Date.now() + day).toISOString(), integrityPolicy: 'PROCTORED',
      accommodationsPolicy: { requestable: true }, reminderPolicy: { enabled: false }, createdBy: 'owner', status: 'ACTIVE',
      targets: [{ targetType: 'USER', targetId: owner }],
    })
    assert.deepEqual((await repos.assessments.listTargets(sponsored.id)).map((t) => t.targetType), ['USER'])
    await repos.assessments.addStudent({ assignmentId: sponsored.id, userId: owner, status: 'ASSIGNED' })
    assert.deepEqual((await repos.assessments.listAssignmentsForUser({ userId: owner })).map((a) => a.id), [pid])
    const orgList = await repos.assessments.listAssignmentsForUser({ userId: owner, organizationId: org.id })
    assert.deepEqual(orgList.map((a) => a.id), [sponsored.id])
    assert.equal(orgList[0].student.status, 'ASSIGNED')
    assert.equal((await repos.assessments.getAssignmentForUser(sponsored.id, 'someone-else')), null)
    await assert.rejects(repos.assessments.createAssignment({ ...personal, id: randomUUID(), sponsorType: 'INSTITUTION', personalKey: null, organizationId: org.id, windowStart: new Date(Date.now() + day).toISOString(), windowEnd: new Date().toISOString() }), { code: 'VALIDATION_FAILED' })
  })

  test(`${label}: preferences upsert per account; product events store only what they are given`, async () => {
    const repos = await getRepos()
    const user = uid()
    assert.equal(await repos.preferences.getPreferences(user), null)
    await repos.preferences.savePreferences(user, { reducedMotion: true, largerText: false })
    const saved = await repos.preferences.savePreferences(user, { reducedMotion: true, largerText: true })
    assert.equal(saved.largerText, true)
    assert.equal((await repos.preferences.getPreferences(user)).reducedMotion, true)

    const event = `briefing_opened`
    const before = (await repos.productEvents.list({ event })).length
    const row = await repos.productEvents.append({ event, actorHash: 'hash-1', workspaceType: 'PERSONAL', organizationId: null, props: { scope: 'PERSONAL' }, occurredAt: new Date().toISOString() })
    assert.deepEqual(row.props, { scope: 'PERSONAL' })
    assert.equal((await repos.productEvents.list({ event })).length, before + 1)

    const org = await repos.organizations.createOrganization({ name: 'Synthetic Grant Org', slug: slug(), organizationType: 'COLLEGE', status: 'ACTIVE' })
    const g = await repos.sharing.createShareGrant({ ownerUserId: user, recipientType: 'ORGANIZATION', recipientOrganizationId: org.id, expiresAt: new Date(Date.now() + day).toISOString(), resources: [{ resourceType: 'ASSESSMENT_REPORT', resourceId: 'sess-g', disclosureLevel: 'FULL' }] })
    const listed = await repos.sharing.listShareGrantsForOwner(user)
    assert.equal(listed.length, 1)
    assert.equal(listed[0].id, g.id)
    assert.equal(listed[0].recipientOrganizationName, 'Synthetic Grant Org')
    assert.deepEqual(listed[0].resources, [{ resourceType: 'ASSESSMENT_REPORT', resourceId: 'sess-g', disclosureLevel: 'FULL' }])
    assert.deepEqual(await repos.sharing.listShareGrantsForOwner(uid()), [])
  })

  test(`${label}: session I/O keeps the first client event and versions artifact writes`, async () => {
    const repos = await getRepos()
    const sid = `sess-${randomUUID()}`
    assert.equal(await repos.sessionIo.getClientEvent(sid, 'evt-1'), null)
    const first = await repos.sessionIo.putClientEvent({ sessionId: sid, clientEventId: 'evt-1', kind: 'MESSAGE', response: { n: 1 } })
    const second = await repos.sessionIo.putClientEvent({ sessionId: sid, clientEventId: 'evt-1', kind: 'MESSAGE', response: { n: 2 } })
    assert.deepEqual(first.response, { n: 1 })
    assert.deepEqual(second.response, { n: 1 }, 'first writer wins')
    assert.equal(await repos.sessionIo.latestArtifactVersion(sid, 'ART'), null)
    await repos.sessionIo.appendArtifactVersion({ sessionId: sid, artifactId: 'ART', version: 1, content: { a: 1 }, savedBy: 'CANDIDATE' })
    await repos.sessionIo.appendArtifactVersion({ sessionId: sid, artifactId: 'ART', version: 2, content: { a: 2 }, savedBy: 'CANDIDATE' })
    await assert.rejects(repos.sessionIo.appendArtifactVersion({ sessionId: sid, artifactId: 'ART', version: 2, content: { a: 3 }, savedBy: 'CANDIDATE' }), { code: 'CONFLICT' })
    await assert.rejects(repos.sessionIo.appendArtifactVersion({ sessionId: sid, artifactId: 'ART', version: 0, content: {}, savedBy: 'CANDIDATE' }), { code: 'VALIDATION_FAILED' })
    assert.deepEqual((await repos.sessionIo.latestArtifactVersion(sid, 'ART')).content, { a: 2 })
    await repos.sessionIo.appendArtifactVersion({ sessionId: sid, artifactId: 'OTHER', version: 1, content: { b: 1 }, savedBy: 'CANDIDATE' })
    const latest = (await repos.sessionIo.listLatestArtifactVersions(sid)).sort((x, y) => x.artifactId.localeCompare(y.artifactId))
    assert.deepEqual(latest.map((v) => [v.artifactId, v.version]), [['ART', 2], ['OTHER', 1]])
  })

  test(`${label}: report versions are append-only per session and unique per content; link grants resolve by hash`, async () => {
    const repos = await getRepos()
    const sid = `sess-${randomUUID()}`
    assert.equal(await repos.reportVersions.latest(sid), null)
    await repos.reportVersions.append({ sessionId: sid, version: 1, contentHash: 'h1', builderVersion: 'b', report: { a: 1 } })
    await assert.rejects(repos.reportVersions.append({ sessionId: sid, version: 2, contentHash: 'h1', builderVersion: 'b', report: { a: 1 } }), { code: 'CONFLICT' })
    await assert.rejects(repos.reportVersions.append({ sessionId: sid, version: 1, contentHash: 'h2', builderVersion: 'b', report: { a: 2 } }), { code: 'CONFLICT' })
    await repos.reportVersions.append({ sessionId: sid, version: 2, contentHash: 'h2', builderVersion: 'b', report: { a: 2 } })
    assert.equal((await repos.reportVersions.latest(sid)).version, 2)
    assert.deepEqual((await repos.reportVersions.findByHash(sid, 'h1')).report, { a: 1 })
    assert.equal(await repos.reportVersions.findByHash(sid, 'nope'), null)

    const owner = uid()
    const hash = `hash-${randomUUID()}`
    const g = await repos.sharing.createShareGrant({ ownerUserId: owner, recipientType: 'LINK', tokenHash: hash, expiresAt: new Date(Date.now() + day).toISOString(), resources: [{ resourceType: 'ASSESSMENT_REPORT', resourceId: sid, disclosureLevel: 'SUMMARY' }] })
    const found = await repos.sharing.findGrantByTokenHash(hash)
    assert.equal(found.id, g.id)
    assert.deepEqual(found.resources, [{ resourceType: 'ASSESSMENT_REPORT', resourceId: sid, disclosureLevel: 'SUMMARY' }])
    assert.equal(await repos.sharing.findGrantByTokenHash('unknown-hash'), null)

    // Institution grants report the disclosure the student chose, per grant.
    const org = await repos.organizations.createOrganization({ name: 'Synthetic Disclosure Org', slug: slug(), organizationType: 'COLLEGE', status: 'ACTIVE' })
    const exp = new Date(Date.now() + day).toISOString()
    await repos.sharing.createShareGrant({ ownerUserId: owner, recipientType: 'ORGANIZATION', recipientOrganizationId: org.id, expiresAt: exp, resources: [{ resourceType: 'ASSESSMENT_REPORT', resourceId: sid, disclosureLevel: 'SUMMARY' }] })
    await repos.sharing.createShareGrant({ ownerUserId: owner, recipientType: 'ORGANIZATION', recipientOrganizationId: org.id, expiresAt: exp, resources: [{ resourceType: 'ASSESSMENT_REPORT', resourceId: sid, disclosureLevel: 'FULL' }] })
    const active = await repos.sharing.findActiveOrgGrants({ ownerUserId: owner, organizationId: org.id, resourceType: 'ASSESSMENT_REPORT', resourceId: sid, at: new Date().toISOString() })
    assert.deepEqual(active.map((a) => a.disclosureLevel).sort(), ['FULL', 'SUMMARY'])
  })

  test(`${label}: campus admin — structure, cohorts, programs, imports, onboarding, notifications, org audit`, async () => {
    const repos = await getRepos()
    const ca = repos.campusAdmin
    const org = await repos.organizations.createOrganization({ name: 'Synthetic Admin Org', slug: slug(), organizationType: 'UNIVERSITY', status: 'ACTIVE' })
    const campus = await ca.createStructure('campus', { organizationId: org.id, name: 'North' })
    const dept = await ca.createStructure('department', { organizationId: org.id, name: 'Commerce', campusId: campus.id, code: 'COM' })
    const prog = await ca.createStructure('academicProgram', { organizationId: org.id, name: 'B.Com', departmentId: dept.id, degreeLevel: 'UG', durationYears: 3 })
    await ca.createStructure('batch', { organizationId: org.id, name: '2024-27', programId: prog.id, startYear: 2024, endYear: 2027 })
    await assert.rejects(ca.createStructure('batch', { organizationId: org.id, name: 'Bad', startYear: 2027, endYear: 2024 }), { code: 'VALIDATION_FAILED' })
    const structure = await ca.listStructure(org.id)
    assert.deepEqual([structure.campuses.length, structure.departments.length, structure.academicPrograms.length, structure.batches.length], [1, 1, 1, 1])

    const cohort = await ca.createCohort({ organizationId: org.id, departmentId: dept.id, academicProgramId: prog.id, name: 'Commerce 2027', semester: 'S5', tags: ['final-year'] })
    const user = uid()
    await repos.organizations.addCohortMember({ cohortId: cohort.id, userId: user })
    let cohorts = await ca.listCohorts(org.id)
    assert.equal(cohorts.find((c) => c.id === cohort.id).memberCount, 1)
    assert.equal((await ca.updateCohort(cohort.id, { name: 'Commerce 2027 A' })).name, 'Commerce 2027 A')
    assert.deepEqual((await ca.listCohortMembershipsForOrg(org.id)).map((m) => m.userId), [user])
    await ca.removeCohortMember(cohort.id, user)
    cohorts = await ca.listCohorts(org.id)
    assert.equal(cohorts.find((c) => c.id === cohort.id).memberCount, 0)
    assert.equal(await ca.removeCohortMember(cohort.id, uid()), null)

    const m = await repos.memberships.upsertMembership({ organizationId: org.id, userId: user, role: 'PLACEMENT_OFFICER', status: 'ACTIVE' })
    assert.equal((await ca.getMembership(m.id)).role, 'PLACEMENT_OFFICER')
    assert.equal((await ca.setMembershipStatus(m.id, 'REMOVED')).status, 'REMOVED')
    assert.equal((await ca.listOrgMemberships(org.id)).length, 1)

    const program = await ca.createProgram({ organizationId: org.id, name: 'Readiness', status: 'DRAFT', startsOn: '2026-10-01', endsOn: '2027-03-31', reportingPolicy: { shareSponsoredReports: true, aggregateOnly: false }, sponsorshipScope: { assessments: true, development: false, reassessment: false }, createdBy: 'owner' })
    await assert.rejects(ca.createProgram({ organizationId: org.id, name: 'Bad', status: 'DRAFT', startsOn: '2027-01-01', endsOn: '2026-01-01', reportingPolicy: {}, sponsorshipScope: {}, createdBy: 'owner' }), { code: 'VALIDATION_FAILED' })
    await ca.setProgramCohorts(program.id, [cohort.id, cohort.id])
    assert.deepEqual(await ca.listProgramCohorts(program.id), [cohort.id])
    assert.equal((await ca.updateProgram(program.id, { status: 'ACTIVE' })).status, 'ACTIVE')
    assert.deepEqual((await ca.listPrograms(org.id)).map((p) => p.id), [program.id])

    const job = await ca.createImportJob({
      organizationId: org.id, uploadedBy: 'owner', fileName: 'students.csv', totals: { rows: 2, invite: 1, alreadyMember: 0, errors: 1 },
      rows: [
        { rowNumber: 2, raw: { email: 'a@test.local' }, normalized: { email: 'a@test.local', cohortId: cohort.id }, errors: [], action: 'INVITE' },
        { rowNumber: 3, raw: { email: 'bad' }, normalized: null, errors: ['EMAIL_INVALID'], action: 'ERROR' },
      ],
    })
    assert.equal(job.status, 'PREVIEW')
    assert.deepEqual((await ca.listImportRows(job.id)).map((r) => r.action), ['INVITE', 'ERROR'])
    assert.equal((await ca.claimImportCommit(job.id, 'k1')).claimed, true)
    await ca.releaseImportClaim(job.id, 'other-key')
    assert.equal((await ca.claimImportCommit(job.id, 'k1')).inFlight, true, 'another key cannot release the claim')
    await ca.releaseImportClaim(job.id, 'k1')
    assert.equal((await ca.claimImportCommit(job.id, 'k1')).claimed, true, 'released claim can be taken again')
    assert.equal((await ca.claimImportCommit(job.id, 'k1')).inFlight, true)
    assert.equal((await ca.claimImportCommit(job.id, 'k2')).claimed, false)
    const committed = await ca.commitImportJob(job.id, { commitKey: 'k1', totals: { ...job.totals, invited: 1, skipped: 1, failed: 0 }, outcomes: { 2: 'INVITED', 3: 'SKIPPED' } })
    assert.equal(committed.job.status, 'COMMITTED')
    assert.equal(committed.replayed, false)
    assert.equal((await ca.commitImportJob(job.id, { commitKey: 'k1', totals: {}, outcomes: {} })).replayed, true)
    assert.deepEqual((await ca.listImportRows(job.id)).map((r) => r.outcome), ['INVITED', 'SKIPPED'])

    assert.equal(await ca.getOnboarding(org.id), null)
    await ca.saveOnboarding({ organizationId: org.id, completedSteps: ['profile'], data: {}, updatedBy: 'owner' })
    const ob = await ca.saveOnboarding({ organizationId: org.id, completedSteps: ['profile', 'structure', 'profile'], data: { x: 1 }, updatedBy: 'owner' })
    assert.deepEqual(ob.completedSteps, ['profile', 'structure'])
    assert.deepEqual((await ca.getOnboarding(org.id)).data, { x: 1 })

    const n = await ca.createNotification({ userId: user, organizationId: org.id, kind: 'IMPORT_COMPLETE', payload: { invited: 1 } })
    assert.equal(n.readAt, null)
    assert.equal(await ca.markNotificationRead(n.id, uid()), null)
    assert.ok((await ca.markNotificationRead(n.id, user)).readAt)
    assert.equal((await ca.listNotifications(user)).length, 1)

    await ca.appendOrgAudit({ organizationId: org.id, actorUserId: 'owner', action: 'cohort.created', targetType: 'COHORT', targetId: cohort.id, details: { name: 'x' } })
    await ca.appendOrgAudit({ organizationId: org.id, actorUserId: 'owner', action: 'program.created', targetType: 'PROGRAM', targetId: program.id })
    const log = await ca.listOrgAudit(org.id)
    assert.equal(log.length, 2)
    assert.deepEqual(log.find((e) => e.action === 'cohort.created').details, { name: 'x' })
  })

  test(`${label}: development — mission versions, attempts, practice ledger, plans, interventions`, async () => {
    const repos = await getRepos()
    const dv = repos.development
    const mid = `MIS-SYN-${randomUUID().slice(0, 6).toUpperCase()}`
    const content = { mission_id: mid, version: 1, title: 'Synthetic mission' }
    const seeded = await dv.seedMissionVersion({ missionId: mid, targetCapabilityId: 'CAP-L1-REASONING', version: 1, status: 'PUBLISHED', schemaVersion: 's1', content, contentHash: 'h1', publishedAt: new Date().toISOString() })
    assert.equal(seeded.version, 1)
    assert.equal((await dv.seedMissionVersion({ missionId: mid, targetCapabilityId: 'CAP-L1-REASONING', version: 1, status: 'PUBLISHED', schemaVersion: 's1', content, contentHash: 'h1', publishedAt: new Date().toISOString() })).contentHash, 'h1')
    await assert.rejects(dv.seedMissionVersion({ missionId: mid, targetCapabilityId: 'CAP-L1-REASONING', version: 1, status: 'PUBLISHED', schemaVersion: 's1', content: { ...content, title: 'x' }, contentHash: 'h2', publishedAt: new Date().toISOString() }), { code: 'CONFLICT' })
    assert.ok((await dv.listPublishedMissions()).some((v) => v.missionId === mid))

    const user = uid()
    const first = await dv.createAttempt({ userId: user, missionId: mid, missionVersion: 1, work: { A: { text: '' } }, idempotencyKey: 'k1' })
    assert.equal(first.replayed, false)
    const again = await dv.createAttempt({ userId: user, missionId: mid, missionVersion: 1, work: { A: { text: '' } }, idempotencyKey: 'k1' })
    assert.equal(again.attempt.id, first.attempt.id)
    assert.equal(again.replayed, true)
    const saved = await dv.saveAttemptWork(first.attempt.id, { expectedVersion: 1, work: { A: { text: 'hello' } } })
    assert.equal(saved.attempt.version, 2)
    assert.equal((await dv.saveAttemptWork(first.attempt.id, { expectedVersion: 1, work: {} })).conflict, 'VERSION')
    const hinted = await dv.saveAttemptWork(first.attempt.id, { expectedVersion: 2, hintsUsed: 1 })
    assert.equal(hinted.attempt.hintsUsed, 1)
    assert.deepEqual(hinted.attempt.work, { A: { text: 'hello' } })
    const done = await dv.completeAttempt(first.attempt.id, { status: 'EVALUATED', evaluation: { summary: 's' }, submittedAt: new Date().toISOString() })
    assert.equal(done.replayed, false)
    assert.equal((await dv.completeAttempt(first.attempt.id, { status: 'EVALUATED', evaluation: {}, submittedAt: new Date().toISOString() })).replayed, true)
    assert.equal((await dv.saveAttemptWork(first.attempt.id, { expectedVersion: done.attempt.version, work: {} })).conflict, 'SUBMITTED')
    assert.equal((await dv.listAttempts({ userId: user })).length, 1)

    const unit = { attemptId: first.attempt.id, userId: user, missionId: mid, missionVersion: 1, capabilityId: 'CAP-L1-REASONING', behaviorId: 'B', criterionId: 'C', sourceType: 'MISSION_PRACTICE', checkType: 'DETERMINISTIC', excerpt: null, provenance: { v: 1 } }
    assert.equal((await dv.appendPracticeUnits([unit, unit])).length, 1)
    await assert.rejects(dv.appendPracticeUnits([{ ...unit, criterionId: 'D', sourceType: 'FORMAL' }]), { code: 'VALIDATION_FAILED' })
    assert.equal((await dv.listPracticeUnits({ userId: user })).length, 1)

    const p1 = await dv.upsertPlan({ userId: user, sourceSessionId: 'sess-a', items: [{ capabilityId: 'CAP-L1-REASONING' }] })
    const p1b = await dv.upsertPlan({ userId: user, sourceSessionId: 'sess-a', items: [{ capabilityId: 'CAP-L1-REASONING' }] })
    assert.equal(p1.id, p1b.id)
    assert.deepEqual(p1.items.map((i) => i.capabilityId), ['CAP-L1-REASONING'])
    const p2 = await dv.upsertPlan({ userId: user, sourceSessionId: 'sess-b', items: [] })
    assert.notEqual(p2.id, p1.id)

    const org = await repos.organizations.createOrganization({ name: 'Synthetic Dev Org', slug: slug(), organizationType: 'COLLEGE', status: 'ACTIVE' })
    const cohort = await repos.organizations.createCohort({ organizationId: org.id, name: 'Dev Cohort' })
    // Calendar days survive a server east of UTC (node-pg reads DATE as local midnight).
    const tz = process.env.TZ
    process.env.TZ = 'Asia/Kolkata'
    let iv
    try {
      iv = await dv.createIntervention({ organizationId: org.id, name: 'Sprint', targetCapabilityId: 'CAP-L1-REASONING', cohortId: cohort.id, startsOn: '2026-10-01', endsOn: '2026-10-29', status: 'ACTIVE', missionIds: [mid], reassessmentPlanned: false, createdBy: 'owner' })
      assert.deepEqual([iv.startsOn, iv.endsOn], ['2026-10-01', '2026-10-29'])
      const read = await dv.getIntervention(iv.id)
      assert.deepEqual([read.startsOn, read.endsOn], ['2026-10-01', '2026-10-29'])
      const program = await repos.campusAdmin.createProgram({ organizationId: org.id, name: 'Dates', status: 'DRAFT', startsOn: '2026-10-01', endsOn: '2027-03-31', reportingPolicy: {}, sponsorshipScope: {}, createdBy: 'owner' })
      assert.deepEqual([program.startsOn, program.endsOn], ['2026-10-01', '2027-03-31'])
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
    assert.deepEqual(iv.missionIds, [mid])
    await dv.addInterventionMember(iv.id, user)
    await dv.addInterventionMember(iv.id, user)
    assert.equal((await dv.listInterventionMembers(iv.id)).length, 1)
    assert.deepEqual((await dv.listInterventionsForUser(user, org.id)).map((x) => x.id), [iv.id])
    assert.equal((await dv.setInterventionStatus(iv.id, 'COMPLETED')).status, 'COMPLETED')
    const campusAttempt = await dv.createAttempt({ userId: user, missionId: mid, missionVersion: 1, organizationId: org.id, interventionId: iv.id, work: {}, idempotencyKey: 'k2' })
    assert.deepEqual((await dv.listAttemptsForIntervention(iv.id)).map((a) => a.id), [campusAttempt.attempt.id])
    assert.equal((await dv.listAttempts({ userId: user })).length, 1, 'campus attempts stay out of the personal list')
    assert.equal((await dv.listAttempts({ userId: user, organizationId: org.id })).length, 1)
  })

  test(`${label}: growth — equivalence registry, decision history, reassessment cycles, snapshots`, async () => {
    const repos = await getRepos()
    const gr = repos.growth
    const defId = `syn-gdef-${randomUUID().slice(0, 8)}`
    const fa = `${defId}:syn-a:1.0.0`
    const fb = `${defId}:syn-b:1.0.0`
    await repos.assessments.seedCatalog({
      definitions: [{ id: defId, title: 'Synthetic Growth Definition', jobFamily: 'GENERAL', status: 'active', durationMinutes: 35, description: 'Synthetic.', measures: ['CAP-L1-REASONING'], notMeasured: ['PERSONALITY'], integrityModes: ['STANDARD'] }],
      forms: [fa, fb].map((id, i) => ({ id, definitionId: defId, version: '1.0.0', scenarioId: `syn-${'ab'[i]}`, jobFamilyId: null, capabilityIds: ['CAP-L1-REASONING'], status: 'FROZEN', frozenAt: new Date().toISOString() })),
    })
    assert.equal(await gr.seedPendingPairs([{ formAId: fa, formBId: fb }, { formAId: fa, formBId: fa }]), 2)
    assert.equal(await gr.seedPendingPairs([{ formAId: fa, formBId: fb }]), 0, 'seeding is idempotent')
    assert.equal((await gr.getEquivalence(fa, fb)).status, 'PENDING')
    await assert.rejects(gr.recordDecision({ formAId: fa, formBId: fb, status: 'APPROVED', evidenceRef: 'run-1', reason: 'Reviewed equating run', decidedBy: 'adm' }), { code: 'VALIDATION_FAILED' })
    await assert.rejects(gr.recordDecision({ formAId: fa, formBId: `${fb}-x`, status: 'REJECTED', evidenceRef: 'run-1', reason: 'Reviewed equating run', decidedBy: 'adm' }), { code: 'NOT_FOUND' })
    const rej = await gr.recordDecision({ formAId: fa, formBId: fb, status: 'REJECTED', evidenceRef: 'run-1', reason: 'Reviewed equating run', decidedBy: 'adm' })
    assert.deepEqual([rej.status, rej.evidenceRef, rej.decidedBy], ['REJECTED', 'run-1', 'adm'])
    const app = await gr.recordDecision({ formAId: fa, formBId: fb, status: 'APPROVED', evidenceRef: 'run-2', reason: 'Second equating run passed', decidedBy: 'adm2', approvalId: 'appr-1' })
    assert.equal(app.status, 'APPROVED')
    assert.deepEqual((await gr.listDecisions(fa, fb)).map((d) => [d.status, d.approvalId]), [['REJECTED', null], ['APPROVED', 'appr-1']])
    assert.ok((await gr.listEquivalence()).some((p) => p.formAId === fa && p.formBId === fa && p.status === 'PENDING'))

    const org = await repos.organizations.createOrganization({ name: 'Synthetic Growth Org', slug: slug(), organizationType: 'COLLEGE', status: 'ACTIVE' })
    const mk = () => repos.assessments.createAssignment({
      id: randomUUID(), definitionId: defId, formPolicy: 'SERVER_SELECTED', sponsorType: 'INSTITUTION', organizationId: org.id,
      windowStart: new Date().toISOString(), windowEnd: new Date(Date.now() + day).toISOString(), integrityPolicy: 'STANDARD',
      accommodationsPolicy: { requestable: true }, reminderPolicy: { enabled: false }, createdBy: 'owner', status: 'ACTIVE', targets: [],
    })
    const [base, re] = [await mk(), await mk()]
    const window = { windowStart: new Date(Date.now() + day).toISOString(), windowEnd: new Date(Date.now() + 3 * day).toISOString() }
    await assert.rejects(gr.createCycle({ organizationId: org.id, name: 'Bad', baselineAssignmentId: base.id, reassessmentAssignmentId: re.id, windowStart: window.windowEnd, windowEnd: window.windowStart, status: 'SCHEDULED', createdBy: 'owner' }), { code: 'VALIDATION_FAILED' })
    const cy = await gr.createCycle({ organizationId: org.id, name: 'Synthetic cycle', baselineAssignmentId: base.id, reassessmentAssignmentId: re.id, ...window, status: 'SCHEDULED', createdBy: 'owner' })
    await assert.rejects(gr.createCycle({ organizationId: org.id, name: 'Dup', baselineAssignmentId: base.id, reassessmentAssignmentId: re.id, ...window, status: 'SCHEDULED', createdBy: 'owner' }), { code: 'CONFLICT' })
    assert.deepEqual((await gr.listCycles(org.id)).map((c) => c.id), [cy.id])
    assert.equal((await gr.setCycleStatus(cy.id, 'CANCELLED')).status, 'CANCELLED')
    assert.equal((await gr.getCycle(cy.id)).reassessmentAssignmentId, re.id)

    const user = uid()
    const snap = { userId: user, organizationId: org.id, capabilityId: 'CAP-L1-REASONING', baselineSessionId: 's-a', reassessmentSessionId: 's-b', formAId: fa, formBId: fb, fromBand: 'DEVELOPING', toBand: 'DEMONSTRATED', direction: 'HIGHER', uncertainty: null, rulesVersion: 'r1' }
    assert.equal((await gr.recordSnapshot(snap)).created, true)
    const again = await gr.recordSnapshot(snap)
    assert.equal(again.created, false)
    assert.equal(again.snapshot.direction, 'HIGHER')
    await assert.rejects(gr.recordSnapshot({ ...snap, reassessmentSessionId: 's-c', formBId: `${fb}-missing` }), { code: 'VALIDATION_FAILED' })
    assert.equal((await gr.listSnapshots({ userId: user, organizationId: org.id })).length, 1)
    assert.equal((await gr.listSnapshots({ userId: user })).length, 0, 'sponsored snapshots stay out of the personal list')
  })

  test(`${label}: analytics settings — per-organization minimum group size with a floor`, async () => {
    const repos = await getRepos()
    const org = await repos.organizations.createOrganization({ name: 'Synthetic Analytics Org', slug: slug(), organizationType: 'COLLEGE', status: 'ACTIVE' })
    assert.equal(await repos.analytics.getSettings(org.id), null, 'no row → the documented default applies')
    await assert.rejects(repos.analytics.saveSettings({ organizationId: org.id, minAggregateGroupSize: 4, updatedBy: 'owner' }), { code: 'VALIDATION_FAILED' })
    assert.equal((await repos.analytics.saveSettings({ organizationId: org.id, minAggregateGroupSize: 12, updatedBy: 'owner' })).minAggregateGroupSize, 12)
    assert.equal((await repos.analytics.saveSettings({ organizationId: org.id, minAggregateGroupSize: 15, updatedBy: 'owner2' })).updatedBy, 'owner2')
    assert.equal((await repos.analytics.getSettings(org.id)).minAggregateGroupSize, 15)
  })

  test(`${label}: billing — contracts (compare-and-set), read-only pricing, invoice export record, usage ledger`, async () => {
    const repos = await getRepos()
    const bl = repos.billing
    const org = await repos.organizations.createOrganization({ name: 'Synthetic Billing Org', slug: slug(), organizationType: 'UNIVERSITY', status: 'ACTIVE' })
    assert.ok((await repos.organizations.listOrganizations()).some((o) => o.id === org.id))
    const tz = process.env.TZ
    process.env.TZ = 'Asia/Kolkata'
    let c
    try {
      c = await bl.createContract({ organizationId: org.id, name: 'Synthetic contract', termStart: '2026-09-01', termEnd: '2027-03-31', includedSeats: 2, billableEvent: 'ASSESSMENT_COMPLETED', components: { platformFee: true }, createdBy: 'admin:ops' })
      assert.deepEqual([c.status, c.termStart, c.termEnd, c.entitlementId], ['DRAFT', '2026-09-01', '2027-03-31', null])
      assert.deepEqual((await bl.getContract(c.id)).components, { platformFee: true })
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
    const ent = await repos.entitlements.createEntitlement({
      id: c.id, organizationId: org.id, sourceType: 'INSTITUTION_SPONSORSHIP', sourceReferenceId: `contract:${c.id}`, productCode: 'PRISM_CAMPUS_ASSESSMENT', quantity: 2,
      validFrom: new Date(Date.now() - day).toISOString(), validUntil: new Date(Date.now() + day).toISOString(), status: 'ACTIVE', metadata: { contractId: c.id, billableEvent: 'ASSESSMENT_COMPLETED' },
    })
    assert.equal(ent.id, c.id)
    await assert.rejects(repos.entitlements.createEntitlement({ id: c.id, organizationId: org.id, sourceType: 'INSTITUTION_SPONSORSHIP', productCode: 'X', quantity: 1, validFrom: new Date().toISOString(), status: 'ACTIVE' }), { code: 'CONFLICT' })
    const active = await bl.transitionContract(c.id, ['DRAFT'], { status: 'ACTIVE', entitlementId: ent.id, activatedBy: 'admin:ops', activatedAt: new Date().toISOString() })
    assert.deepEqual([active.status, active.entitlementId], ['ACTIVE', ent.id])
    assert.equal(await bl.transitionContract(c.id, ['DRAFT'], { status: 'ACTIVE' }), null, 'compare-and-set: only from the expected status')
    assert.deepEqual((await bl.listContracts(org.id)).map((x) => x.id), [c.id])
    assert.equal(await bl.getPricing(c.id), null, 'no price row unless finance adds one')
    assert.equal((await repos.entitlements.setStatus(ent.id, 'SUSPENDED')).status, 'SUSPENDED')
    assert.equal(await repos.entitlements.setStatus(ent.id, 'REVOKED', ['ACTIVE']), null, 'compare-and-set: only from the expected status')
    assert.equal((await repos.entitlements.setStatus(ent.id, 'ACTIVE', ['SUSPENDED'])).status, 'ACTIVE')

    await repos.entitlements.appendEvent({ entitlementId: ent.id, userId: 'u1', organizationId: org.id, sessionId: 's1', event: 'RESERVED', idempotencyKey: `b-${ent.id}-1` })
    await repos.entitlements.appendEvent({ entitlementId: ent.id, userId: 'u1', organizationId: org.id, sessionId: 's1', event: 'CONSUMED', idempotencyKey: `b-${ent.id}-2`, requireOpenReservation: true })
    const personal = await repos.entitlements.createEntitlement({ userId: 'u1', sourceType: 'PERSONAL_PURCHASE', productCode: 'PRISM_PERSONAL', quantity: 1, validFrom: new Date(Date.now() - day).toISOString(), status: 'ACTIVE' })
    await repos.entitlements.appendEvent({ entitlementId: personal.id, userId: 'u1', sessionId: 'sp', event: 'RESERVED', idempotencyKey: `b-${personal.id}` })
    const usage = await bl.usageEvents({ organizationId: org.id })
    assert.deepEqual(usage.map((e) => e.event).sort(), ['CONSUMED', 'RESERVED'], 'sponsored seats only; personal purchases never appear')
    assert.equal((await bl.usageEvents({ organizationId: org.id, entitlementIds: [ent.id], from: new Date(Date.now() + day).toISOString() })).length, 0)

    const x = await bl.appendInvoiceExport({ organizationId: org.id, contractId: c.id, periodStart: '2026-10-01', periodEnd: '2026-10-31', billableEvent: 'ASSESSMENT_COMPLETED', billableCount: 1, createdBy: 'owner' })
    assert.deepEqual([x.periodStart, x.periodEnd, x.billableCount], ['2026-10-01', '2026-10-31', 1])
    assert.deepEqual((await bl.listInvoiceExports(org.id)).map((r) => r.id), [x.id])
  })
}
