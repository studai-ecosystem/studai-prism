import { randomUUID } from 'node:crypto'

const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/

// Echo a well-formed client X-Request-Id or mint one. The app-level request
// logger sets req.requestId from the raw header first, so it is re-validated
// here: anything malformed is replaced before it reaches envelopes or audit.
export function requestId(req, res, next) {
  const current = req.requestId || req.get?.('x-request-id')
  req.requestId = current && SAFE_ID.test(String(current)) ? String(current) : randomUUID()
  res.setHeader('X-Request-Id', req.requestId)
  next()
}
