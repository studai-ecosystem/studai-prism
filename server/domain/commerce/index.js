// Default commerce wiring for routers that are not injected with the campus
// context (routes/payment.js). Postgres when DATABASE_URL is configured; a
// process-local memory store otherwise (tests, file-store deployments — grants
// there are not durable and the licence check does not depend on them).
import { isDbConfigured, query } from '../../db/pool.js'
import { createMemoryDb } from '../campusStore/memoryDb.js'
import { createCommerceRepoMemory, createCommerceRepoPg } from './repository.js'
import { createGrantService } from './grants.js'

let service = null
let override = null

export function getCommerceService() {
  if (override) return override
  if (!service) {
    const repos = isDbConfigured()
      ? { commerce: createCommerceRepoPg({ query }) }
      : { commerce: createCommerceRepoMemory(createMemoryDb()) }
    service = createGrantService({ repos })
  }
  return service
}

// Tests inject a service bound to their own repositories.
export function setCommerceServiceForTests(next) {
  override = next || null
}

export * from './products.js'
export { createGrantService, isActive, assertNewActivity } from './grants.js'
