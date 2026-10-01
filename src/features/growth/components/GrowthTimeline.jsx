// Growth timeline (spec §17): completed formal assessments, practice
// interventions and reassessment windows in date order. Absolute dates only.
import { formatDate, formatDateTime } from '../../student/QueryState.jsx'
import { GROWTH_COPY } from '../../../lib/copy/student.js'

// Each entry shows its date once; windows show the moment they open or close.
function reassessmentDetail(r) {
  const when = r.endedAt ? `ended ${formatDateTime(r.endedAt)}`
    : r.status === 'SCHEDULED' ? `opens ${formatDateTime(r.windowStart)}`
      : r.status === 'ACTIVE' ? `open until ${formatDateTime(r.windowEnd)}`
        : `closed ${formatDateTime(r.windowEnd)}`
  return `Reassessment · ${when}`
}

export function GrowthTimeline({ assessments = [], interventions = [], reassessments = [], comparison = null }) {
  const role = (sessionId) => (comparison?.baseline.sessionId === sessionId ? 'Baseline' : comparison?.reassessment.sessionId === sessionId ? 'Reassessment' : null)
  const items = [
    ...assessments.map((a) => ({
      key: `a-${a.sessionId}`, date: a.completedAt, role: role(a.sessionId),
      title: a.title || 'Assessment',
      detail: [formatDate(a.completedAt), role(a.sessionId), 'Completed', a.form ? `form version ${a.form.version}` : null].filter(Boolean).join(' · '),
    })),
    ...interventions.map((i) => ({
      key: `i-${i.id}`, date: i.startsOn,
      title: i.name,
      detail: `Practice missions · ${formatDate(i.startsOn)} – ${formatDate(i.endsOn)}`,
    })),
    ...reassessments.map((r) => ({
      key: `r-${r.id}`, date: r.windowStart,
      title: r.name,
      detail: reassessmentDetail(r),
      note: r.comparability !== 'APPROVED' && !r.endedAt && r.status !== 'CLOSED' ? GROWTH_COPY.reassessmentNotComparable : null,
    })),
  ].sort((x, y) => String(x.date || '').localeCompare(String(y.date || '')))
  if (!items.length) return null
  return (
    <section aria-labelledby="growth-timeline" className="space-y-3">
      <h2 id="growth-timeline" className="text-lg font-semibold text-prism-ink">{GROWTH_COPY.timelineTitle}</h2>
      <ol className="space-y-2 border-l border-prism-border pl-4" data-testid="growth-timeline">
        {items.map((it) => (
          <li key={it.key} className="relative" data-role={it.role || undefined}>
            <span aria-hidden="true" className={it.role ? 'absolute -left-[23px] top-1 h-3.5 w-3.5 rounded-full border-2 border-prism-accent bg-prism-surface ring-2 ring-prism-accent-soft' : 'absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-prism-accent'} />
            <p className="text-sm font-semibold text-prism-ink">{it.title}</p>
            <p className="text-sm text-prism-ink-muted">{it.detail}</p>
            {it.note && <p className="text-xs text-prism-ink-subtle">{it.note}</p>}
          </li>
        ))}
      </ol>
    </section>
  )
}

export default GrowthTimeline
