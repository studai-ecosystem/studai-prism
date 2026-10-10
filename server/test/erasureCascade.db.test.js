// PROD-READY Phase 2 (SECURITY_REVIEW S8): the account erasure cascade on a
// real PostgreSQL (migrations 0001–0056). One subtest per table of the S8 risk
// row (and the other personal tables the registry erases), another student's
// rows untouched, a rerun after a mid-way failure completes from the ledger,
// the one-transaction guarantee of the account step, the narrowly scoped
// append-only guard, the import-row retention purge, intervention-membership
// exit hooks, the self-service route and the admin account-scope erasure.
// Requires TEST_DATABASE_URL (skips otherwise); run serially with the other
// *.db.test.js files.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import jwt from 'jsonwebtoken'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB
  process.env.PRISM_PG_STORE = 'true'
  process.env.JWT_SECRET = 'phase2-erasure-db-secret'
}

const { migrateUp } = skip ? {} : await import('../db/migrate.js')
const { closePool, query, getPool } = skip ? {} : await import('../db/pool.js')
const store = skip ? {} : await import('../lib/store.js')
const userDb = skip ? {} : await import('../lib/db.js')
const cascadeMod = skip ? {} : await import('../domain/privacy/erasureCascade.js')
const { sessionRef, ERASED_TEXT } = skip ? {} : await import('../lib/campusErasure.js')
const { purgeImportRowRaw } = skip ? {} : await import('../domain/privacy/importRowRetention.js')
const { createPgCampusRepos } = skip ? {} : await import('../domain/campusStore/index.js')
const { parseMigrationColumns } = skip ? {} : await import('../domain/privacy/migrationSchema.js')

const STAFF = 'p2staff'
const hex64 = () => createHash('sha256').update(randomUUID()).digest('hex')
const actorHasher = (uid) => `ah${createHash('md5').update(uid).digest('hex')}`
const one = async (sql, params = []) => (await query(sql, params)).rows[0]
const count = async (sql, params = []) => Number((await query(sql, params)).rows[0].n)

async function seedShared() {
  const org = (await one(`INSERT INTO organizations (name, slug, organization_type, status) VALUES ('Synthetic College', $1, 'COLLEGE', 'ACTIVE') RETURNING id`, [`p2-${randomUUID()}`])).id
  const cohort = (await one(`INSERT INTO cohorts (organization_id, name, status, owner_user_id) VALUES ($1, 'Cohort', 'ACTIVE', $2) RETURNING id`, [org, STAFF])).id
  const intervention = (await one(
    `INSERT INTO interventions (organization_id, name, target_capability_id, cohort_id, starts_on, ends_on, status, mission_ids, reassessment_planned, created_by)
     VALUES ($1, 'Intervention', 'C1', $2, '2026-10-01', '2026-12-01', 'ACTIVE', ARRAY['P2-MISSION'], false, $3) RETURNING id`, [org, cohort, STAFF])).id
  await query(`INSERT INTO mission_definitions (id, target_capability_id, status) VALUES ('P2-MISSION', 'C1', 'ACTIVE') ON CONFLICT DO NOTHING`)
  await query(`INSERT INTO mission_versions (mission_id, version, status, schema_version, content, content_hash, published_at)
               VALUES ('P2-MISSION', 1, 'PUBLISHED', 'v1', '{}', 'h', now()) ON CONFLICT DO NOTHING`)
  await query(`INSERT INTO assessment_definitions (assessment_definition_id, job_family, title) VALUES ('P2-DEF', 'synthetic', 'Synthetic') ON CONFLICT DO NOTHING`)
  for (const f of ['P2-FORM-A', 'P2-FORM-B']) {
    await query(`INSERT INTO assessment_forms (id, definition_id, version, scenario_id, capability_ids, status, frozen_at) VALUES ($1, 'P2-DEF', '1', $1, ARRAY['C1'], 'FROZEN', now()) ON CONFLICT DO NOTHING`, [f])
  }
  await query(`INSERT INTO assessment_form_equivalence (form_a_id, form_b_id, status, evidence_ref, decided_by, decided_at)
               VALUES ('P2-FORM-A', 'P2-FORM-B', 'APPROVED', 'doc-1', $1, now()) ON CONFLICT DO NOTHING`, [STAFF])
  const assignment = `p2-asg-${randomUUID()}`
  await query(`INSERT INTO assessment_assignments (id, definition_id, form_policy, sponsor_type, organization_id, integrity_policy, accommodations_policy, reminder_policy, created_by, status)
               VALUES ($1, 'P2-DEF', 'SERVER_SELECTED', 'INSTITUTION', $2, 'STANDARD', '{}', '{}', $3, 'ACTIVE')`, [assignment, org, STAFF])
  const job = (await one(`INSERT INTO student_import_jobs (organization_id, uploaded_by, status, totals, committed_at) VALUES ($1, $2, 'COMMITTED', '{}', now()) RETURNING id`, [org, STAFF])).id
  const admin = randomUUID()
  await query(`INSERT INTO admin_users (admin_id, email, password_hash) VALUES ($1, $2, 'x')`, [admin, `p2-admin-${admin}@test.local`])
  const invite = randomUUID()
  await query(`INSERT INTO assessment_invites (invite_id, token_hash, max_uses, expires_at, created_by) VALUES ($1, $2, 100, now() + interval '1 day', $3)`, [invite, hex64(), admin])
  return { org, cohort, intervention, assignment, job, admin, invite }
}

function person(label) {
  const uid = `p2${label}${randomUUID().replace(/-/g, '')}`
  return { uid, email: `${uid}@test.local`, sid: randomUUID(), sid2: randomUUID(), candidateId: randomUUID() }
}

