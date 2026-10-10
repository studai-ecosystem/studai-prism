// Process lifecycle (PROD-READY Phase 1S, audit 2026-10-10, N10/N11).
//
// Graceful shutdown: on SIGTERM (Kubernetes rollout / scale-in) or SIGINT the
// server stops accepting connections, the readiness probe reports "draining",
// the proctor socket closes, in-flight requests get a bounded time to finish
// (idle keep-alive connections are closed at once), then background work and
// the PostgreSQL pools are closed and the process exits 0. Past the deadline
// the remaining connections are cut and the process still exits cleanly.
//
// Process errors: an unhandled promise rejection is logged and the process
// keeps serving (Node's default would crash every in-flight request with it);
// an uncaught exception leaves the process in an unknown state, so it is
// logged and the process exits 1 for the orchestrator to restart it.

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 25000 // below the 30 s Kubernetes grace period

export function shutdownTimeoutMs(env = process.env) {
  const n = Number(env.PRISM_SHUTDOWN_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SHUTDOWN_TIMEOUT_MS
}

export function createGracefulShutdown({
  server,
  getIo = () => null,
  onDrain = () => {},
  cleanups = [],
  logger,
  exit = (code) => process.exit(code),
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
}) {
  let running = null
  return function shutdown(signal) {
    if (running) return running
    running = (async () => {
      logger.info('shutdown_started', { signal, timeoutMs })
      onDrain()
      const closed = new Promise((resolve) => {
        if (!server.listening) return resolve()
        server.close(() => resolve())
      })
      const io = getIo()
      if (io) {
        // Disconnect the proctor sockets; the HTTP server is closed above.
        try { io.disconnectSockets(true) } catch { /* already closed */ }
        try { io.engine?.close() } catch { /* already closed */ }
      }
      server.closeIdleConnections?.()
      const idle = setInterval(() => server.closeIdleConnections?.(), 250)
      let timer
      const timedOut = await Promise.race([
        closed.then(() => false),
        new Promise((resolve) => { timer = setTimeout(() => resolve(true), timeoutMs) }),
      ])
      clearInterval(idle)
      clearTimeout(timer)
      if (timedOut) {
        logger.warn('shutdown_deadline_reached', { detail: 'closing remaining connections' })
        server.closeAllConnections?.()
      }
      for (const cleanup of cleanups) {
        try { await cleanup() } catch (err) { logger.error('shutdown_cleanup_failed', { code: err?.code || err?.name || 'unknown' }) }
      }
      logger.info('shutdown_complete', { timedOut })
      exit(0)
    })()
    return running
  }
}

export function installProcessHandlers({ logger, exit = (code) => process.exit(code), proc = process }) {
  proc.on('unhandledRejection', (reason) => {
    logger.captureException(reason instanceof Error ? reason : new Error(String(reason)), { msg: 'unhandled_rejection' })
  })
  proc.on('uncaughtException', (err) => {
    logger.captureException(err, { msg: 'uncaught_exception', fatal: true })
    exit(1)
  })
}
