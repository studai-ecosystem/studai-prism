// Phone-proctor signalling server (Phase 3).
//
// A laptop (the "desktop" role) and a phone (the "phone" role) join the same
// room keyed by a short pairing code. The phone relays its rear-camera frames
// and heartbeats to the desktop through this room. Frames are relayed in-memory
// only — they are NEVER written to disk. We persist just the link STATUS so the
// system check and proctoring can confirm a phone is connected.
//
// socket.io is loaded lazily so the app still boots if it isn't installed (the
// phone-link step then degrades to "skip", like the server STT fallback).
//
// PROD-READY Phase 1S (audit 2026-10-10, N4): the handshake is checked before
// a socket joins a room.
//  - The pairing code must have been issued by POST /api/device/pair and be
//    unexpired; unknown codes are refused and never create a device-link row.
//  - The desktop must present its signed-in owner's token (`auth.token`); when
//    the paired session has a recorded owner, it must be that account.
//  - The phone holds only the pairing code (it is opened from the QR code on
//    another device and is not signed in); the code is the capability.
//  - Production accepts browser origins from the app's own origin and the
//    CORS_ORIGIN allow-list (or PROCTOR_CORS_ORIGIN when set) — never any
//    origin. Development keeps reflecting the origin so LAN phones work.
//  - New connections are rate-limited per client IP.

import logger from './logger.js'
import { recordDeviceLink, getDeviceLink as storeGetDeviceLink, getSession, getEntitlement, getReport } from './store.js'
import { authenticate as defaultAuthenticate } from '../domain/auth/requireUser.js'
import { legacySessionOwnerFrom } from './legacyOwnerLock.js'
import { PAIR_CODE_PATTERN, isPairCodeUsable } from './pairCodes.js'

const isProduction = () => process.env.NODE_ENV === 'production'

// Origins a browser may open the socket from, or null for "any" (development).
export function proctorOriginPolicy(env = process.env) {
  if (env.NODE_ENV !== 'production') return null
  const list = (env.PROCTOR_CORS_ORIGIN || env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean)
  return new Set(list)
}

export function isAllowedProctorOrigin({ origin, host }, allowed) {
  if (!allowed) return true
  if (!origin) return true // not a browser request; the pair code and auth still apply
  if (allowed.has(origin)) return true
  try {
    return new URL(origin).host === String(host || '')
  } catch {
    return false
  }
}

