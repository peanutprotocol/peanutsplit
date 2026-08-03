import { expect, test, type Page } from '@playwright/test'
import { enterCreatedRoom } from './helpers'

/**
 * The other-rooms strip at the top of the settings sheet, at the storage cap.
 *
 * It could not be scrolled sideways by any input. vaul sets `touch-action: none` on the drawer,
 * and touch-action resolves up the ancestor chain rather than being inherited, so a finger could
 * not pan the strip — while the scrollbar was hidden on both engines, leaving a mouse with nothing
 * either. Every room past the fifth tile was unreachable without clearing storage.
 */

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.24' } })

/** `RECENT_ROOMS_LIMIT`. Seeding past it also proves the read path still truncates. */
const CAP = 12

async function roomWithNeighbours(page: Page) {
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Switcher')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await enterCreatedRoom(page)

    const currentSlug = new URL(page.url()).pathname.split('/')[2]
    await page.evaluate(
        ({ currentSlug, count }) => {
            const stored = JSON.parse(localStorage.getItem('ps:recent') ?? '[]')
            const seeded = Array.from({ length: count }, (_, index) => ({
                slug: `seeded-room-${index}-brave-otter-lamp`,
                name: ['Ski trip', 'Lisbon weekend', 'Flat 4B bills and the rest of it', 'Tokyo'][index % 4],
                emoji: 'ski',
                theme: 'classic',
                lastSeenAt: 1_760_000_000_000 - index * 1_000,
            }))
            localStorage.setItem('ps:recent', JSON.stringify([...stored, ...seeded]))
        },
        { currentSlug, count: 20 }
    )
    await page.reload()
    await expect(page.getByTestId('open-room-settings')).toBeVisible({ timeout: 15_000 })
}

test('the strip scrolls to its far end, and the room list stays capped', async ({ page }) => {
    await roomWithNeighbours(page)

    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ps:recent') ?? '[]').length)).toBe(CAP)

    await page.getByTestId('open-room-settings').click()
    await expect(page.getByTestId('settings-sheet')).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(600)

    const strip = page.locator('[data-testid="room-switcher"] ul')
    const before = await strip.evaluate((el) => ({
        overflowing: el.scrollWidth > el.clientWidth,
        touchAction: getComputedStyle(el).touchAction,
        noDrag: el.hasAttribute('data-vaul-no-drag'),
    }))
    // If it does not overflow, the rest of this test proves nothing.
    expect(before.overflowing).toBe(true)
    expect(before.touchAction).toBe('pan-x')
    expect(before.noDrag).toBe(true)

    await strip.evaluate((el) => el.scrollTo({ left: el.scrollWidth }))
    await page.waitForTimeout(400)
    const scrolled = await strip.evaluate((el) => el.scrollLeft)
    expect(scrolled).toBeGreaterThan(0)

    // The escape hatch sits at the far end, so reaching it is the thing that was broken.
    const allRooms = page.getByTestId('room-switcher-all')
    await expect(allRooms).toBeInViewport()
})

test('the strip does not push the room card out of the sheet', async ({ page }) => {
    await roomWithNeighbours(page)
    await page.getByTestId('open-room-settings').click()
    await expect(page.getByTestId('settings-sheet')).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(600)

    // Dropping the "SWITCH ROOM" heading bought back a line; the room's own card is what the
    // sheet is for and has to be reachable without hunting.
    await expect(page.getByTestId('room-display-name')).toBeInViewport()
})
