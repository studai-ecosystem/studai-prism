// Track 5.2 — team-fit simulation routes (flag PRISM_TEAMFIT, default OFF).
//
// Admin-gated B2B surface (x-admin-token):
//   POST /api/teamfit/teams          — register a team from CONSENTED member sessions
//   GET  /api/teamfit/teams          — list teams
//   POST /api/teamfit/session        — start a candidate-vs-twins conversation
//   POST /api/teamfit/message        — one conversation turn
//   POST /api/teamfit/observations   — qualitative observations (NO fit score, ever)
//
// Consent gate: every member session must carry the OPTIONAL
// teamfit_profile_use scope; registration refuses (409) listing the members
// still missing it. No numeric fit output exists anywhere on this surface —
// enforced by schema, by assertNoNumericFit, and by gate tests.

import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import logger from '../lib/logger.js'
import { query, isDbConfigured } from '../db/pool.js'
import { auditLog } from '../lib/telemetry.js'
import {
  isTeamfitEnabled, TEAMFIT_CONSENT_SCOPE, verifyTeamConsent, composeTwins,
  sanitizeObservations, assertNoNumericFit,
} from '../lib/teamfit.js'
import { sanitizeCandidateText, INJECTION_GUARD } from '../lib/promptSecurity.js'
import { renderPrompt } from '../engine/prompts.js'
import { createCompletion, MODEL, buildAvatarSystemPrompt, SCENARIOS } from './assessment.js'

const router = Router()

// Invisible without the flag; admin-token gated beyond that (dark B2B surface).
router.use((req, res, next) => {
  if (!isTeamfitEnabled()) return res.status(404).json({ error: 'Not found' })
  const expected = process.env.ADMIN_TOKEN
  if (!expected) return res.status(503).json({ error: 'teamfit disabled (set ADMIN_TOKEN)' })
  if (req.get('x-admin-token') !== expected) return res.status(401).json({ error: 'unauthorized' })
  if (!isDbConfigured()) return res.status(503).json({ error: 'no database configured' })
  next()
})

const liveTeamfits = new Map()
const MAX_TEAMFIT_TURNS = 6

