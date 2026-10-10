// Synthetic campus at cohort scale on PostgreSQL (PROD-READY Phase 6).
//
// Test tooling only: used by the Phase 6 DB tests (small sizes) and the
// campus load profile (scripts/loadtest.mjs --profile campus, 2,000
// students). Every name, address and number is synthetic and generated here;
// nothing is read from, or written to, a real organization. Rows that exist
// once per student (accounts, memberships, cohort members, roster rows,
// sessions, reports, evidence units) are bulk-inserted with SQL for speed; the
// organization, cohorts, catalog and assignments go through the repositories.
import { randomUUID } from 'node:crypto'
import { normalizeEvidenceUnit } from '../domain/evidence/evidenceUnit.js'
import { PRIMARY_CAPABILITY_IDS, formForSession, definitionForScenario } from '../domain/assessments/catalog.js'

export const SCALE_SCENARIO_ID = 'syn-scale-a'
export const SCALE_SCENARIOS = Object.freeze({ generalScenarios: [{ id: SCALE_SCENARIO_ID }], bankScenarios: {} })

// Insert `rows` (arrays of values) into `table (columns)` in chunks.
export async function bulkInsert(query, table, columns, rows, { chunk = 1000, suffix = '' } = {}) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk)
    const params = []
    const tuples = part.map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}` }).join(', ')})`)
    await query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')} ${suffix}`, params)
  }
}

const pad = (n, w = 4) => String(n).padStart(w, '0')

// Deterministic pseudo-random numbers (mulberry32), so a seed is repeatable.
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

/**
 * seedCampusScale({ query, repos, catalog, students, assignments, cohorts, ... })
 *   completion: fraction of the roster that COMPLETED each assignment (index i);
 *               defaults to a falling curve (90%, 80%, 60%, 40%, 10%, ...).
 * → { org, owner, cohorts, departments, assignmentIds, studentIds, sessions: [{ sessionId, userId, assignmentId }], tag }
 */
