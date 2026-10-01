// C3.07 — entitlement resolver + append-only ledger + legacy adapter.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createEntitlementResolver } from '../domain/entitlements/resolver.js'
import { createEntitlementLedger } from '../domain/entitlements/ledger.js'
import { fromLegacyEntitlement } from '../domain/entitlements/legacyAdapter.js'

const NOW = new Date('2026-10-01T10:00:00Z')
const day = 86400000
const iso = (ms) => new Date(NOW.getTime() + ms).toISOString()
const clock = () => NOW
const student = { id: 'student-1', email: 'student@test.local' }
const personalWs = { id: 'personal', type: 'PERSONAL' }

async function setup({ legacy = [] } = {}) {
  const repos = createMemoryCampusRepos({ clock })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic University', slug: 'synthetic-u', organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  const other = await repos.organizations.createOrganization({ name: 'Other College', slug: 'other-c', organizationType: 'COLLEGE', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: student.id, role: 'STUDENT', status: 'ACTIVE' })
  const campusWs = { id: 'ws-campus', type: 'CAMPUS_STUDENT', organizationId: org.id }
  const audits = []
  const resolver = createEntitlementResolver({ repos, clock, legacyLookup: async () => legacy })
  const ledger = createEntitlementLedger({ repos, clock, audit: (...a) => audits.push(a) })
  return { repos, org, other, campusWs, resolver, ledger, audits }
}

const sponsorship = (orgId, over = {}) => ({ organizationId: orgId, sourceType: 'INSTITUTION_SPONSORSHIP', productCode: 'PRISM_CAMPUS_ASSESSMENT', quantity: 2, validFrom: iso(-day), validUntil: iso(30 * day), status: 'ACTIVE', ...over })
const purchase = (over = {}) => ({ userId: student.id, sourceType: 'PERSONAL_PURCHASE', productCode: 'PRISM_PERSONAL_ASSESSMENT', quantity: 1, validFrom: iso(-day), status: 'ACTIVE', ...over })

test('legacy adapter maps paid/coupon/invite records read-only', () => {
  assert.equal(fromLegacyEntitlement({ sessionId: 's', mode: 'paid', userId: 'u' }).sourceType, 'PERSONAL_PURCHASE')
  assert.equal(fromLegacyEntitlement({ sessionId: 's', mode: 'coupon', userId: 'u' }).sourceType, 'PROMO')
  assert.equal(fromLegacyEntitlement({ sessionId: 's', mode: 'invite', userId: 'u' }).sourceType, 'ADMIN_GRANT')
  assert.equal(fromLegacyEntitlement({ sessionId: 's', mode: 'review_grant', userId: 'u' }).sourceType, 'ADMIN_GRANT')
  assert.equal(fromLegacyEntitlement({ sessionId: 's', mode: 'mystery' }), null)
  const rec = Object.freeze({ sessionId: 's', mode: 'paid', userId: 'u', consumed: true })
  assert.equal(fromLegacyEntitlement(rec).status, 'EXHAUSTED')
})

test('personal purchase path: V2 personal entitlement, then legacy record, else ENTITLEMENT_REQUIRED', async () => {
  const none = await setup()
  assert.equal((await none.resolver.resolveEntitlement({ user: student, workspace: personalWs })).reason, 'ENTITLEMENT_REQUIRED')

  const withLegacy = await setup({ legacy: [{ sessionId: 'legacy-1', mode: 'paid', userId: student.id, consumed: false }] })
  const r1 = await withLegacy.resolver.resolveEntitlement({ user: student, workspace: personalWs })
  assert.equal(r1.allowed, true)
  assert.equal(r1.source, 'PERSONAL_PURCHASE')
  assert.equal(r1.consumptionRequired, false, 'legacy seats are consumed by the legacy path')

  const v2 = await setup()
  const ent = await v2.repos.entitlements.createEntitlement(purchase())
  const r2 = await v2.resolver.resolveEntitlement({ user: student, workspace: personalWs })
  assert.equal(r2.entitlementId, ent.id)
  assert.equal(r2.consumptionRequired, true)
  assert.deepEqual(r2.scope, { workspaceId: 'personal', organizationId: null, sponsorType: 'PERSONAL' })
})

test('sponsorship path: only the organization pool, only for active student members', async () => {
  const s = await setup()
  const ent = await s.repos.entitlements.createEntitlement(sponsorship(s.org.id))
  await s.repos.entitlements.createEntitlement(purchase())
  const r = await s.resolver.resolveEntitlement({ user: student, workspace: s.campusWs })
  assert.equal(r.allowed, true)
  assert.equal(r.source, 'INSTITUTION_SPONSORSHIP')
  assert.equal(r.entitlementId, ent.id)

  const outsider = await s.resolver.resolveEntitlement({ user: { id: 'stranger' }, workspace: s.campusWs })
  assert.equal(outsider.reason, 'NOT_A_MEMBER')
  const otherOrgWs = { id: 'ws-other', type: 'CAMPUS_STUDENT', organizationId: s.other.id }
  assert.equal((await s.resolver.resolveEntitlement({ user: student, workspace: otherOrgWs })).reason, 'NOT_A_MEMBER')
})

