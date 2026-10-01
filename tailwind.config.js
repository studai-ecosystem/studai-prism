/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand (values in src/design/tokens.css). green-ink is the only green
        // that may be used as text on light surfaces; brand green is a fill.
        brand: {
          navy: 'var(--brand-navy)',
          'navy-strong': 'var(--brand-navy-strong)',
          'navy-deep': 'var(--brand-navy-deep)',
          'navy-soft': 'var(--brand-navy-soft)',
          green: 'var(--brand-green)',
          'green-ink': 'var(--brand-green-ink)',
          'green-soft': 'var(--brand-green-soft)',
          soft: 'var(--brand-soft)',
        },
        // Application tokens (shell, campus, student); themeable via CSS vars.
        prism: {
          canvas: 'var(--prism-canvas)',
          surface: 'var(--prism-surface)',
          subtle: 'var(--prism-subtle)',
          border: 'var(--prism-border)',
          'border-strong': 'var(--prism-border-strong)',
          ink: 'var(--prism-ink)',
          'ink-muted': 'var(--prism-ink-muted)',
          'ink-subtle': 'var(--prism-ink-subtle)',
          accent: 'var(--prism-accent)',
          'accent-strong': 'var(--prism-accent-strong)',
          'accent-soft': 'var(--prism-accent-soft)',
          'accent-ink': 'var(--prism-accent-ink)',
          positive: 'var(--prism-positive)',
          'positive-soft': 'var(--prism-positive-soft)',
          partial: 'var(--prism-partial)',
          'partial-soft': 'var(--prism-partial-soft)',
          blocked: 'var(--prism-blocked)',
          'blocked-soft': 'var(--prism-blocked-soft)',
          insufficient: 'var(--prism-insufficient)',
          'insufficient-soft': 'var(--prism-insufficient-soft)',
        },
      },
      fontFamily: {
        // One brand sans (Inter) with Devanagari and Tamil script companions;
        // `serif` is a legacy class name that now maps to the display face.
        sans: ['Inter', 'system-ui', '"Noto Sans Devanagari"', '"Noto Sans Tamil"', 'sans-serif'],
        serif: ['Inter', 'system-ui', '"Noto Sans Devanagari"', '"Noto Sans Tamil"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}