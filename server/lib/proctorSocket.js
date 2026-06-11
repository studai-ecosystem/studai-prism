// Phone-proctor signalling server (Phase 3).
//
// A laptop (the "desktop" role) and a phone (the "phone" role) join the same
// room keyed by a short pairing code. The phone relays its rear-camera frames
// and heartbeats to the desktop through this room. Frames are relayed in-memory
// only — they are NEVER written to disk. We persist just the link STATUS so the
// system check and proctoring can confirm a phone is connected.
//
// socket.io is loaded lazily so the app still boots if it isn't installed (the
// phone-link step then degrades to "skip", like the Whisper STT fallback).

import logger from './logger.js'
import { recordDeviceLink } from './store.js'

export async function attachProctorSocket(httpServer) {
  let Server
  try {
    ({ Server } = await import('socket.io'))
  } catch {
    logger.warn('socket_io_missing', {
      detail: 'socket.io is not installed — phone-link proctoring is disabled.',
    })
    return null
  }

  const io = new Server(httpServer, {
    path: '/proctor-socket',
    cors: {
      // Phones join from the LAN origin (http://<lan-ip>:5173), which differs
      // from CORS_ORIGIN. Reflect the request origin in dev; lock down in prod.
      origin: process.env.PROCTOR_CORS_ORIGIN || true,
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 5e6, // 5 MB — comfortably fits a single JPEG frame
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
    const { pairCode, role } = socket.handshake.query || {}

    if (!pairCode || (role !== 'desktop' && role !== 'phone')) {
      socket.emit('proctor:error', { message: 'Missing pairCode or role.' })
      socket.disconnect(true)
      return
    }

    const room = `pair:${pairCode}`
    socket.join(room)
    socket.data.pairCode = pairCode
    socket.data.role = role

    if (role === 'phone') {
      // Tell the desktop a phone has linked.
      socket.to(room).emit('proctor:phone-status', { status: 'linked' })
      recordDeviceLink(pairCode, {
        sessionId: socket.handshake.query.sessionId || '',
        status: 'linked',
        phoneUserAgent: socket.handshake.headers['user-agent'] || '',
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
