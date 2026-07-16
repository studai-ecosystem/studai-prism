// Track 5.1 — counterfactual replay routes (flag PRISM_REPLAY, default OFF).
//
//   GET  /api/replay/:sessionId/moments   — the exchanges worth replaying
//   POST /api/replay/:sessionId/start     — reconstruct state at a moment
//   POST /api/replay/message              — try a different answer (practice)
//
// PRACTICE ONLY. This router writes to practice_replays and audit_log and
// nothing else. It must never import or call saveReport, issueCredential,
// recordItemResponse, or recordTimelineEntry (gate-tested at source level):
// a certified score cannot move because of anything that happens here.

import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import logger from '../lib/logger.js'
import { query, isDbConfigured } from '../db/pool.js'
import { getSession, getReport } from '../lib/store.js'
import { auditLog } from '../lib/telemetry.js'
import { isReplayEnabled, loadMoments, truncateHistoryForReplay, loadReplayHistory, MAX_REPLAY_TURNS } from '../lib/replay.js'
import { sanitizeCandidateText } from '../lib/promptSecurity.js'
import { microRateTurn } from '../engine/microRater.js'
import { resolveLanguage } from '../lib/lang.js'
import { conversationModel, createCompletion, fastModel } from '../services/ai/index.js'
import { buildAvatarSystemPrompt, SCENARIOS } from './assessment.js'

const router = Router()

// Invisible without the flag (gate: dark by default).
router.use((_req, res, next) => {
  if (!isReplayEnabled()) return res.status(404).json({ error: 'Not found' })
  next()
})

// Live replay state — in-memory only; the durable record is practice_replays.
const liveReplays = new Map()

router.get('/:sessionId/moments', async (req, res) => {
  try {
    // Replay only exists AFTER certification — the certified session is closed.
    const report = await getReport(req.params.sessionId)
    if (!report) return res.status(404).json({ error: 'No completed assessment for this session.' })
    const moments = await loadMoments(req.params.sessionId)
    auditLog('replay_moments_viewed', req.params.sessionId, { count: moments.length })
    res.json({ practice: true, moments })
  } catch (err) {
    logger.captureException(err, { msg: 'replay_moments_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Could not compute moments' })
  }
})

router.post('/:sessionId/start', async (req, res) => {
  const sessionId = req.params.sessionId
  const exchangeNo = Number(req.body?.exchangeNo)
  if (!Number.isInteger(exchangeNo) || exchangeNo < 1) {
    return res.status(400).json({ error: 'exchangeNo (>=1) required' })
  }
  try {
    const report = await getReport(sessionId)
    if (!report) return res.status(404).json({ error: 'No completed assessment for this session.' })
    const persisted = await getSession(sessionId)
    const scenario = SCENARIOS.find((s) => s.id === persisted?.scenarioId)
    // The live store frees the transcript at completion — rebuild from the
    // durable blinded transcript (Track 6.3) when needed.
    const fullHistory = await loadReplayHistory(sessionId, persisted)
    if (!fullHistory || !scenario) return res.status(404).json({ error: 'Session history unavailable.' })

    const history = truncateHistoryForReplay(fullHistory, exchangeNo)
    if (!history) return res.status(400).json({ error: 'That exchange cannot be replayed.' })

    const moments = await loadMoments(sessionId, 10)
    const moment = moments.find((m) => m.exchangeNo === exchangeNo) || null
    const replayId = randomUUID()
    const language = resolveLanguage(persisted?.language)
    liveReplays.set(replayId, { sessionId, scenario, history, exchangeNo, turns: 0, language })

    if (isDbConfigured()) {
      await query(
        `INSERT INTO practice_replays (replay_id, source_session_id, exchange_no, moment)
         VALUES ($1,$2,$3,$4)`,
        [replayId, sessionId, exchangeNo, moment ? JSON.stringify(moment) : null],
      ).catch((err) => logger.captureException(err, { msg: 'practice_replay_insert_failed' }))
    }
    auditLog('replay_started', sessionId, { replayId, exchangeNo, moment })

    // Resend the avatar turn the candidate is replaying against.
    const lastAi = [...history].reverse().find((m) => m.role === 'assistant')
    let replayAgainst = null
    try { replayAgainst = JSON.parse(lastAi?.content || '')?.messages || null } catch { /* raw */ }
    res.json({
      practice: true,
      replayId,
      exchangeNo,
      moment,
      scenario: { title: scenario.title, domain: scenario.domain, context: scenario.context },
      replayAgainst,
      turnsAllowed: MAX_REPLAY_TURNS,
      note: 'Practice replay — nothing here changes your certified score or credential.',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'replay_start_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Could not start replay' })
  }
})

router.post('/message', async (req, res) => {
  const { replayId, message: rawMessage } = req.body || {}
  if (!replayId || !rawMessage) return res.status(400).json({ error: 'replayId and message required' })
  const live = liveReplays.get(replayId)
  if (!live) return res.status(404).json({ error: 'Replay not found or expired.' })
  if (live.turns >= MAX_REPLAY_TURNS) return res.status(410).json({ error: 'Replay complete — start a new one.' })
  const message = sanitizeCandidateText(String(rawMessage), 4000)

  try {
    const avatarSystem = buildAvatarSystemPrompt(live.scenario, 1, live.language)
    const updatedHistory = [...live.history, { role: 'user', content: `[Candidate]: ${message}` }]
    const response = await createCompletion({
      model: conversationModel(),
      max_completion_tokens: 350,
      temperature: 0.85,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: avatarSystem },
        { role: 'system', content: 'PRACTICE REPLAY: the candidate is retrying this moment. Respond in character to their new answer; be natural, then gently move the scene forward.' },
        ...updatedHistory,
      ],
    }, { task: 'replay' })
    const raw = response.choices[0].message.content
    const parsed = JSON.parse(raw)

    // Practice-only per-dimension feedback (micro levels). Clearly labeled;
    // stored ONLY in the practice ledger.
    const practiceLevels = await microRateTurn(message, { createCompletion, model: fastModel(), language: live.language })

    live.history = [...updatedHistory, { role: 'assistant', content: raw }]
    live.turns += 1
    liveReplays.set(replayId, live)

    if (isDbConfigured()) {
      await query(
        `UPDATE practice_replays
            SET turns = turns || $2::jsonb
          WHERE replay_id = $1`,
        [replayId, JSON.stringify([
          { role: 'candidate', content: message, practiceLevels },
          { role: 'avatars', content: parsed.messages || [] },
        ])],
      ).catch((err) => logger.captureException(err, { msg: 'practice_replay_update_failed' }))
    }
    auditLog('replay_turn', live.sessionId, { replayId, turn: live.turns })

    res.json({
      practice: true,
      ...parsed,
      practiceLevels,
      turnsRemaining: MAX_REPLAY_TURNS - live.turns,
      note: 'Practice feedback only — your certified score is unchanged.',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'replay_message_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Replay turn failed' })
  }
})

export default router
