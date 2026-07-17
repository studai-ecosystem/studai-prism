import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager'
import { awsClientConfig } from './awsCredentials.js'

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

const BOOTSTRAP_KEYS = new Set([
  'AWS_ACCESS_KEY_ID',
  'AWS_AZURE_FEDERATED_AUDIENCE',
  'AWS_AZURE_FEDERATED_ROLE_ARN',
  'AWS_AZURE_ROLE_SESSION_NAME',
  'AWS_CONTAINER_CREDENTIALS_FULL_URI',
  'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
  'AWS_EC2_METADATA_DISABLED',
  'AWS_PROFILE',
  'AWS_ROLE_ARN',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SECRETS_MANAGER_REGION',
  'AWS_SECRETS_MANAGER_REQUIRED',
  'AWS_SECRETS_MANAGER_SECRET_ID',
  'AWS_SESSION_TOKEN',
  'AWS_WEB_IDENTITY_TOKEN_FILE',
  'IDENTITY_ENDPOINT',
  'IDENTITY_HEADER',
  'IDENTITY_SERVER_THUMBPRINT',
  'MSI_ENDPOINT',
  'MSI_SECRET',
  'NODE_ENV',
  'PORT',
])

export class RuntimeSecretsError extends Error {
  constructor(code, message, cause = null) {
    super(message, cause ? { cause } : undefined)
    this.name = 'RuntimeSecretsError'
    this.code = code
  }
}

function requiredFor(env) {
  return env.NODE_ENV === 'production' || env.AWS_SECRETS_MANAGER_REQUIRED === 'true'
}

function parseSecretString(secretString) {
  if (typeof secretString !== 'string' || !secretString.trim()) {
    throw new RuntimeSecretsError(
      'SECRETS_MANAGER_EMPTY',
      'AWS Secrets Manager returned no SecretString payload.',
    )
  }

  let payload
  try {
    payload = JSON.parse(secretString)
  } catch (error) {
    throw new RuntimeSecretsError(
      'SECRETS_MANAGER_INVALID_JSON',
      'AWS Secrets Manager payload must be a JSON object.',
      error,
    )
  }

  if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
    throw new RuntimeSecretsError(
      'SECRETS_MANAGER_INVALID_PAYLOAD',
      'AWS Secrets Manager payload must be a JSON object.',
    )
  }
  return payload
}

function applyPayload(payload, env) {
  const keys = Object.keys(payload)
  for (const key of keys) {
    if (!ENV_KEY_PATTERN.test(key)) {
      throw new RuntimeSecretsError(
        'SECRETS_MANAGER_INVALID_KEY',
        `AWS Secrets Manager contains an invalid environment key: ${key}.`,
      )
    }
    if (BOOTSTRAP_KEYS.has(key)) {
      throw new RuntimeSecretsError(
        'SECRETS_MANAGER_BOOTSTRAP_KEY',
        `AWS Secrets Manager must not contain bootstrap key ${key}.`,
      )
    }
    const value = payload[key]
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      throw new RuntimeSecretsError(
        'SECRETS_MANAGER_INVALID_VALUE',
        `AWS Secrets Manager value for ${key} must be a string, number, or boolean.`,
      )
    }
  }

  for (const key of keys) env[key] = String(payload[key])
  return keys.length
}

export async function loadRuntimeSecrets({ env = process.env, client = null } = {}) {
  const secretId = String(env.AWS_SECRETS_MANAGER_SECRET_ID || '').trim()
  if (!secretId) {
    if (requiredFor(env)) {
      throw new RuntimeSecretsError(
        'SECRETS_MANAGER_SECRET_ID_MISSING',
        'AWS_SECRETS_MANAGER_SECRET_ID is required in production.',
      )
    }
    return { enabled: false, keyCount: 0, versionId: null }
  }

  const region = String(
    env.AWS_SECRETS_MANAGER_REGION || env.AWS_REGION || env.AWS_DEFAULT_REGION || '',
  ).trim()
  if (!region) {
    throw new RuntimeSecretsError(
      'SECRETS_MANAGER_REGION_MISSING',
      'AWS_SECRETS_MANAGER_REGION is required when loading runtime secrets.',
    )
  }

  const secretsClient = client || new SecretsManagerClient(awsClientConfig({ env, region }))
  let response
  try {
    response = await secretsClient.send(new GetSecretValueCommand({
      SecretId: secretId,
      VersionStage: 'AWSCURRENT',
    }))
  } catch (error) {
    throw new RuntimeSecretsError(
      'SECRETS_MANAGER_FETCH_FAILED',
      `AWS Secrets Manager request failed (${error?.name || 'unknown'}).`,
      error,
    )
  }

  const keyCount = applyPayload(parseSecretString(response.SecretString), env)
  return {
    enabled: true,
    keyCount,
    versionId: response.VersionId || null,
  }
}

export { BOOTSTRAP_KEYS }