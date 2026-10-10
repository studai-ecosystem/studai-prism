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
  const { installProcessHandlers, createGracefulShutdown, shutdownTimeoutMs } = await import('./lib/gracefulShutdown.js')
  // Phase 1S (N10): log unhandled rejections instead of crashing; exit on an
  // uncaught exception so the orchestrator restarts a process in a known state.
  installProcessHandlers({ logger })

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
    // Phase 1S (N3): a purchasable paid offer needs the Razorpay secrets.
    const { assertPaymentConfiguration } = await import('./lib/security.js')
    const { anyPaidOfferPurchasable } = await import('./domain/commerce/index.js')
    assertPaymentConfiguration({ paidOfferEnabled: anyPaidOfferPurchasable() })
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
  const { startEvaluationWorker } = await import('./domain/assessments/evaluationWorker.js')
  const campus = app.locals.campus
  const worker = startEvaluationWorker({
    sessions: campus.sessions,
    available: () => Boolean(campus.sessions && campus.storeAvailable()),
    onError: (error) => logger.error('assessment_worker_failed', { code: error.code || 'WORKER_FAILED' }),
  })
  server.once('close', () => { void worker.stop() })

  // Behind a load balancer: keep-alive must OUTLIVE the LB idle timeout (ALB
  // default 60s) or the LB reuses a socket the app just closed → intermittent
  // 502s. Long scoring requests must not be cut by Node's own header/request
  // timers either — /evaluate's fast-path + poll design keeps individual
  // responses short, but these guards make the server honest regardless.
  server.keepAliveTimeout = 185000
  server.headersTimeout = 190000
  server.requestTimeout = 0

  // Attach the phone-proctor signalling socket (degrades gracefully if socket.io
  // isn't installed).
  let proctorIo = null
  attachProctorSocket(server)
    .then((io) => { proctorIo = io; if (io) logger.info('proctor_socket_ready', { path: '/proctor-socket' }) })
    .catch((err) => logger.captureException(err, { msg: 'proctor_socket_failed' }))

  // Phase 1S (N11): graceful shutdown on SIGTERM/SIGINT — stop accepting,
  // report "draining" on /api/ready, close the proctor socket, let in-flight
  // requests finish within PRISM_SHUTDOWN_TIMEOUT_MS, then close the worker
  // and the PostgreSQL pools.
  const { closePool } = await import('./db/pool.js')
  const shutdown = createGracefulShutdown({
    server,
    getIo: () => proctorIo,
    onDrain: () => { app.locals.draining = true },
    cleanups: [() => worker.stop(), () => closePool()],
    logger,
    timeoutMs: shutdownTimeoutMs(),
  })
  process.once('SIGTERM', () => { void shutdown('SIGTERM') })
  process.once('SIGINT', () => { void shutdown('SIGINT') })

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

  // Charter §16 (PRISM_RETENTION_ENFORCEMENT, default OFF): the scheduled
  // retention-enforcement job. Dark = nothing auto-deletes; dry-runs and
  // deliberate audited runs remain available through the privacy plane.
  import('./lib/retentionEnforcement.js')
    .then(({ startRetentionScheduler }) => {
      if (startRetentionScheduler()) logger.info('retention_scheduler_active')
    })
    .catch((err) => logger.captureException(err, { msg: 'retention_scheduler_failed' }))

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
