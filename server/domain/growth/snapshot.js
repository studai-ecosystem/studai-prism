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
 * choosePair(entries, approvedKeys, options) — entries newest first, each with
 * `form.id`. The latest session is the reassessment; the baseline is the most
 * recent earlier session whose form pairs with it as APPROVED.
 *   → { reassessment, baseline } | { reason }
 *
 * P7.6 eligibility (applied only on an APPROVED pair; nothing here can make
 * an unapproved pair comparable):
 *   retiredFormIds   — a RETIRED form is no longer comparable: FORM_RETIRED.
 *   correctedSessionIds — a session whose report is under correction / has a
 *                      pending review decision is held: REPORT_CORRECTION_PENDING.
 *   minSpacingDays   — the approval's spacing rule between the two sessions:
 *                      TOO_CLOSE_IN_TIME (0 = no rule).
 * A new formal result is an additional snapshot; earlier results are never
 * rewritten by this choice.
 */
export function choosePair(entries, approvedKeys, { retiredFormIds = new Set(), correctedSessionIds = new Set(), minSpacingDays = 0 } = {}) {
  const withForm = entries.filter((e) => e.form?.id && e.session.completedAt)
  if (withForm.length < 2) return { reason: 'NEEDS_COMPARABLE_REASSESSMENT' }
  const [latest, ...earlier] = withForm
  const baseline = earlier.find((e) => e.session.completedAt < latest.session.completedAt && approvedKeys.has(pairKey(latest.form.id, e.form.id)))
  if (!baseline) return { reason: 'FORMS_NOT_VALIDATED_FOR_COMPARISON' }
  if (retiredFormIds.has(latest.form.id) || retiredFormIds.has(baseline.form.id)) return { reason: 'FORM_RETIRED' }
  if (correctedSessionIds.has(latest.session.sessionId) || correctedSessionIds.has(baseline.session.sessionId)) return { reason: 'REPORT_CORRECTION_PENDING' }
  if (minSpacingDays > 0) {
    const days = (new Date(latest.session.completedAt) - new Date(baseline.session.completedAt)) / 86_400_000
    if (!(days >= minSpacingDays)) return { reason: 'TOO_CLOSE_IN_TIME' }
  }
  return { reassessment: latest, baseline }
}
