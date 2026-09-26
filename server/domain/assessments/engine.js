// Adapter over the existing assessment engine (server/routes/assessment.js).
// The engine is never rewritten: its router is invoked in-process with the
// caller's own Authorization header, exactly as the legacy browser flow calls
// it, and its responses are mapped to the /api/v1 error vocabulary. Nothing
// here generates dialogue, scores or evidence (spec §12.2, §33).
import { ApiError } from '../http/errors.js'

// Runs one request through an Express router without a network hop.
export function createRouterInvoker(router, { timeoutMs = 120000 } = {}) {
  return function invoke({ method, path, body = {}, headers = {}, ip = null, requestId = null }) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!done) { done = true; reject(new ApiError('UPSTREAM_UNAVAILABLE', 'The assessment did not respond in time.')) }
      }, timeoutMs)
      timer.unref?.()
      const lower = Object.fromEntries(Object.entries(headers).filter(([, v]) => v != null).map(([k, v]) => [k.toLowerCase(), String(v)]))
      const req = {
        method,
        url: path,
        originalUrl: `/api/assessment${path}`,
        baseUrl: '',
        headers: lower,
        body,
        query: {},
        params: {},
        // The caller's own address (consent records store it); never invented.
        ip: typeof ip === 'string' && ip ? ip : undefined,
        requestId,
        get(name) { return lower[String(name).toLowerCase()] },
        header(name) { return lower[String(name).toLowerCase()] },
      }
      let done = false
      const finish = (status, payload) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve({ status, body: payload })
      }
      const res = {
        statusCode: 200,
        headersSent: false,
        locals: {},
        _headers: {},
        status(code) { this.statusCode = code; return this },
        set(k, v) { if (typeof k === 'object') Object.assign(this._headers, k); else this._headers[String(k).toLowerCase()] = v; return this },
        setHeader(k, v) { this._headers[String(k).toLowerCase()] = v; return this },
        getHeader(k) { return this._headers[String(k).toLowerCase()] },
        type() { return this },
        json(payload) { this.headersSent = true; finish(this.statusCode, payload); return this },
        send(payload) { this.headersSent = true; finish(this.statusCode, payload ?? null); return this },
        end(payload) { this.headersSent = true; finish(this.statusCode, payload ?? null); return this },
        sendStatus(code) { this.statusCode = code; return this.end() },
      }
      router.handle(req, res, (err) => {
        if (err) {
          if (!done) { done = true; clearTimeout(timer); reject(err) }
        } else finish(404, { error: 'Not found' })
      })
    })
  }
}

function engineError(status, body, fallback) {
  const code = body?.code
  const message = typeof body?.error === 'string' ? body.error : fallback
  if (status === 402) return new ApiError('ENTITLEMENT_REQUIRED', message)
  if (status === 403 && (code === 'AGE_CONFIRMATION_REQUIRED' || code === 'CONSENT_REQUIRED')) return new ApiError(code, message, { status: 403, details: body?.missing ? { missing: body.missing } : undefined })
  if (status === 403) return new ApiError('FORBIDDEN', message)
  if (status === 404) return new ApiError('NOT_FOUND', 'Not found')
  if (status === 409) return new ApiError('ASSESSMENT_COMPLETED', 'This assessment has already been completed.')
  if (status === 410) return new ApiError('SESSION_TIME_LIMIT', message)
  if (status === 422 && code === 'SCENARIO_NOT_FOUND') return new ApiError('SCENARIO_NOT_FOUND', 'This assessment is not available.')
  if (status >= 400 && status < 500) return new ApiError('VALIDATION_FAILED', message)
  // The engine could not answer (AI or scoring failure): the client keeps the
  // candidate's input and retries — nothing is generated on its behalf.
  return new ApiError('UPSTREAM_UNAVAILABLE', fallback)
}

// Only the participant turns the engine produced: speaker, role and text.
export function participantMessages(parsed) {
  return (Array.isArray(parsed?.messages) ? parsed.messages : [])
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ speaker: String(m.speaker || ''), role: m.role ? String(m.role) : null, content: m.content }))
}

// `client` carries the caller's own request facts (IP, user agent) so the
// engine's records (consent meta, audit) describe the real request.
function forward({ authorization, client }) {
  const headers = {}
  if (authorization) headers.authorization = authorization
  if (client?.userAgent) headers['user-agent'] = String(client.userAgent).slice(0, 512)
  return { headers, ip: client?.ip || null }
}

export function createEngineAdapter({ invoke }) {
  const call = async (method, path, { body, authorization, client, requestId }, fallback) => {
    const out = await invoke({ method, path, body, ...forward({ authorization, client }), requestId })
    if (out.status >= 400) {
      if (out.status === 404 && out.body?.code === 'ARTIFACT_NOT_FOUND') throw new ApiError('NOT_FOUND', 'This work material is not part of the session.')
      throw engineError(out.status, out.body, fallback)
    }
    return out
  }
  return {
    async recordConsent({ sessionId, scopes, consentVersion, authorization, client, requestId }) {
      const out = await invoke({ method: 'POST', path: '/consent', body: { sessionId, scopes, consentVersion }, ...forward({ authorization, client }), requestId })
      if (out.status === 400 && Array.isArray(out.body?.missing)) {
        throw new ApiError('CONSENT_REQUIRED', 'Please accept every consent item to continue.', { status: 422, details: { missing: out.body.missing } })
      }
      if (out.status >= 400) throw engineError(out.status, out.body, 'Your consent could not be recorded.')
      return out.body
    },
    async start({ sessionId, scenarioId = null, authorization, client, requestId }) {
      const body = scenarioId ? { sessionId, scenarioId } : { sessionId }
      const out = await call('POST', '/start', { body, authorization, client, requestId }, 'This assessment could not be started.')
      return { messages: participantMessages(out.body) }
    },
    async message({ sessionId, text, authorization, client, requestId }) {
      const out = await call('POST', '/message', { body: { sessionId, text }, authorization, client, requestId }, 'Your answer was not sent.')
      return { messages: participantMessages(out.body) }
    },
    async saveArtifact({ sessionId, artifactId, updates, notes, authorization, client, requestId }) {
      const out = await call('POST', `/artifacts/${encodeURIComponent(sessionId)}`, { body: { artifactId, updates, notes }, authorization, client, requestId }, 'Your work was not saved.')
      if (!out.body?.ok) throw new ApiError('UPSTREAM_UNAVAILABLE', 'Your work was not saved.')
      const artifact = (out.body.artifacts || []).find((a) => a.artifactId === artifactId) || null
      return { artifact }
    },
    async evaluate({ sessionId, authorization, client, requestId }) {
      const out = await call('POST', '/evaluate', { body: { sessionId }, authorization, client, requestId }, 'Your assessment could not be submitted.')
      return { state: out.status === 202 ? 'SCORING' : 'COMPLETE' }
    },
    async evaluateStatus({ sessionId, requestId }) {
      const out = await invoke({ method: 'GET', path: `/evaluate-status/${encodeURIComponent(sessionId)}`, requestId })
      if (out.status === 404) return 'UNKNOWN'
      const s = out.body?.status
      return s === 'complete' ? 'COMPLETE' : s === 'scoring' ? 'SCORING' : s === 'failed' ? 'FAILED' : 'IDLE'
    },
  }
}
