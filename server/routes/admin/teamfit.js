// /api/admin/teamfit — team-simulation administration (Control Centre Phase 4).
//
//   GET    /teams                       teamfit:read    list (+archive state, counts)
//   POST   /teams                       teamfit:manage  create from CONSENTED sessions
//   GET    /teams/:id                   teamfit:read    detail (members + consent evidence)
//   POST   /teams/:id/members           teamfit:manage  add consented member
//   DELETE /teams/:id/members/:sessionId teamfit:manage remove member (history untouched)
//   POST   /teams/:id/archive           teamfit:manage  soft archive (reason required)
//   GET    /sessions                    teamfit:read    team-fit session list
//   GET    /sessions/:teamfitId         teamfit:read    conversation + observations
//
// Permanent rules (Track 5.2, unchanged): every member must carry the
// teamfit_profile_use consent scope; observations are QUALITATIVE ONLY — no
// numeric fit score exists anywhere, and this console adds none. Removing a
// member never rewrites recorded simulations. Starting simulations remains on
// the flag-gated plane (PRISM_TEAMFIT) — the console manages data, not runs.

import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import logger from '../../lib/logger.js'
import { query } from '../../db/pool.js'
import { requirePermission } from '../../lib/adminAuth.js'
import { adminAudit } from '../../lib/adminAudit.js'
import { isTeamfitEnabled, TEAMFIT_CONSENT_SCOPE, verifyTeamConsent } from '../../lib/teamfit.js'

const router = Router()

