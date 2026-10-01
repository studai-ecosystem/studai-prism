// Local performance probe for campus summary endpoints (Campus Phase 12,
// C12.05; spec §47). Runs the real /api/v1 handlers in-process on the MEMORY
// store with a synthetic organization (default 300 students, all completed),
// then drives each endpoint with N concurrent clients for D seconds and
// prints latency percentiles. Local numbers on a developer machine are NOT
// service levels: there is no Postgres, network or production data here.
//
//   node server/test-support/campusPerf.mjs [--students 300] [--concurrency 10] [--duration 8]
//
// Test tooling (like the rest of test-support): flags are enabled inside this
// process only, never in any environment.
import express from 'express'
import http from 'node:http'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext } from '../domain/campusStore/context.js'
import { normalizeEvidenceUnit } from '../domain/evidence/evidenceUnit.js'
import { PRIMARY_CAPABILITY_IDS } from '../domain/assessments/catalog.js'
import { ApiError } from '../domain/http/errors.js'

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i !== -1 ? Number(process.argv[i + 1]) : def }
const STUDENTS = arg('students', 300)
const CONCURRENCY = arg('concurrency', 10)
const DURATION = arg('duration', 8)

process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_CAMPUS_ANALYTICS = 'true'
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error'

const SCENARIOS = { generalScenarios: [{ id: 'syn-perf-a' }], bankScenarios: {} }
const SESSIONS = {}
const UNITS = {}
const legacy = {
  listEntitlements: async () => [], listSessionIds: async () => [],
  getSession: async (id) => (SESSIONS[id] ? { scenarioId: 'syn-perf-a', userId: SESSIONS[id], history: [] } : null),
  getReport: async (id) => (SESSIONS[id] ? { userId: SESSIONS[id], issuedAt: '2026-10-12T10:00:00Z' } : null),
  getEntitlement: async () => null, createEntitlement: async () => null, adminState: async () => null,
  paths: { purchase: '/payment', start: () => '/', resume: () => '/', report: () => '/' },
}

async function seed() {
  const now = new Date('2026-10-20T09:00:00Z')
  const repos = createMemoryCampusRepos({ clock: () => now })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic Perf University', slug: 'syn-perf', organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  const owner = { id: 'owner-perf', email: 'owner-perf@test.local', name: 'Synthetic Owner' }
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: owner.id, role: 'ORG_OWNER', status: 'ACTIVE' })
  const cohorts = []
  for (let c = 0; c < 3; c += 1) {
    const d = await repos.organizations.createDepartment({ organizationId: org.id, name: `Synthetic Dept ${c}` })
    cohorts.push(await repos.organizations.createCohort({ organizationId: org.id, departmentId: d.id, name: `Synthetic Cohort ${c}` }))
  }
  const students = []
  for (let i = 0; i < STUDENTS; i += 1) {
    const id = `student-perf-${i}`
    await repos.memberships.upsertMembership({ organizationId: org.id, userId: id, role: 'STUDENT', status: 'ACTIVE' })
    await repos.organizations.addCohortMember({ cohortId: cohorts[i % 3].id, userId: id })
    students.push(id)
  }
  await repos.entitlements.createEntitlement({ organizationId: org.id, sourceType: 'INSTITUTION_SPONSORSHIP', productCode: 'PRISM_CAMPUS_ASSESSMENT', quantity: STUDENTS, validFrom: '2026-09-01T00:00:00.000Z', validUntil: '2027-03-31T23:59:59.999Z', status: 'ACTIVE' })
  const campus = createCampusContext({
    repos, clock: () => now, legacy, scenarioSource: async () => SCENARIOS, audit: () => {},
    evidence: { units: async (sid) => UNITS[sid] || [] },
    users: { findById: async () => null, findByEmail: async () => null },
  })
  const requireUser = (req, _res, next) => (req.get('x-perf-user') === owner.id ? ((req.user = owner), next()) : next(new ApiError('UNAUTHENTICATED', 'Sign in to continue.')))
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createV1Router({ requireUser, campus }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const cat = await (await fetch(`${base}/organizations/${org.id}/assessment-catalog`, { headers: { 'x-perf-user': owner.id } })).json()
  const assignment = await (await fetch(`${base}/organizations/${org.id}/assignments`, {
    method: 'POST', headers: { 'x-perf-user': owner.id, 'Content-Type': 'application/json' },
    body: JSON.stringify({ definitionId: cat.data.items[0].id, cohortIds: cohorts.map((c) => c.id), windowStart: '2026-10-10T08:00:00.000Z', windowEnd: '2026-10-30T18:00:00.000Z' }),
  })).json()
  for (const [i, userId] of students.entries()) {
    const sessionId = `sess-perf-${i}`
    SESSIONS[sessionId] = userId
    UNITS[sessionId] = PRIMARY_CAPABILITY_IDS.slice(0, 3).flatMap((cap, c) => [1, 2, 3, 4].map((t) => normalizeEvidenceUnit({
      session_id: sessionId, capability_id: cap, source_type: 'DIALOGUE_TURN', source_turn: t + c * 4,
      candidate_action: { dialogue_excerpt: 'Synthetic candidate words.' }, provenance: { synthetic: true },
      rubric_level: 1 + ((i + t + c) % 5), judge_agreement: { agreement: 0.9, samples: 3, method: 'synthetic' },
    }).unit))
    await repos.assessments.updateStudent({ assignmentId: assignment.data.id, userId, patch: { status: 'COMPLETED', sessionId, startedAt: '2026-10-12T09:00:00Z', completedAt: '2026-10-12T10:00:00Z' } })
  }
  return { server, base, org, owner }
}

function hit(url, headers) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint()
    const req = http.request(url, { headers }, (res) => {
      res.on('data', () => {})
      res.on('end', () => resolve({ ms: Number(process.hrtime.bigint() - start) / 1e6, ok: res.statusCode >= 200 && res.statusCode < 400 }))
    })
    req.on('error', () => resolve({ ms: Number(process.hrtime.bigint() - start) / 1e6, ok: false }))
    req.end()
  })
}

async function drive(url, headers) {
  const lat = []
  let errors = 0
  const deadline = Date.now() + DURATION * 1000
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (Date.now() < deadline) {
      const r = await hit(url, headers)
      lat.push(r.ms)
      if (!r.ok) errors += 1
    }
  }))
  lat.sort((a, b) => a - b)
  const p = (q) => +(lat[Math.min(lat.length - 1, Math.floor(q * lat.length))] || 0).toFixed(1)
  return { requests: lat.length, errors, rps: +(lat.length / DURATION).toFixed(1), p50: p(0.5), p95: p(0.95), p99: p(0.99) }
}

const { server, base, org, owner } = await seed()
const o = (p) => `${base}/organizations/${org.id}${p}`
const headers = { 'x-perf-user': owner.id }
const endpoints = {
  overview: o('/overview'),
  students: o('/students?pageSize=25'),
  'analytics/capabilities': o('/analytics/capabilities'),
  'analytics/comparison': o('/analytics/comparison?groupBy=cohort'),
  'analytics/completion': o('/analytics/completion'),
  billing: o('/billing'),
}
const results = { students: STUDENTS, concurrency: CONCURRENCY, durationSeconds: DURATION, store: 'memory', node: process.version, endpoints: {} }
for (const [name, url] of Object.entries(endpoints)) {
  await hit(url, headers) // warm-up
  results.endpoints[name] = await drive(url, headers)
}
server.close()
console.log(JSON.stringify(results, null, 2))
