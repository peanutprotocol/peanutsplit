import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

// Mobile-first: 390x844 is the design target.
export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: 'html',
    use: {
        baseURL,
        trace: 'on-first-retry',
    },
    projects: [
        { name: 'mobile', use: { ...devices['iPhone 14'] } },
        { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    ],
})