// One row per table for the person, all linked to them (or their sessions).
async function seedPerson(p, s) {
  await store.createSession(p.sid, { userId: p.uid, userEmail: p.email, scenarioId: 'synthetic' })
  await store.saveReport(p.sid, { userId: p.uid, overall: 50, report: { quote: 'my own words' } })
  await store.redeemPayment({ paymentId: `pay_${randomUUID()}`, orderId: 'o', sessionId: p.sid2, amount: 1, userId: p.uid, userEmail: p.email })
  await query(`INSERT INTO cohort_members (cohort_id, user_id, status, added_by) VALUES ($1, $2, 'ACTIVE', $3)`, [s.cohort, p.uid, STAFF])
  p.membership = (await one(`INSERT INTO organization_memberships (organization_id, user_id, role, status, invited_by) VALUES ($1, $2, 'STUDENT', 'ACTIVE', $3) RETURNING id`, [s.org, p.uid, STAFF])).id
  await query(`INSERT INTO workspaces (type, owner_user_id, organization_id, name, status) VALUES ('CAMPUS_STUDENT', $1, $2, 'W', 'ACTIVE')`, [p.uid, s.org])
  await query(`INSERT INTO organization_invites (organization_id, email, role, token_hash, status, invited_by, expires_at, accepted_by) VALUES ($1, $2, 'STUDENT', $3, 'ACCEPTED', $4, now() + interval '1 day', $5)`, [s.org, p.email, hex64(), STAFF, p.uid])
  const ent = (await one(`INSERT INTO entitlements (user_id, source_type, product_code, quantity, valid_from, status) VALUES ($1, 'PERSONAL_PURCHASE', 'P', 2, now(), 'ACTIVE') RETURNING id`, [p.uid])).id
  p.spareEntitlement = (await one(`INSERT INTO entitlements (user_id, source_type, product_code, quantity, valid_from, status) VALUES ($1, 'PROMO', 'P', 1, now(), 'ACTIVE') RETURNING id`, [p.uid])).id
  p.entitlement = ent
  await query(`INSERT INTO entitlement_consumptions (entitlement_id, user_id, session_id, event, idempotency_key) VALUES ($1, $2, $3, 'RESERVED', $4)`, [ent, p.uid, p.sid, `reserve:${p.uid}:k1`])
  await query(`INSERT INTO consent_records (user_id, organization_id, consent_type, copy_version, granted_at) VALUES ($1, $2, 'CAMPUS_ASSESSMENT_DISCLOSURE', 'v1', now())`, [p.uid, s.org])
  const grant = (await one(`INSERT INTO share_grants (owner_user_id, recipient_type, recipient_organization_id, expires_at) VALUES ($1, 'ORGANIZATION', $2, now() + interval '1 day') RETURNING id`, [p.uid, s.org])).id
  await query(`INSERT INTO share_grant_resources (share_grant_id, resource_type, resource_id, disclosure_level) VALUES ($1, 'ASSESSMENT_REPORT', $2, 'SUMMARY')`, [grant, p.sid])
  await query(`INSERT INTO data_access_audit_events (actor_user_id, organization_id, subject_user_id, resource_type, resource_id, action) VALUES ($1, $2, $3, 'REPORT', $4, 'READ'), ($3, $2, $3, 'REPORT', $4, 'READ')`, [STAFF, s.org, p.uid, p.sid])
  await query(`INSERT INTO assessment_session_scopes (session_id, owner_user_id, sponsor_type, sponsor_organization_id, workspace_id, visibility_policy, created_by)
               VALUES ($1, $2, 'INSTITUTION', $3, 'w', 'OWNER_AND_SPONSOR', $4)`, [p.sid, p.uid, s.org, STAFF])
  await query(`INSERT INTO assessment_assignment_students (assignment_id, user_id, status, session_id) VALUES ($1, $2, 'COMPLETED', $3)`, [s.assignment, p.uid, p.sid])
  p.personalAssignment = `pa_${randomUUID().replace(/-/g, '')}`
  await query(`INSERT INTO assessment_assignments (id, definition_id, form_policy, sponsor_type, personal_key, integrity_policy, accommodations_policy, reminder_policy, created_by, status)
               VALUES ($1, 'P2-DEF', 'SERVER_SELECTED', 'PERSONAL', $1, 'STANDARD', '{}', '{}', 'SYSTEM', 'ACTIVE')`, [p.personalAssignment])
  await query(`INSERT INTO assessment_assignment_students (assignment_id, user_id, status) VALUES ($1, $2, 'ASSIGNED')`, [p.personalAssignment, p.uid])
  await query(`INSERT INTO assessment_assignment_targets (assignment_id, target_type, target_id) VALUES ($1, 'USER', $2)`, [s.assignment, p.uid])
  await query(`INSERT INTO user_preferences (user_id, reduced_motion, larger_text, updated_at, display_name) VALUES ($1, false, true, now(), 'Synthetic')`, [p.uid])
  await query(`INSERT INTO product_events (event, actor_hash, props, occurred_at) VALUES ('report_viewed', $1, '{}', now())`, [actorHasher(p.uid)])
  await query(`INSERT INTO assessment_client_events (session_id, client_event_id, kind, response_json) VALUES ($1, 'c1', 'MESSAGE', '{"text": "my own words"}')`, [p.sid])
  await query(`INSERT INTO assessment_artifact_versions (session_id, artifact_id, version, content_json, saved_by) VALUES ($1, 'a1', 1, '{"text": "my plan"}', $2)`, [p.sid, p.uid])
  await query(`INSERT INTO assessment_candidate_actions (session_id, client_event_id, kind, payload_hash, payload_json, sequence) VALUES ($1, 'c1', 'MESSAGE', 'h', '{"text": "my own words"}', 1)`, [p.sid])
  await query(`INSERT INTO assessment_jobs (task_key, session_id, kind) VALUES ($1, $2, 'synthetic')`, [`p2-${p.sid}`, p.sid])
  await query(`INSERT INTO student_report_versions (session_id, version, content_hash, builder_version, report_json) VALUES ($1, 1, $2, 'b', '{"quote": "my own words"}'), ($1, 2, $3, 'b', '{"quote": "my words again"}')`, [p.sid, `h1-${p.sid}`, `h2-${p.sid}`])
  p.reviewed = (await one(`INSERT INTO report_review_requests (session_id, version, user_id, category, moment_id, reason, state) VALUES ($1, 1, $2, 'OTHER', 'm1', 'I said something different here', 'RESOLVED') RETURNING id`, [p.sid, p.uid])).id
  await query(`INSERT INTO report_review_decisions (review_id, reviewer_id, decision, reason) VALUES ($1, 'p2reviewer', 'UPHOLD', 'Reviewed the learner quote: upheld')`, [p.reviewed])
  await query(`INSERT INTO report_review_requests (session_id, version, user_id, reason) VALUES ($1, 2, $2, 'Second thoughts about this one')`, [p.sid, p.uid])
  await query(`INSERT INTO assessment_run_timing (session_id, policy_version, policy_json) VALUES ($1, 'v', '{}')`, [p.sid])
  await query(`INSERT INTO assessment_opportunities (session_id, opportunity_id, capability_id) VALUES ($1, 'o1', 'C1')`, [p.sid])
  await query(`INSERT INTO student_import_rows (job_id, row_number, raw, normalized, errors, action, outcome) VALUES ($1, (SELECT COALESCE(MAX(row_number), 0) + 1 FROM student_import_rows WHERE job_id = $1), $2, $3, '[]', 'INVITE', 'INVITED')`,
    [s.job, JSON.stringify({ email: p.email.toUpperCase(), name: 'Synthetic Student' }), JSON.stringify({ email: p.email })])
  await query(`INSERT INTO notifications (user_id, organization_id, kind, payload) VALUES ($1, $2, 'ASSIGNMENT_LAUNCHED', '{}')`, [p.uid, s.org])
  await query(`INSERT INTO organization_audit_events (organization_id, actor_user_id, action, target_type, target_id, details) VALUES ($1, $2, 'cohort.created', 'COHORT', $3, '{}'), ($1, $4, 'member.removed', 'MEMBERSHIP', $2, '{}')`, [s.org, p.uid, s.cohort, STAFF])
  await query(`INSERT INTO intervention_memberships (intervention_id, user_id) VALUES ($1, $2)`, [s.intervention, p.uid])
  const attempt = (await one(`INSERT INTO mission_attempts (user_id, mission_id, mission_version, organization_id, intervention_id, status, work, version, hints_used, idempotency_key)
    VALUES ($1, 'P2-MISSION', 1, $2, $3, 'IN_PROGRESS', '{"text": "my practice work"}', 1, 0, 'k1') RETURNING id`, [p.uid, s.org, s.intervention])).id
  await query(`INSERT INTO practice_evidence_units (attempt_id, user_id, organization_id, mission_id, mission_version, capability_id, behavior_id, criterion_id, source_type, check_type, excerpt, provenance)
    VALUES ($1, $2, $3, 'P2-MISSION', 1, 'C1', 'B1', 'K1', 'MISSION_PRACTICE', 'DETERMINISTIC', 'my verbatim quote', '{}')`, [attempt, p.uid, s.org])
  const plan = (await one(`INSERT INTO development_plans (user_id, organization_id, source_session_id, status) VALUES ($1, $2, $3, 'ACTIVE') RETURNING id`, [p.uid, s.org, p.sid])).id
  await query(`INSERT INTO development_plan_items (plan_id, capability_id, position) VALUES ($1, 'C1', 1)`, [plan])
  await query(`INSERT INTO capability_growth_snapshots (user_id, organization_id, capability_id, baseline_session_id, reassessment_session_id, form_a_id, form_b_id, from_band, to_band, direction, rules_version)
    VALUES ($1, $2, 'C1', $3, $4, 'P2-FORM-A', 'P2-FORM-B', 'L1', 'L2', 'HIGHER', 'v1')`, [p.uid, s.org, p.sid, p.sid2])
  await query(`INSERT INTO practice_allowances (user_id, organization_id, kind, total, source) VALUES ($1, $2, 'BOUNDED', 3, 'synthetic')`, [p.uid, s.org])
  const prep = (await one(`INSERT INTO preparation_attempts (user_id, intent_json, state, title) VALUES ($1, '{"situation": "my interview"}', 'DRAFT', 'My interview') RETURNING id`, [p.uid])).id
  await query(`INSERT INTO preparation_turns (attempt_id, actor, text) VALUES ($1, 'CANDIDATE', 'my rehearsal line')`, [prep])
  await query(`INSERT INTO action_cards (attempt_id, user_id, card_json) VALUES ($1, $2, '{"next": "my plan"}')`, [prep, p.uid])
  await query(`INSERT INTO application_checkins (user_id, source_type, what_tried, outcome) VALUES ($1, 'PREPARATION', 'I tried it', 'It went fine')`, [p.uid])
  await query(`INSERT INTO product_grants (user_id, product_code, product_version, valid_from, funding_source, policy_version) VALUES ($1, 'FREE_FIRST_EXPERIENCE', 'v1', now(), 'DEV', 'v1')`, [p.uid])
  await query(`INSERT INTO preview_attempts (token_hash, payload_json, expires_at, claimed_user_id) VALUES ($1, '{"answer": "guest words"}', now() + interval '1 hour', $2)`, [hex64(), p.uid])
  p.ratedItem = (await one(`INSERT INTO evidence_rating_items (evidence_ref, session_ref, capability_id, source_type, excerpt, rubric_version, enqueued_by, source_method_json)
    VALUES ($1, $2, 'C1', 'DIALOGUE_TURN', '{{candidate}} said my own words', 'v1', 'system:test', '{"m": 1}') RETURNING id`, [hex64(), sessionRef(p.sid)])).id
  await query(`INSERT INTO evidence_unit_ratings (item_id, rater_id, level, cannot_rate) VALUES ($1, 'p2rater', 3, false)`, [p.ratedItem])
  p.unratedItem = (await one(`INSERT INTO evidence_rating_items (evidence_ref, session_ref, capability_id, source_type, excerpt, rubric_version, enqueued_by)
    VALUES ($1, $2, 'C1', 'DIALOGUE_TURN', 'more of my words', 'v1', 'system:test') RETURNING id`, [hex64(), sessionRef(p.sid)])).id
  await query(`INSERT INTO admin_audit_events (action, entity_type, entity_id, before, after) VALUES ('user_profile_updated', 'user', $1, $2, $3), ('report_held', 'session', $4, '{"overall": 50}', '{"held": true}')`,
    [p.uid, JSON.stringify({ name: 'Synthetic Student', college: 'X', accountState: 'active' }), JSON.stringify({ name: 'Renamed', college: 'Y' }), p.sid])
  await query(`INSERT INTO admin_notes (note_id, entity_type, entity_id, author_id, body) VALUES ($1, 'user', $2, $3, 'called the student about their report')`, [randomUUID(), p.uid, s.admin])
  await query(`INSERT INTO admin_session_states (session_id, review_state, review_reason) VALUES ($1, 'held', 'student said something odd')`, [p.sid])
  await query(`INSERT INTO invite_redemptions (redemption_id, invite_id, user_id, user_email, session_id) VALUES ($1, $2, $3, $4, $5)`, [randomUUID(), s.invite, p.uid, p.email, p.sid])
}

