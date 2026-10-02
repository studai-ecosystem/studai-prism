// Production wiring for the campus context: Postgres repositories (only when
// DATABASE_URL is set), the legacy v1 store for personal entitlements, and
// the mailer for invites.
import { isDbConfigured, query, getPool, getSessionLockPool } from '../../db/pool.js'
import { createPgCampusRepos } from './index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from './context.js'
import { listEntitlementsByUser, getSession, getSessionIdsByUser, getReport, getEntitlement, createEntitlement } from '../../lib/store.js'
import { isMailEnabled, sendOrgInviteEmail, sendCampusAssignmentEmail } from '../../lib/mailer.js'
import { findUserById, findUserByEmail } from '../../lib/db.js'
import evidenceGraph from '../../lib/evidenceGraph.js'
import roleAffinityEngine from '../../lib/roleAffinityEngine.js'
import { PRE_APPROVED_SCENARIOS } from '../../lib/scenarioBank.js'
import { createEngineAdapter, createRouterInvoker } from '../assessments/engine.js'
import { createMissionEvaluator } from '../development/evaluator.js'
import { createSliceEvaluator } from '../evidence/sliceEvaluator.js'
import { draftBankScenarios } from '../assessments/draftSegments.js'

// The AI gateway, bound on first use (no provider SDK at module load).
async function completeViaGateway(params, options) {
  const { createCompletion } = await import('../../services/ai/completionService.js')
  return createCompletion(params, options)
}

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
    repos: isDbConfigured() ? createPgCampusRepos({ query, getPool, getLockPool: getSessionLockPool }) : null,
    campusStoreAvailable: () => isDbConfigured(),
    legacyLookup: (user) => listEntitlementsByUser(user.id),
    // Without a configured public URL there is no safe absolute link to send.
    sendInviteEmail: async (msg) => (isMailEnabled() && base ? sendOrgInviteEmail(msg) : false),
    inviteUrlFor: (token) => `${base}/app/campus-invite/${encodeURIComponent(token)}`,
    sendAssignmentEmail: async (msg) => (isMailEnabled() && base ? sendCampusAssignmentEmail(msg) : false),
    appUrl: base,
    // Only the fields admin views need; never password hashes or profile data.
    users: {
      findById: async (id) => { const u = await findUserById(id); return u ? { id: u.id, name: u.name || null, email: u.email || null } : null },
      findByEmail: async (email) => { const u = await findUserByEmail(email); return u ? { id: u.id, name: u.name || null, email: u.email || null } : null },
    },
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
      // DRAFT segments join the bank only when PRISM_DRAFT_CONTENT=true (never by default).
      return { generalScenarios: SCENARIOS, bankScenarios: { ...PRE_APPROVED_SCENARIOS, ...draftBankScenarios() } }
    },
    evidence: { units: (sessionId) => evidenceGraph.getEvidenceUnits(sessionId) },
    roles: { evaluate: ({ capabilityProfile, candidateInterests }) => roleAffinityEngine.computeRoleAffinity(capabilityProfile, candidateInterests) },
    engine: createEngineAdapter({ invoke: invokeEngine }),
    missionEvaluator: createMissionEvaluator({ complete: completeViaGateway }),
    sliceEvaluator: createSliceEvaluator({ complete: completeViaGateway, recordUnit: (unit) => evidenceGraph.recordEvidenceUnit(unit) }),
  })
}
