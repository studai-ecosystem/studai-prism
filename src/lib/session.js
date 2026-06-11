// Session helper backed by the real auth API.
// Stores a JWT + non-sensitive profile in localStorage. Passwords are never stored.

const USER_KEY = 'prism_user'
const TOKEN_KEY = 'prism_token'

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

function persist(token, user) {
  const safe = {
    name: user.name || '',
    email: user.email || '',
    college: user.college || '',
    year: user.year || '',
  }
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(safe))
  return safe
}

export function clearUser() {
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(TOKEN_KEY)
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
export async function register({ name, email, college, year, password }) {
  const data = await postJSON('/api/auth/register', { name, email, college, year, password })
  return persist(data.token, data.user)
}

// Sign in to an existing account. Returns the stored profile on success.
export async function login({ email, password }) {
  const data = await postJSON('/api/auth/login', { email, password })
  return persist(data.token, data.user)
}

// Update the signed-in user's editable profile (name, college, year) and
// refresh the cached profile. Returns the stored profile on success.
export async function updateProfile({ name, college, year }) {
  const token = getToken()
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
  if (!res.ok) {
    throw new Error((data && data.error) || 'Failed to update your profile.')
  }
  return persist(token, data.user)
}

// Verify the current token against the server and refresh the cached profile.
export async function fetchMe() {
  const token = getToken()
  if (!token) return null
  const res = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    clearUser()
    return null
  }
  const data = await res.json()
  return persist(token, data.user)
}
