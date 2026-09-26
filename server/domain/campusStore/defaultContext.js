// Production wiring for the campus context: Postgres repositories (only when
// DATABASE_URL is set), the legacy v1 store for personal entitlements, and
// the mailer for invites.
import { isDbConfigured, query, getPool } from '../../db/pool.js'
import { createPgCampusRepos } from './index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from './context.js'
import { listEntitlementsByUser, getSession, getSessionIdsByUser, getReport, getEntitlement, createEntitlement } from '../../lib/store.js'
import { isMailEnabled, sendOrgInviteEmail } from '../../lib/mailer.js'
import evidenceGraph from '../../lib/evidenceGraph.js'
import roleAffinityEngine from '../../lib/roleAffinityEngine.js'
import { PRE_APPROVED_SCENARIOS } from '../../lib/scenarioBank.js'
import { createEngineAdapter, createRouterInvoker } from '../assessments/engine.js'

// The unchanged engine router, bound on first use (the v1 router must not
// import the engine at module load).
let engineInvoke = null
async function invokeEngine(args) {
  if (!engineInvoke) {
    const { default: router } = await import('../../routes/assessment.js')
    engineInvoke = createRouterInvoker(router)
  }
  return engineInvoke(args)
}

// Legacy flow entry points (the V3 player replaces these in Phase 5).
const legacyPaths = {
  ...EMPTY_LEGACY_SOURCES.paths,
  start: (sessionId) => (process.env.PRISM_SKIP_VERIFICATION === 'true'
    ? `/briefing?session=${encodeURIComponent(sessionId)}`
    : `/verify-identity?session=${encodeURIComponent(sessionId)}`),
}

export function createDefaultCampusContext() {
  const base = (process.env.PUBLIC_APP_URL || '').replace(/\/$/, '')
  return createCampusContext({
    repos: isDbConfigured() ? createPgCampusRepos({ query, getPool }) : null,
    campusStoreAvailable: () => isDbConfigured(),
    legacyLookup: (user) => listEntitlementsByUser(user.id),
    // Without a configured public URL there is no safe absolute link to send.
    sendInviteEmail: async (msg) => (isMailEnabled() && base ? sendOrgInviteEmail(msg) : false),
    inviteUrlFor: (token) => `${base}/app/campus-invite/${encodeURIComponent(token)}`,
    sessionOwner: async (sessionId) => (await getSession(sessionId).catch(() => null))?.userId || null,
    legacy: {
      listEntitlements: (userId) => listEntitlementsByUser(userId),
      listSessionIds: (userId) => getSessionIdsByUser(userId),
      getSession: (sessionId) => getSession(sessionId),
      getReport: (sessionId) => getReport(sessionId),
      getEntitlement: (sessionId) => getEntitlement(sessionId),
      createEntitlement: (record) => createEntitlement(record),
      // Admin hold/invalidation (0012). Without a DB no such record can exist;
      // with one, a failed read is an error (never treated as "not held").
      adminState: async (sessionId) => {
        if (!isDbConfigured()) return null
        const { rows } = await query('SELECT invalid, review_state FROM admin_session_states WHERE session_id = $1', [String(sessionId)])
        return rows[0] ? { invalid: rows[0].invalid, reviewState: rows[0].review_state } : null
      },
      paths: legacyPaths,
    },
    // The frozen general pool lives with the legacy engine; loaded lazily so
    // the v1 router never imports the engine at module load.
    scenarioSource: async () => {
      const { SCENARIOS } = await import('../../routes/assessment.js')
      return { generalScenarios: SCENARIOS, bankScenarios: PRE_APPROVED_SCENARIOS }
    },
    evidence: { units: (sessionId) => evidenceGraph.getEvidenceUnits(sessionId) },
    roles: { evaluate: ({ capabilityProfile, candidateInterests }) => roleAffinityEngine.computeRoleAffinity(capabilityProfile, candidateInterests) },
    engine: createEngineAdapter({ invoke: invokeEngine }),
  })
}
