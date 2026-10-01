// Session directory (C4.03): the caller's assessment sessions, partitioned by
// workspace scope. A session without a scope row is PERSONAL (spec §4.3), so
// the PERSONAL workspace sees only personal sessions and a CAMPUS_STUDENT
// workspace sees only sessions its organization sponsored — never both.
// Legacy session/report records are read, never written (K7). Each session
// carries its admin integrity state: an invalidated or held session is never
// formal evidence (read models exclude it; K59).

const toIso = (v) => {
  if (v == null || v === '') return null
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function createSessionDirectory({ repos, legacy }) {
  async function scopeOf(sessionId) {
    return repos?.scopes ? repos.scopes.getSessionScope(sessionId) : null
  }

  function inWorkspace(scope, workspace) {
    if (workspace.type === 'PERSONAL') return !scope || scope.sponsorType === 'PERSONAL'
    if (workspace.type === 'CAMPUS_STUDENT') return Boolean(scope && scope.sponsorType === 'INSTITUTION' && scope.sponsorOrganizationId === workspace.organizationId)
    return false
  }

  return {
    async listSessions(user, workspace) {
      const ids = await legacy.listSessionIds(user.id)
      const out = []
      for (const sessionId of ids) {
        const scope = await scopeOf(sessionId)
        if (!inWorkspace(scope, workspace)) continue
        const [session, report] = await Promise.all([legacy.getSession(sessionId), legacy.getReport(sessionId)])
        const owner = session?.userId || report?.userId || null
        if (owner !== user.id) continue
        const admin = legacy.adminState ? await legacy.adminState(sessionId) : null
        out.push({
          sessionId,
          integrity: admin?.invalid ? 'INVALIDATED' : admin?.reviewState === 'held' ? 'UNDER_REVIEW' : 'OK',
          scope: scope?.sponsorType === 'INSTITUTION' ? 'SPONSORED' : 'PERSONAL',
          sponsorOrganizationId: scope?.sponsorOrganizationId || null,
          scenarioId: session?.scenarioId || report?.scenarioId || null,
          startedAt: toIso(session?.startedAt),
          completedAt: report ? toIso(report.issuedAt) || toIso(session?.completedAt) : null,
          hasReport: Boolean(report),
          history: Array.isArray(session?.history) ? session.history : [],
        })
      }
      return out.sort((a, b) => String(b.completedAt || b.startedAt || '').localeCompare(String(a.completedAt || a.startedAt || '')))
    },
  }
}
