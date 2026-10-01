import { cx } from '../../lib/cx.js'

// StudAI Prism brand logo: the OFFICIAL brand-pack artwork only (public/brand,
// copied unchanged from StudAI_Prism_Brand_Pack/09_Vector). Never redraw,
// recolour, stretch, or add effects to it.
//
//   variant  'lockup'  icon + wordmark: product UI, navigation, documents (default)
//            'full'    icon + wordmark + tagline: marketing, auth, reports
//            'icon'    the three-facet mark: favicon, collapsed sidebar, mobile
//   tone     'color' on light surfaces, 'reverse' on navy or dark surfaces,
//            'black' / 'white' one-colour production use only
//   size     height in px (legacy prop). Width is derived from the artwork
//            ratio and raised to the brand minimum, so the logo is never
//            rendered below its minimum size.
//   width    set the width instead of the height
//
// Brand minimums (digital): full lockup 240 px wide, lockup 160 px, icon 24 px.

const ARTWORK = {
  lockup: { ratio: 1329 / 350, min: 160, src: { color: 'logo-lockup-color', reverse: 'logo-lockup-reverse', black: 'logo-lockup-black', white: 'logo-lockup-white' } },
  full: { ratio: 1329 / 350, min: 240, src: { color: 'logo-full-color', reverse: 'logo-full-reverse' } },
  icon: { ratio: 370 / 342, min: 24, src: { color: 'logo-icon-color', reverse: 'logo-icon-reverse', black: 'logo-icon-black', white: 'logo-icon-white' } },
}

export function logoDimensions({ variant = 'lockup', size = 32, width } = {}) {
  const art = ARTWORK[variant] || ARTWORK.lockup
  const wanted = width ?? size * art.ratio
  const w = Math.max(Math.round(wanted), art.min)
  return { width: w, height: Math.round(w / art.ratio) }
}

export function logoSource({ variant = 'lockup', tone = 'color' } = {}) {
  const art = ARTWORK[variant] || ARTWORK.lockup
  // A tone without official artwork for this variant falls back to the nearest official one.
  const name = art.src[tone] || (tone === 'white' ? art.src.reverse : art.src.color)
  return `/brand/${name}.svg`
}

export default function PrismLogo({
  variant,
  tone = 'color',
  size = 32,
  width,
  showWordmark = true,
  decorative = false,
  className = '',
}) {
  const kind = showWordmark === false ? 'icon' : (variant || 'lockup')
  const dim = logoDimensions({ variant: kind, size, width })
  return (
    <img
      src={logoSource({ variant: kind, tone })}
      width={dim.width}
      height={dim.height}
      alt={decorative ? '' : 'StudAI Prism'}
      decoding="async"
      draggable={false}
      className={cx('inline-block max-w-full select-none', className)}
      style={{ height: 'auto', aspectRatio: `${dim.width} / ${dim.height}` }}
    />
  )
}

// Icon-only mark (kept for existing imports).
export function PrismMark({ size = 32, tone = 'color', className = '', title = 'StudAI Prism' }) {
  return (
    <img
      src={logoSource({ variant: 'icon', tone })}
      width={size}
      height={Math.round(size * (342 / 370))}
      alt={title}
      decoding="async"
      draggable={false}
      className={className}
    />
  )
}