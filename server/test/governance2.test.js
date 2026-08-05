// Charter MASTER-2026-08-04 Phase 3 part 2 — governance suite
// (§13 accommodations, §15 fairness-research framework, §16 retention).

import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALTERNATE_ADMINISTRATION_DISCLOSURE } from '../lib/sharedConstants.js'
import { FLAG_CATALOGUE } from '../lib/flagRegistry.js'
import {
  MIN_GROUP_SIZE, isDemographicsEnabled, suppressSmallGroups, powerLabel,
} from '../lib/fairnessResearch.js'
import {
  RETENTION_DEFAULTS, PROVISIONAL_BASIS, ENFORCEABLE_ENTITIES,
  isRetentionEnforcementEnabled,
} from '../lib/retentionEnforcement.js'
import { buildVerifyView } from '../routes/credentials.js'
import { INTEGRITY_STATUSES, ASSURANCE_LEVELS } from '../lib/sharedConstants.js'
import * as store from '../lib/store.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const read = (rel) => readFile(join(ROOT, rel), 'utf-8')

// ── §13 accommodations ───────────────────────────────────────────────────────

test('§13: request → decide → alternate administration lifecycle (store twins)', async () => {
  const sid = randomUUID()
  const requested = await store.requestAccommodation(sid, 'I need a text-only assessment without a camera because of a visual impairment.')
  assert.equal(requested.status, 'requested')

  const deniedElsewhere = await store.getAccommodation(sid)
  assert.equal(deniedElsewhere.needs.length > 10, true)

  const decided = await store.decideAccommodation(sid, {
    approved: true,
    modes: { textOnly: true, noCamera: true, reducedProctoring: false },
    material: true,
    note: 'Approved: text-only + no camera; modality change is material.',
    decidedBy: 'admin-1',
  })
  assert.equal(decided.status, 'approved')
  assert.deepEqual(decided.modes, { textOnly: true, noCamera: true, reducedProctoring: false })
  assert.equal(decided.material, true)

  // A decided request is immutable through the request path.
  const rePost = await store.requestAccommodation(sid, 'trying to overwrite the decision')
  assert.equal(rePost.status, 'approved', 'decisions cannot be overwritten by re-requesting')

  // Erasure covers the accommodation record (the most sensitive candidate text).
  await store.eraseSession(sid)
  assert.equal(await store.getAccommodation(sid), null, 'accommodation erased with the session')
})

test('§13: the disclosure is the charter sentence, and ONLY material sessions carry it', async () => {
  assert.match(ALTERNATE_ADMINISTRATION_DISCLOSURE, /approved alternate administration mode/)
  const source = await read('server/routes/assessment.js')
  assert.ok(source.includes('administrationMode?.material'), 'disclosure gated on the material judgement')
  assert.ok(source.includes("auditLog('alternate_administration_applied'"), 'application is audited')
  assert.ok(source.includes("auditLog('accommodation_requested'"), 'requests are audited')
  const admin = await read('server/routes/admin/accommodations.js')
  assert.ok(admin.includes("auditLog('accommodation_decided'"), 'decisions are audited on the assessment plane')
  assert.ok(admin.includes("action: 'accommodation_viewed'"), 'sensitive reads are audited')
})

test('§13 AUTHORIZATION: accommodation details never reach buyer-facing views — the disclosure sentence may', () => {
  const bundle = {
    schema: 'evidence-bundle-v2',
    sessionId: randomUUID(),
    issued: { scaleVersion: 'prism-scale-v1', validityMonths: 12 },
    scores: { dimensions: { criticalThinking: 70 }, insufficientEvidence: [] },
    identityAssurance: { level: 'L1', label: ASSURANCE_LEVELS.L1.label, basis: 'account', recordedAt: 'now' },
    administration: { mode: 'alternate', disclosure: ALTERNATE_ADMINISTRATION_DISCLOSURE },
    reliability: { label: 'high' },
    consent: { version: 'v' },
    provenance: {},
    evidence: {},
    judgeVotes: [],
    integrityEvents: {},
  }
  for (const fullDisclosure of [false, true]) {
    const view = buildVerifyView(bundle, fullDisclosure, { integrityStatus: INTEGRITY_STATUSES.met })
    const serialized = JSON.stringify(view)
    assert.ok(!/needs|disability|accommodationType|textOnly|noCamera|reducedProctoring|modes/.test(serialized),
      'no accommodation type/needs in any view')
    assert.equal(view.administration.disclosure, ALTERNATE_ADMINISTRATION_DISCLOSURE, 'the charter sentence is stated')
  }
})

