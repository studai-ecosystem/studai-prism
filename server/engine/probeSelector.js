// Prism v2 (MASA-2) — Phase 1 Probe Selector (the "Executive" decision).
//
// Before each AI turn, decide how to steer the conversation to MAXIMISE skill-
// evidence density:
//   • target dimension = argmax over dims of  weight · (1 − coverage)
//     (the highest-stakes, least-evidenced skill)
//   • facet = a probe angle not yet used this session (rotates so the
//     conversation doesn't repeat the same question shape)
//   • challenger = deploy the push-back character when the target is
//     collaboration OR the last proposal went unchallenged — but NEVER more
//     than allowed in a short window (anti-pressure spacing)
// It emits a natural-language DIRECTOR DIRECTIVE injected at the top of the
// avatar system prompt, plus structured fields for the audit_log.

import { DIMENSIONS, DIMENSION_WEIGHTS, FACETS, STOP_RULE } from './executiveConfig.js'

const DIMENSION_LABEL = {
  criticalThinking: 'Critical Thinking',
  communication: 'Communication',
  collaboration: 'Collaboration',
  problemSolving: 'Problem Solving',
  aiDigitalFluency: 'AI & Digital Fluency',
}

const DIMENSION_PROBES = {
  criticalThinking:
    'ask what information they are missing, what they are assuming, or introduce a fact that should make them reconsider.',
  communication:
    'ask them to make their point more concrete, or say "I\'m not sure I follow — can you put that simply?" so they restate it clearly.',
  collaboration:
    'voice a different opinion from one character and see whether they acknowledge it before responding, or look for a solution that works for everyone.',
  problemSolving:
    'ask for more than one option, what they would give up for what they gain, or add a new constraint (less time, less money) and see if they adapt.',
  aiDigitalFluency:
    'ask how data, automation, or an AI tool could help here, or whether some information could be biased or wrongly generated — only if it fits naturally.',
}

const FACET_HINT = {
  'first-step': 'their very first concrete step',
  cost: 'the cost or budget angle',
  risk: 'the main risk and how they would contain it',
  people: 'how the people involved would react',
  metric: 'how they would measure success',
  tradeoff: 'an explicit trade-off they must accept',
}

// Pick the dimension with the highest weight × evidence-gap.
export function targetDimension(ledger) {
  let best = DIMENSIONS[0]
  let bestScore = -Infinity
  for (const dim of DIMENSIONS) {
    const gap = 1 - (ledger.coverageOf ? ledger.coverageOf(dim) : 0)
    const score = (DIMENSION_WEIGHTS[dim] || 0) * gap
    if (score > bestScore) {
      bestScore = score
      best = dim
    }
  }
  return best
}

// Choose a facet not yet probed this session; once all are used, rotate by turn.
export function pickFacet(usedFacets, exchangeNo) {
  const used = new Set(usedFacets || [])
  const fresh = FACETS.find((f) => !used.has(f))
  if (fresh) return fresh
  return FACETS[(exchangeNo || 0) % FACETS.length]
}

// Decide the Executive steering for the next turn.
//   ledger        — EvidenceLedger instance
//   state         — { nextExchange, usedFacets, challengerTurns: [exchangeNos] }
// Returns { targetDimension, facet, deployChallenger, avatarStyle, directive }.
export function selectProbe(ledger, state = {}) {
  const nextExchange = state.nextExchange || 1
  const target = targetDimension(ledger)
  const facet = pickFacet(state.usedFacets, nextExchange)

  // Adaptive challenger: past the opening, when collaboration is the target or
  // the candidate's last proposal is still unchallenged, AND not used in the
  // previous 2 turns (anti-pressure spacing).
  const pastOpening = nextExchange >= 3
  const recentChallenger = (state.challengerTurns || []).some((t) => nextExchange - t <= 2)
  const targetWantsPushback = target === 'collaboration' || (ledger.coverageOf?.(target) ?? 0) < 0.34
  const deployChallenger = pastOpening && targetWantsPushback && !recentChallenger

  let avatarStyle = 1
  if (deployChallenger) avatarStyle = 2
  else if (target === 'communication') avatarStyle = 3

  const label = DIMENSION_LABEL[target]
  const challengerLine = deployChallenger
    ? 'The "speaks only when needed" character SHOULD jump in this turn with one short, respectful push-back to surface this skill — frame it as a normal part of the scenario, never as a personal test.'
    : 'Keep this to the main speaker unless the second character genuinely needs to add a constraint.'

  const directive = [
    'EXECUTIVE DIRECTOR — STEERING FOR THIS TURN (highest priority, follow it):',
    `We have the LEAST evidence so far for: ${label}.`,
    `Give the candidate a natural chance to show ${label}: ${DIMENSION_PROBES[target]}`,
    `Angle this around ${FACET_HINT[facet]} (a fresh angle we have not used yet).`,
    challengerLine,
    'Stay fully in character and keep it natural — the candidate must never feel "tested" on a specific skill. Ask exactly one clear, specific question in simple everyday English.',
  ].join('\n')

  return { targetDimension: target, facet, deployChallenger, avatarStyle, directive }
}

// ── Adaptive stop / extend rule (conversation-CAT) ────────────────────────────
// Decide whether to stop early, extend with a targeted probe, or continue.
//   ledger        — EvidenceLedger
//   opts          — { earlyStopEnabled, extensionsUsed, atLimit }
// Returns { action: 'stop'|'extend'|'continue', reason, thinDimension }.
export function stopDecision(ledger, opts = {}) {
  const exchanges = ledger.exchange_count || 0
  if (exchanges < STOP_RULE.MIN_EXCHANGES) {
    return { action: 'continue', reason: 'below_min_exchanges' }
  }

  const minCov = ledger.minCoverage ? ledger.minCoverage() : 0
  const thetaVar = ledger.theta?.var ?? 1

  // Early stop (only when explicitly enabled): confident AND well-covered.
  if (opts.earlyStopEnabled && thetaVar < STOP_RULE.THETA_VAR_STOP && minCov >= STOP_RULE.COVERAGE_STOP) {
    return { action: 'stop', reason: 'confident_and_covered' }
  }

  // Extend (at the time/turn limit) when a dimension is still thin.
  if (opts.atLimit) {
    if (minCov < STOP_RULE.COVERAGE_EXTEND && (opts.extensionsUsed || 0) < STOP_RULE.MAX_EXTENSIONS) {
      let thin = DIMENSIONS[0]
      let lowest = Infinity
      for (const dim of DIMENSIONS) {
        const c = ledger.coverageOf ? ledger.coverageOf(dim) : 0
        if (c < lowest) { lowest = c; thin = dim }
      }
      return { action: 'extend', reason: 'thin_dimension_at_limit', thinDimension: thin }
    }
    return { action: 'stop', reason: 'limit_reached' }
  }

  return { action: 'continue', reason: 'evidence_incomplete' }
}

export { DIMENSION_LABEL }