// Tables (and how many of their rows) whose row text mentions `needle`.
async function mentions(needle) {
  const { rows } = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`)
  const out = {}
  for (const { table_name: t } of rows) {
    const n = await count(`SELECT count(*)::int AS n FROM "${t}" x WHERE strpos(x::text, $1) > 0`, [needle])
    if (n) out[t] = n
  }
  return out
}
async function fingerprint(p) {
  const out = {}
  for (const needle of [p.uid, p.email, p.sid]) {
    const { rows } = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`)
    for (const { table_name: t } of rows) {
      const r = await one(`SELECT md5(string_agg(x::text, '|' ORDER BY x::text)) AS h, count(*)::int AS n FROM "${t}" x WHERE strpos(x::text, $1) > 0`, [needle])
      if (r.n) out[`${t}:${needle === p.sid ? 'sid' : needle === p.email ? 'email' : 'uid'}`] = r.h
    }
  }
  return out
}

test('S8: the account erasure cascade on PostgreSQL', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()
  const shared = await seedShared()
  const a = person('a')
  const b = person('b')
  await seedPerson(a, shared)
  await seedPerson(b, shared)
  const bBefore = await fingerprint(b)
  const cascade = cascadeMod.createErasureCascade({ actorHasher })
  const receipt = await cascade.run({ userId: a.uid, email: a.email, candidateId: a.candidateId })
  const pseudo = cascadeMod.pseudonymFor(a.uid)
  const n = (sql, params) => count(sql, params)

  await t.test('the run completed and is ledgered without the account id', async () => {
    assert.equal(receipt.status, 'COMPLETED')
    assert.equal(receipt.sessionCount, 2, 'the started session and the unstarted paid entitlement')
    const run = await one('SELECT * FROM privacy_erasure_runs WHERE id = $1', [receipt.runId])
    assert.equal(run.status, 'COMPLETED')
    assert.equal(run.pending_session_ids, null, 'the work list is cleared')
    assert.equal(run.subject_ref, cascadeMod.subjectRef(a.uid))
    assert.ok(!JSON.stringify(run).includes(a.uid) && !JSON.stringify(run).includes(a.email))
    const steps = (await query('SELECT step, status FROM privacy_erasure_steps WHERE run_id = $1', [receipt.runId])).rows
    assert.ok(steps.some((s) => s.step === 'campus_user' && s.status === 'DONE'))
    assert.equal(steps.filter((s) => s.step.startsWith('session:')).length, 2)
    assert.ok(!JSON.stringify(steps).includes(a.sid), 'step keys are hashed')
  })

  await t.test('no row anywhere still mentions the account id or the email', async () => {
    assert.deepEqual(await mentions(a.uid), {})
    assert.deepEqual(await mentions(a.email), {})
  })
  await t.test('the erased session id survives only where the registry RETAINs it (tombstone, billing ledger, reviewed request + scrubbed version)', async () => {
    const left = await mentions(a.sid)
    for (const tbl of Object.keys(left)) assert.ok(['assessment_erasure_markers', 'entitlement_consumptions', 'report_review_requests', 'student_report_versions'].includes(tbl), `${tbl} still names the erased session`)
  })

  const gone = {
    organization_memberships: ['SELECT count(*)::int AS n FROM organization_memberships WHERE id = $1', [a.membership]],
    cohort_members: ['SELECT count(*)::int AS n FROM cohort_members WHERE user_id = $1', [a.uid]],
    workspaces: ['SELECT count(*)::int AS n FROM workspaces WHERE owner_user_id = $1', [a.uid]],
    organization_invites: ['SELECT count(*)::int AS n FROM organization_invites WHERE lower(email) = $1 OR accepted_by = $2', [a.email, a.uid]],
    consent_records: ['SELECT count(*)::int AS n FROM consent_records WHERE user_id = $1', [a.uid]],
    share_grants: ['SELECT count(*)::int AS n FROM share_grants WHERE owner_user_id = $1', [a.uid]],
    share_grant_resources: ['SELECT count(*)::int AS n FROM share_grant_resources WHERE resource_id = $1', [a.sid]],
    assessment_assignment_students: ['SELECT count(*)::int AS n FROM assessment_assignment_students WHERE user_id = $1', [a.uid]],
    assessment_assignment_targets: ["SELECT count(*)::int AS n FROM assessment_assignment_targets WHERE target_type = 'USER' AND target_id = $1", [a.uid]],
    'assessment_assignments (personal)': ['SELECT count(*)::int AS n FROM assessment_assignments WHERE id = $1', [a.personalAssignment]],
    user_preferences: ['SELECT count(*)::int AS n FROM user_preferences WHERE user_id = $1', [a.uid]],
    assessment_client_events: ['SELECT count(*)::int AS n FROM assessment_client_events WHERE session_id = $1', [a.sid]],
    assessment_artifact_versions: ['SELECT count(*)::int AS n FROM assessment_artifact_versions WHERE session_id = $1 OR saved_by = $2', [a.sid, a.uid]],
    assessment_candidate_actions: ['SELECT count(*)::int AS n FROM assessment_candidate_actions WHERE session_id = $1', [a.sid]],
    assessment_jobs: ['SELECT count(*)::int AS n FROM assessment_jobs WHERE session_id = $1', [a.sid]],
    assessment_session_scopes: ['SELECT count(*)::int AS n FROM assessment_session_scopes WHERE session_id = $1', [a.sid]],
    assessment_run_timing: ['SELECT count(*)::int AS n FROM assessment_run_timing WHERE session_id = $1', [a.sid]],
    assessment_opportunities: ['SELECT count(*)::int AS n FROM assessment_opportunities WHERE session_id = $1', [a.sid]],
    notifications: ['SELECT count(*)::int AS n FROM notifications WHERE user_id = $1', [a.uid]],
    intervention_memberships: ['SELECT count(*)::int AS n FROM intervention_memberships WHERE user_id = $1', [a.uid]],
    mission_attempts: ['SELECT count(*)::int AS n FROM mission_attempts WHERE user_id = $1', [a.uid]],
    practice_evidence_units: ['SELECT count(*)::int AS n FROM practice_evidence_units WHERE user_id = $1', [a.uid]],
    development_plans: ['SELECT count(*)::int AS n FROM development_plans WHERE user_id = $1', [a.uid]],
    capability_growth_snapshots: ['SELECT count(*)::int AS n FROM capability_growth_snapshots WHERE user_id = $1', [a.uid]],
    practice_allowances: ['SELECT count(*)::int AS n FROM practice_allowances WHERE user_id = $1', [a.uid]],
    preparation_attempts: ['SELECT count(*)::int AS n FROM preparation_attempts WHERE user_id = $1', [a.uid]],
    preparation_turns: ["SELECT count(*)::int AS n FROM preparation_turns WHERE text = 'my rehearsal line' AND attempt_id NOT IN (SELECT id FROM preparation_attempts)", []],
    action_cards: ['SELECT count(*)::int AS n FROM action_cards WHERE user_id = $1', [a.uid]],
    application_checkins: ['SELECT count(*)::int AS n FROM application_checkins WHERE user_id = $1', [a.uid]],
    preview_attempts: ['SELECT count(*)::int AS n FROM preview_attempts WHERE claimed_user_id = $1', [a.uid]],
    admin_notes: ["SELECT count(*)::int AS n FROM admin_notes WHERE entity_type = 'user' AND entity_id = $1", [a.uid]],
    admin_session_states: ['SELECT count(*)::int AS n FROM admin_session_states WHERE session_id = $1', [a.sid]],
    invite_redemptions: ['SELECT count(*)::int AS n FROM invite_redemptions WHERE user_id = $1', [a.uid]],
    'v1_sessions / v1_reports / v1_payments': ['SELECT (SELECT count(*) FROM v1_sessions WHERE session_id = ANY($1)) + (SELECT count(*) FROM v1_reports WHERE session_id = ANY($1)) + (SELECT count(*) FROM v1_payments WHERE session_id = ANY($1))::int AS n', [[a.sid, a.sid2]]],
    'evidence_rating_items (unrated)': ['SELECT count(*)::int AS n FROM evidence_rating_items WHERE id = $1', [a.unratedItem]],
  }
  for (const [table, [sql, params]] of Object.entries(gone)) {
    await t.test(`${table}: the person's rows are deleted`, async () => assert.equal(await n(sql, params), 0))
  }

  await t.test('entitlement_consumptions: the append-only seat event stays under the pseudonym; its reserve key no longer embeds the account id', async () => {
    const rows = (await query('SELECT * FROM entitlement_consumptions WHERE entitlement_id = $1', [a.entitlement])).rows
    assert.equal(rows.length, 1)
    assert.equal(rows[0].user_id, pseudo)
    assert.match(rows[0].idempotency_key, /^erased:[0-9a-f]{32}$/)
  })
  await t.test('entitlements: the ledgered entitlement is kept, pseudonymised and revoked; the spare one is deleted', async () => {
    const kept = await one('SELECT user_id, status FROM entitlements WHERE id = $1', [a.entitlement])
    assert.deepEqual([kept.user_id, kept.status], [pseudo, 'REVOKED'])
    assert.equal(await n('SELECT count(*)::int AS n FROM entitlements WHERE id = $1', [a.spareEntitlement]), 0)
  })
  await t.test('organization_audit_events: events kept, actor and target pseudonymised', async () => {
    assert.equal(await n('SELECT count(*)::int AS n FROM organization_audit_events WHERE actor_user_id = $1 OR target_id = $1', [pseudo]), 2)
  })
  await t.test('data_access_audit_events: events kept; actor, subject and the session resource pseudonymised', async () => {
    const rows = (await query('SELECT * FROM data_access_audit_events WHERE subject_user_id = $1', [pseudo])).rows
    assert.equal(rows.length, 2)
    assert.ok(rows.every((r) => r.resource_id === cascadeMod.sessionPseudonymFor(a.sid)))
    assert.equal(rows.filter((r) => r.actor_user_id === pseudo).length, 1)
  })
  await t.test('admin_audit_events: profile fields stripped from user events; session events pseudonymised and emptied', async () => {
    const user = await one(`SELECT before, after FROM admin_audit_events WHERE entity_type = 'user' AND entity_id = $1`, [pseudo])
    assert.deepEqual(user.before, { accountState: 'active', erased: true })
    assert.deepEqual(user.after, { erased: true })
    const session = await one(`SELECT before, after FROM admin_audit_events WHERE entity_type = 'session' AND entity_id = $1`, [cascadeMod.sessionPseudonymFor(a.sid)])
    assert.deepEqual([session.before, session.after], [{ erased: true }, { erased: true }])
  })
  await t.test('report_review_requests / decisions / student_report_versions: the reviewed request is pseudonymised, its decision text and version scrubbed; the rest deleted', async () => {
    const req = await one('SELECT * FROM report_review_requests WHERE id = $1', [a.reviewed])
    assert.deepEqual([req.user_id, req.reason, req.moment_id], [pseudo, ERASED_TEXT, null])
    assert.equal(await n('SELECT count(*)::int AS n FROM report_review_requests WHERE session_id = $1', [a.sid]), 1)
    assert.equal((await one('SELECT reason FROM report_review_decisions WHERE review_id = $1', [a.reviewed])).reason, ERASED_TEXT)
    const versions = (await query('SELECT version, report_json, content_hash, publication_note FROM student_report_versions WHERE session_id = $1', [a.sid])).rows
    assert.deepEqual(versions, [{ version: 1, report_json: { erased: true }, content_hash: 'erased:v1', publication_note: null }])
  })
  await t.test('student_import_rows: the person\'s raw CSV cells are scrubbed', async () => {
    assert.equal(await n(`SELECT count(*)::int AS n FROM student_import_rows WHERE job_id = $1 AND raw = '{"erased": true}'::jsonb AND normalized IS NULL`, [shared.job]), 1)
  })
  await t.test('evidence_rating_items / evidence_unit_ratings: the rated item is detached and emptied; the append-only rating survives', async () => {
    const item = await one('SELECT * FROM evidence_rating_items WHERE id = $1', [a.ratedItem])
    assert.equal(item.excerpt, ERASED_TEXT)
    assert.notEqual(item.session_ref, sessionRef(a.sid))
    assert.match(item.session_ref, /^[0-9a-f]{64}$/)
    assert.equal(item.source_method_json, null)
    assert.equal(await n('SELECT count(*)::int AS n FROM evidence_unit_ratings WHERE item_id = $1', [a.ratedItem]), 1)
  })
  await t.test('product_grants: the finance record is pseudonymised, not deleted', async () => {
    assert.equal(await n('SELECT count(*)::int AS n FROM product_grants WHERE user_id = $1', [pseudo]), 1)
  })
  await t.test('product_events: the actor hash is cleared, the event kept', async () => {
    assert.equal(await n('SELECT count(*)::int AS n FROM product_events WHERE actor_hash = $1', [actorHasher(a.uid)]), 0)
  })
  await t.test('v1_payment_redemptions: detached, payment stays redeemed', async () => {
    assert.equal(await n('SELECT count(*)::int AS n FROM v1_payment_redemptions WHERE user_id = $1 OR session_id = $2', [a.uid, a.sid2]), 0)
  })
  await t.test('erasure markers: both sessions are tombstoned', async () => {
    assert.equal(await n('SELECT count(*)::int AS n FROM assessment_erasure_markers WHERE session_id = ANY($1)', [[a.sid, a.sid2]]), 2)
  })
  await t.test('another student\'s data is untouched (every row that mentions them is byte-identical)', async () => {
    assert.deepEqual(await fingerprint(b), bBefore)
  })
  await t.test('a second run for the same person is a no-op that completes', async () => {
    const again = await cascade.run({ userId: a.uid, email: a.email, candidateId: a.candidateId })
    assert.equal(again.status, 'COMPLETED')
    assert.notEqual(again.runId, receipt.runId, 'a completed run is never reopened')
    assert.deepEqual(await mentions(a.uid), {})
  })
})

