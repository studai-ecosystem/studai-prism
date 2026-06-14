// PRISM-Director — the rubric-steered Executive engine (Prism v2 — Phase 1).
//
// Replaces the old fixed avatar-style cadence (style cycled 1→2→3 every few
// turns regardless of what the candidate had shown). Following Project
// Vantage's "Executive LLM" principle, one controller now steers the multi-
// agent conversation to MAXIMISE skill-evidence density:
//
//   • It tracks accumulated evidence per dimension (fed by the interpretable
//     behavioral-feature extractor — no extra LLM call).
//   • Each turn it targets the dimension with the THINNEST evidence so far.
//   • The challenger ("speaks only when needed" character) is deployed
//     ADAPTIVELY — only when evidence for the targeted dimension is thin and we
//     are past the opening turns — instead of on a blind fixed cadence.
//   • It emits a natural-language directive injected into the avatar system
//     prompt, steering whoever speaks this turn toward the target dimension.
//
// This is the "rubric-steered multi-agent elicitation method" component.

import { DIMENSION_KEYS } from './behavioralFeatures.js'

// Human-readable label + the kind of probe that best elicits each dimension.
const DIMENSION_PROBES = {
  criticalThinking:
    'Probe their reasoning: ask what information they are missing, what they are assuming, or introduce a fact that should make them reconsider their position.',
  communication:
    'Probe their clarity: ask them to make their point more concrete, or say "I\'m not sure I follow — can you put that simply?" so they have to restate it clearly.',
  collaboration:
    'Probe how they work with people: voice a different opinion from one character and see whether they acknowledge it before responding, or look for a solution that works for everyone.',
  problemSolving:
    'Probe their approach: ask for more than one option, what they would give up for what they gain, or add a new constraint (less time, less money) and see if they adapt.',
  aiDigitalFluency:
    'Probe their use of data/tools: ask how data, automation, or an AI tool could help here, or whether some information could be biased or wrongly generated — but only if it fits naturally.',
}

const DIMENSION_LABEL = {
  criticalThinking: 'Critical Thinking',
  communication: 'Communication',
  collaboration: 'Collaboration',
  problemSolving: 'Problem Solving',
  aiDigitalFluency: 'AI & Digital Fluency',
}

function isEnabled() {
  return (process.env.PRISM_DIRECTOR_ENABLED ?? 'true') !== 'false'
}

// Fresh evidence ledger — one running total per dimension.
export function emptyEvidence() {
  const e = {}
  for (const dim of DIMENSION_KEYS) e[dim] = 0
  return e
}

// Fold a turn's per-dimension signals into the running evidence ledger.
export function accumulateEvidence(evidence, signals) {
  const next = { ...emptyEvidence(), ...(evidence || {}) }
  if (signals) {
    for (const dim of DIMENSION_KEYS) {
      next[dim] = +((next[dim] || 0) + (signals[dim] || 0)).toFixed(3)
    }
  }
  return next
}

// The dimension that has accumulated the LEAST evidence so far (ties broken by
// the canonical order, which front-loads the higher-weighted dimensions).
export function thinnestDimension(evidence) {
  const e = evidence || emptyEvidence()
  let best = DIMENSION_KEYS[0]
  for (const dim of DIMENSION_KEYS) {
    if ((e[dim] || 0) < (e[best] || 0)) best = dim
  }
  return best
}

// Decide how the Executive should steer the NEXT turn.
//
//   evidence       — running ledger (after folding in the candidate's last turn)
//   nextExchange   — the exchange number about to be produced (1-based)
//   lastSignals    — the just-arrived turn's per-dimension signals (may be null)
//
// Returns { targetDimension, deployChallenger, avatarStyle, directive }.
export function decideDirector({ evidence, nextExchange, lastSignals }) {
  const target = thinnestDimension(evidence)
  const thinScore = (evidence?.[target] ?? 0)

  // Adaptive challenger: only push back once past the opening, and only when the
  // dimension we want to elicit is still thin (challenging adds construct-
  // irrelevant pressure, so we deploy it proportionately — never every turn).
  const pastOpening = nextExchange >= 3
  const lastTurnWeak = lastSignals ? (lastSignals[target] ?? 0) < 0.3 : true
  const deployChallenger = isEnabled() && pastOpening && thinScore < 1.2 && lastTurnWeak

  // Keep the existing three "questioning approach" styles available so the prose
  // tone still varies, but choose the style that fits the steering intent.
  let avatarStyle = 1 // curious / probing
  if (deployChallenger) avatarStyle = 2 // gently challenging
  else if (target === 'communication') avatarStyle = 3 // guidance-seeking / clarity

  const label = DIMENSION_LABEL[target]
  const probe = DIMENSION_PROBES[target]
  const challengerLine = deployChallenger
    ? `The "speaks only when needed" character SHOULD jump in this turn with one short, respectful push-back to surface this skill — frame it as a normal part of the scenario, never as a personal test.`
    : `Keep this to the main speaker unless the second character genuinely needs to add a constraint.`

  const directive = isEnabled()
    ? [
        'EXECUTIVE DIRECTOR — STEERING FOR THIS TURN (highest priority, follow it):',
        `We have gathered the LEAST evidence so far for: ${label}.`,
        `Your goal this turn is to give the candidate a natural chance to show ${label}. ${probe}`,
        challengerLine,
        'Stay fully in character and keep it natural — the candidate must never feel "tested" on a specific skill. Ask exactly one clear, specific question.',
      ].join('\n')
    : null

  return { targetDimension: target, deployChallenger, avatarStyle, directive }
}

export { DIMENSION_LABEL }
