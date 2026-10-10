// Demo-organization marker reads (PROD-READY Phase 8, 0061). Synthetic demo
// accounts and the sessions they own are kept out of calibration, the
// rating queue and every real organization (triggers in 0061 enforce the
// organization side). PostgreSQL reads the marker table and view; the
// memory store keeps the same marker in db.demoAccounts / db.demoSessions.
export function createDemoRepoMemory(db) {
  db.demoAccounts ||= new Map()
  db.demoSessions ||= new Set()
  return {
    async isDemoAccount(userId) { return db.demoAccounts.has(String(userId)) },
    async isDemoSession(sessionId) { return db.demoSessions.has(String(sessionId)) },
    async isDemoOrganization(organizationId) { return db.organizations.get(String(organizationId))?.isDemo === true },
  }
}

export function createDemoRepoPg({ query }) {
  return {
    async isDemoAccount(userId) {
      const { rows } = await query('SELECT 1 FROM demo_accounts WHERE user_id = $1', [String(userId)])
      return rows.length > 0
    },
    async isDemoSession(sessionId) {
      const { rows } = await query('SELECT 1 FROM demo_session_ids WHERE session_id = $1', [String(sessionId)])
      return rows.length > 0
    },
    async isDemoOrganization(organizationId) {
      const { rows } = await query('SELECT is_demo FROM organizations WHERE id::text = $1', [String(organizationId)])
      return rows[0]?.is_demo === true
    },
  }
}
