/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0A0D14',
        'bg-secondary': '#111520',
        'bg-tertiary': '#1A1F2E',
        gold: {
          DEFAULT: '#C9A84C',
          light: '#E8C96A',
        },
        'text-primary': '#F0EDE6',
        'text-secondary': '#8A8FA0',
        'border-subtle': '#252A3A',
        danger: '#E05252',
        success: '#3CB97A',
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
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
