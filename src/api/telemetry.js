// POST /api/v1/telemetry — product events (spec §46). Fire-and-forget: a
// telemetry failure never surfaces to the user.
import { request } from './client.js'

export async function sendProductEvent({ event, props, occurredAt }) {
  try {
    await request('/api/v1/telemetry', { method: 'POST', body: { event, props, occurredAt }, on401: 'throw' })
    return true
  } catch {
    return false
  }
}