test('§13: alternate administration inherits profile-first honesty (no composite, no percentile)', async () => {
  // The pilot product is profile-first for EVERY candidate (charter §6) — an
  // accommodated session therefore never gets a composite or percentile either.
  const { finalizeReportForIssuance } = await import('../lib/reportPolicy.js')
  const report = finalizeReportForIssuance(
    { scores: { criticalThinking: 70, communication: 60, collaboration: 65, problemSolving: 60, aiDigitalFluency: 55, overall: 63 }, percentile: 50 },
    { insufficient: [], perDimension: {}, policyVersion: 'anchor-probes-v1' },
  )
  assert.ok(!('overall' in report.scores) && !('percentile' in report))
})

// ── §15 fairness-research framework ──────────────────────────────────────────

test('§15: demographic collection is OFF and CI-banned; the gate names the approvals', () => {
  assert.equal(isDemographicsEnabled(), false)
  const entry = FLAG_CATALOGUE.find((f) => f.key === 'PRISM_DEMOGRAPHICS')
  assert.ok(entry, 'PRISM_DEMOGRAPHICS is a registered governance gate')
  assert.match(entry.dataGate, /HA-005/, 'counsel approval named')
  assert.match(entry.dataGate, /HA-012/, 'ethics review named')
})

test('§15: minimum-group-size suppression is mandatory and does not reveal suppressed counts', () => {
  const { rows, suppressedGroups, note } = suppressSmallGroups([
    { group: 'a', n: 25, stat: 1 },
    { group: 'b', n: MIN_GROUP_SIZE - 1, stat: 2 },
    { group: 'c', n: MIN_GROUP_SIZE, stat: 3 },
    { group: 'd', n: 0, stat: 4 },
  ])
  assert.deepEqual(rows.map((r) => r.group), ['a', 'c'])
  assert.equal(suppressedGroups, 2)
  assert.ok(!note.includes('9') && !note.includes(' 0 '), 'suppressed group sizes are not disclosed')
})

test('§15: UNDERPOWERED labelling is honest and fails closed', () => {
  assert.equal(powerLabel(149, 150), 'UNDERPOWERED')
  assert.equal(powerLabel(150, 150), 'adequately-powered')
  assert.equal(powerLabel(undefined, 150), 'UNDERPOWERED')
  assert.equal(powerLabel(200, NaN), 'UNDERPOWERED')
})

test('§15: the separated table is pseudonymous and erasure-integrated', async () => {
  const migration = await read('server/db/migrations/0019_accommodations_retention.sql')
  const block = migration.slice(
    migration.indexOf('CREATE TABLE IF NOT EXISTS candidate_demographics'),
    migration.indexOf('CREATE TABLE IF NOT EXISTS legal_holds'),
  ).replace(/--.*$/gm, '') // comments may legitimately NAME the banned columns
  assert.ok(!/session_id|user_id|email|full_name/.test(block), 'demographics carry no session/user/identity keys')
  assert.ok(block.includes('withdrawn_at'), 'withdrawal is a first-class column')
  const planner = await read('server/lib/privacyPlanner.js')
  assert.ok(planner.includes('DELETE FROM candidate_demographics'), 'candidate erasure removes demographic rows')
  const framework = await read('docs/FAIRNESS_RESEARCH_FRAMEWORK_v1.md')
  assert.ok(framework.includes('NOT anonymization'), 'name-removal ≠ anonymization is documented')
})

// ── §16 retention ────────────────────────────────────────────────────────────

