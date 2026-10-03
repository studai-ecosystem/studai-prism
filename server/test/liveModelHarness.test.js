import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('P9.5 Layer C harness fails closed without authorization, credentials, spend and approvals', () => {
  const scrub = [
    'PRISM_LIVE_MODEL_AUTHORIZED', 'AWS_ACCESS_KEY_ID', 'AWS_PROFILE', 'AWS_ROLE_ARN', 'OPENAI_API_KEY', 'PRISM_AI_API_KEY',
    'PRISM_LIVE_MODEL_SPEND_LIMIT_USD', 'PRISM_LIVE_MODEL_DATA_CLASS', 'PRISM_LIVE_MODEL_CONSENT_VERSION',
    'PRISM_LIVE_MODEL_CONTENT_APPROVAL_REF', 'PRISM_LIVE_MODEL_MEASUREMENT_APPROVAL_REF',
    'PRISM_LIVE_MODEL_SECURITY_PRIVACY_APPROVAL_REF', 'PRISM_LIVE_MODEL_TARGET_URL',
  ]
  const env = { ...process.env }
  for (const key of scrub) delete env[key]
  const run = spawnSync(process.execPath, ['scripts/live-model-smoke.mjs'], { cwd: root, env, encoding: 'utf8' })
  assert.equal(run.status, 3)
  assert.equal(run.stderr, '')
  const result = JSON.parse(run.stdout)
  assert.equal(result.status, 'BLOCKED')
  const codes = new Set(result.blockers.map((blocker) => blocker.code))
  for (const code of [
    'NO_OPERATOR_AUTHORIZATION', 'NO_PROVIDER_CREDENTIALS', 'NO_SPEND_LIMIT', 'NO_CONSENT_DATA_CLASS',
    'NO_CONTENT_APPROVAL', 'NO_MEASUREMENT_APPROVAL', 'NO_SECURITY_PRIVACY_APPROVAL', 'NO_TARGET', 'FORM_NOT_APPROVED',
  ]) assert.ok(codes.has(code), code)
  assert.ok(result.liveChecks.every((check) => check.state === 'BLOCKED'))
  assert.equal(result.manifest.form.status, 'DRAFT')
  assert.equal(/transcript|learner answer|api[_-]?key/i.test(JSON.stringify(result.manifest)), false)
})
