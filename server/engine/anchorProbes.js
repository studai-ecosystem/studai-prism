// Charter §8 — standardized assessment core (flag PRISM_STANDARDIZED_CORE,
// default OFF; ONE LAW: humans flip it at release).
//
// Every served assessment under the flag includes:
//   1. the fixed scenario opening stimulus (the frozen scenario brief — already
//      versioned in the calibration-frozen bank);
//   2. versioned anchor probes (server/prompts/anchor_probes.v1.json) delivered
//      VERBATIM at fixed exchanges — appended deterministically by the server,
//      never LLM-generated, never templated, never avatar-dependent;
//   3. a minimum evidence opportunity per reported dimension;
//   4. defined sufficiency thresholds (bank policy block);
//   5. adaptive steering only AFTER the anchor schedule (the evidence floor);
//   6. an audit row per probe presented (`anchor_probe_presented`);
//   7. fixed-vs-adaptive turn marking (audit rows + item behavior).
//
// AVATAR INVARIANT (structural, by construction): nothing in this module takes
// a candidate name, avatar style or persona — anchor wording and schedule
// CANNOT vary with them. Tests pin this.
//
// Charter §7.2 (UNCONDITIONAL, flag-independent): AI & Digital Fluency is never
// inferred from ordinary conversation. Without the standardized direct probe
// plus a response meeting the threshold, the dimension reports
// `Insufficient evidence` — see evaluateEvidenceSufficiency below.

import { loadPromptJson } from './prompts.js'
import { DIMENSION_KEYS } from '../lib/sharedConstants.js'

export function isStandardizedCoreEnabled() {
  return process.env.PRISM_STANDARDIZED_CORE === 'true'
}

export function anchorProbeBank() {
  return loadPromptJson('anchor_probes.v1')
}

// The anchor scheduled for this exchange, unless one for the same dimension
// was already presented this session. Deterministic; no candidate/avatar input.
export function anchorDueForExchange(exchange, presented = []) {
  const bank = anchorProbeBank()
  const slot = bank.policy.schedule.find((s) => s.exchange === exchange)
  if (!slot) return null
  if ((presented || []).some((p) => p.dimension === slot.dimension)) return null
  const probe = bank.probes[slot.dimension]
  if (!probe) return null
  return {
    exchange,
    dimension: slot.dimension,
    probeId: probe.id,
    text: probe.text,
    version: bank.version,
  }
}

// Appends the anchor text VERBATIM to the final avatar message of a parsed
// turn. Returns true when the probe was placed. Deliberately takes no avatar,
// persona or candidate parameters (invariance by construction).
export function appendAnchorProbe(parsed, anchor) {
  const messages = Array.isArray(parsed?.messages) ? parsed.messages : null
  if (!messages || !messages.length || !anchor?.text) return false
  const last = messages[messages.length - 1]
  if (typeof last?.content !== 'string') return false
  last.content = `${last.content.trim()} ${anchor.text}`.trim()
  return true
}

// Charter §7.2 / §8 — per-dimension evidence sufficiency at scoring time.
//
//   anchorRecords — [{ exchange, dimension, probeId, version }] persisted at
//                   delivery time (session.anchorProbes).
//   history       — full session history; user turn k (1-based) = exchange k.
//   coreEnabled   — PRISM_STANDARDIZED_CORE state for this session.
//
// Rules:
//   * aiDigitalFluency (ALWAYS): sufficient only when its direct anchor probe
//     was presented AND the candidate's next turn meets the word floor.
//   * other dimensions with the core ON: same anchor-response rule.
//   * other dimensions with the core OFF: legacy conversational basis (the
//     whole conversation is the evidence opportunity — v1 behaviour preserved).
export function evaluateEvidenceSufficiency({ anchorRecords = [], history = [], coreEnabled = false } = {}) {
  const bank = anchorProbeBank()
  const minWords = Number(bank.policy.minResponseWords) || 1
  const minOpportunities = Number(bank.policy.minOpportunitiesPerDimension) || 1

  const userTurns = (history || [])
    .filter((m) => m && m.role === 'user')
    .map((m) => String(m.content).replace('[Candidate]: ', ''))

  const respondedCount = {}
  const presentedCount = {}
  for (const rec of anchorRecords || []) {
    if (!rec || !DIMENSION_KEYS.includes(rec.dimension)) continue
    presentedCount[rec.dimension] = (presentedCount[rec.dimension] || 0) + 1
    // The anchor rides the AI reply to exchange N; the candidate's response is
    // exchange N+1, i.e. userTurns[N] (0-based index).
    const response = userTurns[rec.exchange]
    const words = typeof response === 'string' ? response.split(/\s+/).filter(Boolean).length : 0
    if (words >= minWords) respondedCount[rec.dimension] = (respondedCount[rec.dimension] || 0) + 1
  }

  const perDimension = {}
  const insufficient = []
  for (const dim of DIMENSION_KEYS) {
    const presented = presentedCount[dim] || 0
    const responded = respondedCount[dim] || 0
    const anchorSufficient = presented >= minOpportunities && responded >= minOpportunities
    const requiresAnchor = dim === 'aiDigitalFluency' || coreEnabled
    const sufficient = requiresAnchor ? anchorSufficient : true
    perDimension[dim] = {
      basis: anchorSufficient ? 'anchor-probe' : requiresAnchor ? 'none' : 'conversational',
      opportunities: presented,
      responded,
      sufficient,
    }
    if (!sufficient) insufficient.push(dim)
  }

  return { perDimension, insufficient, policyVersion: bank.version }
}
