// Campus workspace rows — Postgres adapter (0027). (PERSONAL is virtual, K18.)
import { iso } from '../campusStore/pgUtil.js'

const ws = (r) => r && ({ id: r.id, type: r.type, ownerUserId: r.owner_user_id, organizationId: r.organization_id, name: r.name, status: r.status, createdAt: iso(r.created_at) })

export function createWorkspacesRepoPg({ query }) {
  return {
    async upsertWorkspace({ type, ownerUserId, organizationId, name }) {
      const { rows } = await query(
        `INSERT INTO workspaces (type, owner_user_id, organization_id, name, status) VALUES ($1, $2, $3, $4, 'ACTIVE')
         ON CONFLICT (type, owner_user_id, organization_id) DO UPDATE SET status = 'ACTIVE' RETURNING *`,
        [type, ownerUserId, organizationId, name],
      )
      return ws(rows[0])
    },
    async listWorkspacesForUser(userId) {
      const { rows } = await query("SELECT * FROM workspaces WHERE owner_user_id = $1 AND status = 'ACTIVE' ORDER BY created_at ASC", [userId])
      return rows.map(ws)
    },
    async getWorkspace(id) {
      if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null
      const { rows } = await query('SELECT * FROM workspaces WHERE id = $1', [id])
      return ws(rows[0]) || null
    },
  }
}
