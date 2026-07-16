// Control Centre Phase 5 — full-flow integration tests (database required).
//
//   set TEST_DATABASE_URL=postgres://user:pass@localhost:5432/prism_test
//
// Drives the real HTTP surface: CMS seed-from-content.json → draft → versioned
// edit → publish → PRISM_CMS_DB public serving → unpublish/archive → draft
// hard-delete rules; careers + applications lifecycle w/ retention delete;
// feature-flag registry (data-gate refusal for NO-GO science flags, dual
// control on production changes, mark-applied env verification); system
// health with a no-secrets-on-the-wire assertion; model registry; job cancel.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase5-db-test-secret'
  process.env.PRISM_ADMIN_CONSOLE = 'true'
  process.env.PRISM_CMS_DB = 'true' // exercise the DB-serving path end-to-end
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prism-admin-p5db-'))
  // Deliberately fake-looking secret values to prove they never hit the wire.
  process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'p5-secret-razorpay-value'
  process.env.SMTP_PASS = process.env.SMTP_PASS || 'p5-secret-smtp-value'
}

const { migrateUp } = skip ? {} : await import('../db/migrate.js')
const { query, closePool } = skip ? {} : await import('../db/pool.js')
const { buildApp } = skip ? {} : await import('../app.js')
const adminAuth = skip ? {} : await import('../lib/adminAuth.js')
const { seedRbac } = skip ? {} : await import('../lib/adminRbac.js')

async function mintAdmin(roleKeys) {
  const adminId = randomUUID()
  const email = `p5db-${roleKeys[0]}-${adminId.slice(0, 8)}@test.local`
  await query(
    `INSERT INTO admin_users (admin_id, email, name, password_hash, state) VALUES ($1,$2,$3,'x','active')`,
    [adminId, email, roleKeys[0]],
  )
  for (const rk of roleKeys) {
    await query(
      `INSERT INTO admin_user_roles (admin_id, role_id) SELECT $1, role_id FROM admin_roles WHERE role_key = $2`,
      [adminId, rk],
    )
  }
  const session = await adminAuth.createAdminSession(
    { admin_id: adminId, email }, { ip: '10.99.5.1', get: () => 'phase5-tests' },
  )
  return { adminId, email, token: adminAuth.signAccessToken({ admin_id: adminId, email }, session.sessionId), csrf: session.csrfToken }
}

