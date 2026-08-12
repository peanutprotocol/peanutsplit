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
    for (const path of ['/', '/app', '/new', '/import', '/r/not-a-real-room', '/manifest.webmanifest', '/sw.js']) {
        const response = await request.get(path, {
            headers: { 'x-forwarded-host': 'split.peanut.me' },
            maxRedirects: 0,
        })
        expect(response.status(), path).toBe(308)
        expect(response.headers().location, path).toBe(`https://peanutsplit.com${path}`)
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
