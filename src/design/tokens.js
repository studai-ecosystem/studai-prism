// StudAI Prism design system: the token file.
//
// THE SINGLE SOURCE. Every colour, space, type, radius, elevation and motion
// value in the UI comes from here (or the CSS variables in tokens.css; the
// two files change together, enforced by server/test/designSystem.test.js).
// Raw hex or arbitrary values in page code fail CI.
//
// Principle: "Evidence you can understand. Growth you can act on." Prism
// never implies false certainty: evidence status is always shown, absence of
// evidence is a first-class state, never a zero.

// Brand colours are issued by the brand pack (10_Brand_Guide/colors.json):
// navy, green, white, soft surface. Everything marked "derived" is computed
// from them and its contrast is recorded in docs/ui/UI_AUDIT.md section 5.
export const brand = {
  navy: '#0E255B', // issued: trust, intelligence; primary action and text
  green: '#03B67A', // issued: growth; marks and fills. NEVER text on white (2.63:1)
  white: '#FFFFFF', // issued
  soft: '#F6F8FB', // issued: the page canvas
  navyStrong: '#081A45', // derived: hover and pressed on navy
  navyDeep: '#081633', // derived: dark canvas
  navySoft: '#E8EDF8', // derived: selected rows, info chips
  greenInk: '#027A55', // derived: green as text or thin line on light (5.0:1)
  greenSoft: '#E6F7F0', // derived: positive chips
}

export const color = {
  brand,

  surface: {
    canvas: brand.soft,
    raised: brand.white,
    subtle: '#EDF1F8',
    inverse: brand.navy,
    inverseDeep: brand.navyDeep,
  },

  text: {
    primary: brand.navy,
    secondary: '#4A5878',
    tertiary: '#566685',
    onNavy: brand.white,
    onGreen: brand.navy, // navy on green is 5.6:1; white on green fails
    positive: brand.greenInk,
  },

  border: {
    subtle: '#DDE3EE',
    strong: '#76849F', // control boundaries, 3.5:1
    focus: brand.navy,
    onDark: '#2A4380',
    strongOnDark: '#6F82B0',
  },

  // Semantic status. Never brand colours; always paired with an icon and a
  // text label (status is never conveyed by colour alone).
  status: {
    positive: { ink: brand.greenInk, soft: brand.greenSoft },
    partial: { ink: '#92400E', soft: '#FFFBEB' },
    blocked: { ink: '#B42318', soft: '#FEF3F2' },
    info: { ink: '#27408A', soft: brand.navySoft },
    insufficient: { ink: '#4A5878', soft: '#EDF1F8' }, // neutral, never failure-red
  },

  // Evidence status, mapped only to states the governed API returns:
  // SUFFICIENT or SUPPORTED, PROVISIONAL, INSUFFICIENT_EVIDENCE,
  // HUMAN_REVIEW_REQUIRED, and practice (developmental) evidence.
  evidence: {
    demonstrated: { ink: brand.greenInk, soft: brand.greenSoft },
    provisional: { ink: '#92400E', soft: '#FFFBEB' },
    insufficient: { ink: '#4A5878', soft: '#EDF1F8' },
    underReview: { ink: '#27408A', soft: brand.navySoft },
    practice: { ink: brand.navy, soft: brand.navySoft },
  },

  // Charts. The ordinal ramp (EARLY to STRONG) passes 3:1 on white and the
  // canvas; bands are also labelled and have table equivalents.
  data: {
    ramp: ['#7189BD', '#3F5C9E', '#27408A', brand.navy],
    series: [brand.navy, brand.greenInk, '#5B73A8', '#76849F'],
    muted: '#76849F',
  },

  // Dark, focused environments (the assessment room). Deliberate tokens,
  // not an inversion of the light theme.
  dark: {
    canvas: brand.navyDeep,
    surface: brand.navy,
    subtle: '#132C6B',
    border: '#2A4380',
    borderStrong: '#6F82B0',
    text: brand.soft,
    textSecondary: '#C5CFE6',
    textTertiary: '#A9B6D3',
    accent: brand.green,
    accentStrong: '#2FD0A0',
    accentSoft: '#073641',
    accentInk: brand.navyDeep,
    partial: '#FCD34D',
    partialSoft: '#2D2410',
    blocked: '#FCA5A5',
    blockedSoft: '#331616',
  },
}

// ── Type ─────────────────────────────────────────────────────────────────────
// One sans for display and body: Inter, matching the geometric grotesque of
// the wordmark; tabular numerals for data. Noto Sans Devanagari and Tamil are
// metrical script companions (PRISM_LANG: Hindi, Tamil, Hinglish) so the body
// face carries three scripts without a redesign. IBM Plex Mono for IDs.
export const font = {
  display: "'Inter', system-ui, 'Noto Sans Devanagari', 'Noto Sans Tamil', sans-serif",
  body: "'Inter', system-ui, 'Noto Sans Devanagari', 'Noto Sans Tamil', sans-serif",
  utility: "'IBM Plex Mono', ui-monospace, 'Cascadia Mono', monospace",
}

