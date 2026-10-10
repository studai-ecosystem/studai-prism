// Campus ↔ employer separation (PROD-READY Phase 9). Every campus
// organization route (/api/v1/organizations/:orgId/*) answers 404 for an
// EMPLOYER organization, whatever PRISM_EMPLOYER_LND says: the campus admin
// surface has views an employer must never have (student CSV export, report
// reads through sponsorship, unsuppressed per-student assignment rosters with
// report links). An employer is served only by /api/v1/employer/*, which is
// dark while the flag is off. Campus organizations are not affected.
import { ApiError } from '../http/errors.js'
import { isEnabled } from '../flags/index.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createEmployerSeparation({ campus }) {
  return async function employerSeparation(req, _res, next) {
    try {
      // Campus off or no store: the campus guards downstream answer as before.
      if (!isEnabled('PRISM_CAMPUS_ENABLED') || !UUID.test(String(req.params.orgId))) return next()
      const lookup = campus.repos?.organizations?.getOrganization
      if (typeof lookup !== 'function' || (typeof campus.storeAvailable === 'function' && !campus.storeAvailable())) return next()
      const org = await campus.repos.organizations.getOrganization(req.params.orgId)
      if (org?.organizationType === 'EMPLOYER') return next(new ApiError('NOT_FOUND', 'Not found'))
      return next()
    } catch (err) {
      return next(err)
    }
  }
}
