// Session helper backed by the real auth API.
// Stores a JWT + non-sensitive profile in localStorage. Passwords are never stored.

const USER_KEY = 'prism_user'
const TOKEN_KEY = 'prism_token'
export const SESSION_EVENT = 'prism-session-change'
let authRevision = 0

export function sessionOwnerKey(user) {
  // A UI reset key only; server identity and authorization never depend on it.
  return user?.email || user?.id || null
}

export function clearSessionArtifacts() {
  for (const key of ['prismUserName', 'prismCharacter', 'prismLanguage']) localStorage.removeItem(key)
  for (const key of Object.keys(sessionStorage)) {
    if (key === 'prismActiveWorkspace' || key.startsWith('prism.draft.') || key.startsWith('prism.pending.')) sessionStorage.removeItem(key)
  }
}

function requireCurrentSession(token, revision) {
  if (token !== getToken() || revision !== authRevision) throw new Error('Your account changed. Please try again in your current account.')
}

function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EVENT))
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

// Replace the stored token (e.g. after a password change re-issues one).
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  notify()
}

function persist(token, user) {
  const safe = {
    name: user.name || '',
    email: user.email || '',
    college: user.college || '',
    year: user.year || '',
  }
  if (sessionOwnerKey(getUser()) !== sessionOwnerKey(safe)) clearSessionArtifacts()
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(safe))
  notify()
  return safe
}

export function clearUser() {
  authRevision += 1
  clearSessionArtifacts()
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(TOKEN_KEY)
  notify()
}

// Synchronous check used by route guards. A valid session has both a token and
// a cached profile. Server-side verification happens on every protected request.
export function isAuthenticated() {
  return Boolean(getToken()) && getUser() !== null
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    throw new Error((data && data.error) || 'Request failed. Please try again.')
  }
  return data
}

// Register a new account. Returns the stored profile on success.
// Charter §12: registration carries the explicit 18+ confirmation.
export async function register({ name, email, college, year, password, ageConfirmed }) {
  const revision = ++authRevision
  const data = await postJSON('/api/auth/register', { name, email, college, year, password, ageConfirmed })
  if (revision !== authRevision) throw new Error('Your account changed. Please try again in your current account.')
  return persist(data.token, data.user)
}

// Charter §12: existing accounts confirm 18+ before an assessment can start.
export async function confirmAge() {
  const token = getToken()
  const revision = authRevision
  if (!token) throw new Error('You are not signed in.')
  const res = await fetch('/api/auth/confirm-age', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ageConfirmed: true }),
  })
  const data = await res.json().catch(() => ({}))
  requireCurrentSession(token, revision)
  if (!res.ok) throw new Error(data.error || 'Could not record your confirmation.')
  if (data.user) persist(token, data.user)
  return data.user
}

// Sign in to an existing account. Returns the stored profile on success.
export async function login({ email, password }) {
  const revision = ++authRevision
  const data = await postJSON('/api/auth/login', { email, password })
  if (revision !== authRevision) throw new Error('Your account changed. Please try again in your current account.')
  return persist(data.token, data.user)
}

// Update the signed-in user's editable profile (name, college, year) and
// refresh the cached profile. Returns the stored profile on success.
export async function updateProfile({ name, college, year }) {
  const token = getToken()
  const revision = authRevision
  if (!token) throw new Error('You are not signed in.')
  const res = await fetch('/api/auth/me', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, college, year }),
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON response */
  }
  requireCurrentSession(token, revision)
  if (!res.ok) {
    throw new Error((data && data.error) || 'Failed to update your profile.')
  }
  return persist(token, data.user)
}

// Verify the current token against the server and refresh the cached profile.
export async function fetchMe() {
  const token = getToken()
  const revision = authRevision
  if (!token) return null
  const res = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  requireCurrentSession(token, revision)
  if (res.status === 401) {
    clearUser()
    return null
  }
  if (!res.ok) throw new Error('Your account could not be loaded. Please try again.')
  const data = await res.json()
  requireCurrentSession(token, revision)
  return persist(token, data.user)
}
