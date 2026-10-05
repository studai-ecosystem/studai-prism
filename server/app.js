// Express app assembly — extracted from index.js so tests can build the full
// app (all middleware + routes) without binding a port or attaching sockets.
// Remediation Phase 2 (audit C7/C21): helmet security headers, CORS allowlist,
// and per-endpoint rate limiting live here.

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { existsSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import logger, { requestLogger } from './lib/logger.js'
import paymentRouter from './routes/payment.js'
import assessmentRouter from './routes/assessment.js'
import {
  createLegacyReportGuard, sessionOwnerFrom,
  createCampusSessionLock, createCampusReportGate, campusSessionStatusFrom, CAMPUS_LOCKED_BODY_ROUTES, CAMPUS_LOCKED_PARAM_ROUTES,
} from './lib/legacyReportGuard.js'
import { createDefaultCampusContext } from './domain/campusStore/defaultContext.js'
import { getSession as storeGetSession, getReport as storeGetReport } from './lib/store.js'
import authRouter from './routes/auth.js'
import deviceRouter from './routes/device.js'
import contentRouter from './routes/content.js'
import psychometricsRouter from './routes/psychometrics.js'
import studiesRouter from './routes/studies.js'
import validationRouter from './routes/validation.js'
import credentialsRouter from './routes/credentials.js'
import replayRouter from './routes/replay.js'
import teamfitRouter from './routes/teamfit.js'
import pilotRouter from './routes/pilot.js'
import evidenceRouter from './routes/evidence.js'
import adminRouter from './routes/admin/index.js'
import ecosystemRouter from './routes/ecosystem.js'
import catalogRouter from './routes/catalog.js'
import wellKnownRouter from './routes/wellKnown.js'
import jobFamiliesRouter from './routes/jobFamilies.js'
import missionsRouter from './routes/missions.js'
import { createV1Router, v1ErrorHandler } from './routes/v1/index.js'
import { checkModelDriftAtBoot } from './lib/modelDrift.js'
import {
  isProduction,
  apiLimiter,
  authLimiter,
  transcribeLimiter,
  eventLimiter,
  sendReportLimiter,
} from './lib/security.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function buildApp(v1Deps = {}) {
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
                // Production keeps helmet's upgrade-insecure-requests. Local
                // http servers (dev, the e2e audit server) drop it: WebKit
                // otherwise rewrites every asset on 127.0.0.1 to https and the
                // page never loads.
                'upgrade-insecure-requests': isProduction() ? [] : null,
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
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Prism-Workspace', 'X-Request-Id', 'Idempotency-Key', 'If-Match'],
      exposedHeaders: ['X-Request-Id', 'ETag'],
    }),
  )

  // Structured request logging (adds x-request-id + logs each http_request).
  app.use(requestLogger)

  // Broad API rate-limit safety net + targeted limits on abuse-prone endpoints
  // (C7). Order matters: specific limiters run before the routers.
  app.use('/api/', apiLimiter)
  app.use(['/api/auth/login', '/api/auth/register', '/api/auth/change-password'], authLimiter)
  app.use('/api/assessment/transcribe', transcribeLimiter)
  app.use('/api/assessment/event', eventLimiter)
  app.use('/api/assessment/send-report', sendReportLimiter)

  // Global JSON body parser. The /api/assessment/send-report route carries a large
  // base64 PDF and uses its OWN 12mb parser, so we skip the global 2mb parser for
  // that path (otherwise it 500s with PayloadTooLargeError before the route runs).
  const globalJson = express.json({ limit: '2mb' })
  app.use((req, res, next) => {
    if (req.path === '/api/assessment/send-report') return next()
    // The payment webhook verifies an HMAC over the RAW body (its own parser).
    if (req.path === '/api/payment/webhook') return next()
    return globalJson(req, res, next)
  })

  // ── Routes ───────────────────────────────────────────────────────────────
  app.use('/api/auth', authRouter)
  app.use('/api/payment', paymentRouter)
  // The legacy report JSON routes check no identity; only the session owner
  // may read them (Campus Phase 12, S7). The legacy router is unchanged.
  const campus = v1Deps.campus || createDefaultCampusContext()
  app.locals.campus = campus
  const ownerOf = sessionOwnerFrom({ getSession: storeGetSession, getReport: storeGetReport })
  app.get(
    ['/api/assessment/report/:sessionId', '/api/assessment/report/:sessionId/v2', '/api/assessment/report/:sessionId/employee'],
    createLegacyReportGuard({ ownerOf }),
  )
  // Sessions whose id campus staff can know (V3/sponsored, or shared) are
  // closed on the other legacy session routes (Campus Phase 12, S9).
  const classify = campusSessionStatusFrom({ repos: () => (campus.storeAvailable() ? campus.repos : null), ownerOf })
  const campusSessionLock = createCampusSessionLock({ classify })
  app.post(CAMPUS_LOCKED_BODY_ROUTES, campusSessionLock)
  app.all(CAMPUS_LOCKED_PARAM_ROUTES, campusSessionLock)
  app.get('/api/assessment/report/:sessionId', createCampusReportGate({ classify, ownerOf }))
  app.use('/api/assessment', assessmentRouter)
  app.use('/api/device', deviceRouter)
  app.use('/api/content', contentRouter)
  // Prism v2 (MASA-2) Phase 3: read-only psychometrics dashboard (admin-guarded
  // via ADMIN_TOKEN header check inside the router; 503 when unset).
  app.use('/api/psychometrics', psychometricsRouter)
  // Track 6: study runner (admin + rater planes, both guarded in-router).
  app.use('/api/studies', studiesRouter)
  // Campus Phase 12: V3 evidence double-rating, rater plane (dark: PRISM_V3_RATING_QUEUE).
  app.use('/api/validation', validationRouter)
  // Track 2: glass-box credentials (public verify plane + admin lifecycle).
  app.use('/api/credentials', credentialsRouter)
  // Track 5 (both dark; 404 without their flags): practice replay + team-fit.
  app.use('/api/replay', replayRouter)
  app.use('/api/teamfit', teamfitRouter)
  // Phase 3 Stage 1: pilot instrument panel (admin-gated; read-only).
  app.use('/api/pilot', pilotRouter)
  // Phase 3 Stage 4.3: public evidence surfaces (registry-rendered, ceiling-safe).
  app.use('/api/evidence', evidenceRouter)
  // Super Admin & Product Control Centre (dark: 404 unless PRISM_ADMIN_CONSOLE=true).
  // Database-backed admin identities + MFA + RBAC; audited mutations only.
  app.use('/api/admin', adminRouter)
  // StudAI Talent Ecosystem: aligned jobs, dynamic assessment catalog & JWKS
  app.use('/api/ecosystem', ecosystemRouter)
  app.use('/api/assessments/catalog', catalogRouter)
  app.use('/api/catalog', catalogRouter)
  app.use('/api/job-families', jobFamiliesRouter)
  app.use('/api/missions', missionsRouter)
  app.use('/.well-known', wellKnownRouter)
  // Prism Campus V1: versioned API with the standard envelope. Every campus
  // surface under it is dark behind its PRISM_* flag (default OFF).
  app.use('/api/v1', createV1Router({ ...v1Deps, campus }))
  // Phase 3 Stage 6.1: surface judge-model drift loudly at boot.
  checkModelDriftAtBoot()

  // ── Health check ─────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

  // ── Static frontend (production single-origin deploys) ──────────────────
  if (SERVE_FRONTEND) {
    // The e2e audit server only: drop Google Fonts from the HTML shell. Firefox
    // waits for those stylesheets before the document load event, and a stalled
    // CDN holds page.goto for the whole test timeout. Production HTML is unchanged.
    if (process.env.PRISM_AUDIT_E2E === 'true') {
      const auditHtml = readFileSync(join(DIST_DIR, 'index.html'), 'utf8')
        .replace(/<link\b[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>/gi, '')
      app.use((req, res, next) => {
        if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/assets/') || req.path.includes('.')) return next()
        res.setHeader('Cache-Control', 'no-cache')
        res.type('html').send(auditHtml)
      })
    }
    app.use(express.static(DIST_DIR, {
      setHeaders: (res, filePath) => {
        // Vite content-hashes everything under /assets — safe to cache forever.
        // The HTML shell, service worker and manifest must always revalidate
        // or clients keep painting a stale bundle after a deploy.
        if (/[\\/]assets[\\/]/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        } else if (/(?:index\.html|sw\.js|manifest\.webmanifest)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'no-cache')
        }
      },
    }))
    // SPA fallback: any non-API GET serves index.html so client-side routes
    // (/briefing, /m/:pairCode, /verify/:id, ...) survive hard refreshes.
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/proctor-socket')) return next()
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(join(DIST_DIR, 'index.html'))
    })
    logger.info('serving_frontend', { dir: DIST_DIR })
  }

  // ── 404 catch-all ────────────────────────────────────────────────────────
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

  // ── Global error handler ─────────────────────────────────────────────────
  // Errors raised before the v1 router (e.g. malformed JSON) keep the v1 envelope.
  app.use('/api/v1', v1ErrorHandler)
  app.use((err, _req, res, _next) => {
    logger.captureException(err, { msg: 'unhandled_error' })
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
