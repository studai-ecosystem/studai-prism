// Express 4 does not route a rejected promise from an async handler to the
// error handler: the request hangs until the client gives up and the process
// sees an unhandled rejection (PROD-READY Phase 1S, audit 2026-10-10, N10).
// Several handlers in the frozen legacy router are async without a
// try/catch, and the router cannot be edited, so this patches express's
// Layer once (what Express 5 does natively): a handler whose returned promise
// rejects is passed to `next(err)` and gets the app's generic 500.
//
// A rejection AFTER the response was already sent is only logged: handing it
// to express then would make its final handler destroy the socket and could
// cut a response that is still being flushed.
import { createRequire } from 'node:module'
import logger from './logger.js'

const require = createRequire(import.meta.url)
const PATCHED = Symbol.for('prism.asyncRouteErrors')

export function installAsyncRouteErrors() {
  const Layer = require('express/lib/router/layer.js')
  if (Layer.prototype[PATCHED]) return false
  Layer.prototype.handle_request = function handleRequest(req, res, next) {
    const fn = this.handle
    if (fn.length > 3) return next() // an error handler; same as express
    try {
      const ret = fn(req, res, next)
      if (ret && typeof ret.then === 'function') {
        ret.then(undefined, (err) => {
          if (res.headersSent) {
            logger.captureException(err, { msg: 'route_rejected_after_response', requestId: req.requestId })
            return
          }
          next(err || new Error('Route handler rejected without a reason'))
        })
      }
    } catch (err) {
      next(err)
    }
  }
  Layer.prototype[PATCHED] = true
  return true
}

installAsyncRouteErrors()
