// Admin console API client (Control Centre Phase 1).
//
// Security posture (plan §8): the access token and CSRF token live in module
// MEMORY only — never localStorage/sessionStorage. Persistence across page
// loads comes from the HttpOnly SameSite=Strict refresh cookie (scoped to
// /api/admin), redeemed via bootstrapAdminSession() on mount. A 401 mid-flight
// triggers exactly one silent refresh + retry.

let accessToken = null
let csrfToken = null
let admin = null

function applySession(payload) {
  accessToken = payload.accessToken
  csrfToken = payload.csrfToken
  admin = payload.admin
  return admin
}

export function currentAdmin() {
  return admin
}

export function adminHasPermission(key) {
  if (!admin) return false
  return admin.permissions?.includes('*') || admin.permissions?.includes(key)
}

async function parse(res) {
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}

// ── Session bootstrap / refresh ──────────────────────────────────────────────
export async function refreshAdminSession() {
  const res = await fetch('/api/admin/auth/refresh', { method: 'POST' })
  if (!res.ok) {
    accessToken = null
    csrfToken = null
    admin = null
    return null
  }
  return applySession(await res.json())
}

// Try to resume a session from the refresh cookie (page reload).
export async function bootstrapAdminSession() {
  if (admin) return admin
  return refreshAdminSession()
}

// ── Authenticated fetch with one silent refresh-and-retry ────────────────────
export async function adminFetch(path, { method = 'GET', body } = {}) {
  const attempt = () =>
    fetch(path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(method !== 'GET' && csrfToken ? { 'x-admin-csrf': csrfToken } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    })

  let res = await attempt()
  if (res.status === 401) {
    const refreshed = await refreshAdminSession()
    if (!refreshed) {
      const err = new Error('Session expired. Sign in again.')
      err.code = 'SESSION_GONE'
      throw err
    }
    res = await attempt()
  }
  const { ok, status, body: json } = await parse(res)
  if (!ok) {
    const err = new Error(json.error || `Request failed (${status})`)
    err.code = json.code || String(status)
    err.status = status
    throw err
  }
  return json
}

// ── Auth flows ───────────────────────────────────────────────────────────────
export async function adminLogin(email, password) {
  const { ok, status, body } = await parse(
    await fetch('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  )
  if (!ok) {
    const err = new Error(body.error || `Sign-in failed (${status})`)
    err.code = body.code || String(status)
    throw err
  }
  return body // { mfaRequired | mfaSetupRequired, mfaToken }
}

export async function adminMfaSetup(mfaToken) {
  const { ok, body } = await parse(
    await fetch('/api/admin/auth/mfa/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mfaToken }),
    }),
  )
  if (!ok) throw new Error(body.error || 'MFA setup failed')
  return body // { secret, otpauthUri }
}

export async function adminMfaSubmit(kind, mfaToken, code) {
  const path = kind === 'confirm' ? '/api/admin/auth/mfa/confirm' : '/api/admin/auth/mfa/verify'
  const { ok, body } = await parse(
    await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mfaToken, code }),
    }),
  )
  if (!ok) {
    const err = new Error(body.error || 'Code rejected')
    err.code = body.code
    throw err
  }
  return applySession(body)
}

export async function adminChangePassword(current, next, code) {
  return adminFetch('/api/admin/auth/password/change', {
    method: 'POST',
    body: { current, next, code },
  }).then((r) => {
    if (admin) admin.mustChangePassword = false
    return r
  })
}

export async function adminLogout() {
  try {
    await adminFetch('/api/admin/auth/logout', { method: 'POST' })
  } finally {
    accessToken = null
    csrfToken = null
    admin = null
  }
}
