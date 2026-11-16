import { API_ORIGIN, appRoomUrl, expect, test } from './fixtures'

/**
 * E2 (ARCHITECTURE 14.2): a room made in the app is shared with the same link the web shares,
 * `<site>/r/<slug>`. Never the app's own origin and never the in-app `/room/?slug=` path, which
 * would open nothing for the friend who receives it.
 */
test('E2: a room created in the app shares the canonical web link', async ({ page }) => {
    // The copy button writes through navigator.clipboard; record what it writes instead of
    // reading the system clipboard, which only Chromium lets a test read.
    await page.addInitScript(() => {
        const copied: string[] = []
        Object.defineProperty(window, '__copied', { value: copied })
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: async (text: string) => void copied.push(text) },
        })
    })

    await page.goto('/app/')
    await page.getByTestId('app-new-split').click()
    await page.getByTestId('room-name').fill('App made trip')
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()

    await expect(page).toHaveURL(/\/room\/\?slug=/, { timeout: 15_000 })
    const slug = new URL(page.url()).searchParams.get('slug')!
    await expect(page).toHaveURL(appRoomUrl(slug))
    await expect(page.getByTestId('join-gate')).toHaveCount(0)

    const roomLink = `${API_ORIGIN}/r/${slug}`
    const linkRow = page.getByTestId('room-link-row')
    if (!(await linkRow.isVisible())) await page.getByTestId('share-room').click()
    await expect(linkRow).toBeVisible({ timeout: 15_000 })
    await expect(linkRow.getByTestId('room-link')).toContainText(`/r/${slug}`)

    await linkRow.getByTestId('copy-link').click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)).toHaveLength(1)
    const [copied] = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)
    expect(copied).toContain(roomLink)
    expect(copied).not.toContain(':8778')
    expect(copied).not.toContain('/room/')
})
