import { expect, test } from '@playwright/test'

/**
 * What this deployment tells the operating system about itself, on a v1 build.
 *
 * The manifest assertions are the ones that matter: it is served uncredentialed, cached by the
 * browser for as long as it likes, and a room slug in it would be a credential published to the
 * OS. The last assertion in each block is the same one — no `/r/` anywhere.
 *
 * Room creation is metered per IP (20/hour), so this file takes its own TEST-NET address rather
 * than sharing either project's budget.
 */
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.20' } })

test('the manifest names the app Split, offers one shortcut, and carries no room', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest')
    expect(response.status()).toBe(200)

    const manifest = (await response.json()) as {
        name: string
        short_name: string
        shortcuts?: { name: string; url: string }[]
        share_target?: unknown
    }

    expect(manifest.name).toBe('Split')
    expect(manifest.short_name).toBe('Split')
    expect(manifest.shortcuts?.map((shortcut) => shortcut.url)).toEqual(['/new'])
    // The share sheet is v2's, and this build is v1. An entry here would put Split in every
    // Android photo share sheet and then decline the photo.
    expect(manifest.share_target).toBeUndefined()
    expect(JSON.stringify(manifest)).not.toContain('/r/')
})

test('iOS is offered "Split" as the home-screen name', async ({ page }) => {
    // The tag lives in the root layout, so every route under it carries the same value — these two
    // are the routes that need no room and therefore no creation budget.
    for (const path of ['/', '/new']) {
        await page.goto(path)
        await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Split')
    }
})
