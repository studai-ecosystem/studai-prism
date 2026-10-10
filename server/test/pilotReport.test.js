// PROD-READY Phase 8 — pilot technical report export
// (POST /api/admin/organizations/:orgId/pilot-report) over memory repositories
// with synthetic sponsored sessions and synthetic evidence units. Proves: dark
// behind PRISM_PILOT_REPORT_EXPORT (404, flag registered OFF); admin RBAC
// (organizations:read + exports:create); a purpose is required and every
// export is ledgered and audited; the Markdown fills every template section;
// PROVISIONAL and INSUFFICIENT_EVIDENCE are shown as computed (never
// SUFFICIENT under the uncalibrated rules); small-group suppression at, below
// and above the minimum (org setting, floor 5) for whole tables and single
// cells; no student, account or session id or name ever appears; a demo
// organization is labelled synthetic.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { readFileSync } from 'node:fs'
import { createV1Router } from '../routes/v1/index.js'
import { createPilotReportRouter } from '../routes/admin/pilotReport.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext } from '../domain/campusStore/context.js'
import { ApiError } from '../domain/http/errors.js'
import { PRIMARY_CAPABILITY_IDS } from '../domain/assessments/catalog.js'
import { normalizeEvidenceUnit } from '../domain/evidence/evidenceUnit.js'
import { buildPilotReport, renderPilotReportMarkdown, countCell, protectRow, DEMO_REPORT_NOTICE } from '../domain/pilotReport/service.js'
import { ROLES } from '../lib/adminRbac.js'
import { FLAG_CATALOGUE } from '../lib/flagRegistry.js'

process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_CAMPUS_ANALYTICS = 'true'
const FLAG = 'PRISM_PILOT_REPORT_EXPORT'

const SCENARIOS = { generalScenarios: [{ id: 'syn-pr-a' }], bankScenarios: {} }
const CAP = PRIMARY_CAPABILITY_IDS[0]
const TEMPLATE = readFileSync(new URL('../../docs/commercial/PILOT_TECHNICAL_REPORT_TEMPLATE_v1.md', import.meta.url), 'utf8')

async function withFlag(on, fn) {
  const prev = process.env[FLAG]
  if (on) process.env[FLAG] = 'true'
  else delete process.env[FLAG]
  try { return await fn() } finally { if (prev === undefined) delete process.env[FLAG]; else process.env[FLAG] = prev }
}

// Units for one session: `provisional` → 4 units over 4 turns (enough for
// PROVISIONAL under the uncalibrated rules); otherwise 1 unit (INSUFFICIENT).
function unitsFor(sessionId, provisional) {
  const n = provisional ? 4 : 1
  return Array.from({ length: n }, (_, t) => normalizeEvidenceUnit({
    session_id: sessionId, capability_id: CAP, source_type: 'DIALOGUE_TURN', source_turn: t + 1, behavior_anchor_id: `syn-pr-anchor-${t % 2}`,
    candidate_action: { dialogue_excerpt: 'Synthetic words.' }, provenance: { synthetic: true }, rubric_level: 3, judge_agreement: { agreement: 0.9, samples: 3 },
  }).unit)
}

