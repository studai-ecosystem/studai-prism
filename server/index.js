import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load .env from the server/ directory regardless of where node is invoked from
config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') })

import express from 'express'
import cors from 'cors'
import { existsSync } from 'fs'
import logger, { requestLogger } from './lib/logger.js'
import paymentRouter from './routes/payment.js'
import assessmentRouter from './routes/assessment.js'
import authRouter from './routes/auth.js'
import deviceRouter from './routes/device.js'
import contentRouter from './routes/content.js'
import { attachProctorSocket } from './lib/proctorSocket.js'

const app = express()
const PORT = process.env.PORT || 3001

// Built frontend (vite build output). When present, this server serves the SPA
// too — single-origin deployment (Azure App Service, Render, etc.).
const DIST_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const SERVE_FRONTEND = existsSync(join(DIST_DIR, 'index.html'))

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  // Single-origin in production (frontend served by this server) — same-origin
  // requests don't need CORS, so the dev default only matters locally.
  origin: process.env.CORS_ORIGIN || (SERVE_FRONTEND ? true : 'http://localhost:5173'),
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

// Structured request logging (adds x-request-id + logs each http_request).
app.use(requestLogger)

// Global JSON body parser. The /api/assessment/send-report route carries a large
// base64 PDF and uses its OWN 12mb parser, so we skip the global 2mb parser for
// that path (otherwise it 500s with PayloadTooLargeError before the route runs).
const globalJson = express.json({ limit: '2mb' })
app.use((req, res, next) => {
  if (req.path === '/api/assessment/send-report') return next()
  return globalJson(req, res, next)
})

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter)
app.use('/api/payment', paymentRouter)
app.use('/api/assessment', assessmentRouter)
app.use('/api/device', deviceRouter)
app.use('/api/content', contentRouter)

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

// ── Static frontend (production single-origin deploys) ──────────────────────
if (SERVE_FRONTEND) {
  app.use(express.static(DIST_DIR))
  // SPA fallback: any non-API GET serves index.html so client-side routes
  // (/briefing, /m/:pairCode, /verify/:id, ...) survive hard refreshes.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/proctor-socket')) return next()
    res.sendFile(join(DIST_DIR, 'index.html'))
  })
  logger.info('serving_frontend', { dir: DIST_DIR })
}

// ── 404 catch-all ────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.captureException(err, { msg: 'unhandled_error' })
  res.status(500).json({ error: 'Internal server error' })
})

const server = app.listen(PORT, () => {
  logger.info('server_listening', { url: `http://localhost:${PORT}` })
})

// Attach the phone-proctor signalling socket (degrades gracefully if socket.io
// isn't installed).
attachProctorSocket(server)
  .then((io) => { if (io) logger.info('proctor_socket_ready', { path: '/proctor-socket' }) })
  .catch((err) => logger.captureException(err, { msg: 'proctor_socket_failed' }))

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
