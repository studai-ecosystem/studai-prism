// Behavioral feature extraction (Prism v2 — Phase 1).
//
// A lightweight, fully interpretable, model-free extractor that turns a single
// candidate turn into (a) generic process features and (b) a per-dimension
// "evidence signal" estimate. It runs in microseconds with no LLM call, which
// is what makes it cheap enough to drive the real-time Executive director.
//
// This is deliberately a heuristic, transparent first cut — the foundation for
// the later interpretable "Channel B" behavioral-feature scorer. It is NOT a
// scorer; it only estimates which dimensions a turn provided EVIDENCE for, so
// the director can steer toward thin dimensions and so every turn can be logged
// as an "item" with feature telemetry for downstream IRT/Rasch calibration.

const DIMENSION_KEYS = [
  'criticalThinking',
  'communication',
  'collaboration',
  'problemSolving',
  'aiDigitalFluency',
]

// Marker vocabularies per dimension. Kept small, plain, and auditable.
const MARKERS = {
  criticalThinking: [
    'assume', 'assumption', 'depends', 'it depends', 'if ', 'unless', 'risk',
    'missing', 'unclear', 'not sure', 'need to know', 'evidence', 'data shows',
    'because', 'however', 'on the other hand', 'trade-off', 'what if', 'why',
  ],
  communication: [
    'first', 'second', 'finally', 'in short', 'to be clear', 'the point is',
    'so that', 'which means', 'for example', 'specifically', 'in other words',
    'let me explain', 'my point is',
  ],
  collaboration: [
    'i understand', 'i hear', 'i agree', 'good point', 'fair point', 'your point',
    "you're right", 'you are right', "let's", 'together', 'we could', 'we should',
    'i see where', 'that makes sense', 'how about we', 'compromise', 'both',
  ],
  problemSolving: [
    'option', 'alternative', 'instead', 'another way', 'plan', 'step', 'first we',
    'then we', 'trade-off', 'budget', 'within', 'given that', 'constraint',
    'prioritise', 'prioritize', 'short term', 'long term', 'backup',
  ],
  aiDigitalFluency: [
    'ai', 'a.i', 'automate', 'automation', 'data', 'analytics', 'algorithm',
    'model', 'dashboard', 'tool', 'software', 'system', 'bias', 'machine learning',
    'spreadsheet', 'metric', 'track ', 'digital',
  ],
}

const HEDGE_WORDS = ['maybe', 'perhaps', 'i think', 'i guess', 'sort of', 'kind of', 'probably', 'might', 'i suppose']
const CONNECTIVES = ['because', 'therefore', 'so that', 'however', 'although', 'while', 'which means', 'as a result', 'in order to']

function countOccurrences(haystack, needle) {
  if (!needle) return 0
  let count = 0
  let idx = haystack.indexOf(needle)
  while (idx !== -1) {
    count += 1
    idx = haystack.indexOf(needle, idx + needle.length)
  }
  return count
}

// Extract interpretable process features + per-dimension evidence signals (0–1)
// from a single candidate turn. `meta` may carry client telemetry like
// responseMs (time-to-answer) which we pass through but never require.
export function extractTurnFeatures(text, meta = {}) {
  const raw = typeof text === 'string' ? text : ''
  const lower = raw.toLowerCase()
  const words = lower.split(/\s+/).filter(Boolean)
  const wordCount = words.length
  const sentences = raw.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean)
  const uniqueWords = new Set(words)

  const questionCount = countOccurrences(raw, '?')
  const hedgeCount = HEDGE_WORDS.reduce((n, w) => n + countOccurrences(lower, w), 0)
  const connectiveCount = CONNECTIVES.reduce((n, w) => n + countOccurrences(lower, w), 0)
  const lexicalDiversity = wordCount ? +(uniqueWords.size / wordCount).toFixed(3) : 0
  const avgSentenceLength = sentences.length ? +(wordCount / sentences.length).toFixed(1) : wordCount

  const features = {
    wordCount,
    sentenceCount: sentences.length,
    avgSentenceLength,
    questionCount,
    hedgeCount,
    connectiveCount,
    lexicalDiversity,
    responseMs: typeof meta.responseMs === 'number' ? meta.responseMs : null,
  }

  // Per-dimension evidence signal: marker density, lightly normalised so a
  // short but on-target answer still registers. Capped at 1.
  const signals = {}
  for (const dim of DIMENSION_KEYS) {
    const hits = MARKERS[dim].reduce((n, m) => n + countOccurrences(lower, m), 0)
    // A turn that is too short or barely engaged gives little evidence anywhere.
    const engagement = Math.min(1, wordCount / 25)
    signals[dim] = +Math.min(1, (hits / 3) * 0.7 + engagement * 0.3 * (hits > 0 ? 1 : 0.4)).toFixed(3)
  }
  // Asking a clarifying question is itself critical-thinking evidence.
  if (questionCount > 0) signals.criticalThinking = +Math.min(1, signals.criticalThinking + 0.2).toFixed(3)

  return { features, signals }
}

export { DIMENSION_KEYS }