test('§16: the charter defaults are provisional, labelled, and never claim legal approval', () => {
  const byEntity = Object.fromEntries(RETENTION_DEFAULTS.map((d) => [d.entity, d]))
  assert.equal(byEntity.assessment_transcripts.retentionDays, 365)
  assert.equal(byEntity.reports_evidence.retentionDays, 730)
  assert.equal(byEntity.integrity_telemetry.retentionDays, 90)
  assert.equal(byEntity.research_datasets.retentionDays, null, 'research data is consent-scoped, not timer-based')
  assert.equal(byEntity.operational_audit.retentionDays, 1095)
  assert.equal(byEntity.review_dispute_materials.retentionDays, 1095)
  assert.equal(byEntity.payment_records.retentionDays, 2920)
  assert.match(byEntity.payment_records.basis, /NOT legally approved/i, 'the payment period never claims approval')
  assert.equal(byEntity.revoked_credential_tombstone.retentionDays, null)
  for (const d of RETENTION_DEFAULTS.filter((x) => x.basis.includes('PROVISIONAL'))) {
    assert.ok(d.basis.includes(PROVISIONAL_BASIS.slice(0, 20)), `${d.entity} is labelled provisional`)
  }
})

test('§16: integrity-event pruning respects the cutoff, exclusions and dry-run mode (JSON store)', async () => {
  const oldSid = randomUUID()
  const heldSid = randomUUID()
  const freshSid = randomUUID()
  // Age the events by writing then rewinding `at` via the store file is not
  // exposed — use recordEvent + a cutoff in the future/past instead.
  await store.recordEvent(oldSid, 'tab_switch', {})
  await store.recordEvent(heldSid, 'tab_switch', {})
  await store.recordEvent(freshSid, 'tab_switch', {})

  const future = new Date(Date.now() + 60_000).toISOString()
  // Dry-run: everything before the future cutoff matches except exclusions —
  // and NOTHING is deleted.
  const dry = await store.pruneEventsBefore(future, { excludeSessionIds: [heldSid], dryRun: true })
  assert.ok(dry.matched >= 2, 'old events matched')
  assert.equal(dry.deleted, 0, 'dry-run mutates nothing')
  assert.equal((await store.getEvents(oldSid)).length, 1, 'still present after dry-run')

  const enforce = await store.pruneEventsBefore(future, { excludeSessionIds: [heldSid, freshSid], dryRun: false })
  assert.ok(enforce.deleted >= 1)
  assert.equal((await store.getEvents(oldSid)).length, 0, 'pruned')
  assert.equal((await store.getEvents(heldSid)).length, 1, 'excluded (legal hold / dispute) events survive')
  assert.equal((await store.getEvents(freshSid)).length, 1, 'excluded events survive')

  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const none = await store.pruneEventsBefore(past, { dryRun: false })
  assert.equal(none.deleted, 0, 'nothing younger than the cutoff is touched')
  // Cleanup.
  await store.eraseSession(heldSid)
  await store.eraseSession(freshSid)
})

test('§16: the scheduler is OFF by default and registered for human governance', () => {
  assert.equal(isRetentionEnforcementEnabled(), false)
  const entry = FLAG_CATALOGUE.find((f) => f.key === 'PRISM_RETENTION_ENFORCEMENT')
  assert.ok(entry, 'registered gate')
  assert.match(entry.dataGate, /HA-003/, 'counsel-approved schedule named')
  assert.deepEqual([...ENFORCEABLE_ENTITIES].sort(), ['assessment_transcripts', 'integrity_telemetry'],
    'timer enforcement is deliberately narrow')
})

test('§16: legal holds block erasure and enforcement; overrides only extend (wiring)', async () => {
  const planner = await read('server/lib/privacyPlanner.js')
  assert.ok(planner.includes("err.code = 'LEGAL_HOLD_ACTIVE'"), 'erasure refuses under an active hold')
  const privacy = await read('server/routes/admin/privacy.js')
  assert.ok(privacy.includes("code: 'LEGAL_HOLD_ACTIVE'"), 'the execute route surfaces the hold (409)')
  assert.ok(privacy.includes("code: 'DRY_RUN_REQUIRED'"), 'enforcement never runs blind')
  assert.ok(privacy.includes("action: 'legal_hold_placed'") && privacy.includes("action: 'legal_hold_released'"), 'hold lifecycle is audited')
  const engine = await read('server/lib/retentionEnforcement.js')
  assert.ok(engine.includes('Math.max(...days)'), 'overrides extend — the longest applicable period wins')
  assert.ok(engine.includes('retention_runs'), 'every run leaves a receipt')
  const boot = await read('server/index.js')
  assert.ok(boot.includes('startRetentionScheduler'), 'the scheduled job exists (dark until humans enable it)')
})
