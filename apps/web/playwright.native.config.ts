import { defineConfig, devices } from '@playwright/test'

/**
 * The store app's cross-origin suite (local/split-native-app ARCHITECTURE 14.2).
 *
 * Two servers on two ports, so every API call the bundled app makes is cross-origin, exactly as
 * on a phone where the bundle loads from `capacitor://localhost` and the API is
 * `https://peanutsplit.com`:
 *
 * - API (:3100): `next start` on the `pnpm build` output, so `src/proxy.ts` and its CORS answer run
 *   as in production. `SPLIT_CORS_TEST_ORIGINS` admits the app origin. The negative control in
 *   native.yml sets it to an empty string, which is why `??` and not `||` reads it below.
 * - App (:8778): the static export served by `scripts/native/serve-export.mjs`, which copies
 *   Capacitor's rule that every dotless path gets the root index.html. The export must be built
 *   with `NEXT_PUBLIC_BASE_URL=http://localhost:3100` (native.yml does), or the app calls
 *   production.
 *
 * This file sits in the Docker context and the web typecheck, so it imports only
 * `@playwright/test` (the 2026-08-03 incident class). Specs in `e2e-native/` may import `../e2e`
 * helpers because `e2e-native` is excluded from both.
 */

const API_PORT = 3100
const APP_PORT = 8778
const apiOrigin = `http://localhost:${API_PORT}`
const appOrigin = `http://localhost:${APP_PORT}`

export default defineConfig({
    testDir: './e2e-native',
    // `next start` is a production server, far lighter than the `next dev` the web suite uses.
    workers: Number(process.env.E2E_WORKERS ?? 3),
    fullyParallel: true,
    // Two-device specs wait on cross-origin writes and the live stream; leave room on a CI runner.
    timeout: 60_000,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    // Default output folders (`test-results/`, `playwright-report/`): both are gitignored.
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: appOrigin,
        trace: 'retain-on-failure',
        // The app has no service worker; the web context in the specs blocks the web one so a
        // cached response never hides a server answer.
        serviceWorkers: 'block',
    },
    webServer: [
        {
            command: `pnpm exec next start --port ${API_PORT}`,
            url: `${apiOrigin}/healthcheck`,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: {
                DATABASE_URL:
                    process.env.E2E_DATABASE_URL ?? 'postgresql://split:split@localhost:5433/peanut_split_dev',
                SPLIT_FX_MODE: 'static',
                NEXT_PUBLIC_BASE_URL: apiOrigin,
                SPLIT_CORS_TEST_ORIGINS: process.env.SPLIT_CORS_TEST_ORIGINS ?? appOrigin,
            },
        },
        {
            command: `node scripts/native/serve-export.mjs .next-native ${APP_PORT}`,
            url: `${appOrigin}/index.html`,
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
        },
    ],
    projects: [
        // iPhone geometry on both engines. WebKit is the closest Linux stand-in for WKWebView's
        // CORS and EventSource; Chromium stands in for the Android System WebView.
        { name: 'chromium', use: { ...devices['iPhone 14'], browserName: 'chromium' } },
        { name: 'webkit', use: { ...devices['iPhone 14'], browserName: 'webkit' } },
    ],
})
