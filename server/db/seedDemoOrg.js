// Synthetic demo organization for sales demos (PROD-READY Phase 8).
//
//   node db/seedDemoOrg.js --demo [--students 36]       (npm run seed:demo -- --demo)
//
// Creates ONE synthetic college — "Demo College (synthetic)" — with
// departments, cohorts, staff and student accounts, assignments, completed
// sessions, per-session reports and evidence units. Every name, quote, email
// and number is generated here and is obviously synthetic ("Demo Student
// 014", addresses at demo-college.example.invalid, "Demo response (synthetic
// text)"). Nothing is copied from a real person or organization.
//
// Refusals (exit code 2, nothing written):
//   * without the explicit --demo argument;
//   * with NODE_ENV=production unless PRISM_DEMO_MODE=true AND
//     PRISM_DEMO_DATABASE_URL names a database different from DATABASE_URL —
//     the seed then writes ONLY to PRISM_DEMO_DATABASE_URL;
//   * when no database is configured, or the schema lacks migration 0061.
// The npm script deliberately does not use config/runWithRuntimeSecrets.js, so
// it can never pick up the production database from the runtime secret store.
//
// Isolation (migration 0061): the organization is created with is_demo = true
// (immutable), every account is registered in demo_accounts, and triggers
// refuse any membership, cohort or roster row that mixes demo and real
// accounts or organizations. Calibration jobs (calibration/jobs/_base.py) and
// the rating queue (domain/validation/service.js) exclude demo sessions.
// Reports are not written as finished documents: the per-capability statuses
// are computed by the real sufficiency rules from the synthetic evidence, so a
// demo shows PROVISIONAL and INSUFFICIENT exactly as the product would (the
// rules are UNCALIBRATED, so nothing can reach SUFFICIENT).
//
// The seed is idempotent: if the demo organization exists it reports it and
// writes nothing. To start over, drop and recreate the demo database.
import { randomBytes, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const DEMO_ORG_NAME = 'Demo College (synthetic)'
export const DEMO_ORG_SLUG = 'demo-college-synthetic'
export const DEMO_EMAIL_DOMAIN = 'demo-college.example.invalid'
export const DEMO_EXCERPT = 'Demo response (synthetic text) — not written by a real person.'

const pad = (n, w = 3) => String(n).padStart(w, '0')
const sameDb = (a, b) => String(a || '').trim().replace(/\/+$/, '') === String(b || '').trim().replace(/\/+$/, '')

export class DemoSeedRefused extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

// Where the seed may write, or why it must not. Pure: reads argv and env only.
export function resolveDemoTarget(argv = [], env = process.env) {
  if (!argv.includes('--demo')) {
    throw new DemoSeedRefused('DEMO_FLAG_REQUIRED', 'Refusing to seed: pass --demo explicitly to create the synthetic demo organization.')
  }
  const demoUrl = env.PRISM_DEMO_DATABASE_URL || ''
  if (env.NODE_ENV === 'production') {
    if (env.PRISM_DEMO_MODE !== 'true') {
      throw new DemoSeedRefused('DEMO_REFUSED_IN_PRODUCTION', 'Refusing to seed in production: PRISM_DEMO_MODE is off (registered OFF; a human enables it in the demo environment only).')
    }
    if (!demoUrl) {
      throw new DemoSeedRefused('DEMO_DATABASE_REQUIRED', 'Refusing to seed in production without PRISM_DEMO_DATABASE_URL (a separate demo database).')
    }
    if (sameDb(demoUrl, env.DATABASE_URL)) {
      throw new DemoSeedRefused('DEMO_DATABASE_NOT_SEPARATE', 'Refusing to seed: PRISM_DEMO_DATABASE_URL is the same database as DATABASE_URL.')
    }
  }
  const url = demoUrl || env.DATABASE_URL || ''
  if (!url) throw new DemoSeedRefused('NO_DATABASE', 'Refusing to seed: no database configured (PRISM_DEMO_DATABASE_URL or, outside production, DATABASE_URL).')
  return { url, separate: Boolean(demoUrl) && !sameDb(demoUrl, env.DATABASE_URL) }
}

function argValue(argv, name, fallback) {
  const i = argv.indexOf(name)
  if (i === -1) return fallback
  const v = Number(argv[i + 1])
  return Number.isInteger(v) && v > 0 ? v : fallback
}

// Deterministic pseudo-random numbers (mulberry32) so a demo is repeatable.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function bulkInsert(query, table, columns, rows, chunk = 500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const params = []
    const tuples = rows.slice(i, i + chunk).map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}` }).join(', ')})`)
    if (tuples.length) await query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}`, params)
  }
}

/**
 * seedDemoOrganization({ query, repos, catalog, normalizeEvidenceUnit, ... })
 * Writes the synthetic demo college. Returns ids and counts (no passwords).
 */
export async function seedDemoOrganization({
  query, repos, catalog, normalizeEvidenceUnit, passwordHash = null,
  students = 36, seed = 8, scenarioId = null, now = new Date(),
  // Test hook: keeps the unique slug and addresses distinct on a reused test
  // database. The CLI never sets it (one demo organization per demo database).
  tag = null,
}) {
  const slug = tag ? `${DEMO_ORG_SLUG}-${tag}` : DEMO_ORG_SLUG
  const local = (part) => (tag ? `${part}.${tag}` : part)
  const existing = (await query('SELECT id FROM organizations WHERE slug = $1', [slug])).rows[0]
  if (existing) return { created: false, organizationId: existing.id }
  const random = rng(seed)

  // Organization (is_demo is set here and can never change — 0061 trigger).
  const orgId = randomUUID()
  await query(
    `INSERT INTO organizations (id, name, slug, organization_type, status, country, timezone, is_demo)
     VALUES ($1, $2, $3, 'COLLEGE', 'ACTIVE', NULL, 'Asia/Kolkata', TRUE)`,
    [orgId, DEMO_ORG_NAME, slug],
  )
  const depts = []
  for (const label of ['A', 'B']) depts.push(await repos.organizations.createDepartment({ organizationId: orgId, name: `Demo Department ${label} (synthetic)` }))

  // Accounts: staff first, then students. Every account is a demo account.
  const staff = [
    { id: `demo-owner-${orgId.slice(0, 8)}`, name: 'Demo Admin (synthetic)', email: `${local('demo.admin')}@${DEMO_EMAIL_DOMAIN}`, role: 'ORG_OWNER' },
    { id: `demo-officer-${orgId.slice(0, 8)}`, name: 'Demo Placement Officer (synthetic)', email: `${local('demo.officer')}@${DEMO_EMAIL_DOMAIN}`, role: 'PLACEMENT_OFFICER' },
  ]
  const studentRows = Array.from({ length: students }, (_, i) => ({
    id: `demo-s${pad(i + 1)}-${orgId.slice(0, 8)}`, name: `Demo Student ${pad(i + 1)}`, email: `${local(`demo.student.${pad(i + 1)}`)}@${DEMO_EMAIL_DOMAIN}`, role: 'STUDENT',
  }))
  const accounts = [...staff, ...studentRows]
  const declaration = JSON.stringify({ version: 'age-18plus-v1', at: now.toISOString(), meta: { synthetic: true, demo: true } })
  await bulkInsert(query, 'v1_users', ['id', 'email', 'name', 'college', 'year', 'password_hash', 'age_declaration'],
    accounts.map((a) => [a.id, a.email, a.name, DEMO_ORG_NAME, '', passwordHash, declaration]))
  await bulkInsert(query, 'demo_accounts', ['user_id', 'organization_id'], accounts.map((a) => [a.id, orgId]))
  for (const a of accounts) {
    await repos.memberships.upsertMembership({ organizationId: orgId, userId: a.id, role: a.role, status: 'ACTIVE' })
  }

  // Cohorts of different sizes — the small one shows small-group suppression.
  const sizes = [Math.ceil(students * 0.42), Math.ceil(students * 0.42)]
  sizes.push(Math.max(0, students - sizes[0] - sizes[1]))
  const cohorts = []
  for (let c = 0; c < 3; c += 1) {
    cohorts.push(await repos.organizations.createCohort({ organizationId: orgId, departmentId: depts[c % depts.length].id, name: `Demo Cohort ${c + 1} (synthetic)` }))
  }
  const cohortOf = (i) => (i < sizes[0] ? 0 : i < sizes[0] + sizes[1] ? 1 : 2)
  await bulkInsert(query, 'cohort_members', ['cohort_id', 'user_id', 'status', 'added_by'],
    studentRows.map((s, i) => [cohorts[cohortOf(i)].id, s.id, 'ACTIVE', staff[0].id]))

  // Assessment definition from the real catalog (no invented assessment).
  const cat = await catalog.ensureSeeded()
  const scenario = scenarioId || cat.forms.find((f) => f.scenarioId)?.scenarioId
  if (!scenario) throw new Error('DEMO_NO_SCENARIO: the catalog has no scenario to attach demo sessions to')
  const form = cat.forms.find((f) => f.scenarioId === scenario) || null
  const definition = cat.definitions.find((d) => d.id === form?.definitionId) || cat.definitions[0]
  const capabilities = (definition.measures || []).slice(0, 5)

  const windows = [
    { start: new Date(now.getTime() - 40 * 864e5), end: new Date(now.getTime() - 10 * 864e5), share: 0.85 },
    { start: new Date(now.getTime() - 9 * 864e5), end: new Date(now.getTime() + 20 * 864e5), share: 0.35 },
  ]
  const assignmentIds = []
  for (const w of windows) {
    const row = await repos.assessments.createAssignment({
      id: randomUUID(), definitionId: definition.id, formPolicy: definition.formPolicy || 'SERVER_SELECTED', formId: null, sponsorType: 'INSTITUTION',
      organizationId: orgId, programId: null, windowStart: w.start.toISOString(), windowEnd: w.end.toISOString(),
      integrityPolicy: 'STANDARD', accommodationsPolicy: { requestable: true, extraTimeAllowed: false },
      reminderPolicy: { enabled: false, daysBeforeDue: null, participation: 'UNKNOWN', incentive: null },
      createdBy: staff[0].id, status: 'ACTIVE', targets: cohorts.map((c) => ({ targetType: 'COHORT', targetId: c.id })),
    })
    assignmentIds.push(row.id)
  }

  const roster = []
  const sessionRows = []
  const reportRows = []
  const units = []
  const sessions = []
  windows.forEach((w, a) => {
    studentRows.forEach((s, i) => {
      const r = random()
      const status = r < w.share ? 'COMPLETED' : r < w.share + 0.1 ? 'IN_PROGRESS' : 'ASSIGNED'
      const sessionId = status === 'ASSIGNED' ? null : `demo-sess-${orgId.slice(0, 8)}-${a}-${pad(i + 1)}`
      const startedAt = sessionId ? new Date(w.start.getTime() + (1 + (i % 7)) * 864e5).toISOString() : null
      const completedAt = status === 'COMPLETED' ? new Date(Date.parse(startedAt) + (24 + (i % 17)) * 60000).toISOString() : null
      roster.push([assignmentIds[a], s.id, status, sessionId, startedAt, completedAt])
      if (!sessionId) return
      sessionRows.push([sessionId, scenario, s.id, s.email, JSON.stringify({ synthetic: true, demo: true }), Date.parse(startedAt), completedAt ? Date.parse(completedAt) : null, Date.parse(completedAt || startedAt), form?.id || null])
      if (status !== 'COMPLETED') return
      sessions.push({ sessionId, userId: s.id, assignmentId: assignmentIds[a] })
      reportRows.push([sessionId, s.id, null, JSON.stringify({ sessionId, scenarioId: scenario, synthetic: true, demo: true, issuedAt: completedAt }), completedAt])
      capabilities.forEach((capabilityId, c) => {
        // 0–5 units per capability: some capabilities fall below the minimum
        // (INSUFFICIENT_EVIDENCE); the rest are PROVISIONAL (rules uncalibrated).
        const count = Math.floor(random() * 6)
        for (let t = 1; t <= count; t += 1) {
          units.push(normalizeEvidenceUnit({
            session_id: sessionId, capability_id: capabilityId, source_type: 'DIALOGUE_TURN', source_turn: t + c * 6,
            behavior_anchor_id: `demo-anchor-${c}-${t % 2}`,
            candidate_action: { dialogue_excerpt: DEMO_EXCERPT }, provenance: { synthetic: true, demo: true },
            rubric_level: 1 + Math.floor(random() * 5), judge_agreement: { agreement: 0.72 + random() * 0.25, samples: 3, method: 'synthetic-demo' },
          }).unit)
        }
      })
    })
  })
  await bulkInsert(query, 'assessment_assignment_students', ['assignment_id', 'user_id', 'status', 'session_id', 'started_at', 'completed_at'], roster)
  await bulkInsert(query, 'v1_sessions', ['session_id', 'scenario_id', 'user_id', 'user_email', 'data', 'started_at', 'completed_at', 'updated_at', 'assessment_form_id'], sessionRows)
  await bulkInsert(query, 'v1_reports', ['session_id', 'user_id', 'overall', 'report', 'issued_at'], reportRows)
  const json = (v) => (v == null ? null : JSON.stringify(v))
  await bulkInsert(query, 'behavioral_evidence_units', [
    'evidence_id', 'session_id', 'attempt_id', 'blueprint_id', 'capability_id', 'capability_layer', 'source_type', 'source_turn', 'source_artifact_id', 'behavior_anchor_id',
    'candidate_action', 'candidate_action_json', 'observable_behavior', 'rubric_level', 'rubric_label', 'confidence_status', 'judge_agreement', 'judge_agreement_json',
    'human_review_status', 'provenance', 'provenance_json', 'assessment_form_id', 'evidence_status', 'legacy_row', 'created_at',
  ], units.map((u) => [
    u.evidence_id, u.session_id, u.attempt_id, u.blueprint_id, u.capability_id, u.capability_layer, u.source_type, u.source_turn, u.source_artifact_id, u.behavior_anchor_id,
    json(u.candidate_action_json), json(u.candidate_action_json), u.observable_behavior, u.rubric_level, u.rubric_label, u.evidence_status, json(u.judge_agreement_json), json(u.judge_agreement_json),
    u.human_review_status, json(u.provenance_json), json(u.provenance_json), u.assessment_form_id, u.evidence_status, false, u.created_at,
  ]))
  return {
    created: true, organizationId: orgId, owner: staff[0], staff, studentIds: studentRows.map((s) => s.id), cohorts, departments: depts,
    assignmentIds, sessions, scenarioId: scenario, capabilities,
    counts: { accounts: accounts.length, roster: roster.length, sessions: sessionRows.length, reports: reportRows.length, evidenceUnits: units.length },
  }
}

async function main(argv = process.argv.slice(2)) {
  let target
  try {
    target = resolveDemoTarget(argv)
  } catch (err) {
    if (err instanceof DemoSeedRefused) {
      console.error(JSON.stringify({ ok: false, refused: err.code, message: err.message }))
      process.exit(2)
    }
    throw err
  }
  // Everything below talks only to the demo target.
  process.env.DATABASE_URL = target.url
  process.env.PRISM_PG_STORE = 'true'
  const { query, getPool, getSessionLockPool, closePool } = await import('./pool.js')
  try {
    const has = await query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'is_demo'`)
    if (!has.rows.length) {
      console.error(JSON.stringify({ ok: false, refused: 'SCHEMA_TOO_OLD', message: 'Run the migrations on the demo database first (0061 adds the demo marker).' }))
      process.exit(2)
    }
    const { createPgCampusRepos } = await import('../domain/campusStore/index.js')
    const { createCampusContext } = await import('../domain/campusStore/context.js')
    const { defaultScenarioSource } = await import('../domain/campusStore/defaultContext.js')
    const { normalizeEvidenceUnit } = await import('../domain/evidence/evidenceUnit.js')
    const bcrypt = (await import('bcryptjs')).default
    const repos = createPgCampusRepos({ query, getPool, getLockPool: getSessionLockPool })
    const campus = createCampusContext({ repos, scenarioSource: defaultScenarioSource })
    // One shared sign-in password for the demo accounts: PRISM_DEMO_PASSWORD,
    // or a random one printed once below (never stored in clear).
    const password = process.env.PRISM_DEMO_PASSWORD || randomBytes(12).toString('base64url')
    const result = await seedDemoOrganization({
      query, repos, catalog: campus.catalog, normalizeEvidenceUnit,
      passwordHash: await bcrypt.hash(password, 10), students: argValue(argv, '--students', 36),
    })
    console.log(JSON.stringify({
      ok: true, created: result.created, organizationId: result.organizationId, separateDatabase: target.separate,
      ...(result.created ? { counts: result.counts, signIn: { emails: `demo.admin@${DEMO_EMAIL_DOMAIN}, demo.officer@${DEMO_EMAIL_DOMAIN}, demo.student.001@${DEMO_EMAIL_DOMAIN} …`, password: process.env.PRISM_DEMO_PASSWORD ? '(PRISM_DEMO_PASSWORD)' : password } } : { note: 'The demo organization already exists; nothing was written.' }),
    }, null, 2))
  } finally {
    await closePool()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: String(err?.message || err).split('\n')[0] }))
    process.exit(1)
  })
}
