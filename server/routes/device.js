import { Router } from 'express'
import os from 'os'
import { randomBytes } from 'crypto'
import logger from '../lib/logger.js'
import { recordDeviceLink, getDeviceLink, getSession, getEntitlement, getReport } from '../lib/store.js'
import { authenticate } from '../domain/auth/requireUser.js'
import { legacySessionOwnerFrom } from '../lib/legacyOwnerLock.js'
import { PAIR_CODE_ALPHABET as ALPHABET, PAIR_CODE_LENGTH } from '../lib/pairCodes.js'

const router = Router()
const sessionOwner = legacySessionOwnerFrom({ getSession, getEntitlement, getReport })

// Generate a short, human-friendly pairing code (no ambiguous chars).
function makePairCode(len = PAIR_CODE_LENGTH) {
  const bytes = randomBytes(len)
  let code = ''
  for (let i = 0; i < len; i++) code += ALPHABET[bytes[i] % ALPHABET.length]
  return code
}

// Best-effort discovery of the machine's LAN IPv4 addresses so the desktop can
// build a phone-reachable URL on the local network.
function lanAddresses() {
  const out = []
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address)
    }
  }
  return out
}

// ── POST /api/device/pair ─────────────────────────────────────────────────────
// Create a pairing code for a session. The desktop renders this as a QR code
// pointing at /m/:pairCode so a phone can join the proctoring room.
// PROD-READY Phase 1S (N4): only the signed-in owner of an existing session
// gets a code (same 404 for signed out, another account or unknown session).
// A session without a recorded owner exists only on the anonymous development
// path and is refused in production.
router.post('/pair', async (req, res) => {
  const { sessionId } = req.body || {}
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 128) return res.status(400).json({ error: 'sessionId is required.' })
  try {
    const { user } = await authenticate(req)
    const { exists, owner } = await sessionOwner(sessionId)
    const allowed = Boolean(user) && exists && (owner ? owner === String(user.id) : process.env.NODE_ENV !== 'production')
    if (!allowed) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' })
    const pairCode = makePairCode()
    await recordDeviceLink(pairCode, { sessionId, status: 'pending' })
    res.json({ pairCode, status: 'pending' })
  } catch (err) {
    logger.captureException(err, { msg: 'device_pair_create_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Could not create a pairing code.' })
  }
})

// ── GET /api/device/pair/:pairCode ────────────────────────────────────────────
router.get('/pair/:pairCode', async (req, res) => {
  const link = await getDeviceLink(req.params.pairCode)
  if (!link) return res.status(404).json({ error: 'Unknown pairing code.' })
  res.json({ pairCode: link.pairCode, status: link.status, updatedAt: link.updatedAt })
})

// ── GET /api/device/network-info ──────────────────────────────────────────────
// Returns LAN IPs + the dev front-end port so the desktop can build a phone URL
// that resolves on the same network (e.g. http://192.168.1.20:5173/m/ABC123).
// Development only (Phase 1S, N14): production does not disclose the host's
// network addresses; the page then uses its own origin.
router.get('/network-info', (_req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'Not found' })
  res.json({
    addresses: lanAddresses(),
    frontendPort: Number(process.env.FRONTEND_PORT || 5173),
    publicBaseUrl: process.env.PUBLIC_BASE_URL || null,
  })
})

export default router
