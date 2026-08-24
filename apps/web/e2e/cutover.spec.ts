import { expect } from '@playwright/test'
import { test } from './fixtures'

test('app paths serve in place on the local canonical build', async ({ page }) => {
    for (const path of ['/app', '/new', '/import']) {
        const response = await page.goto(path)
        expect(response?.status(), path).toBe(200)
        expect(new URL(page.url()).pathname).toBe(path)
    }
})

test('the former host is a one-way same-path compatibility alias', async ({ request }) => {
    const configuredOrigin = new URL(test.info().project.use.baseURL as string).origin
    for (const path of ['/', '/app', '/new', '/import', '/r/not-a-real-room', '/manifest.webmanifest', '/sw.js']) {
        const response = await request.get(path, {
            headers: { 'x-forwarded-host': 'split.peanut.me' },
            maxRedirects: 0,
        })
        expect(response.status(), path).toBe(308)
        // Next may serialize a redirect back to the request's own configured origin as a relative
        // Location. Resolve it as a browser would; the destination still must be the configured
        // origin, never the attacker-controlled forwarded host.
        expect(new URL(response.headers().location, configuredOrigin).href, path).toBe(
            new URL(path, configuredOrigin).href
        )
    }
})

test('the abandoned cross-origin migration surface is gone', async ({ page }) => {
    await page.goto('/app')
    await expect(page.getByTestId('room-link-recovery')).toBeVisible()
    expect(await page.evaluate(() => window.localStorage.getItem('ps:handoff-done'))).toBeNull()
    await expect(page.locator('iframe[src*="peanutsplit.com"]')).toHaveCount(0)
    await expect(page.getByTestId('reinstall-banner')).toHaveCount(0)

    const response = await page.goto('/handoff')
    expect(response?.status()).toBe(404)
})
