// Panel of LLM Evaluators (PoLL) + position-swap planner (Prism v2 — Phase 1).
//
// A single prompted LLM judge is a measuring instrument with KNOWN systematic
// error: verbosity bias, position bias, self-preference, and silent calibration
// drift on model swaps. The research-backed mitigation is a *panel*: several
// disjoint judges vote, which beats one large judge at lower cost (Verga et al.
// 2024). We also run each judge under position-SWAPPED rubrics (the five
// dimensions presented in different orders) to neutralise ordering effects.
//
// On a single Bedrock model the "panel" is realised as distinct judge
// PERSONAS at different temperatures + dimension-order swaps. When real extra
// model families are configured via PRISM_JUDGE_MODELS (a comma-separated list
// of additional Bedrock model IDs), they are folded in automatically — so
// the architecture is a true multi-family PoLL the moment a second model exists.

const DIMENSION_KEYS = [
  'criticalThinking',
  'communication',
  'collaboration',
  'problemSolving',
  'aiDigitalFluency',
]

// Distinct evaluator personas. Each nudges the same rubric from a different
// stance so their disagreement is informative rather than redundant.
const PERSONAS = {
  rigor: {
    id: 'rigor',
    temperature: 0.2,
    instruction:
      'You are the RIGOROUS panel member. Hold the evidence bar high: a score is only justified by a specific moment you can point to in the transcript. Do not be swayed by long or confident-sounding answers that lack substance (resist verbosity bias).',
  },
  fairness: {
    id: 'fairness',
    temperature: 0.4,
    instruction:
      'You are the FAIRNESS panel member. The candidate is a student, not a professional. Give the benefit of the doubt for imperfect wording and lack of domain knowledge; reward genuine common-sense reasoning. Guard against penalising non-native phrasing or brevity that still carries a clear idea.',
  },
  evidence: {
    id: 'evidence',
    temperature: 0.3,
    instruction:
      'You are the EVIDENCE-FOCUSED panel member. Anchor every dimension score to a quoted or paraphrased exchange. If a dimension had little opportunity to appear, say so explicitly rather than guessing a number.',
  },
}

const PERSONA_ORDER = ['rigor', 'fairness', 'evidence']

// A few fixed dimension orderings used to position-swap the rubric. Index 0 is
// the canonical order; the rest rotate it so no dimension is always "first".
const DIMENSION_ORDERS = [
  ['criticalThinking', 'communication', 'collaboration', 'problemSolving', 'aiDigitalFluency'],
  ['aiDigitalFluency', 'problemSolving', 'collaboration', 'communication', 'criticalThinking'],
  ['collaboration', 'aiDigitalFluency', 'criticalThinking', 'problemSolving', 'communication'],
  ['problemSolving', 'criticalThinking', 'aiDigitalFluency', 'collaboration', 'communication'],
]

function extraModels() {
  return (process.env.PRISM_JUDGE_MODELS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
}

// How many scoring samples to draw in total. Blueprint target is high (Vantage
// votes 20× per turn); for a full-transcript judge fewer samples are stable, so
// we default to 5 and let deployments raise it via env. Always at least 1.
export function sampleCount() {
  const n = parseInt(process.env.PRISM_JUDGE_SAMPLES || '5', 10)
  if (!Number.isFinite(n) || n < 1) return 5
  return Math.min(n, 25)
}

// Build the panel plan: an array of independent judge-run specs. assessment.js
// executes one LLM completion per spec, then the aggregator votes across them.
//
//   defaultModel — the pinned primary Bedrock model ID.
export function buildPanelPlan(defaultModel) {
  const models = [defaultModel, ...extraModels()]
  const total = sampleCount()
  const plan = []
  for (let i = 0; i < total; i++) {
    const persona = PERSONAS[PERSONA_ORDER[i % PERSONA_ORDER.length]]
    const model = models[i % models.length]
    const dimensionOrder = DIMENSION_ORDERS[i % DIMENSION_ORDERS.length]
    plan.push({
      id: `${persona.id}#${i + 1}`,
      model,
      persona: persona.id,
      personaInstruction: persona.instruction,
      temperature: persona.temperature,
      dimensionOrder,
      // Flag every other sample as the position-swapped twin for the
      // consistency check the aggregator performs.
      swapped: i % 2 === 1,
    })
  }
  return plan
}

export { DIMENSION_KEYS, DIMENSION_ORDERS }
