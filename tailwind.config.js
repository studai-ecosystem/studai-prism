/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#EDE4D3',
        'bg-secondary': '#FFFFFF',
        'bg-tertiary': '#F6EFE2',
        card: '#FFFFFF',
        gold: {
          DEFAULT: '#C9A84C',
          light: '#E8C96A',
        },
        'text-primary': '#0A0D14',
        'text-secondary': '#5A5F6E',
        'border-subtle': '#E8E0D0',
        danger: '#E05252',
        success: '#3CB97A',
      },
      fontFamily: {
        // Design-system pair (Part A): Fraunces display + Noto Sans body with
        // Devanagari/Tamil companions + IBM Plex Mono utility. Loaded in
        // index.html; swapping here restyles every legacy page at once.
        serif: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Noto Sans"', '"Noto Sans Devanagari"', '"Noto Sans Tamil"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      animation: {
        shimmer: 'shimmer 3s linear infinite',
        'fade-up': 'fadeUp 0.6s ease forwards',
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        fadeUp: {
          from: { opacity: 0, transform: 'translateY(32px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
