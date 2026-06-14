// Prism v2 (MASA-2) — Phase 1 Micro-Rater.
//
// After each candidate turn, one fast/cheap chat call rates that SINGLE turn
// against the five dimensions' behavioral anchors, returning {dim: 0-4|"NA"}.
// Used to update the EvidenceLedger (coverage + Bayesian θ). It must NEVER block
// or fail the conversation: on any error/timeout it returns null and the caller
// falls back to the interpretable behavioral-feature signals.

import { loadPrompt } from './prompts.js'
import { DIMENSIONS } from './executiveConfig.js'

const VALID = new Set([0, 1, 2, 3, 4])

// Coerce one raw value into 0-4 (integer) or "NA". Anything unparseable → "NA".
function coerceLevel(v) {
  if (v === 'NA' || v === null || v === undefined) return 'NA'
  const n = Math.round(Number(v))
  return VALID.has(n) ? n : 'NA'
}

// Normalize the model's JSON into a complete {dim: 0-4|"NA"} map.
export function normalizeLevels(raw) {
  const out = {}
  for (const dim of DIMENSIONS) out[dim] = coerceLevel(raw?.[dim])
  return out
}

// Rate one candidate turn.
//   candidateText — the candidate's message
//   ctx.createCompletion — the resilient chat fn from the route (injected)
//   ctx.model — model id
// Returns {dim: 0-4|"NA"} or null on failure. Never throws.
export async function microRateTurn(candidateText, ctx) {
  const text = String(candidateText || '').trim()
  if (!text || !ctx?.createCompletion) return null
  try {
    const completion = await ctx.createCompletion(
      {
        model: ctx.model,
        temperature: 0,
        max_completion_tokens: 150,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: loadPrompt('micro_rater.v1') },
          { role: 'user', content: `Candidate turn:\n"""${text.slice(0, 2000)}"""` },
        ],
      },
      { retries: 1 },
    )
    const rawContent = completion?.choices?.[0]?.message?.content
    if (!rawContent) return null
    return normalizeLevels(JSON.parse(rawContent))
  } catch {
    return null // graceful: caller falls back to behavioral signals
  }
}
