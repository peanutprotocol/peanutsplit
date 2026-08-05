import { expect } from '@playwright/test'
import { test } from './fixtures'
import { enterCreatedRoom, openCurrentRoomSettings } from './helpers'

/**
 * Navigation from the title switcher has to win over sheet dismissal. The
 * sheet is URL-backed, so these cases guard against competing router updates
 * that leave the person in the room they were trying to leave.
 */

async function createRoom(page: import('@playwright/test').Page, name: string) {
    await page.goto('/new')
    await page.getByTestId('room-name').fill(name)
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await enterCreatedRoom(page)
    return new URL(page.url()).pathname.split('/')[2]
}

test('tapping a room tile navigates to that room', async ({ page }) => {
    const alpha = await createRoom(page, 'Alpha')
    const beta = await createRoom(page, 'Beta')
    expect(beta).not.toBe(alpha)

    await page.getByTestId('open-room-switcher').click()
    await expect(page.getByTestId('room-switcher-sheet')).toBeVisible({ timeout: 10_000 })

    const tile = page.locator(`[data-testid="room-switcher-tile"][data-slug="${alpha}"]`)
    await expect(tile).toBeVisible()

    await tile.click()
    await expect(page).toHaveURL(new RegExp(`/r/${alpha}$`), { timeout: 10_000 })
    // Arriving is what closes the sheet — nothing calls onClose.
    await expect(page.getByTestId('room-switcher-sheet')).toBeHidden({ timeout: 10_000 })
    await expect(page.getByTestId('room-title')).toHaveText('Alpha')
})

test('a room beyond the old compact limit is still a direct destination', async ({ page }) => {
    const alpha = await createRoom(page, 'Alpha beyond limit')
    await createRoom(page, 'Beta beyond limit')
    await createRoom(page, 'Gamma beyond limit')
    await createRoom(page, 'Delta beyond limit')

    await page.getByTestId('open-room-switcher').click()
    await expect(page.getByTestId('room-switcher-sheet')).toBeVisible({ timeout: 10_000 })

    const rooms = page.getByTestId('room-switcher-tile')
    await expect(rooms).toHaveCount(3)
    const alphaTile = page.locator(`[data-testid="room-switcher-tile"][data-slug="${alpha}"]`)
    await alphaTile.scrollIntoViewIfNeeded()
    await alphaTile.click()

    await expect(page).toHaveURL(new RegExp(`/r/${alpha}$`), { timeout: 10_000 })
    await expect(page.getByTestId('room-title')).toHaveText('Alpha beyond limit')
})

test('tapping a theme swatch repaints the room', async ({ page }) => {
    await createRoom(page, 'Palette')

    await openCurrentRoomSettings(page)
    await page.waitForTimeout(600)

    await expect(page.locator('[data-testid="theme-swatch"] svg')).toHaveCount(0)
    const swatch = page.locator('[data-testid="theme-swatch"]').nth(2)
    const key = await swatch.getAttribute('data-theme')
    await swatch.click()
    await page.waitForTimeout(2_000)
    await expect(swatch).toHaveAttribute('aria-pressed', 'true')
    expect(key).toBeTruthy()
})
