// Track 5.1 — counterfactual replay (flag PRISM_REPLAY, default OFF).
//
// HARD ISOLATION RULE: nothing in this module (or routes/replay.js) may
// import or call saveReport, issueCredential, recordItemResponse,
// recordTimelineEntry, or the judge panel. Replay produces PRACTICE data in
// the practice_replays ledger only — a certified score can never move because
// of anything that happens here (gate-tested at source level and live).

import { getItemsBySession } from './store.js'
import { query, isDbConfigured } from '../db/pool.js'
import { DIMENSION_KEYS } from './sharedConstants.js'

export function isReplayEnabled() {
  return process.env.PRISM_REPLAY === 'true'
}

export const MAX_REPLAY_TURNS = 3 // a focused practice rep, not a second test

// ── moment detection (pure) ──────────────────────────────────────────────────
// Find the exchanges worth replaying:
//   theta_drop    — consecutive ability_estimates where θ moved DOWN the most
//                   (executive sessions; the conversation's turning points)
//   weak_evidence — the turn where a dimension's evidence signal fell furthest
//                   below that dimension's own session mean (all sessions)
// Deterministic; returns at most `top` moments, one per exchange, strongest first.
export function detectMoments({ items = [], estimates = [], top = 3 } = {}) {
  const moments = []

  // θ movement between consecutive exchanges.
  const est = [...estimates]
    .filter((e) => Number.isFinite(Number(e?.theta_mean)) && Number.isFinite(Number(e?.exchange_no)))
    .sort((a, b) => a.exchange_no - b.exchange_no)
  for (let i = 1; i < est.length; i++) {
    const delta = Number(est[i].theta_mean) - Number(est[i - 1].theta_mean)
    if (delta < 0) {
      moments.push({
        exchangeNo: Number(est[i].exchange_no),
        kind: 'theta_drop',
        dimension: null, // scalar θ; the weak dimension is attached below when known
        magnitude: +Math.abs(delta).toFixed(4),
      })
    }
  }

  // Per-dimension evidence dips from the interpretable per-turn signals.
  const turns = [...items]
    .filter((it) => it && Number.isFinite(Number(it.turnIndex)) && it.signals)
    .sort((a, b) => a.turnIndex - b.turnIndex)
  if (turns.length >= 2) {
    const means = {}
    for (const dim of DIMENSION_KEYS) {
      const vals = turns.map((t) => Number(t.signals[dim]) || 0)
      means[dim] = vals.reduce((s, v) => s + v, 0) / vals.length
    }
    for (const t of turns) {
      let worstDim = null
      let worstGap = 0
      for (const dim of DIMENSION_KEYS) {
        const gap = means[dim] - (Number(t.signals[dim]) || 0)
        if (gap > worstGap) { worstGap = gap; worstDim = dim }
      }
      if (worstDim && worstGap > 0.15) {
        moments.push({
          exchangeNo: Number(t.turnIndex),
          kind: 'weak_evidence',
          dimension: worstDim,
          magnitude: +worstGap.toFixed(4),
        })
      }
    }
  }

  // One moment per exchange (keep the strongest), ranked, capped.
  const byExchange = new Map()
  for (const m of moments) {
    const cur = byExchange.get(m.exchangeNo)
    if (!cur || m.magnitude > cur.magnitude) byExchange.set(m.exchangeNo, m)
  }
  return [...byExchange.values()]
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, Math.max(1, top))
}

// Load everything moment detection needs for a real session.
export async function loadMoments(sessionId, top = 3) {
  const items = await getItemsBySession(sessionId).catch(() => [])
  let estimates = []
  if (isDbConfigured()) {
    const r = await query(
      'SELECT exchange_no, theta_mean FROM ability_estimates WHERE session_id = $1 ORDER BY exchange_no',
      [sessionId],
    ).catch(() => null)
    estimates = r?.rows || []
  }
  return detectMoments({ items, estimates, top })
}

// Reconstruct the conversation as it stood going INTO the chosen exchange:
// everything before the candidate's answer at exchangeNo, so they can try a
// different response to the same question from the same avatars.
export function truncateHistoryForReplay(history, exchangeNo) {
  if (!Array.isArray(history)) return null
  let candidateTurns = 0
  for (let i = 0; i < history.length; i++) {
    if (history[i].role === 'user' && !history[i].content?.startsWith?.('Begin the scenario')) {
      // The opening prompt is also role:user — count only real candidate turns
      // (they are prefixed '[Candidate]: ' by the assessment route).
      if (String(history[i].content).includes('[Candidate]')) {
        candidateTurns += 1
        if (candidateTurns === exchangeNo) return history.slice(0, i)
      }
    }
  }
  return null // exchange not found — session too short
}

// The v1 store deliberately frees a session's transcript at completion
// (saveReport), but the blinded session_transcripts row (Track 6.3) survives.
// Rebuild prompt-shaped history from those turns so completed sessions — the
// only sessions replay applies to — can be reconstructed.
export function historyFromTranscript(turns) {
  if (!Array.isArray(turns) || !turns.length) return null
  const history = []
  for (const t of turns) {
    if (t?.speaker === 'candidate' && t.text) {
      history.push({ role: 'user', content: `[Candidate]: ${t.text}` })
    } else if (t?.text) {
      history.push({
        role: 'assistant',
        content: JSON.stringify({ messages: [{ speaker: t.name || 'Avatar', role: '', content: t.text }] }),
      })
    }
  }
  return history.length ? history : null
}

export async function loadReplayHistory(sessionId, persisted) {
  if (Array.isArray(persisted?.history) && persisted.history.length) return persisted.history
  if (!isDbConfigured()) return null
  const r = await query('SELECT turns FROM session_transcripts WHERE session_id = $1', [sessionId]).catch(() => null)
  return historyFromTranscript(r?.rows?.[0]?.turns)
}
