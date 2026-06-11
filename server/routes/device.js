import { Router } from 'express'
import os from 'os'
import { randomBytes } from 'crypto'
import logger from '../lib/logger.js'
import { recordDeviceLink, getDeviceLink } from '../lib/store.js'

const router = Router()

// Generate a short, human-friendly pairing code (no ambiguous chars).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function makePairCode(len = 6) {
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
router.post('/pair', async (req, res) => {
  const { sessionId } = req.body || {}
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' })
  try {
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
router.get('/network-info', (_req, res) => {
  res.json({
    addresses: lanAddresses(),
    frontendPort: Number(process.env.FRONTEND_PORT || 5173),
    publicBaseUrl: process.env.PUBLIC_BASE_URL || null,
  })
})

export default router
