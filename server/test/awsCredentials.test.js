import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AzureFederationError,
  createAzureFederatedCredentials,
} from '../config/awsCredentials.js'

const FEDERATED_ENV = {
  AWS_AZURE_FEDERATED_ROLE_ARN: 'arn:aws:iam::123456789012:role/prism-runtime',
  AWS_AZURE_FEDERATED_AUDIENCE: 'api://prism-runtime',
  AWS_SECRETS_MANAGER_REGION: 'ap-south-1',
  IDENTITY_ENDPOINT: 'https://identity.example/token',
  IDENTITY_HEADER: 'opaque-platform-header',
}

test('Azure managed identity exchanges once and caches temporary AWS credentials', async () => {
  let identityCalls = 0
  let stsCalls = 0
  const provider = createAzureFederatedCredentials({
    env: { ...FEDERATED_ENV },
    now: () => Date.parse('2026-07-17T10:00:00Z'),
    fetchFn: async (url, options) => {
      identityCalls += 1
      assert.equal(url.searchParams.get('resource'), 'api://prism-runtime')
      assert.equal(options.headers['X-IDENTITY-HEADER'], 'opaque-platform-header')
      return {
        ok: true,
        async json() { return { access_token: 'azure-managed-identity-token' } },
      }
    },
    stsClient: {
      async send(command) {
        stsCalls += 1
        assert.equal(command.input.RoleArn, FEDERATED_ENV.AWS_AZURE_FEDERATED_ROLE_ARN)
        assert.equal(command.input.WebIdentityToken, 'azure-managed-identity-token')
        return {
          Credentials: {
            AccessKeyId: 'temporary-access-key',
            SecretAccessKey: 'temporary-secret-key',
            SessionToken: 'temporary-session-token',
            Expiration: new Date('2026-07-17T11:00:00Z'),
          },
        }
      },
    },
  })

  const first = await provider()
  const second = await provider()
  assert.equal(first, second)
  assert.equal(first.expiration.toISOString(), '2026-07-17T11:00:00.000Z')
  assert.equal(identityCalls, 1)
  assert.equal(stsCalls, 1)
})

test('Azure federation is optional when the default AWS chain is used', () => {
  assert.equal(createAzureFederatedCredentials({ env: {} }), null)
})

test('Azure federation fails without the App Service identity endpoint', async () => {
  const provider = createAzureFederatedCredentials({
    env: {
      AWS_AZURE_FEDERATED_ROLE_ARN: FEDERATED_ENV.AWS_AZURE_FEDERATED_ROLE_ARN,
      AWS_AZURE_FEDERATED_AUDIENCE: FEDERATED_ENV.AWS_AZURE_FEDERATED_AUDIENCE,
    },
  })
  await assert.rejects(
    provider(),
    (error) => error instanceof AzureFederationError &&
      error.code === 'AZURE_MANAGED_IDENTITY_UNAVAILABLE',
  )
})

test('Azure federation requires role and audience together', () => {
  assert.throws(
    () => createAzureFederatedCredentials({
      env: { AWS_AZURE_FEDERATED_ROLE_ARN: FEDERATED_ENV.AWS_AZURE_FEDERATED_ROLE_ARN },
    }),
    (error) => error instanceof AzureFederationError &&
      error.code === 'AWS_AZURE_FEDERATION_INCOMPLETE',
  )
})