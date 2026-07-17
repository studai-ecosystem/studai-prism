import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  loadRuntimeSecrets,
  RuntimeSecretsError,
} from '../config/runtimeSecrets.js'

function fakeClient(response) {
  return {
    async send(command) {
      assert.equal(command.input.SecretId, '/studai/prism/prod/runtime')
      assert.equal(command.input.VersionStage, 'AWSCURRENT')
      return response
    },
  }
}

test('runtime secrets hydrate environment before application modules load', async () => {
  const env = {
    NODE_ENV: 'production',
    AWS_SECRETS_MANAGER_SECRET_ID: '/studai/prism/prod/runtime',
    AWS_SECRETS_MANAGER_REGION: 'ap-south-1',
    JWT_SECRET: 'stale-host-value',
  }
  const status = await loadRuntimeSecrets({
    env,
    client: fakeClient({
      SecretString: JSON.stringify({
        JWT_SECRET: 'secret-manager-value',
        PRISM_V2_TELEMETRY: true,
        BEDROCK_TIMEOUT_MS: 25000,
      }),
      VersionId: 'version-1',
    }),
  })

  assert.equal(env.JWT_SECRET, 'secret-manager-value')
  assert.equal(env.PRISM_V2_TELEMETRY, 'true')
  assert.equal(env.BEDROCK_TIMEOUT_MS, '25000')
  assert.deepEqual(status, { enabled: true, keyCount: 3, versionId: 'version-1' })
})

test('runtime secrets fail closed in production without a secret id', async () => {
  await assert.rejects(
    loadRuntimeSecrets({ env: { NODE_ENV: 'production' } }),
    (error) => error instanceof RuntimeSecretsError &&
      error.code === 'SECRETS_MANAGER_SECRET_ID_MISSING',
  )
})

test('runtime secrets are optional for local development', async () => {
  assert.deepEqual(
    await loadRuntimeSecrets({ env: { NODE_ENV: 'development' } }),
    { enabled: false, keyCount: 0, versionId: null },
  )
})

test('runtime secrets reject AWS bootstrap credentials in the payload', async () => {
  const env = {
    NODE_ENV: 'production',
    AWS_SECRETS_MANAGER_SECRET_ID: '/studai/prism/prod/runtime',
    AWS_SECRETS_MANAGER_REGION: 'ap-south-1',
  }
  await assert.rejects(
    loadRuntimeSecrets({
      env,
      client: fakeClient({
        SecretString: JSON.stringify({ AWS_ACCESS_KEY_ID: 'must-not-be-here' }),
      }),
    }),
    (error) => error instanceof RuntimeSecretsError &&
      error.code === 'SECRETS_MANAGER_BOOTSTRAP_KEY',
  )
  assert.equal(env.AWS_ACCESS_KEY_ID, undefined)
})

test('runtime secrets cannot override process mode or managed-identity bootstrap', async () => {
  for (const reservedKey of ['NODE_ENV', 'PORT', 'IDENTITY_ENDPOINT', 'IDENTITY_HEADER']) {
    const env = {
      NODE_ENV: 'production',
      AWS_SECRETS_MANAGER_SECRET_ID: '/studai/prism/prod/runtime',
      AWS_SECRETS_MANAGER_REGION: 'ap-south-1',
    }
    await assert.rejects(
      loadRuntimeSecrets({
        env,
        client: fakeClient({ SecretString: JSON.stringify({ [reservedKey]: 'override' }) }),
      }),
      (error) => error instanceof RuntimeSecretsError &&
        error.code === 'SECRETS_MANAGER_BOOTSTRAP_KEY',
    )
  }
})

test('runtime secret fetch errors expose only an error category', async () => {
  const env = {
    NODE_ENV: 'production',
    AWS_SECRETS_MANAGER_SECRET_ID: '/studai/prism/prod/runtime',
    AWS_SECRETS_MANAGER_REGION: 'ap-south-1',
  }
  await assert.rejects(
    loadRuntimeSecrets({
      env,
      client: {
        async send() {
          const error = new Error('provider detail must not be copied')
          error.name = 'AccessDeniedException'
          throw error
        },
      },
    }),
    (error) => error instanceof RuntimeSecretsError &&
      error.code === 'SECRETS_MANAGER_FETCH_FAILED' &&
      !error.message.includes('provider detail'),
  )
})

test('server and maintenance commands hydrate secrets before environment consumers', async () => {
  const [indexSource, packageSource] = await Promise.all([
    readFile(new URL('../index.js', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ])
  assert.ok(indexSource.indexOf('await loadRuntimeSecrets()') <
    indexSource.indexOf("await import('./lib/logger.js')"))
  const scripts = JSON.parse(packageSource).scripts
  for (const name of ['migrate', 'seed:items', 'seed:admin']) {
    assert.match(scripts[name], /^node config\/runWithRuntimeSecrets\.js /)
  }
})