test('S8: a rerun after a mid-way failure completes; the account step is one transaction', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()
  const shared = await seedShared()
  const c = person('c')
  await seedPerson(c, shared)
  // A synthetic trigger fails the account transaction late (after memberships
  // were already deleted inside it).
  await query(`CREATE OR REPLACE FUNCTION p2_interrupt() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF OLD.user_id = '${c.uid}' THEN RAISE EXCEPTION 'synthetic erasure interruption'; END IF; RETURN OLD; END $$`)
  await query('CREATE TRIGGER p2_interrupt BEFORE DELETE ON notifications FOR EACH ROW EXECUTE FUNCTION p2_interrupt()')
  const cascade = cascadeMod.createErasureCascade({ actorHasher })
  let runId
  try {
    await assert.rejects(cascade.run({ userId: c.uid, email: c.email }), (err) => { runId = err.erasureRunId; return /synthetic erasure interruption/.test(err.message) })
  } finally {
    await query('DROP TRIGGER p2_interrupt ON notifications')
    await query('DROP FUNCTION p2_interrupt()')
  }
  const failed = await one('SELECT * FROM privacy_erasure_runs WHERE id = $1', [runId])
  assert.equal(failed.status, 'FAILED')
  assert.match(failed.last_error, /synthetic erasure interruption/)
  assert.ok(!String(failed.last_error).includes(c.uid), 'the error text carries no account id')
  assert.deepEqual([...failed.pending_session_ids].sort(), [c.sid, c.sid2].sort(), 'the work list is kept while the run is open')
  const done = (await query(`SELECT step FROM privacy_erasure_steps WHERE run_id = $1 AND status = 'DONE'`, [runId])).rows.map((r) => r.step)
  assert.equal(done.filter((s) => s.startsWith('session:')).length, 2, 'session steps finished before the failure')
  assert.ok(!done.includes('campus_user'))
  assert.equal(await count('SELECT count(*)::int AS n FROM organization_memberships WHERE user_id = $1', [c.uid]), 1, 'the account transaction rolled back as a whole')
  assert.equal(await count('SELECT count(*)::int AS n FROM v1_sessions WHERE session_id = $1', [c.sid]), 0, 'the committed session step stays done')

  const resumed = await cascade.run({ userId: c.uid, email: c.email })
  assert.equal(resumed.runId, runId, 'the open run is resumed')
  assert.equal(resumed.resumed, true)
  assert.equal(resumed.sessions.length, 0, 'finished session steps are not repeated')
  const run = await one('SELECT * FROM privacy_erasure_runs WHERE id = $1', [runId])
  assert.deepEqual([run.status, run.attempts, run.pending_session_ids, run.last_error], ['COMPLETED', 2, null, null])
  assert.ok(run.completed_at)
  assert.deepEqual(await mentions(c.uid), {})
  // The ledger is proof of erasure: never deleted.
  await assert.rejects(query('DELETE FROM privacy_erasure_runs WHERE id = $1', [runId]), /append-only/)
  await assert.rejects(query('DELETE FROM privacy_erasure_steps WHERE run_id = $1', [runId]), /append-only/)
})

