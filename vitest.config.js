import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['src/test/setup.js'],
    restoreMocks: true,
    css: false,
    // PROD-READY Phase 6 (P69): recharts and its d3 dependencies are several
    // hundred small ES modules. Loaded on demand inside a test (the campus
    // charts are a React.lazy chunk), vite-node transformed them one by one
    // within the test's time budget (~1 s idle, several seconds under load).
    // Pre-bundled for the jsdom environment they load as one module.
    deps: { optimizer: { web: { enabled: true, include: ['recharts'] } } },
  },
})
