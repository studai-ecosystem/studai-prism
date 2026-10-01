import { Loader2 } from 'lucide-react'
import { cx } from '../../lib/cx.js'
import PrismLogo from './PrismLogo.jsx'

// The standard waiting states. Use these instead of ad-hoc spinners; copy is
// human ("Preparing your workspace"), never an internal scenario name.

export function InlineSpinner({ label = 'Loading', size = 16, className }) {
  return (
    <span role="status" className={cx('inline-flex items-center gap-2', className)}>
      <Loader2 size={size} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function FullScreenLoading({ message = 'Preparing your workspace\u2026' }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-prism-canvas px-6 text-center text-prism-ink-muted">
      <PrismLogo variant="icon" width={48} decorative />
      <Loader2 size={20} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

export default InlineSpinner