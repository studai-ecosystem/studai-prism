// Quadratically-weighted Cohen's kappa — the agreement statistic Vantage's
// validation used and the IRR gate for the human-rating workbench (T6.3).
//
// Pure functions, no I/O. Categories are ordinal integers 0..4 (rubric
// levels); 'NA' pairs are excluded pairwise.

// ratingsA/ratingsB: arrays of equal length with values 0-4 (numbers) or 'NA'.
export function quadraticWeightedKappa(ratingsA, ratingsB, categories = 5) {
  if (!Array.isArray(ratingsA) || !Array.isArray(ratingsB) || ratingsA.length !== ratingsB.length) {
    throw new Error('kappa: rating arrays must be equal-length')
  }
  const pairs = []
  for (let i = 0; i < ratingsA.length; i++) {
    const a = ratingsA[i]
    const b = ratingsB[i]
    if (Number.isInteger(a) && Number.isInteger(b) && a >= 0 && a < categories && b >= 0 && b < categories) {
      pairs.push([a, b])
    }
  }
  const n = pairs.length
  if (n === 0) return null

  // Observed matrix + marginals.
  const O = Array.from({ length: categories }, () => new Array(categories).fill(0))
  for (const [a, b] of pairs) O[a][b] += 1
  const rowSum = O.map((row) => row.reduce((x, y) => x + y, 0))
  const colSum = new Array(categories).fill(0)
  for (let i = 0; i < categories; i++) for (let j = 0; j < categories; j++) colSum[j] += O[i][j]

  // Quadratic disagreement weights w_ij = (i-j)^2 / (k-1)^2.
  const denomW = (categories - 1) ** 2
  let num = 0
  let den = 0
  for (let i = 0; i < categories; i++) {
    for (let j = 0; j < categories; j++) {
      const w = ((i - j) ** 2) / denomW
      num += w * O[i][j]
      den += w * (rowSum[i] * colSum[j]) / n
    }
  }
  if (den === 0) return 1 // no expected disagreement (degenerate marginals, perfect agreement)
  return +(1 - num / den).toFixed(4)
}

// Convenience: kappa across per-dimension level maps.
// itemsA/itemsB: arrays of {dimension: 0-4|'NA'} aligned by index.
export function kappaFromLevelMaps(itemsA, itemsB, dimensions) {
  const a = []
  const b = []
  for (let i = 0; i < Math.min(itemsA.length, itemsB.length); i++) {
    for (const dim of dimensions) {
      a.push(coerce(itemsA[i]?.[dim]))
      b.push(coerce(itemsB[i]?.[dim]))
    }
  }
  return quadraticWeightedKappa(a, b)
}

function coerce(v) {
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= 4 ? n : 'NA'
}
