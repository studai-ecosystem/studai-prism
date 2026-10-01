// Auth primitives for AuthProvider ONLY. New code reads the session through
// useAuth(); the token itself stays owned by lib/session.js (spec §32.1).
export { getToken, getUser, clearUser, login, SESSION_EVENT } from '../lib/session.js'
