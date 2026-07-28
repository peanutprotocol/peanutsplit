import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 3100)
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

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
              },
          },
    projects: [
        // iPhone 14 geometry on Chromium: WebKit needs host libraries (libwoff1,
        // libavif16, …) that neither this box nor a plain CI image ships, and the
        // journey asserts layout-independent backend truth. Swap `browserName`
        // back to webkit once those deps are part of the image.
        {
            name: 'mobile',
            use: {
                ...devices['iPhone 14'],
                browserName: 'chromium',
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
                extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.11' },
            },
        },
    ],
})