async function world({ completed = 12, provisionalEvery = 2, extraAssigned = 3, isDemo = false, minGroupSize = null, held = 0 } = {}) {
  const now = new Date('2026-10-20T09:00:00Z')
  const repos = createMemoryCampusRepos({ clock: () => now })
  const org = await repos.organizations.createOrganization({ name: isDemo ? 'Demo College (synthetic)' : 'Synthetic Pilot College', slug: `syn-pr-${Math.random().toString(36).slice(2, 8)}`, organizationType: 'COLLEGE', status: 'ACTIVE', isDemo })
  const dept = await repos.organizations.createDepartment({ organizationId: org.id, name: 'Synthetic Department' })
  const cohort = await repos.organizations.createCohort({ organizationId: org.id, departmentId: dept.id, name: 'Synthetic Cohort' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: 'owner-pr', role: 'ORG_OWNER', status: 'ACTIVE' })
  const students = []
  for (let i = 0; i < completed + extraAssigned; i += 1) {
    const id = `student-pr-${i}`
    await repos.memberships.upsertMembership({ organizationId: org.id, userId: id, role: 'STUDENT', status: 'ACTIVE' })
    await repos.organizations.addCohortMember({ cohortId: cohort.id, userId: id })
    students.push(id)
  }
  if (minGroupSize) await repos.analytics.saveSettings({ organizationId: org.id, minAggregateGroupSize: minGroupSize, updatedBy: 'owner-pr' })
  const SESSIONS = {}
  const UNITS = {}
  const HELD = new Set()
  const legacy = {
    listEntitlements: async () => [], listSessionIds: async () => [],
    getSession: async (id) => (SESSIONS[id] ? { scenarioId: 'syn-pr-a', userId: SESSIONS[id], history: [] } : null),
    getReport: async (id) => (SESSIONS[id] ? { userId: SESSIONS[id], issuedAt: '2026-10-12T10:00:00Z' } : null),
    getEntitlement: async () => null, createEntitlement: async () => null,
    adminState: async (id) => (HELD.has(id) ? { invalid: false, reviewState: 'held' } : null),
    paths: { purchase: '/payment', start: () => '/', resume: () => '/', report: () => '/' },
  }
  const campus = createCampusContext({
    repos, clock: () => now, legacy, scenarioSource: async () => SCENARIOS,
    users: { findById: async () => null, findByEmail: async () => null },
    evidence: { units: async (sid) => UNITS[sid] || [] },
    audit: () => {},
  })
  // A sponsored assignment created through the real v1 handlers.
  const v1 = express()
  v1.use(express.json())
  v1.use((req, _res, next) => { req.user = { id: 'owner-pr', email: 'owner-pr@test.local', name: 'Synthetic Owner' }; next() })
  v1.use('/api/v1', createV1Router({ requireUser: (_q, _s, n) => n(), campus }))
  v1.use((err, _req, res, _next) => res.status(err instanceof ApiError ? 400 : 500).json({ error: String(err.message) }))
  const s1 = v1.listen(0)
  await new Promise((r) => s1.once('listening', r))
  const vbase = `http://127.0.0.1:${s1.address().port}/api/v1/organizations/${org.id}`
  const cat = await (await fetch(`${vbase}/assessment-catalog`)).json()
  const assignment = (await (await fetch(`${vbase}/assignments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ definitionId: cat.data.items[0].id, cohortIds: [cohort.id], windowStart: '2026-10-10T08:00:00.000Z', windowEnd: '2026-10-30T18:00:00.000Z' }) })).json()).data
  s1.close()
  for (let i = 0; i < completed; i += 1) {
    const userId = students[i]
    const sessionId = `sess-pr-${i}`
    SESSIONS[sessionId] = userId
    UNITS[sessionId] = unitsFor(sessionId, i % provisionalEvery === 0)
    if (i < held) HELD.add(sessionId)
    await repos.assessments.updateStudent({ assignmentId: assignment.id, userId, patch: { status: 'COMPLETED', sessionId, startedAt: '2026-10-12T09:00:00Z', completedAt: '2026-10-12T09:31:00Z' } })
  }

  const audits = []
  const ledger = []
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    const role = req.get('x-admin-role')
    if (role) req.admin = { id: `admin-${role}`, permissions: new Set(ROLES[role].permissions) }
    next()
  })
  app.use('/api/admin/organizations', createPilotReportRouter({
    campus, audit: async (_req, e) => { audits.push(e) }, ledger: async (_req, e) => { ledger.push(e) },
    adminState: legacy.adminState, clock: () => now,
  }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/admin/organizations`
  const call = async (role, path, body) => {
    const r = await fetch(`${base}${path}`, { method: 'POST', headers: { ...(role ? { 'x-admin-role': role } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
    const text = await r.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* markdown */ }
    return { status: r.status, text, json, type: r.headers.get('content-type') }
  }
  return { org, students, sessions: Object.keys(SESSIONS), campus, legacy, call, audits, ledger, close: () => server.close() }
}

const body = { purpose: 'Synthetic pilot close-out review', term: 'Synthetic term 2026', format: 'markdown' }
const noIdentity = (text, w) => {
  for (const id of [...w.students, ...w.sessions, 'owner-pr', 'Synthetic Owner']) assert.ok(!text.includes(id), `report leaks ${id}`)
  // Selection wording appears only inside the stated disclaimers.
  const stripped = text
    .replace(/not a hiring screen, a ranking, a pass\/fail cut-off or a predictor of job performance/g, '')
    .replace(/not a ranking, no cut-off/g, '')
  assert.ok(!/\b(rank(ed|ing)?|percentile|hire|hiring|fit score|pass mark|cut-off|top \d+)\b/i.test(stripped), 'no ranking / selection wording')
  assert.ok(!/"(score|rank|average|composite|percentile)"/i.test(text), 'no score, rank or composite field')
}

test('flag PRISM_PILOT_REPORT_EXPORT is registered OFF; flag off → 404 for everyone', async () => {
  const f = FLAG_CATALOGUE.find((x) => x.key === FLAG)
  assert.ok(f, 'registered')
  assert.match(f.dataGate, /HA-008/)
  assert.notEqual(process.env[FLAG], 'true')
  const w = await world()
  try {
    await withFlag(false, async () => {
      assert.equal((await w.call('product_admin', `/${w.org.id}/pilot-report`, body)).status, 404)
      assert.equal((await w.call('super_admin', `/${w.org.id}/pilot-report`, body)).status, 404)
    })
    assert.equal(w.ledger.length + w.audits.length, 0, 'nothing exported or audited while dark')
  } finally { w.close() }
})

test('flag on: RBAC, purpose, ledger + audit, every template section, honest statuses, no identities', async () => {
  const w = await world({ completed: 12 })
  try {
    await withFlag(true, async () => {
      assert.equal((await w.call(null, `/${w.org.id}/pilot-report`, body)).status, 401)
      assert.equal((await w.call('content_admin', `/${w.org.id}/pilot-report`, body)).status, 403)
      assert.equal((await w.call('auditor', `/${w.org.id}/pilot-report`, body)).status, 403, 'read-only roles cannot export')
      assert.equal((await w.call('product_admin', `/${w.org.id}/pilot-report`, { ...body, purpose: 'short' })).status, 400)
      assert.equal((await w.call('product_admin', `/${w.org.id}/pilot-report`, { ...body, format: 'pdf' })).status, 400)
      assert.equal((await w.call('product_admin', '/00000000-0000-4000-8000-000000000000/pilot-report', body)).status, 404)
      assert.equal(w.ledger.length + w.audits.length, 0, 'refused requests leave no export record')
      const md = await w.call('product_admin', `/${w.org.id}/pilot-report`, body)
      assert.equal(md.status, 200)
      assert.match(md.type, /text\/markdown/)
      for (const heading of TEMPLATE.match(/^### \d\. .+$/gm)) assert.ok(md.text.includes(heading.split(' (')[0]), `template section ${heading}`)
      assert.match(md.text, /Synthetic Pilot College, Synthetic term 2026/)
      assert.match(md.text, /\| SUFFICIENT \| PROVISIONAL \| INSUFFICIENT_EVIDENCE \|/)
      // 12 students: 6 PROVISIONAL, 6 INSUFFICIENT_EVIDENCE, 0 SUFFICIENT.
      // A rate is never shown when a count it is made of is suppressed.
      assert.match(md.text, /\| 12 \| 0 \| suppressed \(fewer than 10\) \| suppressed \(fewer than 10\) \| 0 \| suppressed or not enough data \|/)
      assert.match(md.text, /Composite score: NOT REPORTED/)
      assert.match(md.text, /PENDING \(HA-009, HA-010, HA-013\)/)
      assert.match(md.text, /UNKNOWN/)
      assert.match(md.text, /not a hiring screen, a ranking, a pass\/fail cut-off or a predictor of job performance/)
      noIdentity(md.text, w)
      assert.equal(w.ledger.length, 1)
      assert.deepEqual(w.ledger[0].filters, { organizationId: w.org.id, format: 'markdown', term: 'Synthetic term 2026', isDemo: false })
      assert.equal(w.audits[0].action, 'pilot_report_exported')
      assert.equal(w.audits[0].reason, body.purpose)
      const js = await w.call('product_admin', `/${w.org.id}/pilot-report`, { ...body, format: 'json' })
      assert.equal(js.status, 200)
      const m = js.json.report
      assert.equal(m.measurement.capabilities[0].statuses.SUFFICIENT.n, 0, 'never SUFFICIENT under uncalibrated rules')
      assert.deepEqual(m.measurement.capabilities[0].statuses.PROVISIONAL, { suppressed: true }, '6 < 10 → suppressed cell, not a number')
      assert.equal(m.measurement.capabilities[0].insufficientRate, null, '6 of 12 would reveal the suppressed cell')
      noIdentity(js.text, w)
      assert.equal(w.ledger.length, 2, 'every export is ledgered')
    })
  } finally { w.close() }
})

test('suppression edges: below / at the minimum, org setting with floor 5, single cells, held sessions', async () => {
  // 9 completed (< 10): every learner table is suppressed whole.
  let w = await world({ completed: 9, extraAssigned: 0 })
  try {
    const m = await buildPilotReport({ campus: w.campus, organizationId: w.org.id, adminState: w.legacy.adminState })
    assert.equal(m.measurement.capabilities, null)
    assert.deepEqual(m.measurement.assessed, { suppressed: true })
    assert.deepEqual(m.administration.funnel, { suppressed: true })
    assert.deepEqual(m.administration.integrity, { suppressed: true })
    assert.equal(m.operations.completionRate, null)
    assert.equal(m.operations.medianMinutes, null)
    const md = renderPilotReportMarkdown(m)
    assert.match(md, /Capability tables suppressed: fewer than 10 students/)
    assert.ok(!/\b9\b/.test(md.replace(/2026|PILOT_TECHNICAL_REPORT_TEMPLATE_v1|ACCOMMODATIONS_POLICY_v1|v1/g, '')), 'the number 9 never appears')
    noIdentity(md, w)
  } finally { w.close() }
  // Exactly 10 completed, all PROVISIONAL: visible; INSUFFICIENT cell 0 stays 0.
  w = await world({ completed: 10, provisionalEvery: 1, extraAssigned: 0 })
  try {
    const m = await buildPilotReport({ campus: w.campus, organizationId: w.org.id })
    const c = m.measurement.capabilities[0]
    assert.equal(c.n, 10)
    assert.deepEqual(c.statuses.PROVISIONAL, { n: 10 })
    assert.deepEqual(c.statuses.INSUFFICIENT_EVIDENCE, { n: 0 })
    assert.equal(m.operations.medianMinutes, 31)
    assert.equal(m.operations.completionRate, 100)
  } finally { w.close() }
  // Org minimum lowered to 5 (the floor): 6 completed are visible, cells of 3 are not.
  w = await world({ completed: 6, extraAssigned: 0, minGroupSize: 5 })
  try {
    const m = await buildPilotReport({ campus: w.campus, organizationId: w.org.id })
    assert.equal(m.minGroupSize, 5)
    const c = m.measurement.capabilities[0]
    assert.equal(c.n, 6)
    assert.deepEqual(c.statuses.PROVISIONAL, { suppressed: true })
    assert.deepEqual(c.statuses.INSUFFICIENT_EVIDENCE, { suppressed: true })
    assert.match(renderPilotReportMarkdown(m), /suppressed \(fewer than 5\)/)
  } finally { w.close() }
  // Held sessions are counted as review-recommended, small counts suppressed.
  w = await world({ completed: 12, held: 2 })
  try {
    const m = await buildPilotReport({ campus: w.campus, organizationId: w.org.id, adminState: w.legacy.adminState })
    assert.deepEqual(m.administration.integrity.reviewRecommended, { suppressed: true })
    assert.deepEqual(m.administration.integrity.invalidated, { n: 0 })
    assert.deepEqual(m.administration.integrity.conditionsMet, { suppressed: true, complementary: true }, '10 next to the shown 12 completed would give away the 2')
  } finally { w.close() }
  // One suppressed cell next to a shown total: the smallest visible non-zero cell goes too.
  w = await world({ completed: 14, provisionalEvery: 7, extraAssigned: 0 })
  try {
    const m = await buildPilotReport({ campus: w.campus, organizationId: w.org.id })
    const c = m.measurement.capabilities[0]
    assert.equal(c.n, 14)
    assert.deepEqual(c.statuses.PROVISIONAL, { suppressed: true })
    assert.deepEqual(c.statuses.INSUFFICIENT_EVIDENCE, { suppressed: true, complementary: true }, '12 would give away the 2')
    assert.deepEqual(c.statuses.SUFFICIENT, { n: 0 })
    assert.deepEqual(c.provisional, c.statuses.PROVISIONAL, 'the band table repeats the status cell, never the raw number')
    assert.equal(c.insufficientRate, null)
    const md = renderPilotReportMarkdown(m)
    assert.match(md, /suppressed \(complementary\)/)
    assert.ok(!/\| 12 \|/.test(md) && !/\| 2 \|/.test(md))
  } finally { w.close() }
  assert.deepEqual(protectRow({ a: { n: 0 }, b: { suppressed: true }, c: { n: 30 }, d: { n: 11 } }), { a: { n: 0 }, b: { suppressed: true }, c: { n: 30 }, d: { suppressed: true, complementary: true } })
  assert.deepEqual(protectRow({ a: { suppressed: true }, b: { suppressed: true }, c: { n: 30 } }).c, { n: 30 }, 'two hidden cells already protect each other')
  assert.deepEqual(countCell(0, 10), { n: 0 })
  assert.deepEqual(countCell(9, 10), { suppressed: true })
  assert.deepEqual(countCell(10, 10), { n: 10 })
  assert.deepEqual(countCell(undefined, 10), { unknown: true })
})

test('a demo organization is labelled synthetic in Markdown and JSON', async () => {
  const w = await world({ isDemo: true })
  try {
    await withFlag(true, async () => {
      const md = await w.call('product_admin', `/${w.org.id}/pilot-report`, body)
      assert.equal(md.status, 200)
      assert.ok(md.text.includes(DEMO_REPORT_NOTICE))
      const js = await w.call('product_admin', `/${w.org.id}/pilot-report`, { ...body, format: 'json' })
      assert.equal(js.json.report.organization.isDemo, true)
      assert.equal(js.json.report.demoNotice, DEMO_REPORT_NOTICE)
      assert.equal(w.ledger.at(-1).filters.isDemo, true)
    })
  } finally { w.close() }
})