// Same client-IP rule as the HTTP rate limits (one trusted proxy hop: the
// last X-Forwarded-For entry; port suffixes stripped).
export function handshakeIp(handshake) {
  const xff = String(handshake?.headers?.['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean)
  const raw = xff.length ? xff[xff.length - 1] : String(handshake?.address || 'unknown')
  const v4 = raw.match(/^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/)
  return v4 ? v4[1] : raw
}

export function createConnectionRateLimiter({ limit = 60, windowMs = 60 * 1000, now = () => Date.now() } = {}) {
  const buckets = new Map()
  return function allow(key) {
    const t = now()
    const bucket = buckets.get(key)
    if (!bucket || t - bucket.start >= windowMs) {
      buckets.set(key, { start: t, count: 1 })
      if (buckets.size > 10000) {
        for (const [k, b] of buckets) if (t - b.start >= windowMs) buckets.delete(k)
      }
      return true
    }
    bucket.count += 1
    return bucket.count <= limit
  }
}

// Decides whether a handshake may join a pairing room. Resolves to
// { pairCode, role, sessionId } or throws an Error whose message the client
// receives as `connect_error`.
export function createProctorHandshakeGuard({
  getDeviceLink = storeGetDeviceLink,
  lookup = legacySessionOwnerFrom({ getSession, getEntitlement, getReport }),
  authenticate = defaultAuthenticate,
  production = isProduction,
  now = () => Date.now(),
} = {}) {
  return async function checkHandshake(handshake) {
    const query = handshake?.query || {}
    const pairCode = typeof query.pairCode === 'string' ? query.pairCode : ''
    const role = query.role
    if (!PAIR_CODE_PATTERN.test(pairCode) || (role !== 'desktop' && role !== 'phone')) {
      throw new Error('Missing pairCode or role.')
    }
    const link = await getDeviceLink(pairCode)
    if (!isPairCodeUsable(link, now())) throw new Error('Unknown or expired pairing code.')
    const sessionId = link.sessionId || ''
    if (role === 'desktop') {
      const token = typeof handshake.auth?.token === 'string' ? handshake.auth.token : ''
      const { user } = await authenticate({ headers: { authorization: token ? `Bearer ${token}` : '' } })
      const { owner } = await lookup(sessionId)
      if (owner) {
        if (!user || String(user.id) !== owner) throw new Error('Not authorized for this pairing code.')
      } else if (production() || !user) {
        throw new Error('Not authorized for this pairing code.')
      }
    }
    return { pairCode, role, sessionId }
  }
}

export async function attachProctorSocket(httpServer, deps = {}) {
  let Server
  try {
    ({ Server } = await import('socket.io'))
  } catch {
    logger.warn('socket_io_missing', {
      detail: 'socket.io is not installed — phone-link proctoring is disabled.',
    })
    return null
  }

  const allowedOrigins = deps.allowedOrigins === undefined ? proctorOriginPolicy() : deps.allowedOrigins
  const checkHandshake = deps.checkHandshake || createProctorHandshakeGuard(deps)
  const allowConnection = deps.rateLimiter || createConnectionRateLimiter({
    limit: Number(process.env.PROCTOR_SOCKET_RATE_PER_MIN) || 60,
  })

  const io = new Server(httpServer, {
    path: '/proctor-socket',
    cors: {
      // Phones join from the LAN origin (http://<lan-ip>:5173) in development,
      // so the origin is reflected there; production uses the allow-list.
      origin: allowedOrigins ? [...allowedOrigins] : true,
      methods: ['GET', 'POST'],
    },
    // Applies to every transport (CORS does not cover WebSockets).
    allowRequest: (req, callback) => {
      callback(null, isAllowedProctorOrigin({ origin: req.headers.origin, host: req.headers.host }, allowedOrigins))
    },
    maxHttpBufferSize: 5e6, // 5 MB — comfortably fits a single JPEG frame
  })

  io.use((socket, next) => {
    if (!allowConnection(handshakeIp(socket.handshake))) {
      return next(new Error('Too many connection attempts. Please wait a minute and try again.'))
    }
    checkHandshake(socket.handshake)
      .then((granted) => {
        socket.data.pairCode = granted.pairCode
        socket.data.role = granted.role
        socket.data.sessionId = granted.sessionId
        next()
      })
      .catch((err) => next(new Error(err?.message || 'Not authorized.')))
  })

  // Count how many of each role are currently in a room. Used to tell the phone
  // whether a desktop is actually watching, so it can stop the camera when the
  // test ends or the laptop goes away. `excludeId` lets us compute presence
  // during a 'disconnecting' event, when the leaving socket is still a member.
  function presenceFor(room, excludeId) {
    const ids = io.sockets.adapter.rooms.get(room) || new Set()
    let desktop = 0
    let phone = 0
    for (const id of ids) {
      if (id === excludeId) continue
      const s = io.sockets.sockets.get(id)
      if (!s) continue
      if (s.data.role === 'desktop') desktop++
      else if (s.data.role === 'phone') phone++
    }
    return { desktop, phone }
  }

  io.on('connection', (socket) => {
    const { pairCode, role, sessionId } = socket.data

    const room = `pair:${pairCode}`
    socket.join(room)

    if (role === 'phone') {
      // Tell the desktop a phone has linked. The link row already exists
      // (issued by /api/device/pair); only its status changes.
      socket.to(room).emit('proctor:phone-status', { status: 'linked' })
      recordDeviceLink(pairCode, {
        sessionId,
        status: 'linked',
        phoneUserAgent: String(socket.handshake.headers['user-agent'] || '').slice(0, 512),
      }).catch((err) => logger.captureException(err, { msg: 'device_link_persist_failed' }))
    } else {
      // A desktop (re)connected — ask any phone already in the room to announce.
      socket.to(room).emit('proctor:desktop-ready')
    }

    // Broadcast the current presence to everyone in the room so the phone knows
    // whether a desktop is watching (and vice-versa).
    io.to(room).emit('proctor:presence', presenceFor(room))

    // Relay a camera frame from phone → desktop.
    socket.on('proctor:frame', (payload) => {
      if (socket.data.role !== 'phone') return
      socket.to(room).emit('proctor:frame', payload)
    })

    // Relay a heartbeat (keeps the desktop's "phone connected" status fresh).
    socket.on('proctor:heartbeat', (payload) => {
      socket.to(room).emit('proctor:heartbeat', payload || { at: Date.now() })
    })

    // Phone-reported proctoring signals (e.g. camera covered, low light).
    socket.on('proctor:signal', (payload) => {
      socket.to(room).emit('proctor:signal', payload)
    })

    // Desktop signals the test is over → tell the phone to stop its camera.
    socket.on('proctor:end', (payload) => {
      if (socket.data.role !== 'desktop') return
      socket.to(room).emit('proctor:end', payload || { at: Date.now() })
    })

    // Recompute presence before this socket actually leaves the room so the
    // remaining peers learn immediately that a desktop/phone has gone.
    socket.on('disconnecting', () => {
      const presence = presenceFor(room, socket.id)
      socket.to(room).emit('proctor:presence', presence)
      if (socket.data.role === 'phone') {
        socket.to(room).emit('proctor:phone-status', { status: 'disconnected' })
        recordDeviceLink(pairCode, { status: 'disconnected' }).catch(() => {})
      }
    })
  })

  logger.info('proctor_socket_ready', { path: '/proctor-socket' })
  return io
}
