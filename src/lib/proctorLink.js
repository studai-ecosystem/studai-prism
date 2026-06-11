// Frontend helper for the phone-proctor signalling socket (Phase 3).
//
// The socket is reached at the SAME ORIGIN as the page. In dev, Vite proxies
// "/proctor-socket" through to the API server (port 3001) with websocket
// upgrades, so the phone and laptop both connect over the single (HTTPS) Vite
// origin — no separate ws://host:3001 link that would be blocked as mixed
// content. In production the same-origin reverse proxy handles it identically.
import { io } from 'socket.io-client'

export function proctorSocketUrl() {
  if (import.meta.env.VITE_PROCTOR_URL) return import.meta.env.VITE_PROCTOR_URL
  return window.location.origin
}

export function connectProctor({ pairCode, role, sessionId }) {
  return io(proctorSocketUrl(), {
    path: '/proctor-socket',
    transports: ['websocket', 'polling'],
    query: { pairCode, role, sessionId: sessionId || '' },
    reconnection: true,
    reconnectionDelay: 1000,
  })
}

// ── Persistent desktop proctor session ───────────────────────────────────────
// The desktop's link to the phone must survive route changes (link-phone →
// briefing → assessment). A plain per-component socket would disconnect on
// unmount, dropping the proctor feed the moment the candidate leaves the
// link-phone page — which also left the phone streaming to nobody. We keep a
// single module-level socket alive for the whole proctored flow and let any
// page subscribe to its events.
//
// Liveness: the phone streams ~1fps frames + heartbeats. If nothing arrives for
// LIVENESS_TIMEOUT_MS we treat the phone as disconnected even without a clean
// socket "disconnect" (e.g. the phone screen locked or the tab was closed).

const LIVENESS_TIMEOUT_MS = 8000
const PAIR_STORAGE_PREFIX = 'prism_pair_'

let session = null // { socket, pairCode, sessionId, linked, lastFrameAt, lastFrame, subscribers }

export function rememberPairCode(sessionId, pairCode) {
  try {
    if (sessionId && pairCode) sessionStorage.setItem(PAIR_STORAGE_PREFIX + sessionId, pairCode)
  } catch { /* ignore */ }
}

export function recallPairCode(sessionId) {
  try {
    return sessionId ? sessionStorage.getItem(PAIR_STORAGE_PREFIX + sessionId) || '' : ''
  } catch {
    return ''
  }
}

function forgetPairCode(sessionId) {
  try {
    if (sessionId) sessionStorage.removeItem(PAIR_STORAGE_PREFIX + sessionId)
  } catch { /* ignore */ }
}

// Public helper: forget any remembered pairing for a session (used when the
// candidate explicitly skips phone linking, so the assessment does not then
// block waiting for a phone that will never connect).
export function clearRememberedPair(sessionId) {
  forgetPairCode(sessionId)
}

function emitToSubscribers(evt, payload) {
  if (!session) return
  for (const cb of session.subscribers) {
    try { cb(evt, payload) } catch { /* a bad subscriber must not break the rest */ }
  }
}

function setLinked(value) {
  if (!session || session.linked === value) return
  session.linked = value
  emitToSubscribers('linked', { linked: value })
}

// Create (or reuse) the single desktop proctor socket for this pairCode.
export function startProctorSession({ pairCode, sessionId }) {
  if (!pairCode) return null

  // Reuse an existing live session for the same code.
  if (session && session.pairCode === pairCode) {
    if (sessionId) session.sessionId = sessionId
    return session
  }
  // Switching codes — tear down the old session first.
  if (session && session.pairCode !== pairCode) {
    try { session.socket?.disconnect() } catch { /* ignore */ }
    if (session.livenessTimer) clearInterval(session.livenessTimer)
    session = null
  }

  let socket
  try {
    socket = connectProctor({ pairCode, role: 'desktop', sessionId })
  } catch {
    return null
  }

  session = {
    socket,
    pairCode,
    sessionId: sessionId || '',
    linked: false,
    lastFrameAt: 0,
    lastFrame: null,
    subscribers: new Set(),
    livenessTimer: null,
  }
  rememberPairCode(sessionId, pairCode)

  socket.on('connect', () => emitToSubscribers('socket', { connected: true }))
  socket.on('connect_error', () => emitToSubscribers('error', {}))

  socket.on('proctor:phone-status', ({ status } = {}) => {
    if (status === 'linked') {
      session.lastFrameAt = Date.now()
      setLinked(true)
    } else if (status === 'disconnected') {
      setLinked(false)
    }
  })

  socket.on('proctor:heartbeat', () => {
    session.lastFrameAt = Date.now()
    setLinked(true)
  })

  socket.on('proctor:frame', ({ dataUrl } = {}) => {
    if (!dataUrl) return
    session.lastFrameAt = Date.now()
    session.lastFrame = dataUrl
    setLinked(true)
    emitToSubscribers('frame', { dataUrl })
  })

  // Mark the phone as disconnected if its frames/heartbeats stop arriving.
  session.livenessTimer = setInterval(() => {
    if (!session) return
    if (session.linked && Date.now() - session.lastFrameAt > LIVENESS_TIMEOUT_MS) {
      setLinked(false)
    }
  }, 2000)

  return session
}

export function getProctorSession() {
  return session
}

// Subscribe to proctor events. The callback is invoked as cb(eventName, payload)
// for 'linked' | 'frame' | 'socket' | 'error'. Current state is replayed
// immediately so a freshly-mounted page renders without waiting for the next
// event. Returns an unsubscribe function.
export function subscribeProctor(cb) {
  if (!session || typeof cb !== 'function') return () => {}
  session.subscribers.add(cb)
  cb('linked', { linked: session.linked })
  if (session.lastFrame) cb('frame', { dataUrl: session.lastFrame })
  return () => {
    session?.subscribers.delete(cb)
  }
}

// End the proctored session: tell the phone to stop its camera, then drop the
// socket. Called when the test is submitted or the candidate truly leaves.
export function endProctorSession() {
  if (!session) return
  const { socket, sessionId } = session
  try { socket?.emit('proctor:end', { at: Date.now() }) } catch { /* ignore */ }
  // Give the 'end' event a moment to flush before disconnecting.
  setTimeout(() => {
    try { socket?.disconnect() } catch { /* ignore */ }
  }, 250)
  if (session.livenessTimer) clearInterval(session.livenessTimer)
  forgetPairCode(sessionId)
  session = null
}

// React 18 StrictMode mounts → unmounts → re-mounts components in dev, which
// would falsely tear down the proctor session on the throw-away unmount. We
// defer the teardown briefly; a genuine unmount lets it fire, while StrictMode's
// immediate re-mount cancels it via cancelScheduledEnd().
let scheduledEnd = null

export function scheduleEndProctorSession(delayMs = 1500) {
  if (scheduledEnd) clearTimeout(scheduledEnd)
  scheduledEnd = setTimeout(() => {
    scheduledEnd = null
    endProctorSession()
  }, delayMs)
}

export function cancelScheduledEnd() {
  if (scheduledEnd) {
    clearTimeout(scheduledEnd)
    scheduledEnd = null
  }
}
