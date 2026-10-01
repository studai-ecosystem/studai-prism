import { Check } from 'lucide-react'
import { cx } from '../../lib/cx.js'
import { Button } from './Button.jsx'

// One plan on the pricing section. The featured plan sits on brand navy; the
// other on a raised surface. Prices are passed in, never defined here.
export default function PricingCard({ plan, price, period, subtitle, features, ctaLabel, ctaAction, featured = false }) {
  return (
    <article
      className={cx(
        'flex flex-col gap-6 rounded-[var(--prism-radius-lg)] border p-8',
        featured ? 'border-brand-navy bg-brand-navy text-white' : 'border-prism-border bg-prism-surface text-prism-ink',
      )}
    >
      <div>
        <p className={cx('mb-3 font-mono text-xs font-semibold uppercase tracking-widest', featured ? 'text-brand-green' : 'text-brand-green-ink')}>{plan}</p>
        <p className="flex items-end gap-2">
          <span className="text-4xl font-bold tabular-nums">{price}</span>
          <span className={cx('mb-1.5 text-sm', featured ? 'text-brand-soft' : 'text-prism-ink-muted')}>{period}</span>
        </p>
        <p className={cx('mt-1 text-sm', featured ? 'text-brand-soft' : 'text-prism-ink-muted')}>{subtitle}</p>
      </div>

      <ul className="flex flex-col gap-3">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <Check size={16} aria-hidden="true" className={cx('mt-0.5 shrink-0', featured ? 'text-brand-green' : 'text-brand-green-ink')} />
            <span className={cx('text-sm', featured ? 'text-brand-soft' : 'text-prism-ink')}>{f}</span>
          </li>
        ))}
      </ul>

      <Button
        size="lg"
        block
        onClick={ctaAction}
        variant={featured ? 'secondary' : 'primary'}
        className={cx('mt-auto', featured && '!border-transparent !bg-brand-green !text-brand-navy hover:!bg-brand-green hover:brightness-95')}
      >
        {ctaLabel}
      </Button>
    </article>
  )
}