router.get('/teams', requirePermission('teamfit:read'), async (req, res) => {
  try {
    const r = await query(
      `SELECT t.team_id, t.name, t.created_at, t.archived_at,
              COUNT(DISTINCT m.member_session_id)::int AS members,
              (SELECT COUNT(*)::int FROM teamfit_sessions s WHERE s.team_id = t.team_id) AS simulations
         FROM teams t LEFT JOIN team_members m ON m.team_id = t.team_id
        GROUP BY t.team_id ORDER BY t.created_at DESC`,
    ).catch(() => null)
    res.json({
      teams: r?.rows || [],
      simulationPlane: isTeamfitEnabled()
        ? 'PRISM_TEAMFIT is ON — simulations run on the flag-gated plane.'
        : 'PRISM_TEAMFIT is OFF — team data can be prepared here, but simulations cannot run until the flag is enabled by an operator (flip-check governs the claim).',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_teams_list_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/teams', requirePermission('teamfit:manage'), async (req, res) => {
  try {
    const { name, memberSessionIds } = req.body || {}
    if (!name || !Array.isArray(memberSessionIds) || memberSessionIds.length < 2) {
      return res.status(400).json({ error: 'name and memberSessionIds (>= 2) are required.' })
    }
    const consent = await verifyTeamConsent(memberSessionIds)
    if (!consent.ok) {
      return res.status(409).json({
        error: `Every member must have granted the '${TEAMFIT_CONSENT_SCOPE}' consent scope on their own session.`,
        missingConsent: consent.missing,
      })
    }
    const teamId = randomUUID()
    await query('INSERT INTO teams (team_id, name) VALUES ($1,$2)', [teamId, String(name).slice(0, 200)])
    for (const sid of memberSessionIds) {
      await query(
        'INSERT INTO team_members (team_id, member_session_id, consent_verified_at) VALUES ($1,$2,now())',
        [teamId, sid],
      )
    }
    await adminAudit(req, {
      action: 'teamfit_team_created', entityType: 'team', entityId: teamId,
      after: { name: String(name).slice(0, 200), members: memberSessionIds.length },
    })
    res.status(201).json({ ok: true, teamId, members: memberSessionIds.length })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_team_create_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/teams/:id', requirePermission('teamfit:read'), async (req, res) => {
  try {
    const team = await query('SELECT * FROM teams WHERE team_id = $1', [req.params.id])
    if (!team?.rows?.length) return res.status(404).json({ error: 'Team not found.' })
    const members = await query(
      'SELECT member_session_id, consent_verified_at FROM team_members WHERE team_id = $1',
      [req.params.id],
    )
    const sims = await query(
      `SELECT teamfit_id, candidate_session_id, jsonb_array_length(turns) AS turn_count,
              (observations IS NOT NULL) AS has_observations, created_at
         FROM teamfit_sessions WHERE team_id = $1 ORDER BY created_at DESC`,
      [req.params.id],
    )
    res.json({ team: team.rows[0], members: members?.rows || [], simulations: sims?.rows || [] })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_team_detail_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/teams/:id/members', requirePermission('teamfit:manage'), async (req, res) => {
  try {
    const { memberSessionId } = req.body || {}
    if (!memberSessionId) return res.status(400).json({ error: 'memberSessionId required.' })
    const team = await query('SELECT team_id, archived_at FROM teams WHERE team_id = $1', [req.params.id])
    if (!team?.rows?.length) return res.status(404).json({ error: 'Team not found.' })
    if (team.rows[0].archived_at) return res.status(409).json({ error: 'Archived teams cannot be modified.' })

    const consent = await verifyTeamConsent([memberSessionId])
    if (!consent.ok) {
      return res.status(409).json({
        error: `This member has not granted the '${TEAMFIT_CONSENT_SCOPE}' consent scope.`,
        missingConsent: consent.missing,
      })
    }
    await query(
      `INSERT INTO team_members (team_id, member_session_id, consent_verified_at)
       VALUES ($1,$2,now()) ON CONFLICT DO NOTHING`,
      [req.params.id, String(memberSessionId)],
    )
    await adminAudit(req, {
      action: 'teamfit_member_added', entityType: 'team', entityId: req.params.id,
      after: { memberSessionId },
    })
    res.json({ ok: true })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_team_member_add_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/teams/:id/members/:sessionId', requirePermission('teamfit:manage'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    const r = await query(
      'DELETE FROM team_members WHERE team_id = $1 AND member_session_id = $2 RETURNING member_session_id',
      [req.params.id, req.params.sessionId],
    )
    if (!r?.rows?.length) return res.status(404).json({ error: 'Member not found on this team.' })
    await adminAudit(req, {
      action: 'teamfit_member_removed', entityType: 'team', entityId: req.params.id,
      before: { memberSessionId: req.params.sessionId }, reason,
    })
    res.json({
      ok: true,
      note: 'Historical simulations recorded with this member remain unchanged — removal only affects future compositions.',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_team_member_remove_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/teams/:id/archive', requirePermission('teamfit:manage'), async (req, res) => {
  try {
    const { reason } = req.body || {}
    if (!reason) return res.status(400).json({ error: 'A reason is required.' })
    const r = await query(
      'UPDATE teams SET archived_at = now() WHERE team_id = $1 AND archived_at IS NULL RETURNING team_id',
      [req.params.id],
    )
    if (!r?.rows?.length) return res.status(409).json({ error: 'Team not found or already archived.' })
    await adminAudit(req, {
      action: 'teamfit_team_archived', entityType: 'team', entityId: req.params.id, reason,
    })
    res.json({ ok: true, note: 'Soft archive — team and its simulation history remain readable.' })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_team_archive_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/sessions', requirePermission('teamfit:read'), async (req, res) => {
  try {
    const r = await query(
      `SELECT s.teamfit_id, s.team_id, t.name AS team_name, s.candidate_session_id,
              jsonb_array_length(s.turns) AS turn_count,
              (s.observations IS NOT NULL) AS has_observations, s.created_at
         FROM teamfit_sessions s JOIN teams t ON t.team_id = s.team_id
        ORDER BY s.created_at DESC LIMIT 200`,
    ).catch(() => null)
    res.json({ sessions: r?.rows || [] })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_teamfit_sessions_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/sessions/:teamfitId', requirePermission('teamfit:read'), async (req, res) => {
  try {
    const r = await query(
      `SELECT s.*, t.name AS team_name FROM teamfit_sessions s
         JOIN teams t ON t.team_id = s.team_id WHERE s.teamfit_id = $1`,
      [req.params.teamfitId],
    )
    const session = r?.rows?.[0]
    if (!session) return res.status(404).json({ error: 'Team-fit session not found.' })
    const consentEvidence = await query(
      'SELECT member_session_id, consent_verified_at FROM team_members WHERE team_id = $1',
      [session.team_id],
    )
    res.json({
      session,
      consentEvidence: consentEvidence?.rows || [],
      note: 'Observations are qualitative only — the no-numeric-fit-score rule is permanent and schema-enforced.',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'admin_teamfit_session_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
