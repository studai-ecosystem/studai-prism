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

export function createMemoryCampusRepos(options = {}) {
  const db = options.db || createMemoryDb(options)
  return {
    kind: 'memory',
    db,
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
  }
}

export function createPgCampusRepos({ query, getPool, getLockPool }) {
  const deps = { query, getPool }
  return {
    kind: 'pg',
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
  }
}
