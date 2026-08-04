import { expect, type Page } from '@playwright/test'
import { test } from './fixtures'
import { enterCreatedRoom } from './helpers'

/**
 * The title switcher stays deliberately smaller than the full room chooser.
 * Even at the recent-room storage cap it renders the current room, at most two
 * destinations, and one stable All rooms escape hatch in a vertical list.
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

test('the title switcher caps its vertical recent list at two rooms', async ({ page }) => {
    await roomWithNeighbours(page)

    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ps:recent') ?? '[]').length)).toBe(CAP)

    const sheet = await openRoomSwitcher(page)
    const current = sheet.getByTestId('room-switcher-current')
    const recent = sheet.getByTestId('room-switcher-tile')
    const allRooms = sheet.getByTestId('room-switcher-all')

    await expect(current).toBeVisible()
    await expect(recent).toHaveCount(2)
    await expect(allRooms).toBeVisible()

    const [currentBox, firstBox, secondBox, allRoomsBox] = await Promise.all([
        current.boundingBox(),
        recent.nth(0).boundingBox(),
        recent.nth(1).boundingBox(),
        allRooms.boundingBox(),
    ])
    expect(currentBox!.y + currentBox!.height).toBeLessThanOrEqual(firstBox!.y)
    expect(firstBox!.y + firstBox!.height).toBeLessThanOrEqual(secondBox!.y)
    expect(secondBox!.y + secondBox!.height).toBeLessThanOrEqual(allRoomsBox!.y)
})

test('the compact switcher keeps All rooms reachable without horizontal overflow', async ({ page }) => {
    await roomWithNeighbours(page)
    const sheet = await openRoomSwitcher(page)

    const allRooms = sheet.getByTestId('room-switcher-all')
    await expect(allRooms).toBeInViewport()
    await expect(allRooms).toHaveAttribute('href', '/app')

    const overflow = await sheet.evaluate((element) => ({
        sheet: element.scrollWidth - element.clientWidth,
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }))
    expect(overflow).toEqual({ sheet: 0, document: 0 })
})
