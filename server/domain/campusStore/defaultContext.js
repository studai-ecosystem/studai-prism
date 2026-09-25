// Production wiring for the campus context: Postgres repositories (only when
// DATABASE_URL is set), the legacy v1 store for personal entitlements, and
// the mailer for invites.
import { isDbConfigured, query, getPool } from '../../db/pool.js'
import { createPgCampusRepos } from './index.js'
import { createCampusContext } from './context.js'
import { listEntitlementsByUser, getSession } from '../../lib/store.js'
import { isMailEnabled, sendOrgInviteEmail } from '../../lib/mailer.js'

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
  })
}
