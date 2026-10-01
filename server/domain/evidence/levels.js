// Governed capability level vocabulary (spec §13, §20.2). PROVISIONAL until
// measurement governance approves labels and thresholds (HA-C002). This is the
// ONLY place these labels are defined; clients receive them from the server.
import { INSUFFICIENT_EVIDENCE_LABEL } from '../../lib/sharedConstants.js'

export const LEVEL_LABELS_STATUS = 'PROVISIONAL'

export const EVIDENCE_STATUSES = Object.freeze(['INSUFFICIENT_EVIDENCE', 'PROVISIONAL', 'SUFFICIENT', 'HUMAN_REVIEW_REQUIRED'])

// Band keys are stable ids; labels are customer copy.
export const CAPABILITY_LEVELS = Object.freeze([
  { band: 'INSUFFICIENT', label: INSUFFICIENT_EVIDENCE_LABEL },
  { band: 'EARLY', label: 'Early evidence' },
  { band: 'DEVELOPING', label: 'Developing' },
  { band: 'DEMONSTRATED', label: 'Demonstrated' },
  { band: 'STRONG', label: 'Strongly demonstrated' },
])

// Rubric levels (1–5 anchored rubric) → provisional bands. Only ever applied
// to capabilities whose sufficiency status allows a level (never INSUFFICIENT).
export function bandForRubricLevel(level) {
  if (!Number.isFinite(level)) return CAPABILITY_LEVELS[0]
  if (level >= 4.5) return CAPABILITY_LEVELS[4]
  if (level >= 3.5) return CAPABILITY_LEVELS[3]
  if (level >= 2.5) return CAPABILITY_LEVELS[2]
  return CAPABILITY_LEVELS[1]
}

export function labelForBand(band) {
  return (CAPABILITY_LEVELS.find((l) => l.band === band) || CAPABILITY_LEVELS[0]).label
}