router.post('/teams', async (req, res) => {
  const { name, memberSessionIds } = req.body || {}
  if (!name || !Array.isArray(memberSessionIds) || memberSessionIds.length < 2) {
    return res.status(400).json({ error: 'name and memberSessionIds (>=2) required' })
  }
  try {
    // 5.2 consent gate: verify EVERY profile-source member; stop if missing.
    const consent = await verifyTeamConsent(memberSessionIds)
    if (!consent.ok) {
      auditLog('teamfit_consent_refused', null, { missing: consent.missing.length })
      return res.status(409).json({
        error: `Every team member must have granted the '${TEAMFIT_CONSENT_SCOPE}' consent scope on their own session.`,
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
    auditLog('teamfit_team_registered', null, { teamId, members: memberSessionIds.length })
    res.status(201).json({ teamId, members: memberSessionIds.length })
  } catch (err) {
    logger.captureException(err, { msg: 'teamfit_team_failed' })
    res.status(500).json({ error: 'failed to register team' })
  }
})

router.get('/teams', async (_req, res) => {
  const r = await query(
    `SELECT t.team_id, t.name, t.created_at, COUNT(m.member_session_id)::int AS members
       FROM teams t LEFT JOIN team_members m ON m.team_id = t.team_id
      GROUP BY t.team_id ORDER BY t.created_at DESC`,
  ).catch(() => null)
  res.json({ teams: r?.rows || [] })
})

router.post('/session', async (req, res) => {
  const { teamId, candidateSessionId } = req.body || {}
  if (!teamId) return res.status(400).json({ error: 'teamId required' })
  try {
    const members = await query('SELECT member_session_id FROM team_members WHERE team_id = $1', [teamId])
    if (!members?.rows?.length) return res.status(404).json({ error: 'unknown team' })
    const twins = await composeTwins(members.rows.map((m) => m.member_session_id))
    if (twins.length < 2) return res.status(422).json({ error: 'need at least 2 members with completed reports' })

    // Twin scenario: an active scenario's situation, played by the twins.
    const base = SCENARIOS.find((s) => !s.retired)
    const scenario = { ...base, participants: twins }
    const teamfitId = randomUUID()

    const opening = await createCompletion({
      model: MODEL(),
      max_completion_tokens: 350,
      temperature: 0.8,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildAvatarSystemPrompt(scenario, 1) },
        { role: 'user', content: 'Begin the scenario now. The FIRST twin opens: explain the situation simply and ask the candidate one friendly question about how they would start working with this team on it. Return the single message in the messages array.' },
      ],
    })
    const raw = opening.choices[0].message.content
    const history = [{ role: 'assistant', content: raw }]
    liveTeamfits.set(teamfitId, { teamId, scenario, history, turns: 0 })

    await query(
      'INSERT INTO teamfit_sessions (teamfit_id, team_id, candidate_session_id) VALUES ($1,$2,$3)',
      [teamfitId, teamId, candidateSessionId || null],
    ).catch((err) => logger.captureException(err, { msg: 'teamfit_session_insert_failed' }))
    auditLog('teamfit_session_started', candidateSessionId || null, { teamfitId, teamId, twins: twins.length })

    res.status(201).json({
      teamfitId,
      scenario: { title: scenario.title, domain: scenario.domain, context: scenario.context },
      twins: twins.map((t) => ({ name: t.name, role: t.role })),
      ...JSON.parse(raw),
      turnsAllowed: MAX_TEAMFIT_TURNS,
    })
  } catch (err) {
    logger.captureException(err, { msg: 'teamfit_session_failed' })
    res.status(500).json({ error: 'failed to start teamfit session' })
  }
})

router.post('/message', async (req, res) => {
  const { teamfitId, message: rawMessage } = req.body || {}
  if (!teamfitId || !rawMessage) return res.status(400).json({ error: 'teamfitId and message required' })
  const live = liveTeamfits.get(teamfitId)
  if (!live) return res.status(404).json({ error: 'teamfit session not found or expired' })
  if (live.turns >= MAX_TEAMFIT_TURNS) return res.status(410).json({ error: 'conversation complete — request observations' })
  const message = sanitizeCandidateText(String(rawMessage), 4000)
  try {
    const updatedHistory = [...live.history, { role: 'user', content: `[Candidate]: ${message}` }]
    const response = await createCompletion({
      model: MODEL(),
      max_completion_tokens: 350,
      temperature: 0.85,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildAvatarSystemPrompt(live.scenario, live.turns % 2 === 0 ? 1 : 2) },
        ...updatedHistory,
      ],
    })
    const raw = response.choices[0].message.content
    live.history = [...updatedHistory, { role: 'assistant', content: raw }]
    live.turns += 1
    liveTeamfits.set(teamfitId, live)
    await query(
      'UPDATE teamfit_sessions SET turns = turns || $2::jsonb WHERE teamfit_id = $1',
      [teamfitId, JSON.stringify([{ role: 'candidate', content: message }, { role: 'twins', content: JSON.parse(raw).messages || [] }])],
    ).catch(() => {})
    auditLog('teamfit_turn', null, { teamfitId, turn: live.turns })
    res.json({ ...JSON.parse(raw), turnsRemaining: MAX_TEAMFIT_TURNS - live.turns })
  } catch (err) {
    logger.captureException(err, { msg: 'teamfit_message_failed' })
    res.status(500).json({ error: 'teamfit turn failed' })
  }
})

router.post('/observations', async (req, res) => {
  const { teamfitId } = req.body || {}
  const live = liveTeamfits.get(teamfitId)
  if (!live) return res.status(404).json({ error: 'teamfit session not found or expired' })
  if (live.turns < 2) return res.status(400).json({ error: 'need at least 2 conversation turns first' })
  try {
    const transcript = live.history
      .map((m) => {
        if (m.role === 'user') return `CANDIDATE: ${String(m.content).replace('[Candidate]: ', '')}`
        try { return (JSON.parse(m.content).messages || []).map((x) => `${x.speaker}: ${x.content}`).join('\n') } catch { return m.content }
      })
      .join('\n\n')
    const personas = live.scenario.participants
      .map((p) => `- ${p.name}: ${p.personality}`)
      .join('\n')
    const response = await createCompletion({
      model: MODEL(),
      max_completion_tokens: 900,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: renderPrompt('teamfit_observer.v1', { PERSONAS: personas, TRANSCRIPT: transcript, INJECTION_GUARD }) },
        { role: 'user', content: 'Produce the observations JSON now.' },
      ],
    })
    const clean = sanitizeObservations(JSON.parse(response.choices[0].message.content))
    assertNoNumericFit(clean) // structural guarantee, throws on violation
    await query(
      'UPDATE teamfit_sessions SET observations = $2 WHERE teamfit_id = $1',
      [teamfitId, JSON.stringify(clean)],
    ).catch(() => {})
    auditLog('teamfit_observations', null, { teamfitId, observations: clean.observations.length })
    res.json(clean)
  } catch (err) {
    logger.captureException(err, { msg: 'teamfit_observations_failed' })
    res.status(500).json({ error: 'failed to produce observations' })
  }
})

export default router
