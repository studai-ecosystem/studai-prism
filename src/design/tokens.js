// Prism Design System — Part A: the token file.
//
// THE SINGLE SOURCE. Every color, space, type, radius, elevation and motion
// value in the UI comes from here (or the CSS variables generated from here
// in tokens.css — keep the two in lockstep). Raw hex or arbitrary values in
// page code fail CI (server/test/designSystem.test.js).
//
// Direction: "Instrument, not oracle." Prism looks like a precision
// measuring device that shows its workings — calibration marks, evidence
// annotations, honest uncertainty. Not friendly-edtech, not enterprise grey,
// not dark-mode-plus-acid-accent.

// ── Palette ──────────────────────────────────────────────────────────────────
// Six named values + semantic status. The accent is used ALMOST EXCLUSIVELY
// for measurement moments (evidence threads, confidence bands, the active
// speaking state) so that when you see viridian, it always means
// "measurement" — that scarcity is the identity.
export const color = {
  // A warm near-white paper ground — credentials are documents.
  paper: '#FAFAF7',
  // Pure surface for cards sitting on paper.
  surface: '#FFFFFF',
  // Deep neutral ink with a cold undertone; primary text and structure.
  ink: '#16181D',
  // Muted ink for secondary text; AA on paper.
  inkMuted: '#565B66',
  // Hairlines, calibration marks, dividers — the instrument's engraving.
  line: '#D9D9D2',
  // THE accent: calibrated viridian. Evidence, measurement, live states.
  // Chosen against both AI-default palettes; prints legibly in greyscale.
  accent: '#0E7C7B',
  // Accent on dark surfaces (the assessment room at night).
  accentBright: '#3BB8B6',

  // The assessment room is dark-capable (candidates test at night).
  room: '#14161A', // room ground
  roomSurface: '#1D2026', // cards/console in the room
  roomInk: '#E8E9E4', // text in the room
  roomLine: '#33363E',

  // Semantic status — reliability must be distinguishable WITHOUT color
  // alone: components always pair these with an icon + label.
  reliabilityHigh: '#1A7F37',
  reliabilityModerate: '#9A6700',
  reliabilityLow: '#C93C37',
  info: '#31589E',

  // Form/feedback
  danger: '#C93C37',
  dangerSurface: '#FCEBEA',
  success: '#1A7F37',
  successSurface: '#EAF5EC',
  warnSurface: '#FBF3E0',
  infoSurface: '#EBF1FB',
}

// ── Type ─────────────────────────────────────────────────────────────────────
// Display: Fraunces — a contemporary "old-style soft serif" with real
//   personality (optical sizing, ink-trap details). Justification: it reads
//   like the engraved face of a well-made instrument — warm but exact —
//   and is unmistakably NOT the geometric-sans AI default. Variable font,
//   openly licensed.
// Body: Noto Sans — chosen for one non-negotiable reason: Noto Sans
//   Devanagari and Noto Sans Tamil are designed as metrical companions in
//   the same superfamily. PRISM_LANG (Hindi/Tamil/Hinglish) means the body
//   face must carry three scripts WITHOUT a redesign; Noto is the only
//   family pair that guarantees harmonized weights/x-heights across all
//   three today.
// Utility: IBM Plex Mono — tabular numerals for scores, timers, evidence
//   indices; its drafting-table heritage suits the instrument language.
export const font = {
  display: "'Fraunces', Georgia, serif",
  body: "'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Tamil', system-ui, sans-serif",
  utility: "'IBM Plex Mono', ui-monospace, 'Cascadia Mono', monospace",
}

// Type scale — exactly 8 steps. rem-based; 1rem = 16px.
export const typeScale = {
  xs: '0.75rem', //   12  metadata, evidence indices
  sm: '0.875rem', //  14  secondary text, labels
  base: '1rem', //    16  body
  md: '1.125rem', //  18  lead paragraphs, console input
  lg: '1.375rem', //  22  card titles, section heads
  xl: '1.75rem', //   28  page titles
  '2xl': '2.25rem', //36  report verdict, display
  '3xl': '3rem', //   48  homepage thesis
}

export const leading = { tight: 1.2, base: 1.55, loose: 1.75 }
export const tracking = { tight: '-0.01em', base: '0', wide: '0.08em' } // wide = overline labels

// ── Space / radius / elevation ───────────────────────────────────────────────
// 4px base. Named, not arbitrary.
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

// Elevation: paper casts almost no shadow — an instrument sits flat.
// Three levels only.
export const elevation = {
  flat: 'none',
  raised: '0 1px 2px rgba(22, 24, 29, 0.06), 0 2px 8px rgba(22, 24, 29, 0.06)',
  overlay: '0 4px 12px rgba(22, 24, 29, 0.12), 0 12px 40px rgba(22, 24, 29, 0.16)',
}

// ── Motion ───────────────────────────────────────────────────────────────────
// Calm by default. Global reduced-motion strategy: tokens.css collapses every
// duration to 0.01ms under prefers-reduced-motion; nothing in the UI may
// convey meaning by motion alone (states always pair with text/icon).
export const motion = {
  durationFast: '120ms', //  hover, focus rings
  durationBase: '200ms', //  reveals, state changes
  durationSlow: '320ms', //  page-level transitions, the thread drawing in
  easeStandard: 'cubic-bezier(0.2, 0, 0, 1)', // decisive out
  easeEnter: 'cubic-bezier(0, 0, 0.2, 1)',
  easeExit: 'cubic-bezier(0.4, 0, 1, 1)',
}

// ── The signature element ────────────────────────────────────────────────────
// "The evidence thread": the visual device that appears EVERYWHERE a number
// meets its justification. Geometry tokens for the component
// (src/components/ui/EvidenceThread.jsx) — one device, used identically on
// the report, the credential, the methodology page and the marketing site.
export const thread = {
  stroke: '1.5px',
  tick: '7px', // the calibration tick at each terminus
  gap: space[3],
  color: color.accent,
  colorDark: color.accentBright,
}

const tokens = { color, font, typeScale, leading, tracking, space, radius, elevation, motion, thread }
export default tokens
