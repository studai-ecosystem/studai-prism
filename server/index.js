import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load .env from the server/ directory regardless of where node is invoked from
config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') })

import logger from './lib/logger.js'
import { assertProductionSecrets } from './lib/security.js'
import { buildApp } from './app.js'
import { attachProctorSocket } from './lib/proctorSocket.js'

// Hard startup gate (audit C8): a production instance without JWT_SECRET must
// NOT come up — a warning log is not an acceptable failure mode for a
// well-known signing secret.
try {
  assertProductionSecrets()
} catch (err) {
  logger.error('startup_check_failed', { detail: err.message })
  process.exit(1)
}

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