test('a campus workspace never falls back to personal credits (and vice versa)', async () => {
  const s = await setup({ legacy: [{ sessionId: 'legacy-1', mode: 'paid', userId: student.id }] })
  await s.repos.entitlements.createEntitlement(purchase())
  const campus = await s.resolver.resolveEntitlement({ user: student, workspace: s.campusWs })
  assert.equal(campus.allowed, false)
  assert.equal(campus.reason, 'ENTITLEMENT_REQUIRED')

  const s2 = await setup()
  await s2.repos.entitlements.createEntitlement(sponsorship(s2.org.id))
  const personal = await s2.resolver.resolveEntitlement({ user: student, workspace: personalWs })
  assert.equal(personal.allowed, false)
})

test('expired and exhausted sponsorships are named', async () => {
  const s = await setup()
  await s.repos.entitlements.createEntitlement(sponsorship(s.org.id, { validFrom: iso(-60 * day), validUntil: iso(-day) }))
  assert.equal((await s.resolver.resolveEntitlement({ user: student, workspace: s.campusWs })).reason, 'ENTITLEMENT_EXPIRED')

  const x = await setup()
  const ent = await x.repos.entitlements.createEntitlement(sponsorship(x.org.id, { quantity: 1 }))
  const r = await x.resolver.resolveEntitlement({ user: student, workspace: x.campusWs })
  await x.ledger.reserve({ resolution: r, user: student, sessionId: 's1', idempotencyKey: 'k1' })
  assert.equal((await x.repos.entitlements.getEntitlement(ent.id)).consumedQuantity, 1)
  assert.equal((await x.resolver.resolveEntitlement({ user: student, workspace: x.campusWs })).reason, 'ENTITLEMENT_EXHAUSTED')
})

test('reserve is idempotent, consume audits once, release on abandon frees the seat', async () => {
  const s = await setup()
  const ent = await s.repos.entitlements.createEntitlement(sponsorship(s.org.id))
  const r = await s.resolver.resolveEntitlement({ user: student, workspace: s.campusWs })
  await assert.rejects(s.ledger.reserve({ resolution: r, user: student, sessionId: 's1' }), { code: 'IDEMPOTENCY_KEY_REQUIRED' })
  const a = await s.ledger.reserve({ resolution: r, user: student, sessionId: 's1', idempotencyKey: 'start-1' })
  const b = await s.ledger.reserve({ resolution: r, user: student, sessionId: 's1', idempotencyKey: 'start-1' })
  assert.equal(b.replayed, true)
  assert.equal(a.consumption.id, b.consumption.id)
  assert.equal((await s.repos.entitlements.getEntitlement(ent.id)).consumedQuantity, 1)

  await s.ledger.consume({ entitlementId: ent.id, user: student, sessionId: 's1' })
  await s.ledger.consume({ entitlementId: ent.id, user: student, sessionId: 's1' })
  assert.equal(s.audits.filter(([e]) => e === 'entitlement.consumed').length, 1)

  await s.ledger.reserve({ resolution: r, user: student, sessionId: 's2', idempotencyKey: 'start-2' })
  assert.equal((await s.repos.entitlements.getEntitlement(ent.id)).consumedQuantity, 2)
  await s.ledger.release({ entitlementId: ent.id, user: student, sessionId: 's2' })
  assert.equal((await s.repos.entitlements.getEntitlement(ent.id)).consumedQuantity, 1)
  await assert.rejects(s.ledger.consume({ entitlementId: ent.id, user: student, sessionId: 'never' }), { code: 'CONFLICT' })
  assert.deepEqual((await s.repos.entitlements.listConsumptions(ent.id)).map((c) => c.event), ['RESERVED', 'CONSUMED', 'RESERVED', 'RELEASED'])
})

test('cross-scope consumption is impossible even with a forged resolution', async () => {
  const s = await setup()
  const personal = await s.repos.entitlements.createEntitlement(purchase())
  const sponsor = await s.repos.entitlements.createEntitlement(sponsorship(s.org.id))
  const forgedCampus = { allowed: true, consumptionRequired: true, entitlementId: personal.id, scope: { sponsorType: 'INSTITUTION', organizationId: s.org.id } }
  await assert.rejects(s.ledger.reserve({ resolution: forgedCampus, user: student, sessionId: 's', idempotencyKey: 'f1' }), { code: 'FORBIDDEN' })
  const forgedPersonal = { allowed: true, consumptionRequired: true, entitlementId: sponsor.id, scope: { sponsorType: 'PERSONAL', organizationId: null } }
  await assert.rejects(s.ledger.reserve({ resolution: forgedPersonal, user: student, sessionId: 's', idempotencyKey: 'f2' }), { code: 'FORBIDDEN' })
  const otherOrg = { allowed: true, consumptionRequired: true, entitlementId: sponsor.id, scope: { sponsorType: 'INSTITUTION', organizationId: s.other.id } }
  await assert.rejects(s.ledger.reserve({ resolution: otherOrg, user: student, sessionId: 's', idempotencyKey: 'f3' }), { code: 'FORBIDDEN' })
  assert.equal((await s.repos.entitlements.getEntitlement(personal.id)).consumedQuantity, 0)
  assert.equal((await s.repos.entitlements.getEntitlement(sponsor.id)).consumedQuantity, 0)
})

test('the consumption ledger is append-only in memory too', async () => {
  const s = await setup()
  const ent = await s.repos.entitlements.createEntitlement(sponsorship(s.org.id))
  await s.repos.entitlements.appendEvent({ entitlementId: ent.id, userId: 'u', organizationId: s.org.id, sessionId: 's', event: 'RESERVED', idempotencyKey: 'x' })
  assert.throws(() => { s.repos.db.consumptions[0].event = 'CONSUMED' })
})
