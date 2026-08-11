import { defineConfig } from '@playwright/test'

const port = Number(process.env.PWA_BOUNDARY_PORT ?? 8777)
const productOrigin = process.env.PWA_BOUNDARY_PRODUCT_ORIGIN ?? `http://localhost:${port}`
const contentOrigin = process.env.PWA_BOUNDARY_CONTENT_ORIGIN ?? `http://localhost:${port}`

/**
 * Production-build-only PWA seam. The ordinary suite runs `next dev`, where Serwist deliberately
 * emits no worker; this separate config targets an already-running build or hosted candidate.
 */
export default defineConfig({
    testDir: './e2e-pwa-boundary',
    workers: 1,
    retries: 0,
    reporter: 'list',
    use: {
        browserName: 'chromium',
        ignoreHTTPSErrors: true,
        // A real run receives the raw edge marker as a request header. Never persist it in a
        // Playwright trace, even on failure; the assertions and console diagnostics are enough.
        trace: 'off',
    },
    metadata: { productOrigin, contentOrigin },
})