test('0056 erasure guard: ordinary updates and deletes of append-only rows are still rejected', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()
  const shared = await seedShared()
  const d = person('d')
  await seedPerson(d, shared)
  const ent = d.entitlement
  const cases = [
    ['entitlement_consumptions', 'user_id', 'entitlement_id = $1', [ent], true],
    ['organization_audit_events', 'actor_user_id', 'actor_user_id = $1', [d.uid], true],
    ['data_access_audit_events', 'subject_user_id', 'subject_user_id = $1', [d.uid], true],
    ['report_review_decisions', 'reason', 'review_id = $1', [d.reviewed], true],
    ['admin_audit_events', 'entity_id', "entity_type = 'user' AND entity_id = $1", [d.uid], true],
    ['student_report_versions', 'content_hash', 'session_id = $1 AND version = 1', [d.sid], false],
  ]
  for (const [table, col, where, params, deleteGuarded] of cases) {
    await t.test(`${table}: plain UPDATE rejected${deleteGuarded ? ', DELETE rejected' : ''}; the erasure flag allows only an erasure value in a whitelisted column`, async () => {
      await assert.rejects(query(`UPDATE ${table} SET ${col} = 'erased:x' WHERE ${where}`, params), /append-only|immutable/)
      if (deleteGuarded) await assert.rejects(query(`DELETE FROM ${table} WHERE ${where}`, params), /append-only|immutable/)
      const client = await getPool().connect()
      try {
        await client.query('BEGIN')
        await client.query("SELECT set_config('prism.erasure', 'on', true)")
        await client.query('SAVEPOINT s')
        await assert.rejects(client.query(`UPDATE ${table} SET ${col} = 'a real value' WHERE ${where}`, params), /append-only|immutable/)
        await client.query('ROLLBACK TO SAVEPOINT s')
        const other = table === 'student_report_versions' ? 'builder_version' : table === 'admin_audit_events' ? 'action' : table === 'report_review_decisions' ? 'decision' : table === 'entitlement_consumptions' ? 'event' : 'action'
        const otherValue = table === 'report_review_decisions' ? 'REJECT' : table === 'entitlement_consumptions' ? 'RELEASED' : 'erased:changed'
        await assert.rejects(client.query(`UPDATE ${table} SET ${other} = $${params.length + 1} WHERE ${where}`, [...params, otherValue]), /append-only|immutable/)
        await client.query('ROLLBACK TO SAVEPOINT s')
        if (deleteGuarded) {
          await assert.rejects(client.query(`DELETE FROM ${table} WHERE ${where}`, params), /append-only|immutable/)
          await client.query('ROLLBACK TO SAVEPOINT s')
        }
        const ok = await client.query(`UPDATE ${table} SET ${col} = 'erased: by test' WHERE ${where}`, params)
        assert.ok(ok.rowCount >= 1, 'an erasure value in a whitelisted column passes')
        await client.query('ROLLBACK')
      } finally {
        client.release()
      }
      // The flag is transaction-local: after the transaction it is gone.
      await assert.rejects(query(`UPDATE ${table} SET ${col} = 'erased:x' WHERE ${where}`, params), /append-only|immutable/)
    })
  }
})

