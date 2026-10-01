import { CapabilityLevelBadge } from '../capability/CapabilityLevelBadge.jsx'
import { EvidenceSufficiencyBadge } from './EvidenceSufficiencyBadge.jsx'
import { EvidenceSource } from './EvidenceSource.jsx'

// Evidence for one capability over time, newest first. Each entry is one
// completed formal assessment; a level appears only if that assessment had
// enough evidence to give one.
export function EvidenceTimeline({ entries }) {
  if (!entries.length) return null
  const ordered = [...entries].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  return (
    <ol className="space-y-3" data-testid="evidence-timeline">
      {ordered.map((e, i) => (
        <li key={e.id} className="relative pl-6">
          <span aria-hidden="true" className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border border-prism-accent bg-prism-surface" />
          {i < ordered.length - 1 && <span aria-hidden="true" className="absolute -bottom-3 left-[4.5px] top-4 w-px bg-prism-border-strong" />}
          <p className="text-sm text-prism-ink"><EvidenceSource title={e.title} date={e.date} emptyDate="Date not recorded" /></p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {e.level && <CapabilityLevelBadge level={e.level} provisional={e.status === 'PROVISIONAL'} />}
            <EvidenceSufficiencyBadge status={e.status} />
          </div>
        </li>
      ))}
    </ol>
  )
}

export default EvidenceTimeline