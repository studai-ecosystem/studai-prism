// Track 0.1 — durable pseudonymous candidate identity.
//
// candidate_id is the longitudinal spine: it survives sessions, payment
// cycles and (later) institutions. It is PSEUDONYMOUS — research and
// calibration tables carry candidate_id only, never user id / email / name.
// The candidate_id ↔ person mapping lives exclusively in the v1 identity
// store (users.json / v1_users), alongside the PII it already guards.

import { randomUUID } from 'node:crypto'
import { findUserById, updateUser } from './db.js'
import logger from './logger.js'

// Returns the user's candidate_id, minting + persisting one on first use.
// Never throws — a failure returns null and the caller proceeds without a
// candidate link (anonymous-session behavior), so identity can never block
// an assessment.
export async function ensureCandidateId(userId) {
  if (!userId) return null
  try {
    const user = await findUserById(userId)
    if (!user) return null
    if (user.candidateId) return user.candidateId
    const candidateId = randomUUID()
    await updateUser(userId, { candidateId })
    logger.info('candidate_id_minted', { userId, candidateId })
    return candidateId
  } catch (err) {
    logger.captureException(err, { msg: 'ensure_candidate_id_failed', userId })
    return null
  }
}