test('the parsed migration schema matches the live database (the ratchet sees every real column)', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()
  const live = new Set((await query(`SELECT c.table_name || '.' || c.column_name AS k FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.table_name <> 'schema_migrations'`)).rows.map((r) => r.k))
  const parsed = new Set(parseMigrationColumns().map((c) => `${c.table}.${c.column}`))
  assert.deepEqual([...live].filter((k) => !parsed.has(k)).sort(), [], 'live columns the parser misses')
  assert.deepEqual([...parsed].filter((k) => !live.has(k)).sort(), [], 'parsed columns that do not exist')
})

test('student_import_rows.raw retention purge: dry-run first, then cells of old committed imports are cleared', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()
  const shared = await seedShared()
  const old = (await one(`INSERT INTO student_import_jobs (organization_id, uploaded_by, status, totals, committed_at, created_at) VALUES ($1, $2, 'COMMITTED', '{}', now() - interval '40 days', now() - interval '41 days') RETURNING id`, [shared.org, STAFF])).id
  const fresh = (await one(`INSERT INTO student_import_jobs (organization_id, uploaded_by, status, totals, committed_at) VALUES ($1, $2, 'COMMITTED', '{}', now() - interval '2 days') RETURNING id`, [shared.org, STAFF])).id
  const preview = (await one(`INSERT INTO student_import_jobs (organization_id, uploaded_by, status, totals, created_at) VALUES ($1, $2, 'PREVIEW', '{}', now() - interval '60 days') RETURNING id`, [shared.org, STAFF])).id
  for (const job of [old, fresh, preview]) {
    await query(`INSERT INTO student_import_rows (job_id, row_number, raw, normalized, errors, action, outcome) VALUES ($1, 1, '{"email": "x@test.local", "name": "X"}', '{"email": "x@test.local"}', '[]', 'INVITE', 'INVITED')`, [job])
  }
  const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  assert.deepEqual(await purgeImportRowRaw({ dryRun: false, now: future }), { ok: false, error: 'DRY_RUN_REQUIRED' }, 'no dry-run receipt in the last 24 hours')
  const dry = await purgeImportRowRaw({ dryRun: true })
  assert.equal(dry.ok, true)
  assert.equal(dry.effectiveDays, 30)
  assert.equal(dry.provisional, true)
  assert.ok(dry.matched >= 1)
  assert.equal(dry.cleared, 0)
  assert.equal(await count(`SELECT count(*)::int AS n FROM student_import_rows WHERE job_id = $1 AND raw ? 'email'`, [old]), 1, 'dry-run mutates nothing')
  const real = await purgeImportRowRaw({ dryRun: false })
  assert.equal(real.ok, true)
  assert.ok(real.cleared >= 1)
  const row = async (job) => one('SELECT raw, normalized, action, outcome FROM student_import_rows WHERE job_id = $1', [job])
  assert.deepEqual(await row(old), { raw: { purged: true }, normalized: null, action: 'INVITE', outcome: 'INVITED' })
  assert.equal((await row(fresh)).raw.email, 'x@test.local', 'younger than N days: kept')
  assert.equal((await row(preview)).raw.email, 'x@test.local', 'an uncommitted preview is not purged')
  assert.ok(await count(`SELECT count(*)::int AS n FROM retention_runs WHERE entity = 'student_import_rows_raw' AND mode = 'enforce'`) >= 1, 'every run leaves a receipt')
})

