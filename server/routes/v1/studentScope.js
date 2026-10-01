// Shared guards for student-scoped /api/v1 routes: the caller, a workspace
// they hold (X-Prism-Workspace), and only PERSONAL or CAMPUS_STUDENT ones.
// With campus on, sessions' sponsorship is only knowable from the campus
// store, so its absence fails closed (K60).
import { ApiError } from '../../domain/http/errors.js'
import { isEnabled } from '../../domain/flags/index.js'

export function studentWorkspace(req, _res, next) {
  const type = req.workspace?.type
  if (type === 'PERSONAL' || type === 'CAMPUS_STUDENT') return next()
  return next(new ApiError('FORBIDDEN', 'This is not a student workspace.'))
}

export function createScopesKnowable(campus) {
  return function scopesKnowable(_req, _res, next) {
    return isEnabled('PRISM_CAMPUS_ENABLED') && !campus.storeAvailable()
      ? next(new ApiError('CAMPUS_STORE_UNAVAILABLE', 'This is temporarily unavailable.'))
      : next()
  }
}

export function studentScoped({ requireUser, campus }) {
  return [requireUser, createScopesKnowable(campus), campus.resolveWorkspace, studentWorkspace]
}
