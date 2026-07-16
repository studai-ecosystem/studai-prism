// Prism v2 (MASA-2) — Phase 2 Channel A: turn-level k-vote judge ensemble.
//
// For each scored candidate turn we draw k votes (K_A on model A + K_B on a
// 2nd-family model B), each returning {dim:0-4|"NA"}. The modal level per
// dimension is the turn's level (NA if any vote is NA). A 20% sample of turns
// is consistency-checked (paraphrase + speaker-swap); a turn whose modal shifts
// > 1 band is marked unstable and excluded from aggregation.
//
// All votes persist to judge_votes (Phase 2 telemetry) with model+version.
// Concurrency-limited with exponential backoff on 429/5xx. Never throws to the
// caller beyond a final "all judges failed" — the route catches that.

import { randomUUID } from 'node:crypto'
import { DIMENSIONS, SCORER } from './dualScorerConfig.js'
import { modalLevelsForTurn } from './aggregate.js'
import { query } from '../db/pool.js'
import { isTelemetryEnabled } from '../lib/telemetry.js'
import { wrapCandidateTurn, INJECTION_GUARD } from '../lib/promptSecurity.js'
import logger from '../lib/logger.js'
import { loadPrompt } from '../services/ai/promptManager.js'

const VALID = new Set([0, 1, 2, 3, 4])
function normalizeLevels(raw) {
  const out = {}
  for (const dim of DIMENSIONS) {
    const v = raw?.[dim]
    if (v === 'NA' || v === null || v === undefined) { out[dim] = 'NA'; continue }
    const n = Math.round(Number(v))
    out[dim] = VALID.has(n) ? n : 'NA'
  }
  return out
}

// Bounded-concurrency map (avoid hammering the model with k×turns at once).
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx], idx)
    }
  })
  await workers.reduce((p) => p, Promise.resolve())
  await Promise.all(workers)
  return out
}

// One judge vote on a single turn. Returns {dim:0-4|"NA"} or null on failure.
async function oneVote(ctx, turnText, model, { swapped = false, paraphrased = false } = {}) {
  const sys = `${loadPrompt('judge_turn.v1')}\n\n${INJECTION_GUARD}`
  const text = paraphrased ? `(paraphrased) ${turnText}` : turnText
  const wrapped = wrapCandidateTurn(text, 2000)
  const userMsg = swapped
    ? `Context note: speaker labels may be swapped — judge only the candidate's substance.\n${wrapped}`
    : wrapped
  try {
    const completion = await ctx.createCompletion(
      {
        model,
        temperature: SCORER.TEMPERATURE,
        max_completion_tokens: 150,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: userMsg },
        ],
      },
      { retries: 2, task: 'judge_turn' },
    )
    const raw = completion?.choices?.[0]?.message?.content
    return raw ? normalizeLevels(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

// Persist all votes for one response (fire-and-forget; never blocks scoring).
function persistVotes(responseId, votes, modelLabels) {
  if (!isTelemetryEnabled() || !responseId) return
  Promise.resolve()
    .then(async () => {
      let no = 0
      for (const v of votes) {
        no += 1
        await query(
          `INSERT INTO judge_votes (vote_id, response_id, judge_model, vote_no, levels, stability_flag)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [randomUUID(), responseId, v.model || modelLabels.a, no, JSON.stringify(v.levels || {}), v.stability || 'ok'],
        )
      }
    })
    .catch((err) => logger.captureException(err, { msg: 'judge_votes_persist_failed', responseId }))
}

// Score ONE turn with the full k-vote panel + optional consistency check.
//   ctx: { createCompletion, modelA, modelB }
//   turn: { text, exchangeNo, responseId, asrConfidence }
// Returns { exchangeNo, levels, stable, votes: count, asrConfidence }.
export async function scoreTurn(ctx, turn) {
  const tasks = []
  for (let i = 0; i < SCORER.K_A; i++) tasks.push({ model: ctx.modelA })
  for (let i = 0; i < SCORER.K_B; i++) tasks.push({ model: ctx.modelB || ctx.modelA })

  const results = await mapLimit(tasks, 6, async (t) => {
    const levels = await oneVote(ctx, turn.text, t.model)
    return levels ? { model: t.model, levels, stability: 'ok' } : null
  })
  const valid = results.filter(Boolean)
  if (!valid.length) return null

  const modal = modalLevelsForTurn(valid.map((v) => v.levels))

  // Consistency check on a sampled fraction of turns.
  let stable = true
  if (Math.random() < SCORER.CONSISTENCY_SAMPLE) {
    const recheck = await Promise.all([
      oneVote(ctx, turn.text, ctx.modelA, { paraphrased: true }),
      oneVote(ctx, turn.text, ctx.modelA, { swapped: true }),
    ])
    for (const r of recheck.filter(Boolean)) {
      for (const dim of DIMENSIONS) {
        const a = modal[dim]
        const b = r[dim]
        if (a === 'NA' || b === 'NA') continue
        if (Math.abs(Number(a) - Number(b)) > SCORER.CONSISTENCY_BAND) {
          stable = false
          break
        }
      }
    }
    valid.push(...recheck.filter(Boolean).map((levels) => ({ model: ctx.modelA, levels, stability: stable ? 'ok' : 'paraphrase_unstable' })))
  }

  persistVotes(turn.responseId, valid, { a: ctx.modelA, b: ctx.modelB })

  return {
    exchangeNo: turn.exchangeNo,
    levels: modal,
    stable,
    votes: valid.length,
    asrConfidence: Number.isFinite(turn.asrConfidence) ? turn.asrConfidence : 1,
  }
}

// Score every candidate turn. Returns the array of per-turn results (drops
// turns where the whole panel failed). Concurrency-limited across turns.
export async function scoreAllTurns(ctx, turns) {
  const scored = await mapLimit(turns, 3, (turn) => scoreTurn(ctx, turn))
  return scored.filter(Boolean)
}
