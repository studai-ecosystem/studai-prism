import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../../lib/cx.js'

const VARIANTS = {
  primary: 'bg-prism-accent text-prism-accent-ink hover:bg-prism-accent-strong border border-transparent',
  secondary: 'bg-prism-surface text-prism-ink border border-prism-border-strong hover:bg-prism-subtle',
  ghost: 'bg-transparent text-prism-ink border border-transparent hover:bg-prism-subtle',
  danger: 'bg-prism-blocked text-white border border-transparent hover:opacity-90',
}
const SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
}

export function buttonClasses({ variant = 'primary', size = 'md', block = false, className } = {}) {
  return cx(
    'inline-flex items-center justify-center rounded-[var(--prism-radius-md)] font-semibold transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
    VARIANTS[variant] || VARIANTS.primary,
    SIZES[size] || SIZES.md,
    block && 'w-full',
    className,
  )
}

export const Button = forwardRef(function Button(
  { variant, size, block, loading = false, loadingLabel = 'Working…', type = 'button', className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses({ variant, size, block, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span>{loadingLabel}</span> : children}
    </button>
  )
})

export const IconButton = forwardRef(function IconButton({ label, variant = 'ghost', size = 'md', className, children, type = 'button', ...rest }, ref) {
  const box = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-10 w-10'
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx(buttonClasses({ variant, size }), '!px-0', box, className)}
      {...rest}
    >
      <span aria-hidden="true" className="inline-flex">{children}</span>
    </button>
  )
})

export function LinkButton({ to, href, variant = 'secondary', size, block, className, children, ...rest }) {
  const classes = buttonClasses({ variant, size, block, className })
  if (href) {
    return <a href={href} className={classes} {...rest}>{children}</a>
  }
  return <Link to={to} className={classes} {...rest}>{children}</Link>
}

export default Button
