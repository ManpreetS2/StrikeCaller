import { defineConfig, devices } from '@playwright/test'

const APP_ORIGIN = 'http://127.0.0.1:4173'
const PAGES_ORIGIN = 'http://127.0.0.1:4174/StrikeCaller'

/**
 * Production-like E2E: build + Vite preview (not Vite dev HMR on 5173).
 *
 * reuseExistingServer is opt-in via E2E_REUSE_SERVER=1. Default (and always in
 * CI) is a fresh `scripts/e2e-webservers.mjs` run so tests cannot attach to a
 * leftover preview with different code. Dev (`vite`, port 5173) is never used.
 *
 * The helper starts Pages preview first and waits until /StrikeCaller/ answers,
 * then starts the root preview Playwright polls at APP_ORIGIN.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `${APP_ORIGIN}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'node scripts/e2e-webservers.mjs',
    url: APP_ORIGIN,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
    timeout: 240_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      testIgnore: /pages\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'desktop-firefox',
      testIgnore: /pages\.spec\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'desktop-webkit',
      testIgnore: /pages\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-webkit',
      testIgnore: /pages\.spec\.ts/,
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'pages-chromium',
      testMatch: /pages\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `${PAGES_ORIGIN}/`,
      },
    },
  ],
})
