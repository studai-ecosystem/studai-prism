// Default commerce wiring for routers that are not injected with the campus
// context (routes/payment.js). Postgres when DATABASE_URL is configured; a
// process-local memory store otherwise (tests, file-store deployments — grants
// there are not durable and the licence check does not depend on them).
import { isDbConfigured, query } from '../../db/pool.js'
import { createMemoryDb } from '../campusStore/memoryDb.js'
import { createCommerceRepoMemory, createCommerceRepoPg } from './repository.js'
import { createGrantService } from './grants.js'
import { offerAvailability, offerView } from './products.js'
import { MISSION_LIBRARY } from '../development/missionLibrary.js'
import { contentRegistry } from '../content/versions.js'

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
export * from './softBudget.js'

// The offer as the running build can actually deliver it: the mission library
// and the content registry decide whether the promised content is reviewed.
export function liveOfferAvailability(code, { priceApproved } = {}) {
  const latest = new Map()
  for (const m of MISSION_LIBRARY) latest.set(m.mission_id || m.id, m)
  const formStates = contentRegistry.listForms().filter((f) => f.kind === 'UNIVERSAL_FORM').map((f) => f.state)
  return offerAvailability(code, { missions: [...latest.values()], formStates, ...(priceApproved === undefined ? {} : { priceApproved }) })
}

export function liveOfferView(code, options = {}) {
  return offerView(code, { ...options, availability: liveOfferAvailability(code, options) })
}
