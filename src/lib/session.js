// Lightweight client-side session helper.
// NOTE: This is a front-end-only mock for the funnel. It never stores passwords.
// Replace with a real auth backend (JWT/session cookie) before production.

const USER_KEY = 'prism_user'

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setUser(user) {
  // Persist only non-sensitive profile fields — never the password.
  const safe = {
    name: user.name || '',
    email: user.email || '',
    college: user.college || '',
    year: user.year || '',
  }
  localStorage.setItem(USER_KEY, JSON.stringify(safe))
  return safe
}

export function clearUser() {
  localStorage.removeItem(USER_KEY)
}

export function isAuthenticated() {
  return getUser() !== null
}
