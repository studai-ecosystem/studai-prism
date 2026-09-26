// Growth comparison (spec §17; C9.04). Fail closed: a change is reported only
// when the two formal sessions were taken on an APPROVED equivalent form pair
// and BOTH have SUFFICIENT evidence for the capability. The change is a
// level-label change (never a score difference); uncertainty is attached only
// when a validated method produced it — none exists yet, so it is omitted.
import { labelForBand } from '../evidence/levels.js'

const BAND_ORDER = { EARLY: 0, DEVELOPING: 1, DEMONSTRATED: 2, STRONG: 3 }

// Canonical key for an unordered form pair (stored with a <= b).
export function canonicalPair(formX, formY) {
  const [formAId, formBId] = [String(formX), String(formY)].sort()
  return { formAId, formBId }
}
export const pairKey = (x, y) => { const { formAId, formBId } = canonicalPair(x, y); return `${formAId}|${formBId}` }

/**
 * compareCapability(baselineDecision, reassessmentDecision)
 *   → { comparable: true, from, to, direction, uncertainty: null, uncertaintyStatus: 'NOT_VALIDATED' }
 *   | { comparable: false, reason }
 */
export function compareCapability(before, after) {
  if (!before || !after) return { comparable: false, reason: 'NOT_MEASURED_IN_BOTH' }
  if (before.status !== 'SUFFICIENT' || after.status !== 'SUFFICIENT' || !before.level || !after.level) {
    return { comparable: false, reason: 'EVIDENCE_NOT_SUFFICIENT_IN_BOTH' }
  }
  if (before.rulesVersion && after.rulesVersion && before.rulesVersion !== after.rulesVersion) {
    return { comparable: false, reason: 'DIFFERENT_EVIDENCE_RULES' }
  }
  const a = BAND_ORDER[before.level.band]
  const b = BAND_ORDER[after.level.band]
  if (a === undefined || b === undefined) return { comparable: false, reason: 'UNKNOWN_LEVEL' }
  return {
    comparable: true,
    from: { band: before.level.band, label: labelForBand(before.level.band) },
    to: { band: after.level.band, label: labelForBand(after.level.band) },
    direction: b > a ? 'HIGHER' : b < a ? 'LOWER' : 'SAME',
    uncertainty: null,
    uncertaintyStatus: 'NOT_VALIDATED',
  }
}

/**
 * choosePair(entries, approvedKeys) — entries newest first, each with
 * `form.id`. The latest session is the reassessment; the baseline is the most
 * recent earlier session whose form pairs with it as APPROVED.
 *   → { reassessment, baseline } | { reason }
 */
export function choosePair(entries, approvedKeys) {
  const withForm = entries.filter((e) => e.form?.id && e.session.completedAt)
  if (withForm.length < 2) return { reason: 'NEEDS_COMPARABLE_REASSESSMENT' }
  const [latest, ...earlier] = withForm
  const baseline = earlier.find((e) => e.session.completedAt < latest.session.completedAt && approvedKeys.has(pairKey(latest.form.id, e.form.id)))
  if (!baseline) return { reason: 'FORMS_NOT_VALIDATED_FOR_COMPARISON' }
  return { reassessment: latest, baseline }
}