test('leaving a cohort or the organization removes intervention memberships (PostgreSQL repos, same transaction)', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()
  const repos = createPgCampusRepos({ query, getPool })
  const shared = await seedShared()
  const e = person('e')
  const f = person('f')
  for (const p of [e, f]) {
    await query(`INSERT INTO cohort_members (cohort_id, user_id, status, added_by) VALUES ($1, $2, 'ACTIVE', $3)`, [shared.cohort, p.uid, STAFF])
    p.membership = (await one(`INSERT INTO organization_memberships (organization_id, user_id, role, status) VALUES ($1, $2, 'STUDENT', 'ACTIVE') RETURNING id`, [shared.org, p.uid])).id
    await query(`INSERT INTO intervention_memberships (intervention_id, user_id) VALUES ($1, $2)`, [shared.intervention, p.uid])
  }
  const members = async (p) => count('SELECT count(*)::int AS n FROM intervention_memberships WHERE user_id = $1', [p.uid])
  await repos.campusAdmin.removeCohortMember(shared.cohort, e.uid)
  assert.equal(await members(e), 0, 'cohort exit')
  assert.equal(await members(f), 1, 'others stay')
  await query(`INSERT INTO intervention_memberships (intervention_id, user_id) VALUES ($1, $2)`, [shared.intervention, e.uid])
  await repos.campusAdmin.setMembershipStatus(e.membership, 'REMOVED')
  assert.equal(await members(e), 0, 'organization exit')
  await repos.campusAdmin.setMembershipStatus(f.membership, 'SUSPENDED')
  assert.equal(await members(f), 1, 'a suspension is not an exit')
})

