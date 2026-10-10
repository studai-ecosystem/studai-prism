// PROD-READY Phase 3 (SECURITY_REVIEW S6) on a throwaway Postgres
// (TEST_DATABASE_URL). Two application instances share one database: each
// has its own pg pools and its own repositories/services, exactly as two
// API replicas would. Proves:
//   - one engine turn per client event id across instances (advisory lock);
//   - an artifact save appends its version row before the engine sees it,
//     and only one of two stale-equal saves ever reaches the engine;
//   - invite acceptance, campus role change and member removal are one
//     transaction each (fault injection leaves no partial state);
//   - the rating queue never stores a third rating for an item;
//   - migration 0057's guard triggers and the persisted session form id.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB
  process.env.PRISM_PG_STORE = 'true'
}

const pg = skip ? null : (await import('pg')).default
const poolMod = skip ? null : await import('../db/pool.js')
const { migrateUp, migrateDown } = skip ? {} : await import('../db/migrate.js')
const { createPgCampusRepos } = skip ? {} : await import('../domain/campusStore/index.js')
const { createCampusContext } = skip ? {} : await import('../domain/campusStore/context.js')
const { createAssessmentSessionService } = skip ? {} : await import('../domain/assessments/sessionService.js')
const { createMemorySessionLocks } = skip ? {} : await import('../domain/assessments/sessionLocks.js')
const { createValidationService } = skip ? {} : await import('../domain/validation/service.js')

const hex = (s) => createHash('sha256').update(s).digest('hex')

function instance() {
  const pool = new pg.Pool({ connectionString: TEST_DB, max: 6 })
  const lockPool = new pg.Pool({ connectionString: TEST_DB, max: 6 })
  const repos = createPgCampusRepos({ query: (text, params) => pool.query(text, params), getPool: () => pool, getLockPool: () => lockPool })
  return { pool, repos, close: async () => { await pool.end(); await lockPool.end() } }
}

async function latest(q) {
  const { rows } = await q('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1')
  return rows[0]?.name
}

