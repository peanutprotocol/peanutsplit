import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 3100)
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`
const browserName =
    process.env.E2E_BROWSER === 'firefox' || process.env.E2E_BROWSER === 'webkit' ? process.env.E2E_BROWSER : 'chromium'

/**
 * Mobile-first: 390x844 is the design target.
 *
 * The webServer runs the real app against the real local dev database — these
 * specs assert backend truth (balances, settlements), not screenshots, so a
 * mocked API would defeat the point. Port 3100 keeps it clear of a dev server on
 * 3000. FX is pinned to the static table so a foreign-currency expense has
 * deterministic maths.
 */
export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? 'html' : 'list',
    use: {
        baseURL,
        trace: 'on-first-retry',
    },
    webServer: process.env.E2E_BASE_URL
        ? undefined
        : {
              command: `pnpm dev --port ${PORT}`,
              url: `${baseURL}/healthcheck`,
              reuseExistingServer: !process.env.CI,
              timeout: 180_000,
              env: {
                  DATABASE_URL:
                      process.env.E2E_DATABASE_URL ?? 'postgresql://peanut:peanut@localhost:5432/peanut_split_dev',
                  SPLIT_FX_MODE: 'static',
                  NEXT_PUBLIC_BASE_URL: baseURL,
                  // Keep the notification control in the e2e surface. Tests that exercise it
                  // stop at the browser permission result, so this short fixture key is never
                  // passed to PushManager.
                  NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'aGkh',
              },
          },
    projects: [
        // iPhone 14 geometry on Chromium by default. `E2E_BROWSER=firefox` or
        // `E2E_BROWSER=webkit` enables the deep cross-engine matrix without
        // duplicating projects. The nightly workflow provisions each engine's
        // host dependencies before it starts the suite.
        {
            name: 'mobile',
            use: {
                ...devices['iPhone 14'],
                browserName,
                // The two projects model independent visitors. Keeping their
                // TEST-NET addresses distinct prevents one project's room/member
                // creation budget from making the other project's QA order-dependent.
                extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.10' },
            },
        },
        {
            name: 'desktop',
            use: {
                ...devices['Desktop Chrome'],
                browserName,
                extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.11' },
            },
        },
    ],
})
