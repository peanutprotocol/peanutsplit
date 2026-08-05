import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_V2_PORT ?? 3101)
const baseURL = process.env.E2E_V2_BASE_URL ?? `http://localhost:${PORT}`

/**
 * The v2 journeys, run against a build that opted in.
 *
 * A separate config rather than a project inside `playwright.config.ts` because
 * `NEXT_PUBLIC_SPLIT_V2_ENABLED` is a BUILD-time value that Next inlines into
 * the client bundle: one server cannot serve both answers, and the v1 suite
 * asserts the absence of exactly the affordances this one drives. Two configs,
 * two servers, two ports — and `pnpm e2e` stays the v1 gate it was.
 *
 * Everything else is deliberately identical to the v1 config: same mobile-first
 * geometry, same real database, same static FX.
 */
export default defineConfig({
    testDir: './e2e-v2',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? 'html' : 'list',
    use: {
        baseURL,
        trace: 'on-first-retry',
    },
    webServer: process.env.E2E_V2_BASE_URL
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
                  NEXT_PUBLIC_SPLIT_V2_ENABLED: '1',
                  // The scan route refuses before it reads a body without one. The
                  // spec intercepts every model call, so the value is never used —
                  // it only has to exist for the capability probe to say yes.
                  SPLIT_GEMINI_API_KEY: process.env.SPLIT_GEMINI_API_KEY ?? 'e2e-not-a-real-key',
                  SPLIT_GEMINI_PAID_TIER_CONFIRMED: '1',
              },
          },
    projects: [{ name: 'mobile', use: { ...devices['iPhone 14'], browserName: 'chromium' } }],
})
