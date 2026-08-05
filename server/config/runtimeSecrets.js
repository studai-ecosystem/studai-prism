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
  'AWS_SECRETS_MANAGER_SECRET_IDS',
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

// Charter §4.2 (SECRET-SPLIT-DESIGN.md loader contract): the runtime can load
// EITHER the legacy monolithic secret (AWS_SECRETS_MANAGER_SECRET_ID) OR an
// ordered comma-separated list of category secrets
// (AWS_SECRETS_MANAGER_SECRET_IDS). The list wins when both are set so the
// cutover is a single env change and instantly reversible.
function secretIdsFor(env) {
  const list = String(env.AWS_SECRETS_MANAGER_SECRET_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (list.length > 0) {
    const seen = new Set()
    for (const id of list) {
      if (seen.has(id)) {
        throw new RuntimeSecretsError(
          'SECRETS_MANAGER_DUPLICATE_SECRET_ID',
          `AWS_SECRETS_MANAGER_SECRET_IDS lists secret ${id} more than once.`,
        )
      }
      seen.add(id)
    }
    return list
  }
  const single = String(env.AWS_SECRETS_MANAGER_SECRET_ID || '').trim()
  return single ? [single] : []
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

function validatePayload(payload) {
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
  return keys
}

export async function loadRuntimeSecrets({ env = process.env, client = null } = {}) {
  const secretIds = secretIdsFor(env)
  if (secretIds.length === 0) {
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

  // Fetch and validate EVERY secret before applying ANY key: a bad payload in
  // one category must not leave the environment partially hydrated.
  const merged = {}
  const ownerOf = new Map() // key → secretId that first defined it
  const perSecret = []
  for (const secretId of secretIds) {
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
    const payload = parseSecretString(response.SecretString)
    const keys = validatePayload(payload)
    for (const key of keys) {
      // §4.2 loader contract: a key defined by more than one secret is a
      // configuration ERROR — refuse to boot rather than silently override.
      if (ownerOf.has(key)) {
        throw new RuntimeSecretsError(
          'SECRETS_MANAGER_DUPLICATE_KEY',
          `Runtime secret key ${key} is defined by both ${ownerOf.get(key)} and ${secretId}.`,
        )
      }
      ownerOf.set(key, secretId)
      merged[key] = payload[key]
    }
    perSecret.push({ secretId, keyCount: keys.length, versionId: response.VersionId || null })
  }

  for (const key of Object.keys(merged)) env[key] = String(merged[key])

  if (perSecret.length === 1) {
    // Legacy single-secret status shape, unchanged for existing callers/logs.
    return { enabled: true, keyCount: perSecret[0].keyCount, versionId: perSecret[0].versionId }
  }
  return {
    enabled: true,
    keyCount: ownerOf.size,
    versionId: null,
    secrets: perSecret,
  }
}

export { BOOTSTRAP_KEYS }