// Type scale: 8 steps, rem-based (1rem = 16px).
export const typeScale = {
  xs: '0.75rem', //   12 metadata, evidence indices
  sm: '0.875rem', //  14 secondary text, labels
  base: '1rem', //    16 body
  md: '1.125rem', //  18 lead paragraphs
  lg: '1.375rem', //  22 card titles, section heads
  xl: '1.75rem', //   28 page titles
  '2xl': '2.25rem', //36 report headline, metrics
  '3xl': '3rem', //   48 marketing display
}

// Type roles: hierarchy by weight, size, spacing and case, not size alone.
export const typeRoles = {
  display: { size: typeScale['3xl'], weight: 800, leading: 1.1, tracking: '-0.025em' },
  h1: { size: typeScale.xl, weight: 700, leading: 1.2, tracking: '-0.02em' },
  h2: { size: typeScale.lg, weight: 700, leading: 1.25, tracking: '-0.015em' },
  h3: { size: typeScale.md, weight: 600, leading: 1.3, tracking: '-0.01em' },
  body: { size: typeScale.base, weight: 400, leading: 1.55, tracking: '0' },
  bodySmall: { size: typeScale.sm, weight: 400, leading: 1.5, tracking: '0' },
  caption: { size: typeScale.xs, weight: 400, leading: 1.4, tracking: '0' },
  overline: { size: typeScale.xs, weight: 600, leading: 1.2, tracking: '0.08em', uppercase: true },
  dataLabel: { size: typeScale.xs, weight: 500, leading: 1.2, tracking: '0.01em', tabular: true },
  metric: { size: typeScale['2xl'], weight: 700, leading: 1.1, tracking: '-0.02em', tabular: true },
  code: { size: '0.8125rem', weight: 500, leading: 1.4, tracking: '0', mono: true },
}

export const leading = { tight: 1.2, base: 1.55, loose: 1.75 }
export const tracking = { tight: '-0.01em', base: '0', wide: '0.08em' } // wide = overline labels

// ── Space / radius / elevation ───────────────────────────────────────────────
export const space = {
  0: '0',
  1: '0.25rem', //  4
  2: '0.5rem', //   8
  3: '0.75rem', // 12
  4: '1rem', //    16
  6: '1.5rem', //  24
  8: '2rem', //    32
  12: '3rem', //   48
  16: '4rem', //   64
}

export const radius = {
  hair: '2px', //  calibration ticks, thread nodes
  sm: '6px', //    inputs, chips
  md: '10px', //   cards
  lg: '16px', //   modals, hero surfaces
  full: '999px', // pills, dials
}

// Navy-tinted shadows; three levels only.
export const elevation = {
  flat: 'none',
  raised: '0 1px 2px rgba(14, 37, 91, 0.06), 0 2px 8px rgba(14, 37, 91, 0.06)',
  overlay: '0 4px 12px rgba(14, 37, 91, 0.12), 0 12px 40px rgba(14, 37, 91, 0.16)',
}

// ── Layout ───────────────────────────────────────────────────────────────────
export const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280, wide: 1440 }
export const layout = {
  sidebarWidth: '15rem',
  sidebarCollapsed: '4.5rem',
  headerHeight: '3.5rem',
  contentMax: '72rem', // app pages
  readingMax: '44rem', // research and legal reading width
  wideMax: '90rem', //   campus analytics
  touchTarget: '2.75rem', // 44px minimum
}

// Focus is always visible and never colour-only (2px outline plus offset).
export const focus = { width: '2px', offset: '2px', color: brand.navy, colorOnDark: brand.green }

// ── Motion ───────────────────────────────────────────────────────────────────
// Calm by default. tokens.css collapses every duration to 0.01ms under
// prefers-reduced-motion; nothing conveys meaning by motion alone.
export const motion = {
  durationFast: '120ms',
  durationBase: '200ms',
  durationSlow: '320ms',
  easeStandard: 'cubic-bezier(0.2, 0, 0, 1)',
  easeEnter: 'cubic-bezier(0, 0, 0.2, 1)',
  easeExit: 'cubic-bezier(0.4, 0, 1, 1)',
}

// ── The signature element ────────────────────────────────────────────────────
// "The evidence thread": where a conclusion meets its evidence. Geometry for
// src/components/ui/EvidenceThread.jsx; one device, used identically on the
// report, the credential, the methodology page and the marketing site.
export const thread = {
  stroke: '1.5px',
  tick: '7px',
  gap: space[3],
  color: brand.greenInk,
  colorDark: brand.green,
}

const tokens = { brand, color, font, typeScale, typeRoles, leading, tracking, space, radius, elevation, layout, breakpoints, focus, motion, thread }
export default tokens