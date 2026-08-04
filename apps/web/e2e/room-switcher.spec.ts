import { expect, type Page } from '@playwright/test'
import { test } from './fixtures'
import { enterCreatedRoom } from './helpers'

/**
 * The title switcher is the retained-room chooser. Even at the storage cap it
 * renders the current room plus every other retained destination in one
 * vertically scrollable list.
 */

/** `RECENT_ROOMS_LIMIT`. Seeding past it also proves the read path still truncates. */
const CAP = 12

async function roomWithNeighbours(page: Page) {
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Switcher')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await enterCreatedRoom(page)

    await page.evaluate((count) => {
        const stored = JSON.parse(localStorage.getItem('ps:recent') ?? '[]')
        const seeded = Array.from({ length: count }, (_, index) => ({
            slug: `seeded-room-${index}-brave-otter-lamp`,
            name: ['Ski trip', 'Lisbon weekend', 'Flat 4B bills and the rest of it', 'Tokyo'][index % 4],
            emoji: 'ski',
            theme: 'classic',
            lastSeenAt: 1_760_000_000_000 - index * 1_000,
        }))
        localStorage.setItem('ps:recent', JSON.stringify([...stored, ...seeded]))
    }, 20)
    await page.reload()
    await expect(page.getByTestId('open-room-switcher')).toBeVisible({ timeout: 15_000 })
}

async function openRoomSwitcher(page: Page) {
    await page.getByTestId('open-room-switcher').click()
    const sheet = page.getByTestId('room-switcher-sheet')
    await expect(sheet).toBeVisible({ timeout: 10_000 })
    return sheet
}

test('the title switcher exposes every retained non-current room', async ({ page }) => {
    await roomWithNeighbours(page)

    const retained = await page.evaluate(
        () => JSON.parse(localStorage.getItem('ps:recent') ?? '[]') as Array<{ slug: string }>
    )
    expect(retained).toHaveLength(CAP)
    const currentSlug = new URL(page.url()).pathname.split('/')[2]
    const expectedSlugs = retained.filter((room) => room.slug !== currentSlug).map((room) => room.slug)

    const sheet = await openRoomSwitcher(page)
    const current = sheet.getByTestId('room-switcher-current')
    const recent = sheet.getByTestId('room-switcher-tile')
    const manage = sheet.getByTestId('room-switcher-manage')

    await expect(current).toBeVisible()
    await expect(recent).toHaveCount(expectedSlugs.length)
    await expect(sheet.getByRole('link')).toHaveCount(expectedSlugs.length + 1)
    await expect(manage).toHaveAttribute('href', '/app?manage=1')
    expect(await recent.evaluateAll((tiles) => tiles.map((tile) => (tile as HTMLElement).dataset.slug))).toEqual(
        expectedSlugs
    )
    for (const slug of expectedSlugs) {
        await expect(sheet.locator(`[data-testid="room-switcher-tile"][data-slug="${slug}"]`)).toHaveAttribute(
            'href',
            `/r/${slug}`
        )
    }
})

test('the full switcher scrolls to its final room without horizontal overflow', async ({ page }) => {
    await roomWithNeighbours(page)
    const sheet = await openRoomSwitcher(page)

    const recent = sheet.getByTestId('room-switcher-tile')
    const manage = sheet.getByTestId('room-switcher-manage')
    await expect(recent).toHaveCount(CAP - 1)
    await manage.scrollIntoViewIfNeeded()
    await expect(manage).toBeInViewport()

    const overflow = await sheet.evaluate((element) => ({
        sheet: element.scrollWidth - element.clientWidth,
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }))
    expect(overflow).toEqual({ sheet: 0, document: 0 })
})
