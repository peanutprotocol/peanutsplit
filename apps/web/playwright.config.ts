import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 3100)
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`
const browserName = process.env.E2E_BROWSER === 'firefox' ? 'firefox' : 'chromium'

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
    // Compiles the on-demand dev routes once, so no test pays a cold start inside its own timeout.
    globalSetup: './e2e/global-setup.ts',
    fullyParallel: true,
    /**
     * ONE `next dev` process serves every worker, so the server is the bottleneck and the CPU is
     * not. Playwright's default (half the cores) oversubscribes it on a large box: the long
     * two-device journeys then spend their wall clock waiting on a saturated server and fail as
     * timeouts that read exactly like races — a click whose target is already "visible, enabled and
     * stable" simply running out of budget. Six is measured, not guessed: on a 16-core box the
     * default left 7 tests failing per run and 6 left none, at the same total runtime, because the
     * server was always the limit.
     */
    workers: Number(process.env.E2E_WORKERS ?? 6),
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
        // iPhone 14 geometry on Chromium by default. `E2E_BROWSER=firefox`
        // enables the focused cross-engine matrix without duplicating projects.
        // WebKit needs host GTK/GStreamer/image libraries that this VM and a
        // plain CI image do not ship; add it once those deps are provisioned.
        // Every context gets its OWN `x-forwarded-for` from `e2e/fixtures.ts`, so the
        // server's 20-per-hour creation budget is per test rather than per project.
        // A fixed address here would only have separated the two projects from each
        // other, and the suite creates far more than 20 rooms per project.
        { name: 'mobile', use: { ...devices['iPhone 14'], browserName } },
        { name: 'desktop', use: { ...devices['Desktop Chrome'], browserName } },
    ],
})
