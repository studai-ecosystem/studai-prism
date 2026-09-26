import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // 120s: a long single-worker run can stall a localhost navigation past 60s
  // without a wrong assertion (K109). Expect stays at 10s.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // A long four-project run occasionally loses a localhost navigation or a
  // click during a re-render. One retry re-runs the same assertions (K111).
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'audit-results/prism-e2e-results.json' }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.PRISM_AUDIT_BASE_URL || 'http://127.0.0.1:4173',
    // Traces are recorded for every test and kept only on failure. On Firefox
    // that recording stalled the page long enough to hit the test timeout
    // (K109). Screenshots on failure are enough to see a broken page.
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
    // The shell-caching service worker (public/sw.js) is not under test, and
    // once it controls a page WebKit sends that page's requests through it, so
    // page.route() network-drop checks (Journey E) would be bypassed (K105).
    serviceWorkers: 'block',
  },
  webServer: process.env.PRISM_AUDIT_BASE_URL ? undefined : [
    {
      command: 'node scripts/start-audit-server.mjs',
      url: 'http://127.0.0.1:4173/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Campus harness: same isolated audit server with the campus flags on
      // (test process only, K2). Campus specs target it via CAMPUS_BASE_URL.
      command: 'node scripts/start-audit-server.mjs',
      url: 'http://127.0.0.1:4174/api/health',
      env: {
        PORT: '4174',
        PRISM_AUDIT_CAMPUS: 'true',
        // Throwaway campus store (Journey B) when the runner provides one.
        ...(process.env.PRISM_E2E_DATABASE_URL ? { PRISM_AUDIT_CAMPUS_DATABASE_URL: process.env.PRISM_E2E_DATABASE_URL } : {}),
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: {
      ...devices['Desktop Firefox'],
      // Font stylesheets are non-blocking (index.html, K107). localDomains is
      // only a hint: it does not refuse the connection. A dead proxy is not
      // used — it would bypass offline emulation (PRISM-E2E-13).
      launchOptions: { firefoxUserPrefs: { 'network.dns.localDomains': 'fonts.googleapis.com,fonts.gstatic.com' } },
    } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
})
