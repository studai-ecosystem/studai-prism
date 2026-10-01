// Campus route guards (contract §2, §5).
//   requireCampus          flag off → 404 (dark); no campus store → 503
//   requireOrgPermission   active membership + can() in the route's org, else 404
// Denials are 404 so a caller cannot learn whether an organization exists.
import { ApiError } from '../http/errors.js'
import { isEnabled } from '../flags/index.js'
import { can } from './can.js'

export function createRequireCampus({ campusStoreAvailable }) {
  return function requireCampus(_req, _res, next) {
    if (!isEnabled('PRISM_CAMPUS_ENABLED')) return next(new ApiError('NOT_FOUND', 'Not found'))
    if (!campusStoreAvailable()) return next(new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Campus features are temporarily unavailable.'))
    return next()
  }
}

export function createRequireOrgPermission({ workspaceService }) {
  return function requireOrgPermission(permission, resourceFrom = () => ({})) {
    return async function orgPermission(req, _res, next) {
      try {
        const actor = await workspaceService.actorFor(req.user)
        const resource = { organizationId: req.params.orgId, ...resourceFrom(req) }
        const decision = can(actor, permission, resource)
        if (!decision.allowed) return next(new ApiError('NOT_FOUND', 'Not found'))
        req.actor = actor
        req.permissionScope = decision
        return next()
      } catch (err) {
        return next(err)
      }
    }
  }
}
