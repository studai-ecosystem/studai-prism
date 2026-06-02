import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load .env from the server/ directory regardless of where node is invoked from
config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') })

import express from 'express'
import cors from 'cors'
import paymentRouter from './routes/payment.js'
import assessmentRouter from './routes/assessment.js'

const app = express()
const PORT = process.env.PORT || 3001

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}))
app.use(express.json({ limit: '2mb' }))

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/payment', paymentRouter)
app.use('/api/assessment', assessmentRouter)

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

// ── 404 catch-all ────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Error]', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`[Prism server] Listening on http://localhost:${PORT}`)
})
