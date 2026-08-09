import { expect } from '@playwright/test'
import { test } from './fixtures'

/**
 * The domain cutover's e2e surface is deliberately small: the redirects are host-gated
 * on the two production hostnames, and an e2e run answers on localhost — so the full
 * cross-host walk cannot be exercised here and lives in the unit decision table
 * (`src/lib/cutover-redirects.test.ts`). What CAN be proven here is the inertness that
 * gate promises: on a non-production host nothing redirects, the handoff importer never
 * builds its iframe, and the reinstall banner never appears.
 */

test('app paths serve in place on a non-production host — no cutover redirect', async ({ page }) => {
    const response = await page.goto('/app')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveURL(/\/app$/)
})

test('the handoff importer stays inert: no guard written, no legacy iframe created', async ({ page }) => {
    await page.goto('/app')
    await expect(page.getByTestId('room-link-recovery')).toBeVisible()
    expect(await page.evaluate(() => window.localStorage.getItem('ps:handoff-done'))).toBeNull()
    expect(await page.locator('iframe[src*="peanutsplit.com"]').count()).toBe(0)
})

test('the reinstall banner never appears off the legacy production host', async ({ page }) => {
    await page.goto('/app')
    await expect(page.getByTestId('room-link-recovery')).toBeVisible()
    await expect(page.getByTestId('reinstall-banner')).toHaveCount(0)
})

test('/handoff serves without redirecting and renders its one-line explanation', async ({ page }) => {
    const response = await page.goto('/handoff')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveURL(/\/handoff$/)
    await expect(page.getByText('nothing to do here')).toBeVisible()
})
