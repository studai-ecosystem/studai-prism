import { Info, AlertTriangle, CheckCircle2, XCircle, HelpCircle } from 'lucide-react'
import { cx } from '../../lib/cx.js'

const TONE = {
  info: { cls: 'border-prism-accent-soft bg-prism-accent-soft text-prism-ink', Icon: Info },
  positive: { cls: 'border-prism-positive-soft bg-prism-positive-soft text-prism-ink', Icon: CheckCircle2 },
  partial: { cls: 'border-prism-partial-soft bg-prism-partial-soft text-prism-ink', Icon: AlertTriangle },
  blocked: { cls: 'border-prism-blocked-soft bg-prism-blocked-soft text-prism-ink', Icon: XCircle },
  insufficient: { cls: 'border-prism-border bg-prism-insufficient-soft text-prism-ink', Icon: HelpCircle },
}

// Compact inline message inside a form or card.
export function InlineNotice({ tone = 'info', children, className }) {
  const t = TONE[tone] || TONE.info
  return (
    <p className={cx('flex items-start gap-2 rounded-[var(--prism-radius-md)] border px-3 py-2 text-sm', t.cls, className)}>
      <t.Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

// Larger explanatory block with a title (e.g. privacy scope, methodology).
export function Callout({ tone = 'info', title, children, action, className, role }) {
  const t = TONE[tone] || TONE.info
  return (
    <div role={role} className={cx('flex gap-3 rounded-[var(--prism-radius-lg)] border p-4', t.cls, className)}>
      <t.Icon size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className="mt-1 text-sm text-prism-ink-muted">{children}</div>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  )
}

export default InlineNotice
