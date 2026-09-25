import { cx } from '../../lib/cx.js'

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function Avatar({ name, size = 'md', className, decorative = false }) {
  const box = size === 'sm' ? 'h-7 w-7 text-xs' : size === 'lg' ? 'h-12 w-12 text-base' : 'h-9 w-9 text-sm'
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-prism-accent-soft font-semibold text-prism-accent-strong', box, className)}
    >
      {initials(name)}
    </span>
  )
}

export default Avatar
