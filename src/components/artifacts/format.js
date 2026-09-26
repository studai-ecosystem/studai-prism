// Generic, vocabulary-free formatting for data-driven work materials (C5.09):
// labels come from the data's own keys; no scenario terms live in components.

// 'blendedCac' → 'Blended CAC', 'searchSpend' → 'Search spend', 'ctr' → 'CTR'.
// A camel-case segment of up to four letters is treated as an abbreviation.
export function humanizeKey(key) {
  const parts = String(key).replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/\s+/).filter(Boolean)
  return parts
    .map((p, i) => {
      if (p.length <= 4 && /^[a-z]+$/i.test(p) && (parts.length === 1 || i > 0)) return p.toUpperCase()
      const lower = p.toLowerCase()
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower
    })
    .join(' ')
}

export function formatValue(v) {
  if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (v == null) return ''
  return String(v)
}
