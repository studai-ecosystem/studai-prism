import { formatDate } from '../../features/student/QueryState.jsx'

// Where a piece of evidence came from: the assessment, where in it, and when.
// Parts that are not recorded are left out, never guessed.
export function EvidenceSource({ title, where, date, emptyDate, label }) {
  const parts = [title || 'Assessment', where, formatDate(date) || emptyDate].filter(Boolean)
  return (
    <span data-evidence-source>
      {label && <span className="sr-only">{label}: </span>}
      {parts.join(' \u00b7 ')}
    </span>
  )
}

export default EvidenceSource