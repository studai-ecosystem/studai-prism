import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider.jsx'

// UX guard only — the server enforces authentication on every request.
export function AuthGuard({ children }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status !== 'authenticated') {
    const next = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return children
}

export default AuthGuard
