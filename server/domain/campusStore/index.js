// Assembles every campus repository behind one factory so services and
// routes receive the same interface whether the store is Postgres or memory.
import { createMemoryDb } from './memoryDb.js'
import { createOrganizationsRepoMemory } from '../organizations/repository.memory.js'
import { createOrganizationsRepoPg } from '../organizations/repository.pg.js'
import { createMembershipsRepoMemory } from '../memberships/repository.memory.js'
import { createMembershipsRepoPg } from '../memberships/repository.pg.js'
import { createWorkspacesRepoMemory } from '../workspaces/repository.memory.js'
import { createWorkspacesRepoPg } from '../workspaces/repository.pg.js'
import { createEntitlementsRepoMemory } from '../entitlements/repository.memory.js'
import { createEntitlementsRepoPg } from '../entitlements/repository.pg.js'
import { createSharingRepoMemory } from '../sharing/repository.memory.js'
import { createSharingRepoPg } from '../sharing/repository.pg.js'
import { createAuditRepoMemory } from '../audit/repository.memory.js'
import { createAuditRepoPg } from '../audit/repository.pg.js'
import { createScopesRepoMemory } from '../scopes/repository.memory.js'
import { createScopesRepoPg } from '../scopes/repository.pg.js'
import { createAssessmentsRepoMemory } from '../assessments/repository.memory.js'
import { createAssessmentsRepoPg } from '../assessments/repository.pg.js'
import { createPreferencesRepoMemory, createPreferencesRepoPg } from '../preferences/repository.js'
import { createProductEventsRepoMemory, createProductEventsRepoPg } from '../telemetry/events.js'
import { createSessionIoRepoMemory, createSessionIoRepoPg } from '../assessments/sessionIoRepository.js'
import { createReportVersionsRepoMemory, createReportVersionsRepoPg, createReportReviewsRepoMemory, createReportReviewsRepoPg } from '../reports/v3/repository.js'
import { createCampusAdminRepoMemory } from '../campusAdmin/repository.memory.js'
import { createCampusAdminRepoPg } from '../campusAdmin/repository.pg.js'
import { createDevelopmentRepoMemory } from '../development/repository.memory.js'
import { createDevelopmentRepoPg } from '../development/repository.pg.js'
import { createGrowthRepoMemory } from '../growth/repository.memory.js'
import { createGrowthRepoPg } from '../growth/repository.pg.js'
import { createAnalyticsRepoMemory, createAnalyticsRepoPg } from '../analytics/repository.js'
import { createBillingRepoMemory, createBillingRepoPg } from '../billing/repository.js'
import { createValidationRepoMemory, createValidationRepoPg } from '../validation/repository.js'
import { createPreparationRepoMemory, createPreparationRepoPg } from '../preparation/repository.js'
import { createMemorySessionLocks, createPgSessionLocks } from '../assessments/sessionLocks.js'
import { createCommerceRepoMemory, createCommerceRepoPg } from '../commerce/repository.js'
import { withTransaction, transactionDeps, inTransaction } from './pgUtil.js'

// Memory "transaction" (no-database development and tests only): one at a
// time; on failure every collection of the memory db is restored in place to
// its state when the transaction began. Not isolated from writes made outside
// a transaction while it runs; the PostgreSQL store is the real guarantee.
function createMemoryTransaction(db, reposFor) {
  let tail = Promise.resolve()
  const restorable = (v) => v instanceof Map || v instanceof Set || Array.isArray(v)
  const snapshot = () => {
    const out = new Map()
    for (const [key, value] of Object.entries(db)) if (restorable(value)) out.set(key, structuredClone(value))
    return out
  }
  const restore = (saved) => {
    for (const [key, value] of Object.entries(db)) {
      if (!restorable(value)) continue
      const before = saved.get(key)
      if (value instanceof Map) { value.clear(); for (const [k, v] of before || []) value.set(k, v) }
      else if (value instanceof Set) { value.clear(); for (const v of before || []) value.add(v) }
      else { value.length = 0; value.push(...(before || [])) }
    }
  }
  return function transaction(fn) {
    const run = tail.then(async () => {
      const saved = snapshot()
      try {
        return await fn(reposFor())
      } catch (err) {
        restore(saved)
        throw err
      }
    })
    tail = run.catch(() => {})
    return run
  }
}