test('DELETE /api/assessment/candidate-data and the admin account-scope erasure both run the cascade (PostgreSQL)', { skip }, async (t) => {
  t.after(async () => { await closePool() })
  await migrateUp()
  const { buildApp } = await import('../app.js')
  const shared = await seedShared()
  const app = buildApp()
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  try {
    const record = await userDb.createUser({ email: `p2-http-${randomUUID()}@test.local`, name: 'Synthetic', passwordHash: 'x' })
    const g = { ...person('g'), uid: record.id, email: record.email }
    await seedPerson(g, shared)
    const token = jwt.sign({ sub: record.id, email: record.email, tv: 0 }, process.env.JWT_SECRET)
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/assessment/candidate-data`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.ok, true)
    assert.equal(body.erasure.status, 'COMPLETED')
    assert.equal(await count('SELECT count(*)::int AS n FROM organization_memberships WHERE user_id = $1', [record.id]), 0)
    assert.equal(await count('SELECT count(*)::int AS n FROM mission_attempts WHERE user_id = $1', [record.id]), 0)
    assert.notEqual(await userDb.findUserById(record.id), null, 'self-service data erasure keeps the login (P24)')
    const runs = (await query('SELECT scope, initiated_by, status FROM privacy_erasure_runs WHERE subject_ref = $1', [cascadeMod.subjectRef(record.id)])).rows
    assert.deepEqual(runs, [{ scope: 'DATA', initiated_by: 'SELF_SERVICE', status: 'COMPLETED' }])

    // Admin, candidate scope: the same cascade, then the account record.
    const { executeErasure } = await import('../lib/privacyPlanner.js')
    const h = await userDb.createUser({ email: `p2-admin-${randomUUID()}@test.local`, name: 'Synthetic', passwordHash: 'x' })
    const hp = { ...person('h'), uid: h.id, email: h.email }
    await seedPerson(hp, shared)
    const receipt = await executeErasure({ scope: 'candidate', candidate_user_id: h.id })
    assert.equal(receipt.accountDeleted, true)
    assert.ok(receipt.erasureRunId)
    assert.equal(await userDb.findUserById(h.id), null)
    assert.equal(await count('SELECT count(*)::int AS n FROM user_preferences WHERE user_id = $1', [h.id]), 0)
    const adminRun = await one('SELECT scope, initiated_by, status FROM privacy_erasure_runs WHERE id = $1', [receipt.erasureRunId])
    assert.deepEqual(adminRun, { scope: 'ACCOUNT', initiated_by: 'ADMIN_REQUEST', status: 'COMPLETED' })
    assert.equal(await count(`SELECT count(*)::int AS n FROM privacy_erasure_steps WHERE run_id = $1 AND step = 'account' AND status = 'DONE'`, [receipt.erasureRunId]), 1)
  } finally {
    server.close()
  }
})
