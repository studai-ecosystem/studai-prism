import { cx } from '../../lib/cx.js'

// Semantic tones only (spec §5.2). `insufficient` is neutral gray, never red.
export const TONES = {
  neutral: 'bg-prism-subtle text-prism-ink-muted border-prism-border',
  accent: 'bg-prism-accent-soft text-prism-accent-strong border-prism-accent-soft',
  positive: 'bg-prism-positive-soft text-prism-positive border-prism-positive-soft',
  partial: 'bg-prism-partial-soft text-prism-partial border-prism-partial-soft',
  blocked: 'bg-prism-blocked-soft text-prism-blocked border-prism-blocked-soft',
  insufficient: 'bg-prism-insufficient-soft text-prism-insufficient border-prism-border',
}

export function Badge({ tone = 'neutral', className, children, ...rest }) {
  return (
    <span
      className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold', TONES[tone] || TONES.neutral, className)}
      {...rest}
    >
      {children}
    </span>
  )
}

// A status chip always pairs colour with a text label and a shape marker, so
// meaning never depends on colour alone (WCAG 1.4.1).
const MARKERS = { positive: '●', partial: '◐', blocked: '■', insufficient: '○', neutral: '·', accent: '◆' }

export function StatusChip({ tone = 'neutral', label, className }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-[var(--prism-radius-sm)] border px-2 py-1 text-xs font-medium', TONES[tone] || TONES.neutral, className)}>
      <span aria-hidden="true">{MARKERS[tone] || MARKERS.neutral}</span>
      <span>{label}</span>
    </span>
  )
}

export default Badge