export function createMemoryCampusRepos(options = {}) {
  const db = options.db || createMemoryDb(options)
  let self = null
  // Inside a transaction the callback gets a view whose own transaction()
  // joins the open one (the outer set waits for it to finish).
  const begin = createMemoryTransaction(db, () => {
    const view = { ...self }
    view.transaction = async (fn) => fn(view)
    return view
  })
  self = {
    kind: 'memory',
    // PROD-READY Phase 3: run several repository writes as one unit.
    transaction: (fn) => begin(fn),
    db,
    // P10.2 readiness probe: the memory store carries every repo the current
    // schema needs, so it reports the required floor as applied.
    listAppliedMigrations: async () => ['0040_candidate_actions_jobs', '0043_run_timing', '0044_opportunity_ledger', '0054_report_publication_note'],
    organizations: createOrganizationsRepoMemory(db),
    memberships: createMembershipsRepoMemory(db),
    workspaces: createWorkspacesRepoMemory(db),
    entitlements: createEntitlementsRepoMemory(db),
    sharing: createSharingRepoMemory(db),
    audit: createAuditRepoMemory(db),
    scopes: createScopesRepoMemory(db),
    assessments: createAssessmentsRepoMemory(db),
    preferences: createPreferencesRepoMemory(db),
    productEvents: createProductEventsRepoMemory(db),
    sessionIo: createSessionIoRepoMemory(db),
    sessionLocks: createMemorySessionLocks(),
    reportVersions: createReportVersionsRepoMemory(db),
    reportReviews: createReportReviewsRepoMemory(db),
    campusAdmin: createCampusAdminRepoMemory(db),
    development: createDevelopmentRepoMemory(db),
    growth: createGrowthRepoMemory(db),
    analytics: createAnalyticsRepoMemory(db),
    billing: createBillingRepoMemory(db),
    validation: createValidationRepoMemory(db),
    preparation: createPreparationRepoMemory(db),
    commerce: createCommerceRepoMemory(db),
  }
  return self
}

export function createPgCampusRepos({ query, getPool, getLockPool }) {
  const deps = { query, getPool }
  // P10.2 readiness probe (read-only, cached briefly): applied migration names.
  let migrationsCache = null
  const self = {
    kind: 'pg',
    // PROD-READY Phase 3: fn(txRepos) runs on one connection inside
    // BEGIN/COMMIT; every repository write in it (their own transactions
    // become savepoints) commits or rolls back together. Nested calls join.
    async transaction(fn) {
      if (inTransaction(getPool)) return fn(self)
      return withTransaction(getPool, (client) => fn(createPgCampusRepos({ ...transactionDeps(client), getLockPool })))
    },
    async listAppliedMigrations() {
      if (migrationsCache && Date.now() - migrationsCache.at < 60_000) return migrationsCache.names
      const { rows } = await query('SELECT name FROM schema_migrations ORDER BY name')
      migrationsCache = { at: Date.now(), names: rows.map((r) => r.name) }
      return migrationsCache.names
    },
    organizations: createOrganizationsRepoPg(deps),
    memberships: createMembershipsRepoPg(deps),
    workspaces: createWorkspacesRepoPg(deps),
    entitlements: createEntitlementsRepoPg(deps),
    sharing: createSharingRepoPg(deps),
    audit: createAuditRepoPg(deps),
    scopes: createScopesRepoPg(deps),
    assessments: createAssessmentsRepoPg(deps),
    preferences: createPreferencesRepoPg(deps),
    productEvents: createProductEventsRepoPg(deps),
    sessionIo: createSessionIoRepoPg(deps),
    sessionLocks: createPgSessionLocks({ getPool: getLockPool || (() => {
      throw new Error('A dedicated assessment lock pool is required.')
    }) }),
    reportVersions: createReportVersionsRepoPg(deps),
    reportReviews: createReportReviewsRepoPg(deps),
    campusAdmin: createCampusAdminRepoPg(deps),
    development: createDevelopmentRepoPg(deps),
    growth: createGrowthRepoPg(deps),
    analytics: createAnalyticsRepoPg(deps),
    billing: createBillingRepoPg(deps),
    validation: createValidationRepoPg(deps),
    preparation: createPreparationRepoPg(deps),
    commerce: createCommerceRepoPg(deps),
  }
  return self
}
