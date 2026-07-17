import {
  AssumeRoleWithWebIdentityCommand,
  STSClient,
} from '@aws-sdk/client-sts'

const REFRESH_WINDOW_MS = 5 * 60 * 1000
let sharedProvider = null
let sharedProviderKey = null

export class AzureFederationError extends Error {
  constructor(code, message, cause = null) {
    super(message, cause ? { cause } : undefined)
    this.name = 'AzureFederationError'
    this.code = code
  }
}

function federationConfig(env) {
  const roleArn = String(env.AWS_AZURE_FEDERATED_ROLE_ARN || '').trim()
  const audience = String(env.AWS_AZURE_FEDERATED_AUDIENCE || '').trim()
  if (!roleArn && !audience) return null
  if (!roleArn || !audience) {
    throw new AzureFederationError(
      'AWS_AZURE_FEDERATION_INCOMPLETE',
      'AWS_AZURE_FEDERATED_ROLE_ARN and AWS_AZURE_FEDERATED_AUDIENCE must be configured together.',
    )
  }
  return {
    roleArn,
    audience,
    region: String(
      env.AWS_REGION || env.AWS_SECRETS_MANAGER_REGION || env.AWS_DEFAULT_REGION || 'ap-south-1',
    ),
    sessionName: String(env.AWS_AZURE_ROLE_SESSION_NAME || 'studai-prism-appservice')
      .replace(/[^A-Za-z0-9+=,.@_-]/g, '-')
      .slice(0, 64),
  }
}

async function managedIdentityToken({ env, audience, fetchFn }) {
  const endpoint = String(env.IDENTITY_ENDPOINT || '').trim()
  const identityHeader = String(env.IDENTITY_HEADER || '').trim()
  if (!endpoint || !identityHeader) {
    throw new AzureFederationError(
      'AZURE_MANAGED_IDENTITY_UNAVAILABLE',
      'Azure App Service managed identity endpoint is unavailable.',
    )
  }

  const url = new URL(endpoint)
  url.searchParams.set('api-version', '2019-08-01')
  url.searchParams.set('resource', audience)

  let response
  try {
    response = await fetchFn(url, {
      headers: {
        'X-IDENTITY-HEADER': identityHeader,
        Metadata: 'true',
      },
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    throw new AzureFederationError(
      'AZURE_MANAGED_IDENTITY_FETCH_FAILED',
      `Azure managed identity request failed (${error?.name || 'unknown'}).`,
      error,
    )
  }
  if (!response.ok) {
    throw new AzureFederationError(
      'AZURE_MANAGED_IDENTITY_REJECTED',
      `Azure managed identity request returned HTTP ${response.status}.`,
    )
  }

  const payload = await response.json()
  if (!payload?.access_token) {
    throw new AzureFederationError(
      'AZURE_MANAGED_IDENTITY_TOKEN_MISSING',
      'Azure managed identity response did not include an access token.',
    )
  }
  return payload.access_token
}

export function createAzureFederatedCredentials({
  env = process.env,
  fetchFn = globalThis.fetch,
  stsClient = null,
  now = () => Date.now(),
} = {}) {
  const settings = federationConfig(env)
  if (!settings) return null
  const client = stsClient || new STSClient({ region: settings.region })
  let cached = null

  return async () => {
    if (cached?.expiration?.getTime() - now() > REFRESH_WINDOW_MS) return cached

    const webIdentityToken = await managedIdentityToken({
      env,
      audience: settings.audience,
      fetchFn,
    })
    let response
    try {
      response = await client.send(new AssumeRoleWithWebIdentityCommand({
        RoleArn: settings.roleArn,
        RoleSessionName: settings.sessionName,
        WebIdentityToken: webIdentityToken,
        DurationSeconds: 3600,
      }))
    } catch (error) {
      throw new AzureFederationError(
        'AWS_ROLE_EXCHANGE_FAILED',
        `AWS role exchange failed (${error?.name || 'unknown'}).`,
        error,
      )
    }

    const credentials = response?.Credentials
    if (!credentials?.AccessKeyId || !credentials?.SecretAccessKey ||
        !credentials?.SessionToken || !credentials?.Expiration) {
      throw new AzureFederationError(
        'AWS_ROLE_CREDENTIALS_INVALID',
        'AWS STS returned an incomplete temporary credential set.',
      )
    }
    cached = {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
      expiration: new Date(credentials.Expiration),
    }
    return cached
  }
}

export function awsClientConfig({ env = process.env, region, maxAttempts } = {}) {
  const settings = federationConfig(env)
  const config = {
    region: region || settings?.region,
    ...(maxAttempts ? { maxAttempts } : {}),
  }
  if (!settings) return config

  const providerKey = `${settings.roleArn}\n${settings.audience}\n${settings.region}`
  if (!sharedProvider || sharedProviderKey !== providerKey) {
    sharedProvider = createAzureFederatedCredentials({ env })
    sharedProviderKey = providerKey
  }
  return { ...config, credentials: sharedProvider }
}