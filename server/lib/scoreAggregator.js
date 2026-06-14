// Score aggregator + uncertainty quantification (Prism v2 — Phase 1).
//
// Takes the panel's individual judge samples and produces ONE defensible score
// per dimension by voting, plus an interpretable measure of how much the judges
// (and their position-swapped twins) DISAGREED. Wide disagreement is the signal
// that turns "an AI score" into "a score we know how confident we are in":
//
//   • Per-dimension central estimate  = MEDIAN across samples (robust to a
//     single outlier judge), then weighted-recomputed overall downstream.
//   • Per-dimension confidence band   = half the interquartile-style spread,
//     reported as ± points (a simple, honest dispersion band — NOT a calibrated
//     conformal interval yet; that arrives with the Channel-B work).
//   • Panel agreement                 = 1 − normalised mean dispersion (0–1).
//   • flaggedForReview                = true when agreement is low OR any single
//     dimension's spread is large → route to a second pass / human review.
//
// The narrative fields (feedback / evidence / highlights / growthAreas) are
// taken from the sample whose dimension scores sit CLOSEST to the medians (the
// "representative" judge), so the prose matches the reported numbers.

const DIMENSION_KEYS = [
  'criticalThinking',
  'communication',
  'collaboration',
  'problemSolving',
  'aiDigitalFluency',
]

function median(nums) {
  const arr = nums.filter((n) => typeof n === 'number' && Number.isFinite(n)).slice().sort((a, b) => a - b)
  if (!arr.length) return 0
  const mid = Math.floor(arr.length / 2)
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2
}

// Spread = half the distance between the 25th and 75th percentile-ish points,
// degrading gracefully for tiny sample counts (uses min/max when n < 4).
function spread(nums) {
  const arr = nums.filter((n) => typeof n === 'number' && Number.isFinite(n)).slice().sort((a, b) => a - b)
  if (arr.length < 2) return 0
  if (arr.length < 4) return (arr[arr.length - 1] - arr[0]) / 2
  const q1 = arr[Math.floor(arr.length * 0.25)]
  const q3 = arr[Math.floor(arr.length * 0.75)]
  return (q3 - q1) / 2
}

// Reliability label thresholds (points of half-spread / agreement).
function reliabilityLabel(agreement, maxBand) {
  if (agreement >= 0.85 && maxBand <= 6) return 'high'
  if (agreement >= 0.7 && maxBand <= 12) return 'moderate'
  return 'low'
}

// samples: array of { scores:{dim:0-100,...}, feedback, evidence, highlights,
//                     growthAreas, _meta:{id,persona,model,swapped,dimensionOrder} }
export function aggregateSamples(samples) {
  const valid = (samples || []).filter((s) => s && s.scores)
  if (!valid.length) return null

  const scores = {}
  const perDimensionBand = {}
  const bands = []
  for (const dim of DIMENSION_KEYS) {
    const vals = valid.map((s) => Number(s.scores[dim])).filter((n) => Number.isFinite(n))
    scores[dim] = Math.round(median(vals))
    const band = Math.round(spread(vals))
    perDimensionBand[dim] = band
    bands.push(band)
  }

  const meanBand = bands.reduce((a, b) => a + b, 0) / (bands.length || 1)
  const maxBand = Math.max(0, ...bands)
  // Map mean dispersion (0..~25 pts realistic) onto a 0..1 agreement score.
  const agreement = +Math.max(0, Math.min(1, 1 - meanBand / 25)).toFixed(3)

  // Position-swap consistency: compare the median of swapped vs non-swapped
  // samples per dimension. A large gap means ordering moved the judge.
  const swapped = valid.filter((s) => s._meta?.swapped)
  const unswapped = valid.filter((s) => !s._meta?.swapped)
  let positionSwapDelta = null
  if (swapped.length && unswapped.length) {
    let sum = 0
    for (const dim of DIMENSION_KEYS) {
      const a = median(swapped.map((s) => Number(s.scores[dim])))
      const b = median(unswapped.map((s) => Number(s.scores[dim])))
      sum += Math.abs(a - b)
    }
    positionSwapDelta = +(sum / DIMENSION_KEYS.length).toFixed(1)
  }

  // Pick the representative sample (closest to the medians) for the prose.
  let rep = valid[0]
  let bestDist = Infinity
  for (const s of valid) {
    let dist = 0
    for (const dim of DIMENSION_KEYS) dist += Math.abs(Number(s.scores[dim]) - scores[dim])
    if (dist < bestDist) {
      bestDist = dist
      rep = s
    }
  }

  const label = reliabilityLabel(agreement, maxBand)
  const flaggedForReview =
    label === 'low' || maxBand > 14 || (positionSwapDelta != null && positionSwapDelta > 12)

  return {
    scores, // medians per dimension (overall recomputed by caller)
    feedback: rep.feedback || {},
    evidence: rep.evidence || {},
    highlights: Array.isArray(rep.highlights) ? rep.highlights : [],
    growthAreas: Array.isArray(rep.growthAreas) ? rep.growthAreas : [],
    reliability: {
      method: 'panel-of-evaluators + position-swap (median vote)',
      label, // high | moderate | low
      agreement, // 0..1, judge consensus
      samples: valid.length,
      panel: [...new Set(valid.map((s) => s._meta?.persona).filter(Boolean))],
      models: [...new Set(valid.map((s) => s._meta?.model).filter(Boolean))],
      perDimensionBand, // ± points per dimension
      positionSwapDelta, // mean abs swap difference (null if not measurable)
      flaggedForReview,
    },
  }
}

export { DIMENSION_KEYS as AGG_DIMENSION_KEYS }