test('Phase 5 CMS/flags/system end-to-end', { skip }, async (t) => {
  await migrateUp()
  await seedRbac()

  const app = buildApp()
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(async () => { server.close(); await closePool() })

  const call = async (method, path, actor, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(actor ? { authorization: `Bearer ${actor.token}` } : {}),
        ...(actor && method !== 'GET' ? { 'x-admin-csrf': actor.csrf } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    })
    let json = null
    try { json = await res.json() } catch { /* empty */ }
    return { status: res.status, json }
  }

  const contentAdmin = await mintAdmin(['content_admin'])
  const superA = await mintAdmin(['super_admin'])
  const superB = await mintAdmin(['super_admin'])
  const auditor = await mintAdmin(['auditor'])

  // ── CMS: seed from content.json happened on first touch ────────────────────
  const list1 = await call('GET', '/api/admin/content/posts', contentAdmin)
  assert.equal(list1.status, 200)
  assert.ok(list1.json.posts.length >= 6, 'content.json posts imported')
  assert.match(list1.json.servingFrom, /database/, 'PRISM_CMS_DB on in this test')

  // Public route serves the DB now — imported posts visible.
  const publicBlog = await call('GET', '/api/content/blog', null)
  assert.equal(publicBlog.status, 200)
  assert.ok(publicBlog.json.posts.length >= 6)
  assert.ok(publicBlog.json.posts.every((p) => p.slug && !('body' in p)), 'public shape preserved')

  // ── Blog lifecycle: draft → edit (versioned) → publish → archive ──────────
  const slug = `p5-e2e-${randomUUID().slice(0, 6)}`
  const created = await call('POST', '/api/admin/content/posts', contentAdmin, {
    slug, title: 'P5 E2E Post',
  })
  assert.equal(created.status, 201)
  const postId = created.json.postId

  // Draft invisible publicly.
  const notYet = await call('GET', `/api/content/blog/${slug}`, null)
  assert.equal(notYet.status, 404, 'drafts never leak to the public surface')

  const edited = await call('PATCH', `/api/admin/content/posts/${postId}`, contentAdmin, {
    body: 'Hello from the CMS.', summary: 'e2e summary', changeNote: 'wrote the body',
  })
  assert.equal(edited.status, 200)
  assert.equal(edited.json.version, 2, 'edit bumped the version')
  const badField = await call('PATCH', `/api/admin/content/posts/${postId}`, contentAdmin, { slug: 'sneaky' })
  assert.equal(badField.status, 400, 'slug is not editable')

  const published = await call('POST', `/api/admin/content/posts/${postId}/status`, contentAdmin, {
    status: 'published', reason: 'e2e publish',
  })
  assert.equal(published.status, 200)
  const nowPublic = await call('GET', `/api/content/blog/${slug}`, null)
  assert.equal(nowPublic.status, 200)
  assert.equal(nowPublic.json.post.body, 'Hello from the CMS.')

  // Published posts cannot be hard-deleted.
  const delPublished = await call('DELETE', `/api/admin/content/posts/${postId}`, contentAdmin)
  assert.equal(delPublished.status, 409)
  assert.equal(delPublished.json.code, 'NOT_A_DRAFT')

  const unpub = await call('POST', `/api/admin/content/posts/${postId}/status`, contentAdmin, {
    status: 'draft', reason: 'e2e unpublish',
  })
  assert.equal(unpub.status, 200)
  assert.equal((await call('GET', `/api/content/blog/${slug}`, null)).status, 404, 'unpublished → gone from public')
  // Was published once → still not hard-deletable.
  assert.equal((await call('DELETE', `/api/admin/content/posts/${postId}`, contentAdmin)).status, 409)
  await call('POST', `/api/admin/content/posts/${postId}/status`, contentAdmin, { status: 'archived', reason: 'e2e archive' })

  // A never-published draft CAN be hard-deleted.
  const disposable = await call('POST', '/api/admin/content/posts', contentAdmin, {
    slug: `p5-tmp-${randomUUID().slice(0, 6)}`, title: 'Disposable',
  })
  assert.equal((await call('DELETE', `/api/admin/content/posts/${disposable.json.postId}`, contentAdmin)).status, 200)

  const versions = await call('GET', `/api/admin/content/posts/${postId}`, contentAdmin)
  assert.ok(versions.json.versions.length >= 2, 'version history retained through the whole lifecycle')

  // Auditor reads, cannot publish.
  assert.equal((await call('GET', '/api/admin/content/posts', auditor)).status, 200)
  assert.equal((await call('POST', `/api/admin/content/posts/${postId}/status`, auditor, { status: 'published', reason: 'x' })).status, 403)

  // ── Careers + applications ─────────────────────────────────────────────────
  const roleSlug = `p5-role-${randomUUID().slice(0, 6)}`
  const role = await call('POST', '/api/admin/content/jobs-list', contentAdmin, { slug: roleSlug, title: 'E2E Role' })
  assert.equal(role.status, 201)
  await call('POST', `/api/admin/content/jobs-list/${role.json.jobId}/status`, contentAdmin, { status: 'open', reason: 'hiring' })

  // Public application lands in the DB.
  const applied = await call('POST', `/api/content/careers/${roleSlug}/apply`, null, {
    name: 'Appl Icant', email: 'applicant@test.local', message: 'hire me',
  })
  assert.equal(applied.status, 201)
  const apps = await call('GET', `/api/admin/content/applications?jobSlug=${roleSlug}`, contentAdmin)
  assert.equal(apps.json.applications.length, 1)
  const appId = apps.json.applications[0].application_id

  assert.equal((await call('POST', `/api/admin/content/applications/${appId}/status`, contentAdmin, { status: 'reviewing' })).status, 200)
  const delNoReason = await fetch(`${base}/api/admin/content/applications/${appId}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${contentAdmin.token}`, 'x-admin-csrf': contentAdmin.csrf },
    body: JSON.stringify({}),
  })
  assert.equal(delNoReason.status, 400, 'retention delete demands a reason')
  const delOk = await fetch(`${base}/api/admin/content/applications/${appId}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${contentAdmin.token}`, 'x-admin-csrf': contentAdmin.csrf },
    body: JSON.stringify({ reason: 'retention window elapsed (e2e)' }),
  })
  assert.equal(delOk.status, 200)

  // ── Feature flags ──────────────────────────────────────────────────────────
  const flags = await call('GET', '/api/admin/flags', superA)
  assert.equal(flags.status, 200)
  assert.ok(flags.json.flags.length >= 15, 'registry seeded')
  const velocity = flags.json.flags.find((f) => f.flag_key === 'PRISM_VELOCITY')
  assert.equal(velocity.scienceGated, true)
  assert.equal(velocity.risk, 'high')

  // Science-gated production enable with NO-GO verdict → refused outright.
  const gated = await call('POST', '/api/admin/flags/PRISM_VELOCITY/request', superA, {
    environment: 'production', requestedState: 'on', reason: 'trying to enable velocity early',
  })
  assert.equal(gated.status, 409)
  assert.equal(gated.json.code, 'DATA_GATE_NOT_MET')

  // Operational production change: dual control end-to-end.
  const reqChange = await call('POST', '/api/admin/flags/PRISM_ADMIN_CONSOLE/request', superA, {
    environment: 'production', requestedState: 'on', reason: 'attest current console state',
  })
  assert.equal(reqChange.status, 201)
  assert.equal(reqChange.json.status, 'requested')
  const changeId = reqChange.json.changeId

  const selfDecide = await call('POST', `/api/admin/flags/changes/${changeId}/decide`, superA, {
    decision: 'approved', reason: 'self-approval attempt',
  })
  assert.equal(selfDecide.status, 403)
  assert.equal(selfDecide.json.code, 'DUAL_CONTROL')

  assert.equal((await call('POST', `/api/admin/flags/changes/${changeId}/decide`, superB, {
    decision: 'approved', reason: 'reviewed in e2e',
  })).status, 200)

  // mark-applied verifies the LIVE env: PRISM_ADMIN_CONSOLE is 'on' here → ok.
  const applied2 = await call('POST', `/api/admin/flags/changes/${changeId}/mark-applied`, superA, {})
  assert.equal(applied2.status, 200)
  assert.match(applied2.json.verification, /verified against the live environment/)

  // And a request that CONTRADICTS the live env cannot be marked applied.
  const offReq = await call('POST', '/api/admin/flags/PRISM_ADMIN_CONSOLE/request', superA, {
    environment: 'production', requestedState: 'off', reason: 'exercise env-mismatch guard',
  })
  await call('POST', `/api/admin/flags/changes/${offReq.json.changeId}/decide`, superB, {
    decision: 'approved', reason: 'approving to test the guard',
  })
  const mismatch = await call('POST', `/api/admin/flags/changes/${offReq.json.changeId}/mark-applied`, superA, {})
  assert.equal(mismatch.status, 409)
  assert.equal(mismatch.json.code, 'ENV_MISMATCH')
  await call('POST', `/api/admin/flags/changes/${offReq.json.changeId}/cancel`, superA, {})

  // Dev change auto-approves (medium risk, non-production).
  const devReq = await call('POST', '/api/admin/flags/PRISM_CMS_DB/request', superA, {
    environment: 'development', requestedState: 'on', reason: 'dev enable for local CMS work',
  })
  assert.equal(devReq.json.status, 'approved')

  // ── System health: secrets never on the wire ───────────────────────────────
  const health = await call('GET', '/api/admin/system/health', superA)
  assert.equal(health.status, 200)
  const wire = JSON.stringify(health.json)
  for (const secret of [process.env.RAZORPAY_KEY_SECRET, process.env.SMTP_PASS, process.env.JWT_SECRET, process.env.DATABASE_URL]) {
    assert.ok(!wire.includes(secret), 'no secret value may appear in the health payload')
  }
  assert.equal(health.json.postgres.ok, true)

  // ── Model registry + job cancel ────────────────────────────────────────────
  const model = await call('POST', '/api/admin/system/models', superA, {
    provider: 'aws-bedrock', deployment: `p5-test-${randomUUID().slice(0, 6)}`,
    purpose: 'e2e metadata row', costPerMtokIn: 2.5, costPerMtokOut: 15,
  })
  assert.equal(model.status, 201)
  assert.equal((await call('GET', '/api/admin/system/models', auditor)).status, 200)
  assert.equal((await call('POST', '/api/admin/system/models', contentAdmin, { provider: 'x', deployment: 'y' })).status, 403, 'models:manage is super-only')

  const jobId = randomUUID()
  await query(
    `INSERT INTO system_jobs (job_id, kind, state, detail) VALUES ($1,'e2e_probe','queued','{}')`,
    [jobId],
  )
  assert.equal((await call('POST', `/api/admin/system/jobs/${jobId}/cancel`, superA, { reason: 'e2e cancellation' })).status, 200)
  assert.equal((await call('POST', `/api/admin/system/jobs/${jobId}/cancel`, superA, { reason: 'twice' })).status, 409, 'only queued jobs cancel')

  // ── Cleanup ────────────────────────────────────────────────────────────────
  await query(`DELETE FROM content_posts WHERE slug LIKE 'p5-%'`)
  await query(`DELETE FROM job_applications WHERE job_slug = $1`, [roleSlug])
  await query(`DELETE FROM content_jobs WHERE slug = $1`, [roleSlug])
  await query(`DELETE FROM feature_flag_changes WHERE requested_by IN (SELECT admin_id FROM admin_users WHERE email LIKE 'p5db-%')`)
  await query(`DELETE FROM model_registry WHERE deployment LIKE 'p5-test-%'`)
  await query(`DELETE FROM system_jobs WHERE job_id = $1`, [jobId])
  await query(`DELETE FROM admin_users WHERE email LIKE 'p5db-%'`)
})