export async function seedCampusScale({
  query, repos, catalog, students = 2000, assignments = 5, cohorts = 8, departments = 4,
  completion = null, unitsPerCapability = 4, capabilities = 3, seed = 6, tag = randomUUID().slice(0, 8), log = () => {},
}) {
  const random = rng(seed)
  const t0 = Date.now()
  const org = await repos.organizations.createOrganization({ name: `Synthetic Scale University ${tag}`, slug: `syn-scale-${tag}`, organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  const owner = { id: `syn-owner-${tag}`, email: `syn-owner-${tag}@example.test`, name: 'Synthetic Owner' }
  await bulkInsert(query, 'v1_users', ['id', 'email', 'name', 'password_hash'], [[owner.id, owner.email, owner.name, null]])
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: owner.id, role: 'ORG_OWNER', status: 'ACTIVE' })
  const depts = []
  for (let d = 0; d < departments; d += 1) depts.push(await repos.organizations.createDepartment({ organizationId: org.id, name: `Synthetic Department ${d + 1}` }))
  const cohortRows = []
  for (let c = 0; c < cohorts; c += 1) cohortRows.push(await repos.organizations.createCohort({ organizationId: org.id, departmentId: depts[c % depts.length].id, name: `Synthetic Cohort ${pad(c + 1, 2)}` }))

  // Accounts, memberships, cohort members (one cohort per student).
  const studentIds = Array.from({ length: students }, (_, i) => `syn-s${pad(i + 1, 5)}-${tag}`)
  const userRows = studentIds.map((id, i) => [id, `syn.student.${pad(i + 1, 5)}.${tag}@example.test`, i % 17 === 0 ? '' : `Synthetic Student ${pad(i + 1, 5)}`, null])
  await bulkInsert(query, 'v1_users', ['id', 'email', 'name', 'password_hash'], userRows)
  await bulkInsert(query, 'organization_memberships', ['organization_id', 'user_id', 'role', 'status', 'joined_at'],
    studentIds.map((id, i) => [org.id, id, 'STUDENT', i % 50 === 49 ? 'SUSPENDED' : 'ACTIVE', new Date(Date.UTC(2026, 8, 1, 0, 0, i)).toISOString()]))
  await bulkInsert(query, 'cohort_members', ['cohort_id', 'user_id', 'status', 'added_by'],
    studentIds.map((id, i) => [cohortRows[i % cohortRows.length].id, id, 'ACTIVE', owner.id]))
  log(`accounts+memberships ${Date.now() - t0} ms`)

  // Catalog and assignments (every assignment targets every cohort).
  const cat = await catalog.ensureSeeded()
  const definitionId = definitionForScenario(cat, SCALE_SCENARIO_ID)
  const definition = cat.definitions.find((d) => d.id === definitionId)
  const form = formForSession(cat, SCALE_SCENARIO_ID)
  const curve = completion || [0.9, 0.8, 0.6, 0.4, 0.1]
  const assignmentIds = []
  for (let a = 0; a < assignments; a += 1) {
    const row = await repos.assessments.createAssignment({
      id: randomUUID(), definitionId: definition.id, formPolicy: definition.formPolicy || 'SERVER_SELECTED', formId: null, sponsorType: 'INSTITUTION',
      organizationId: org.id, programId: null, windowStart: new Date(Date.UTC(2026, 8, 1 + a * 7)).toISOString(), windowEnd: new Date(Date.UTC(2026, 11, 20)).toISOString(),
      integrityPolicy: 'STANDARD', accommodationsPolicy: { requestable: true, extraTimeAllowed: false }, reminderPolicy: { enabled: false, daysBeforeDue: null, participation: 'UNKNOWN', incentive: null },
      createdBy: owner.id, status: 'ACTIVE', targets: cohortRows.map((c) => ({ targetType: 'COHORT', targetId: c.id })),
    })
    assignmentIds.push(row.id)
  }

  // Roster rows; COMPLETED rows get a session, a report and evidence units.
  const roster = []
  const sessions = []
  const sessionRows = []
  const reportRows = []
  const unitRows = []
  const caps = PRIMARY_CAPABILITY_IDS.slice(0, capabilities)
  assignmentIds.forEach((assignmentId, a) => {
    const share = curve[a % curve.length]
    studentIds.forEach((userId, i) => {
      const r = random()
      const done = r < share
      const status = done ? 'COMPLETED' : r < share + 0.1 ? 'IN_PROGRESS' : r < share + 0.2 ? 'ACKNOWLEDGED' : 'ASSIGNED'
      const sessionId = status === 'COMPLETED' || status === 'IN_PROGRESS' ? `syn-sess-${tag}-${a}-${pad(i + 1, 5)}` : null
      const startedAt = sessionId ? new Date(Date.UTC(2026, 8, 2 + a * 7, 9, 0, i % 3600)).toISOString() : null
      const completedAt = status === 'COMPLETED' ? new Date(Date.UTC(2026, 8, 2 + a * 7, 10, 0, i % 3600)).toISOString() : null
      roster.push([assignmentId, userId, status, sessionId, startedAt, completedAt])
      if (!sessionId) return
      sessionRows.push([sessionId, SCALE_SCENARIO_ID, userId, null, JSON.stringify({ synthetic: true }), Date.parse(startedAt), completedAt ? Date.parse(completedAt) : null, Date.parse(completedAt || startedAt), form?.id || null])
      if (status !== 'COMPLETED') return
      sessions.push({ sessionId, userId, assignmentId })
      reportRows.push([sessionId, userId, null, JSON.stringify({ sessionId, scenarioId: SCALE_SCENARIO_ID, synthetic: true, issuedAt: completedAt }), completedAt])
      caps.forEach((capabilityId, c) => {
        for (let t = 1; t <= unitsPerCapability; t += 1) {
          const { unit } = normalizeEvidenceUnit({
            session_id: sessionId, capability_id: capabilityId, source_type: 'DIALOGUE_TURN', source_turn: t + c * unitsPerCapability,
            behavior_anchor_id: `syn-anchor-${c}-${t % 2}`,
            candidate_action: { dialogue_excerpt: 'Synthetic candidate words.' }, provenance: { synthetic: true },
            rubric_level: 1 + Math.floor(random() * 5), judge_agreement: { agreement: 0.75 + random() * 0.25, samples: 3, method: 'synthetic' },
          })
          unitRows.push(unit)
        }
      })
    })
  })
  await bulkInsert(query, 'assessment_assignment_students', ['assignment_id', 'user_id', 'status', 'session_id', 'started_at', 'completed_at'], roster)
  log(`roster ${roster.length} rows ${Date.now() - t0} ms`)
  await bulkInsert(query, 'v1_sessions', ['session_id', 'scenario_id', 'user_id', 'user_email', 'data', 'started_at', 'completed_at', 'updated_at', 'assessment_form_id'], sessionRows)
  await bulkInsert(query, 'v1_reports', ['session_id', 'user_id', 'overall', 'report', 'issued_at'], reportRows)
  log(`sessions ${sessionRows.length} reports ${reportRows.length} ${Date.now() - t0} ms`)
  const json = (v) => (v == null ? null : JSON.stringify(v))
  await bulkInsert(query, 'behavioral_evidence_units', [
    'evidence_id', 'session_id', 'attempt_id', 'blueprint_id', 'capability_id', 'capability_layer', 'source_type', 'source_turn', 'source_artifact_id', 'behavior_anchor_id',
    'candidate_action', 'candidate_action_json', 'observable_behavior', 'rubric_level', 'rubric_label', 'confidence_status', 'judge_agreement', 'judge_agreement_json',
    'human_review_status', 'provenance', 'provenance_json', 'assessment_form_id', 'evidence_status', 'legacy_row', 'created_at',
  ], unitRows.map((u) => [
    u.evidence_id, u.session_id, u.attempt_id, u.blueprint_id, u.capability_id, u.capability_layer, u.source_type, u.source_turn, u.source_artifact_id, u.behavior_anchor_id,
    json(u.candidate_action_json), json(u.candidate_action_json), u.observable_behavior, u.rubric_level, u.rubric_label, u.evidence_status, json(u.judge_agreement_json), json(u.judge_agreement_json),
    u.human_review_status, json(u.provenance_json), json(u.provenance_json), u.assessment_form_id, u.evidence_status, false, u.created_at,
  ]), { chunk: 1500 })
  log(`evidence units ${unitRows.length} ${Date.now() - t0} ms`)
  return { org, owner, cohorts: cohortRows, departments: depts, assignmentIds, studentIds, sessions, tag, definition, form, counts: { roster: roster.length, sessions: sessionRows.length, reports: reportRows.length, units: unitRows.length } }
}