test('Phase 3: two instances on one database', { skip }, async (t) => {
  await migrateUp()
  const a = instance()
  const b = instance()
  const q = (text, params) => a.pool.query(text, params)
  t.after(async () => {
    await a.close()
    await b.close()
    await poolMod.closePool()
  })

  // ── 1. advisory lock: one engine turn per client event id ──────────────
  const user = { id: `p3-user-${randomUUID().slice(0, 8)}` }
  const workspace = { type: 'PERSONAL' }
  function sessionFixture() {
    const sessionId = `p3-s-${randomUUID()}`
    const state = { userId: user.id, scenarioId: 'p3-synthetic-scenario', exchangeCount: 0, artifacts: [{ artifactId: 'a1', type: 'doc', data: { seed: 1 } }] }
    const legacy = { getSession: async () => JSON.parse(JSON.stringify(state)), getReport: async () => null }
    return { sessionId, state, legacy }
  }
  const services = (legacy, engine, { memoryLocks = false } = {}) => [a, b].map((inst) => createAssessmentSessionService({
    repos: memoryLocks ? { ...inst.repos, sessionLocks: createMemorySessionLocks() } : inst.repos,
    legacy, engine, audit: () => {},
  }))

  await t.test('same client event id on two instances → exactly one engine turn', async () => {
    const { sessionId, state, legacy } = sessionFixture()
    let turns = 0
    const engine = { async message() { turns += 1; await delay(150); state.exchangeCount += 1; return { messages: [{ role: 'assistant', content: 'synthetic reply' }] } } }
    const [one, two] = services(legacy, engine)
    const args = { user, workspace, sessionId, clientEventId: 'evt-1', text: 'synthetic answer' }
    const out = await Promise.all([one.sendMessage(args), two.sendMessage(args)])
    assert.equal(turns, 1, 'the engine ran exactly once')
    assert.deepEqual(out.map((o) => o.replayed).sort(), [false, true])
    assert.deepEqual(out[0].messages, out[1].messages)
    assert.equal(state.exchangeCount, 1)
    const { rows } = await q("SELECT state FROM assessment_candidate_actions WHERE session_id = $1", [sessionId])
    assert.deepEqual(rows.map((r) => r.state), ['APPLIED'])
  })

  await t.test('control: with per-process locks the same race runs the engine twice', async () => {
    const { sessionId, state, legacy } = sessionFixture()
    let turns = 0
    const engine = { async message() { turns += 1; await delay(150); state.exchangeCount += 1; return { messages: [{ role: 'assistant', content: 'synthetic reply' }] } } }
    const [one, two] = services(legacy, engine, { memoryLocks: true })
    const args = { user, workspace, sessionId, clientEventId: 'evt-1', text: 'synthetic answer' }
    await Promise.allSettled([one.sendMessage(args), two.sendMessage(args)])
    assert.equal(turns, 2, 'without the shared lock both instances reach the engine (the S6 defect)')
  })

  await t.test('a busy session answers the existing retryable 503 instead of waiting forever', async () => {
    const { sessionId, legacy } = sessionFixture()
    const holder = await b.pool.connect()
    const { sessionLockKey } = await import('../domain/assessments/sessionLocks.js')
    await holder.query('SELECT pg_advisory_lock($1::bigint)', [sessionLockKey(sessionId)])
    try {
      const { createPgSessionLocks } = await import('../domain/assessments/sessionLocks.js')
      const quick = createPgSessionLocks({ getPool: () => a.pool, waitMs: 200, pollMs: 20 })
      let ran = false
      const [svc] = [createAssessmentSessionService({ repos: { ...a.repos, sessionLocks: quick }, legacy, engine: { async message() { ran = true; return { messages: [] } } }, audit: () => {} })]
      await assert.rejects(svc.sendMessage({ user, workspace, sessionId, clientEventId: 'evt-busy', text: 'x' }), (e) => e.code === 'UPSTREAM_UNAVAILABLE' && /busy/.test(e.message))
      assert.equal(ran, false)
    } finally {
      await holder.query('SELECT pg_advisory_unlock($1::bigint)', [sessionLockKey(sessionId)])
      holder.release()
    }
  })

  // ── 2. artifact saves: version row first ──────────────────────────────
  function artifactEngine(state, sessionId, seen, { fail = false } = {}) {
    return {
      async saveArtifact({ artifactId, updates }) {
        const { rows } = await q('SELECT max(version) AS v FROM assessment_artifact_versions WHERE session_id = $1 AND artifact_id = $2', [sessionId, artifactId])
        seen.push(rows[0].v)
        await delay(100)
        if (fail) throw Object.assign(new Error('synthetic engine failure'), { code: 'UPSTREAM_UNAVAILABLE' })
        const target = state.artifacts.find((x) => x.artifactId === artifactId)
        target.data = { ...target.data, ...updates }
        return { artifact: JSON.parse(JSON.stringify(target)) }
      },
    }
  }

  await t.test('artifact save: the version row exists before the engine sees the save; one of two equal If-Match saves wins', async () => {
    const { sessionId, state, legacy } = sessionFixture()
    const seen = []
    const [one, two] = services(legacy, artifactEngine(state, sessionId, seen))
    const base = { user, workspace, sessionId, artifactId: 'a1', ifMatch: 0 }
    const results = await Promise.allSettled([
      one.saveArtifact({ ...base, clientEventId: 'art-1', updates: { owner: 'one' } }),
      two.saveArtifact({ ...base, clientEventId: 'art-2', updates: { owner: 'two' } }),
    ])
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
    const loser = results.find((r) => r.status === 'rejected')
    assert.equal(loser.reason.code, 'CONFLICT')
    assert.deepEqual(seen, [1], 'the engine ran once, after version 1 was appended')
    const { rows } = await q('SELECT version, content_json FROM assessment_artifact_versions WHERE session_id = $1', [sessionId])
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0].content_json.data, state.artifacts[0].data, 'the stored version equals the engine state')
  })

  await t.test('artifact save without the shared lock: the version-row fence still lets only one save reach the engine', async () => {
    const { sessionId, state, legacy } = sessionFixture()
    const seen = []
    const [one, two] = services(legacy, artifactEngine(state, sessionId, seen), { memoryLocks: true })
    const base = { user, workspace, sessionId, artifactId: 'a1', ifMatch: 0 }
    const results = await Promise.allSettled([
      one.saveArtifact({ ...base, clientEventId: 'art-1', updates: { owner: 'one' } }),
      two.saveArtifact({ ...base, clientEventId: 'art-2', updates: { owner: 'two' } }),
    ])
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
    assert.equal(seen.length, 1, 'the losing writer failed on the version row, before the engine')
    const loser = results.find((r) => r.status === 'rejected').reason
    assert.equal(loser.code, 'CONFLICT')
    assert.equal(loser.details.version, 1, 'the 409 carries the server snapshot, as for a stale If-Match')
  })

  await t.test('artifact save: an engine failure withdraws the reserved version; the retry applies once', async () => {
    const { sessionId, state, legacy } = sessionFixture()
    const seen = []
    const [failing] = services(legacy, artifactEngine(state, sessionId, seen, { fail: true }))
    const args = { user, workspace, sessionId, artifactId: 'a1', ifMatch: 0, clientEventId: 'art-x', updates: { owner: 'x' } }
    await assert.rejects(failing.saveArtifact(args), /synthetic engine failure/)
    assert.equal((await q('SELECT count(*)::int AS n FROM assessment_artifact_versions WHERE session_id = $1', [sessionId])).rows[0].n, 0)
    const [, healthy] = services(legacy, artifactEngine(state, sessionId, seen))
    const out = await healthy.saveArtifact(args)
    assert.equal(out.version, 1)
    assert.deepEqual(seen, [1, 1])
  })

  // ── 3. transactional multi-writes ──────────────────────────────────────
  process.env.PRISM_CAMPUS_ENABLED = 'true'
  t.after(() => { delete process.env.PRISM_CAMPUS_ENABLED })
  let tokenSeq = 0
  const contexts = [a, b].map((inst) => createCampusContext({
    repos: inst.repos,
    tokenFactory: () => `p3-token-${randomUUID()}-${++tokenSeq}`,
    scenarioSource: async () => ({ generalScenarios: [{ id: 'p3-general' }], bankScenarios: {} }),
  }))
  const org = await a.repos.organizations.createOrganization({ name: 'Synthetic Phase 3 Org', slug: `p3-${randomUUID().slice(0, 8)}`, organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  const cohort = await a.repos.organizations.createCohort({ organizationId: org.id, name: 'P3 Cohort' })
  const owner = { id: `p3-owner-${randomUUID().slice(0, 8)}`, email: 'p3-owner@test.local', name: 'Owner' }
  await a.repos.memberships.upsertMembership({ organizationId: org.id, userId: owner.id, role: 'ORG_OWNER', status: 'ACTIVE' })
  const ownerActor = async () => contexts[0].workspaceService.actorFor(owner)
  const invite = async (email) => {
    let token
    const ctx = createCampusContext({ repos: a.repos, tokenFactory: () => { token = `p3-token-${randomUUID()}`; return token }, scenarioSource: async () => ({ generalScenarios: [], bankScenarios: {} }) })
    await ctx.invites.createInvites({ actor: await ownerActor(), orgId: org.id, role: 'STUDENT', emails: [email], cohortId: cohort.id })
    return token
  }
  const footprint = async (userId) => {
    const count = async (sql) => (await q(sql, [userId])).rows[0].n
    return {
      consents: await count('SELECT count(*)::int AS n FROM consent_records WHERE user_id = $1'),
      memberships: await count('SELECT count(*)::int AS n FROM organization_memberships WHERE user_id = $1'),
      workspaces: await count('SELECT count(*)::int AS n FROM workspaces WHERE owner_user_id = $1'),
      cohortMembers: await count('SELECT count(*)::int AS n FROM cohort_members WHERE user_id = $1'),
      accepted: await count("SELECT count(*)::int AS n FROM organization_invites WHERE accepted_by = $1 AND status = 'ACCEPTED'"),
    }
  }

  await t.test('invite acceptance: a failure at the last write leaves no consent, membership, workspace or cohort row', async () => {
    const student = { id: `p3-fault-${randomUUID().slice(0, 8)}`, email: `p3-fault-${randomUUID().slice(0, 6)}@test.local` }
    const token = await invite(student.email)
    await q(`CREATE OR REPLACE FUNCTION p3_fail_invite() RETURNS trigger AS $$
             BEGIN IF NEW.status = 'ACCEPTED' AND NEW.accepted_by LIKE 'p3-fault-%' THEN RAISE EXCEPTION 'synthetic acceptance failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`)
    await q('CREATE TRIGGER p3_fail_invite BEFORE UPDATE ON organization_invites FOR EACH ROW EXECUTE FUNCTION p3_fail_invite()')
    try {
      await assert.rejects(contexts[0].invites.acceptInvite({ token, user: student, acknowledged: true }), /synthetic acceptance failure/)
      assert.deepEqual(await footprint(student.id), { consents: 0, memberships: 0, workspaces: 0, cohortMembers: 0, accepted: 0 })
      assert.equal((await q('SELECT status FROM organization_invites WHERE email = $1', [student.email])).rows[0].status, 'PENDING')
    } finally {
      await q('DROP TRIGGER IF EXISTS p3_fail_invite ON organization_invites')
      await q('DROP FUNCTION IF EXISTS p3_fail_invite()')
    }
    const out = await contexts[1].invites.acceptInvite({ token, user: student, acknowledged: true })
    assert.equal(out.alreadyAccepted, false)
    assert.deepEqual(await footprint(student.id), { consents: 1, memberships: 1, workspaces: 1, cohortMembers: 1, accepted: 1 })
  })

  await t.test('invite acceptance: two instances accepting at once write everything exactly once', async () => {
    const student = { id: `p3-race-${randomUUID().slice(0, 8)}`, email: `p3-race-${randomUUID().slice(0, 6)}@test.local` }
    const token = await invite(student.email)
    const out = await Promise.all(contexts.map((ctx) => ctx.invites.acceptInvite({ token, user: student, acknowledged: true })))
    assert.deepEqual(out.map((o) => o.alreadyAccepted).sort(), [false, true])
    assert.equal(out[0].workspaceId, out[1].workspaceId)
    assert.deepEqual(await footprint(student.id), { consents: 1, memberships: 1, workspaces: 1, cohortMembers: 1, accepted: 1 })
  })

  const staffMember = async (role, idPrefix = 'p3-staff') => {
    const id = `${idPrefix}-${randomUUID().slice(0, 8)}`
    const m = await a.repos.memberships.upsertMembership({ organizationId: org.id, userId: id, role, status: 'ACTIVE' })
    return { id, membershipId: m.id }
  }
  const req = (userId) => ({ user: { id: userId }, requestId: `p3-req-${randomUUID().slice(0, 6)}` })

  await t.test('role change: a failure on the notification leaves the old role active and writes nothing else', async () => {
    const staff = await staffMember('PLACEMENT_OFFICER', 'p3-fault')
    await q(`CREATE OR REPLACE FUNCTION p3_fail_notification() RETURNS trigger AS $$
             BEGIN IF NEW.kind = 'ROLE_CHANGED' AND NEW.user_id LIKE 'p3-fault-%' THEN RAISE EXCEPTION 'synthetic notification failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`)
    await q('CREATE TRIGGER p3_fail_notification BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION p3_fail_notification()')
    try {
      await assert.rejects(contexts[0].admin.changeRole(req(owner.id), await ownerActor(), org.id, staff.membershipId, 'PLACEMENT_DIRECTOR'), /synthetic notification failure/)
    } finally {
      await q('DROP TRIGGER IF EXISTS p3_fail_notification ON notifications')
      await q('DROP FUNCTION IF EXISTS p3_fail_notification()')
    }
    const { rows } = await q('SELECT role, status FROM organization_memberships WHERE user_id = $1 ORDER BY role', [staff.id])
    assert.deepEqual(rows, [{ role: 'PLACEMENT_OFFICER', status: 'ACTIVE' }])
    assert.equal((await q("SELECT count(*)::int AS n FROM organization_audit_events WHERE organization_id = $1 AND action = 'role.changed' AND target_id IN (SELECT id::text FROM organization_memberships WHERE user_id = $2)", [org.id, staff.id])).rows[0].n, 0)
    const done = await contexts[1].admin.changeRole(req(owner.id), await ownerActor(), org.id, staff.membershipId, 'PLACEMENT_DIRECTOR')
    assert.equal(done.role, 'PLACEMENT_DIRECTOR')
    const after = await q('SELECT role, status FROM organization_memberships WHERE user_id = $1 ORDER BY role', [staff.id])
    assert.deepEqual(after.rows, [{ role: 'PLACEMENT_DIRECTOR', status: 'ACTIVE' }, { role: 'PLACEMENT_OFFICER', status: 'REMOVED' }])
    assert.equal((await q("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND kind = 'ROLE_CHANGED'", [staff.id])).rows[0].n, 1)
  })

  await t.test('two owners demoting each other on two instances leave exactly one owner', async () => {
    const org2 = await a.repos.organizations.createOrganization({ name: 'Synthetic Phase 3 Owners', slug: `p3o-${randomUUID().slice(0, 8)}`, organizationType: 'UNIVERSITY', status: 'ACTIVE' })
    const ids = [`p3-own-a-${randomUUID().slice(0, 6)}`, `p3-own-b-${randomUUID().slice(0, 6)}`]
    const ms = []
    for (const id of ids) ms.push(await a.repos.memberships.upsertMembership({ organizationId: org2.id, userId: id, role: 'ORG_OWNER', status: 'ACTIVE' }))
    const actors = await Promise.all(ids.map((id) => contexts[0].workspaceService.actorFor({ id })))
    const results = await Promise.allSettled([
      contexts[0].admin.changeRole(req(ids[0]), actors[0], org2.id, ms[1].id, 'PLACEMENT_DIRECTOR'),
      contexts[1].admin.changeRole(req(ids[1]), actors[1], org2.id, ms[0].id, 'PLACEMENT_DIRECTOR'),
    ])
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
    assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'CONFLICT')
    const owners = await q("SELECT count(*)::int AS n FROM organization_memberships WHERE organization_id = $1 AND role = 'ORG_OWNER' AND status = 'ACTIVE'", [org2.id])
    assert.equal(owners.rows[0].n, 1)
  })

  // ── 4. rating queue: two ratings per item ──────────────────────────────
  await t.test('rating queue: concurrent submissions on two instances store exactly two ratings; SQL cannot add a third', async () => {
    const { item } = await a.repos.validation.upsertItem({
      evidenceRef: hex(`p3-evidence-${randomUUID()}`), sessionRef: hex(`p3-session-${randomUUID()}`), capabilityId: 'CAP-L1-REASONING', sourceType: 'DIALOGUE_TURN',
      behaviorAnchorId: null, excerpt: 'A synthetic candidate sentence for the queue.', aiLevel: 3, aiStatus: 'SUFFICIENT', rubricVersion: 'r1', enqueuedBy: 'p3-test',
    })
    const svcs = [a, b].map((inst) => createValidationService({ repos: inst.repos }))
    const raters = Array.from({ length: 6 }, (_, i) => `p3-rater-${i}-${randomUUID().slice(0, 4)}`)
    const results = await Promise.allSettled(raters.map((r, i) => svcs[i % 2].submit(r, item.id, { level: 3 })))
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2)
    for (const r of results.filter((x) => x.status === 'rejected')) assert.equal(r.reason.code, 'CONFLICT')
    assert.equal((await q('SELECT count(*)::int AS n FROM evidence_unit_ratings WHERE item_id = $1', [item.id])).rows[0].n, 2)
    await assert.rejects(q("INSERT INTO evidence_unit_ratings (item_id, rater_id, level, cannot_rate) VALUES ($1, 'p3-direct', 2, false)", [item.id]), /already has its two ratings/)
  })

  // ── 5. 0057 guard triggers ────────────────────────────────────────────
  const def = `p3-def-${randomUUID().slice(0, 6)}`
  await q("INSERT INTO assessment_definitions (assessment_definition_id, job_family, title, status) VALUES ($1, 'GENERAL', 'Synthetic', 'active')", [def])
  const forms = [`${def}:a:1`, `${def}:b:1`, `${def}:c:1`]
  for (const [i, id] of forms.entries()) {
    await q("INSERT INTO assessment_forms (id, definition_id, version, scenario_id, capability_ids, status, frozen_at) VALUES ($1, $2, '1', $3, ARRAY['CAP-L1-REASONING'], 'FROZEN', now())", [id, def, `sc-${i}`])
  }
  const snapshot = (fa, fb, s1) => q(
    "INSERT INTO capability_growth_snapshots (user_id, capability_id, baseline_session_id, reassessment_session_id, form_a_id, form_b_id, from_band, to_band, direction, rules_version) VALUES ('p3-u', 'CAP-L1-REASONING', $3, $4, $1, $2, 'EARLY', 'DEVELOPING', 'HIGHER', 'r1')",
    [fa, fb, s1, `${s1}-re`],
  )

  await t.test('0057: an equivalence pair cannot become APPROVED without an APPROVED decision row citing the same evidence', async () => {
    const [fa, fb] = [forms[0], forms[1]]
    await q("INSERT INTO assessment_form_equivalence (form_a_id, form_b_id, status) VALUES ($1, $2, 'PENDING')", [fa, fb])
    const approve = () => q("UPDATE assessment_form_equivalence SET status = 'APPROVED', evidence_ref = 'study-1', decided_by = 'adm', decided_at = now() WHERE form_a_id = $1 AND form_b_id = $2", [fa, fb])
    await assert.rejects(approve(), /cannot be APPROVED without an APPROVED decision/)
    await assert.rejects(q("INSERT INTO assessment_form_equivalence (form_a_id, form_b_id, status, evidence_ref, decided_by, decided_at) VALUES ($1, $1, 'APPROVED', 'study-1', 'adm', now())", [fa]), /cannot be APPROVED/)
    // A REJECTED latest decision does not license an approval either.
    await q("INSERT INTO assessment_form_equivalence_decisions (form_a_id, form_b_id, status, evidence_ref, reason, decided_by) VALUES ($1, $2, 'REJECTED', 'study-1', 'Not equated yet, synthetic', 'adm')", [fa, fb])
    await assert.rejects(approve(), /cannot be APPROVED/)
    // A snapshot on the still-PENDING pair is refused.
    await assert.rejects(snapshot(fa, fb, `p3-s-${randomUUID().slice(0, 6)}`), /need an APPROVED form pair \(.* is PENDING\)/)
    // The admin plane's path (decision row + pair update in one transaction) passes.
    const after = await a.repos.growth.recordDecision({ formAId: fa, formBId: fb, status: 'APPROVED', evidenceRef: 'study-2', reason: 'Synthetic equating study reviewed', decidedBy: 'adm', approvalId: 'appr-p3' })
    assert.equal(after.status, 'APPROVED')
    // Erasure pseudonymises decided_by on an approved pair: still allowed.
    await q("UPDATE assessment_form_equivalence SET decided_by = 'erased:p3' WHERE form_a_id = $1 AND form_b_id = $2", [fa, fb])
    // A direct change of the cited evidence without a decision is refused.
    await assert.rejects(q("UPDATE assessment_form_equivalence SET evidence_ref = 'forged-study' WHERE form_a_id = $1 AND form_b_id = $2", [fa, fb]), /cannot be APPROVED/)
    await snapshot(fa, fb, `p3-s-${randomUUID().slice(0, 6)}`)
  })

  await t.test('0057: a growth snapshot is refused on a PENDING or REJECTED pair', async () => {
    const [fa, fc] = [forms[0], forms[2]]
    await q("INSERT INTO assessment_form_equivalence (form_a_id, form_b_id, status) VALUES ($1, $2, 'PENDING')", [fa, fc])
    await assert.rejects(snapshot(fa, fc, `p3-s-${randomUUID().slice(0, 6)}`), /is PENDING/)
    await a.repos.growth.recordDecision({ formAId: fa, formBId: fc, status: 'REJECTED', evidenceRef: 'study-3', reason: 'Synthetic: not equivalent', decidedBy: 'adm' })
    await assert.rejects(snapshot(fa, fc, `p3-s-${randomUUID().slice(0, 6)}`), /is REJECTED/)
  })

  // ── 6. persisted session form id (0057) ────────────────────────────────
  await t.test('0057: the session form id is recorded once, never remapped, and backfilled from evidence units', async () => {
    const store = await import('../lib/store.js')
    store.registerSessionFormResolver(async (scenarioId) => `${scenarioId}:1.0.0`)
    try {
      const sid = `p3-form-${randomUUID()}`
      const created = await store.createSession(sid, { scenarioId: 'p3-bank', userId: user.id })
      assert.equal(created.assessmentFormId, 'p3-bank:1.0.0')
      // A later bank version (resolver now answers 2.0.0) never remaps it.
      store.registerSessionFormResolver(async (scenarioId) => `${scenarioId}:2.0.0`)
      await store.updateSession(sid, { exchangeCount: 3, assessmentFormId: 'p3-bank:2.0.0' })
      await store.createSession(sid, { scenarioId: 'p3-bank', userId: user.id })
      assert.equal((await store.getSession(sid)).assessmentFormId, 'p3-bank:1.0.0')
      assert.equal((await q('SELECT assessment_form_id FROM v1_sessions WHERE session_id = $1', [sid])).rows[0].assessment_form_id, 'p3-bank:1.0.0')
    } finally {
      store.registerSessionFormResolver(null)
    }

    // Backfill: roll back to 0056, write sessions + evidence, re-apply 0057.
    while ((await latest(q)) >= '0057') await migrateDown()
    const cols = await q("SELECT 1 FROM information_schema.columns WHERE table_name = 'v1_sessions' AND column_name = 'assessment_form_id'")
    assert.equal(cols.rows.length, 0, '0057 down drops the column')
    assert.equal((await q("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname IN ('assessment_form_equivalence_requires_decision', 'capability_growth_snapshots_require_approved_pair', 'evidence_unit_ratings_two_per_item')")).rows[0].n, 0)
    const single = `p3-bf1-${randomUUID().slice(0, 8)}`
    const mixed = `p3-bf2-${randomUUID().slice(0, 8)}`
    const none = `p3-bf3-${randomUUID().slice(0, 8)}`
    for (const sid of [single, mixed, none]) await q("INSERT INTO v1_sessions (session_id, scenario_id, user_id, data) VALUES ($1, 'p3-bank', $2, '{}')", [sid, user.id])
    const unit = (sid, form, n) => q(
      `INSERT INTO behavioral_evidence_units (evidence_id, session_id, blueprint_id, capability_id, capability_layer, source_turn, observable_behavior, rubric_level, rubric_label, assessment_form_id, evidence_status, provenance_json, candidate_action_json)
       VALUES ($1, $2, 'bp', 'CAP-L1-REASONING', 'LAYER_1_TRANSFERABLE', $3, 'synthetic', 3, 'L3', $4, 'SUFFICIENT', '{}', '{}')`,
      [`p3-ev-${randomUUID().slice(0, 12)}`, sid, n, form],
    )
    await unit(single, 'p3-bank:1.0.0', 1)
    await unit(single, 'p3-bank:1.0.0', 2)
    await unit(mixed, 'p3-bank:1.0.0', 1)
    await unit(mixed, 'p3-bank:2.0.0', 2)
    await unit(none, null, 1)
    await migrateUp()
    const { rows } = await q('SELECT session_id, assessment_form_id FROM v1_sessions WHERE session_id = ANY($1) ORDER BY session_id', [[single, mixed, none]])
    const byId = Object.fromEntries(rows.map((r) => [r.session_id, r.assessment_form_id]))
    assert.equal(byId[single], 'p3-bank:1.0.0')
    assert.equal(byId[mixed], null, 'ambiguous evidence is not guessed')
    assert.equal(byId[none], null)
    // Leave the shared database as other suites expect it (their down
    // migrations rebuild constraints over existing evidence rows).
    await q('DELETE FROM behavioral_evidence_units WHERE session_id = ANY($1)', [[single, mixed, none]])
  })

  await t.test('sessions:pin-forms records older sessions from the current catalog, dry-run first, never changing a recorded id', async () => {
    const { pinSessionForms } = await import('../domain/assessments/sessionFormPins.js')
    const scenarioSource = async () => ({ generalScenarios: [], bankScenarios: { 'p3-pin-bank': { title: 'Synthetic', version: '3.0.0', briefing: { objective: 'x' }, probingTree: { turns: [] } } } })
    const [open, kept, unknown] = [`p3-pin-a-${randomUUID().slice(0, 8)}`, `p3-pin-b-${randomUUID().slice(0, 8)}`, `p3-pin-c-${randomUUID().slice(0, 8)}`]
    await q("INSERT INTO v1_sessions (session_id, scenario_id, user_id, data) VALUES ($1, 'p3-pin-bank', 'u', '{}')", [open])
    await q("INSERT INTO v1_sessions (session_id, scenario_id, user_id, data, assessment_form_id) VALUES ($1, 'p3-pin-bank', 'u', '{}', 'p3-pin-bank:1.0.0')", [kept])
    await q("INSERT INTO v1_sessions (session_id, scenario_id, user_id, data) VALUES ($1, NULL, 'u', '{}')", [unknown])
    const run = (text, params) => a.pool.query(text, params)
    const dry = await pinSessionForms({ dryRun: true, scenarioSource, run })
    assert.equal(dry.dryRun, true)
    assert.ok(dry.byForm['p3-pin-bank:3.0.0'] >= 1)
    assert.equal((await q('SELECT assessment_form_id FROM v1_sessions WHERE session_id = $1', [open])).rows[0].assessment_form_id, null, 'dry run writes nothing')
    await pinSessionForms({ dryRun: false, scenarioSource, run })
    const { rows } = await q('SELECT session_id, assessment_form_id FROM v1_sessions WHERE session_id = ANY($1)', [[open, kept, unknown]])
    const byId = Object.fromEntries(rows.map((r) => [r.session_id, r.assessment_form_id]))
    assert.equal(byId[open], 'p3-pin-bank:3.0.0')
    assert.equal(byId[kept], 'p3-pin-bank:1.0.0', 'a recorded form is never remapped')
    assert.equal(byId[unknown], null)
  })
})
