// Express app assembly — extracted from index.js so tests can build the full
// app (all middleware + routes) without binding a port or attaching sockets.
// Remediation Phase 2 (audit C7/C21): helmet security headers, CORS allowlist,
// and per-endpoint rate limiting live here.

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import logger, { requestLogger } from './lib/logger.js'
import paymentRouter from './routes/payment.js'
import assessmentRouter from './routes/assessment.js'
import authRouter from './routes/auth.js'
import deviceRouter from './routes/device.js'
import contentRouter from './routes/content.js'
import psychometricsRouter from './routes/psychometrics.js'
import studiesRouter from './routes/studies.js'
import credentialsRouter from './routes/credentials.js'
import {
  isProduction,
  apiLimiter,
  authLimiter,
  transcribeLimiter,
  eventLimiter,
  sendReportLimiter,
} from './lib/security.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function buildApp() {
  const app = express()

  // Azure App Service fronts the container with a single proxy hop — required
  // for req.ip (rate limiting) and req.secure to be correct.
  app.set('trust proxy', 1)

  // Built frontend (vite build output). When present, this server serves the SPA
  // too — single-origin deployment (Azure App Service, Render, etc.).
  const DIST_DIR = join(__dirname, '..', 'dist')
  const SERVE_FRONTEND = existsSync(join(DIST_DIR, 'index.html'))

  // ── Security headers (C21) ─────────────────────────────────────────────────
  // CSP allows exactly the third parties the app uses: Razorpay checkout,
  // Google Fonts, and blob/data URLs for the in-browser PDF/mic/face-model
  // work. PRISM_DISABLE_CSP=true is an operational escape hatch (headers other
  // than CSP stay on) — use only while diagnosing a breakage, never long-term.
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.PRISM_DISABLE_CSP === 'true'
          ? false
          : {
              useDefaults: true,
              directives: {
                // 'wasm-unsafe-eval' is required for the self-hosted tesseract
                // OCR (identity verification) — WebAssembly.compile is blocked
                // without it. It does NOT allow JS eval().
                'script-src': ["'self'", "'wasm-unsafe-eval'", 'https://checkout.razorpay.com'],
                'frame-src': ['https://api.razorpay.com', 'https://checkout.razorpay.com'],
                'connect-src': ["'self'", 'https://api.razorpay.com', 'https://lumberjack.razorpay.com', 'ws:', 'wss:'],
                'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
                'img-src': ["'self'", 'data:', 'blob:', 'https://*.razorpay.com'],
                'media-src': ["'self'", 'blob:', 'data:'],
                'worker-src': ["'self'", 'blob:'],
              },
            },
      // Static avatars/models are fetched cross-origin by the LAN phone page in dev.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
      // Razorpay checkout opens bank-auth/UPI popups that must keep their
      // window.opener — helmet's default COOP (same-origin) severs it and
      // breaks payment completion.
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    }),
  )

  // ── CORS (C21) ─────────────────────────────────────────────────────────────
  // Production is a single-origin deployment (frontend served by this server),
  // so cross-origin browser callers are DENIED unless explicitly allowlisted
  // via CORS_ORIGIN (comma-separated). Dev keeps a permissive policy so the
  // Vite server and LAN phone origins work.
  const allowlist = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean)
  app.use(
    cors({
      origin: allowlist.length ? allowlist : isProduction() ? false : true,
      methods: ['GET', 'POST', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  )

  // Structured request logging (adds x-request-id + logs each http_request).
  app.use(requestLogger)

  // Broad API rate-limit safety net + targeted limits on abuse-prone endpoints
  // (C7). Order matters: specific limiters run before the routers.
  app.use('/api/', apiLimiter)
  app.use(['/api/auth/login', '/api/auth/register'], authLimiter)
  app.use('/api/assessment/transcribe', transcribeLimiter)
  app.use('/api/assessment/event', eventLimiter)
  app.use('/api/assessment/send-report', sendReportLimiter)

  // Global JSON body parser. The /api/assessment/send-report route carries a large
  // base64 PDF and uses its OWN 12mb parser, so we skip the global 2mb parser for
  // that path (otherwise it 500s with PayloadTooLargeError before the route runs).
  const globalJson = express.json({ limit: '2mb' })
  app.use((req, res, next) => {
    if (req.path === '/api/assessment/send-report') return next()
    return globalJson(req, res, next)
  })

  // ── Routes ───────────────────────────────────────────────────────────────
  app.use('/api/auth', authRouter)
  app.use('/api/payment', paymentRouter)
  app.use('/api/assessment', assessmentRouter)
  app.use('/api/device', deviceRouter)
  app.use('/api/content', contentRouter)
  // Prism v2 (MASA-2) Phase 3: read-only psychometrics dashboard (admin-guarded
  // via ADMIN_TOKEN header check inside the router; 503 when unset).
  app.use('/api/psychometrics', psychometricsRouter)
  // Track 6: study runner (admin + rater planes, both guarded in-router).
  app.use('/api/studies', studiesRouter)
  // Track 2: glass-box credentials (public verify plane + admin lifecycle).
  app.use('/api/credentials', credentialsRouter)

  // ── Health check ─────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

  // ── Static frontend (production single-origin deploys) ──────────────────
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

  // ── 404 catch-all ────────────────────────────────────────────────────────
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

  // ── Global error handler ─────────────────────────────────────────────────
  app.use((err, _req, res, _next) => {
    logger.captureException(err, { msg: 'unhandled_error' })
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
