import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prism-eco-test-'))
process.env.JWT_SECRET = 'test-secret-for-ecosystem-suite'
process.env.ECOSYSTEM_SECRET = 'test-secret-for-ecosystem-suite'

const { buildApp } = await import('../app.js')

const app = buildApp()
const server = app.listen(0)
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`
test.after(() => server.close())

test('ecosystem aligned-jobs returns curated opportunities with target constructs', async () => {
  const resp = await fetch(`${base}/api/ecosystem/aligned-jobs`)
  assert.equal(resp.status, 200)

  const data = await resp.json()
  assert.equal(data.status, 'ok')
  assert.ok(Array.isArray(data.jobs))
  assert.ok(data.jobs.length > 0)

  const firstJob = data.jobs[0]
  assert.ok(firstJob.job_ref)
  assert.ok(firstJob.title)
  assert.ok(firstJob.salary_range.min > 0)
  assert.ok(Array.isArray(firstJob.target_constructs))
})

test('ecosystem handover endpoint mints single-use 60s authorization code without browser tokens in URLs', async () => {
  const resp = await fetch(`${base}/api/ecosystem/handover-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      destination: 'hire',
      targetJobRef: 'job_test_123',
      sessionId: 'sess_test_456',
      credentialId: 'cred_test_789',
    }),
  })

  assert.equal(resp.status, 200)
  const data = await resp.json()
  assert.equal(data.status, 'ok')
  assert.ok(data.code, 'Must return authorization code')
  assert.ok(data.code.startsWith('eco_auth_'), 'Code must have standard eco_auth_ prefix')
  assert.equal(data.expires_in, 60, 'Authorization code TTL must be 60 seconds')

  // Hardened security assertion: Candidate browser URL must NEVER carry tokens in query parameters
  assert.ok(!data.redirect_url.includes('token='), 'Browser redirect URL must NOT contain token parameter')
  assert.ok(data.redirect_url.includes('code='), 'Browser redirect URL must contain one-time code parameter')
  assert.ok(data.redirect_url.includes('target_job=job_test_123'), 'Browser redirect URL must carry target job reference')
})
