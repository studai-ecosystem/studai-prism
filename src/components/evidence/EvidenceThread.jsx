import { cx } from '../../lib/cx.js'

// The visible chain from what the candidate did to what Prism concluded:
// action, observed behaviour, capability, then the described behaviour at the
// level. A step with no value is left out; the chain never invents a link.
export function EvidenceThread({ steps, className }) {
  const shown = steps.filter((s) => s.value)
  return (
    <ol className={cx('space-y-0', className)} data-evidence-thread>
      {shown.map((s, i) => (
        <li key={s.label} className="relative grid gap-1 pb-3 pl-6 last:pb-0 sm:grid-cols-[12rem_1fr] sm:gap-3">
          <span aria-hidden="true" className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border border-prism-accent bg-prism-surface" />
          {i < shown.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[4.5px] top-4 w-px bg-prism-border-strong" />}
          <span className="text-xs font-semibold uppercase tracking-wide text-prism-ink-subtle">
            <span className="sr-only">Step {i + 1}: </span>{s.label}
          </span>
          <span className="text-sm text-prism-ink">{s.value}</span>
        </li>
      ))}
    </ol>
  )
}

export default EvidenceThread