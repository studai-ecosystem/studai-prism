import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { loadRuntimeSecrets } from './config/runtimeSecrets.js'

// Load .env from the server/ directory regardless of where node is invoked from
config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') })

async function start() {
  let secretStatus
  try {
    secretStatus = await loadRuntimeSecrets()
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      msg: 'runtime_secrets_load_failed',
      code: error?.code || error?.name || 'unknown',
    }))
    process.exit(1)
  }
  const { default: logger } = await import('./lib/logger.js')
  const { assertProductionSecrets } = await import('./lib/security.js')

  if (secretStatus.enabled) {
    logger.info('runtime_secrets_loaded', {
      provider: 'aws-secrets-manager',
      keyCount: secretStatus.keyCount,
      versionId: secretStatus.versionId,
    })
  }

  // Hard startup gate (audit C8): a production instance without JWT_SECRET must
  // NOT come up — a warning log is not an acceptable failure mode for a
  // well-known signing secret.
  try {
    assertProductionSecrets()
  } catch (err) {
    logger.error('startup_check_failed', { detail: err.message })
    process.exit(1)
  }

  const [{ buildApp }, { attachProctorSocket }] = await Promise.all([
    import('./app.js'),
    import('./lib/proctorSocket.js'),
  ])

  const PORT = process.env.PORT || 3001
  const app = buildApp()

  const server = app.listen(PORT, () => {
    logger.info('server_listening', { url: `http://localhost:${PORT}` })
  })

  // Attach the phone-proctor signalling socket (degrades gracefully if socket.io
  // isn't installed).
  attachProctorSocket(server)
    .then((io) => { if (io) logger.info('proctor_socket_ready', { path: '/proctor-socket' }) })
    .catch((err) => logger.captureException(err, { msg: 'proctor_socket_failed' }))

  // Control Centre Phase 3: OPTIONAL prompt-registry runtime (default OFF —
  // prompts stay file-based). When PRISM_ADMIN_PROMPT_REGISTRY=true, prime the
  // engine prompt cache from the database's production versions at boot.
  import('./lib/promptRegistry.js')
    .then(({ primePromptRegistry }) => primePromptRegistry())
    .then((r) => { if (r?.enabled) logger.info('prompt_registry_runtime', r) })
    .catch((err) => logger.captureException(err, { msg: 'prompt_registry_prime_failed' }))

  // Prism v2 (MASA-2) Phase 0: when telemetry is enabled (PRISM_V2_TELEMETRY +
  // DATABASE_URL), idempotently backfill the item bank so per-turn item_responses
  // can link to a probe item. No-op otherwise — v1 boots unchanged. Never fatal.
  import('./lib/telemetry.js')
    .then(({ isTelemetryEnabled }) => {
      if (!isTelemetryEnabled()) return
      return import('./db/seedItems.js')
        .then(({ seedItems }) =>
          seedItems().then(({ inserted, total }) =>
            logger.info('v2_items_seeded', { inserted, total }),
          ),
        )
        .then(() => import('./lib/studies.js'))
        .then(({ seedStudies, seedTrainingRefs }) =>
          Promise.all([seedStudies(), seedTrainingRefs()]).then(([st, tr]) =>
            logger.info('studies_seeded', { studies: st, trainingRefs: tr }),
          ),
        )
    })
    .catch((err) => logger.captureException(err, { msg: 'v2_seed_items_failed' }))

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error('port_in_use', {
        port: PORT,
        detail: 'Another instance is running. Stop it (or set PORT to a free port) and try again.',
      })
      process.exit(1)
    }
    throw err
  })
}

start().catch((error) => {
  console.error(JSON.stringify({
    level: 'error',
    msg: 'server_start_failed',
    code: error?.code || error?.name || 'unknown',
  }))
  process.exit(1)
})
