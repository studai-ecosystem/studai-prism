// Liveness of the API (used by the pre-assessment system check).
import { request } from './client.js'

export async function checkApiHealth() {
  try {
    const { data } = await request('/api/v1/health', { workspace: false, auth: false })
    return data?.status === 'ok'
  } catch {
    return false
  }
}
