// Deterministic mission checks (spec §16.3 steps 1–2; C8.03). Pure functions:
// the attempt's work is validated against the mission's artifact structure,
// then every governed rule runs and reports what it actually saw. A criterion
// passes deterministically only when ALL of its rules pass.
import { ApiError } from '../http/errors.js'

export const VALIDATORS_VERSION = 'mission-validators.v1'

const str = (v) => (typeof v === 'string' ? v : '')

// Validates and normalises `work` ({ [artifactId]: {...} }) for a mission.
// Unknown artifacts, fields, rows or columns are rejected (never stored).
export function normaliseWork(mission, work) {
  if (!work || typeof work !== 'object' || Array.isArray(work)) throw new ApiError('VALIDATION_FAILED', 'Your work could not be read.')
  const known = new Map(mission.artifacts.map((a) => [a.artifact_id, a]))
  const out = {}
  for (const [id, value] of Object.entries(work)) {
    const a = known.get(id)
    if (!a || !value || typeof value !== 'object') throw new ApiError('VALIDATION_FAILED', 'Your work refers to something that is not part of this mission.')
    if (a.type === 'TEXT_RESPONSE') {
      const text = str(value.text)
      if (text.length > (a.max_length || 4000)) throw new ApiError('VALIDATION_FAILED', `"${a.title}" is too long.`)
      out[id] = { text }
    } else if (a.type === 'FIELD_SHEET') {
      const fields = {}
      const allowed = new Map((a.fields || []).map((f) => [f.key, f]))
      for (const [k, v] of Object.entries(value.fields || {})) {
        const f = allowed.get(k)
        if (!f) throw new ApiError('VALIDATION_FAILED', `"${a.title}" has an unknown field.`)
        if (f.kind === 'number') {
          if (v !== '' && v !== null && !Number.isFinite(Number(v))) throw new ApiError('VALIDATION_FAILED', `"${f.label}" must be a number.`)
          fields[k] = v === '' || v === null ? null : Number(v)
        } else {
          const s = str(v)
          if (s.length > (f.max_length || 1000)) throw new ApiError('VALIDATION_FAILED', `"${f.label}" is too long.`)
          fields[k] = s
        }
      }
      out[id] = { fields }
    } else if (a.type === 'TABLE') {
      const base = new Map((a.initial_state.rows || []).map((r) => [r.id, r]))
      const editable = (a.columns || []).filter((c) => c.editable)
      const rows = []
      for (const r of Array.isArray(value.rows) ? value.rows : []) {
        const seed = base.get(r?.id)
        if (!seed) throw new ApiError('VALIDATION_FAILED', `"${a.title}" has an unknown row.`)
        const row = { ...seed }
        for (const c of editable) {
          if (!(c.key in r)) continue
          const v = r[c.key]
          if (c.kind === 'number') {
            if (v !== '' && v !== null && !Number.isFinite(Number(v))) throw new ApiError('VALIDATION_FAILED', `"${c.label}" must be a number.`)
            row[c.key] = v === '' || v === null ? null : Number(v)
          } else {
            row[c.key] = str(v).slice(0, 400)
          }
        }
        rows.push(row)
      }
      if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new ApiError('VALIDATION_FAILED', `"${a.title}" repeats a row.`)
      out[id] = { rows }
    }
  }
  return out
}

// The starting work for a new attempt (a copy of each artifact's initial state).
export function initialWork(mission) {
  return Object.fromEntries(mission.artifacts.map((a) => [a.artifact_id, JSON.parse(JSON.stringify(a.initial_state))]))
}

function valuesAt(artifactWork, path) {
  if (!artifactWork || !path) return []
  const [head, ...rest] = path.split('.')
  if (head === 'rows') return (artifactWork.rows || []).map((r) => r[rest[0]])
  if (head === 'fields') return [artifactWork.fields?.[rest[0]]]
  return [artifactWork[head]]
}

function runRule(rule, work) {
  const values = valuesAt(work[rule.artifact_id], rule.path)
  switch (rule.type) {
    case 'REQUIRED_FIELD': {
      const min = Number(rule.params.min_length || 1)
      const passed = values.length > 0 && values.every((v) => (typeof v === 'number' ? Number.isFinite(v) : str(v).trim().length >= min))
      return { passed, detail: passed ? 'Filled in' : 'Missing or too short' }
    }
    case 'TEXT_PATTERN': {
      const re = new RegExp(String(rule.params.pattern), String(rule.params.flags || '').replace(/[^imsu]/g, ''))
      const passed = values.length > 0 && values.every((v) => re.test(str(v)))
      return { passed, detail: passed ? 'Matches the expected structure' : 'Does not match the expected structure' }
    }
    case 'NUMBER_RANGE': {
      const { min = -Infinity, max = Infinity } = rule.params
      const passed = values.length > 0 && values.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max)
      return { passed, detail: passed ? 'Within the allowed range' : 'Outside the allowed range' }
    }
    case 'SUM_EQUALS': {
      const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v))
      const sum = nums.reduce((a, b) => a + b, 0)
      const passed = nums.length === values.length && values.length > 0 && Math.abs(sum - Number(rule.params.total)) < 1e-9
      return { passed, detail: `Total ${sum}` }
    }
    default:
      return { passed: false, detail: 'Unknown rule' }
  }
}

// → Map criterionId → { observed: boolean, rules: [{ ruleId, passed, description, detail }] }
export function runDeterministicChecks(mission, work) {
  const results = new Map()
  for (const c of mission.rubric.criteria) results.set(c.criterion_id, { observed: false, rules: [] })
  for (const rule of mission.deterministic_validation_rules) {
    const r = runRule(rule, work)
    results.get(rule.criterion_id).rules.push({ ruleId: rule.rule_id, passed: r.passed, description: rule.description, detail: r.detail })
  }
  for (const v of results.values()) v.observed = v.rules.length > 0 && v.rules.every((r) => r.passed)
  return results
}

// The candidate's own words in the artifacts a criterion reads (for quote checks).
export function candidateTextFor(mission, work, artifactIds) {
  const parts = []
  for (const id of artifactIds) {
    const a = mission.artifacts.find((x) => x.artifact_id === id)
    const w = work[id]
    if (!a || !w) continue
    if (a.type === 'TEXT_RESPONSE') parts.push(str(w.text))
    if (a.type === 'FIELD_SHEET') for (const f of a.fields || []) if (f.kind === 'text') parts.push(str(w.fields?.[f.key]))
    if (a.type === 'TABLE') for (const r of w.rows || []) for (const c of a.columns || []) if (c.kind === 'text' && c.editable) parts.push(str(r[c.key]))
  }
  return parts.filter((p) => p.trim())
}
