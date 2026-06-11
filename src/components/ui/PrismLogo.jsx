import { useId } from 'react'

// PRISM brand logo — a hand-built, scalable SVG (no image asset). Renders the
// gold certificate-with-ribbon mark and, optionally, the navy serif "PRISM"
// wordmark + "by StudAI One" subtitle. Used across the app's headers, footer
// and report so the brand stays consistent everywhere.
//
// Props:
//   size           — height of the mark in px (default 32)
//   showWordmark   — show the PRISM wordmark beside the mark (default true)
//   wordmark       — wordmark text (default 'PRISM')
//   subtitle       — subtitle text, or null/'' to hide (default 'by StudAI One')
//   wordmarkColor  — wordmark colour (default navy #1A2A6C)
//   subtitleColor  — subtitle colour (default #64687A)
//   gap            — px gap between mark and wordmark (default 10)
//   className      — extra classes on the wrapper

export function PrismMark({ size = 32, className = '', title = 'Prism' }) {
  const uid = useId().replace(/[:]/g, '')
  const gold = `pl-gold-${uid}`
  const goldDark = `pl-goldDark-${uid}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F6DD8B" />
          <stop offset="45%" stopColor="#E3B84E" />
          <stop offset="100%" stopColor="#B8860B" />
        </linearGradient>
        <linearGradient id={goldDark} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#D9A93C" />
          <stop offset="100%" stopColor="#9A6E0A" />
        </linearGradient>
      </defs>

      {/* Back document — gold, offset behind */}
      <rect x="26" y="7" width="29" height="40" rx="4" fill={`url(#${gold})`} />
      <g stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.55">
        <line x1="33" y1="17" x2="48" y2="17" />
        <line x1="33" y1="23" x2="48" y2="23" />
        <line x1="33" y1="29" x2="48" y2="29" />
        <line x1="33" y1="35" x2="44" y2="35" />
      </g>

      {/* Front document — white with a gold frame */}
      <rect x="11" y="13" width="29" height="40" rx="4" fill="#FFFFFF" stroke={`url(#${gold})`} strokeWidth="2.4" />
      <g stroke={`url(#${gold})`} strokeWidth="2" strokeLinecap="round">
        <line x1="17" y1="23" x2="34" y2="23" />
        <line x1="17" y1="29" x2="34" y2="29" />
        <line x1="17" y1="35" x2="30" y2="35" />
      </g>

      {/* Ribbon tails */}
      <path d="M16 49 L11 63 L17 59 L20 64 L23 51 Z" fill={`url(#${goldDark})`} />
      <path d="M30 49 L35 63 L29 59 L26 64 L23 51 Z" fill={`url(#${goldDark})`} />

      {/* Seal — 8-point rosette badge */}
      <g transform="translate(23 47)">
        <rect x="-9" y="-9" width="18" height="18" rx="3" fill={`url(#${gold})`} />
        <rect x="-9" y="-9" width="18" height="18" rx="3" fill={`url(#${gold})`} transform="rotate(45)" />
        <circle r="8.5" fill={`url(#${gold})`} />
        <circle r="6.2" fill="none" stroke="#fff" strokeWidth="1.1" opacity="0.7" />
      </g>
    </svg>
  )
}

export default function PrismLogo({
  size = 32,
  showWordmark = true,
  wordmark = 'PRISM',
  subtitle = 'by StudAI One',
  wordmarkColor = '#1A2A6C',
  subtitleColor = '#64687A',
  gap = 10,
  className = '',
}) {
  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap }}>
      <PrismMark size={size} title={wordmark} />
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span
            className="font-serif font-bold tracking-tight"
            style={{ color: wordmarkColor, fontSize: Math.round(size * 0.6), lineHeight: 1 }}
          >
            {wordmark}
          </span>
          {subtitle && (
            <span
              className="font-sans tracking-wider"
              style={{ color: subtitleColor, fontSize: Math.max(9, Math.round(size * 0.3)), marginTop: 2 }}
            >
              {subtitle}
            </span>
          )}
        </span>
      )}
    </span>
  )
}
