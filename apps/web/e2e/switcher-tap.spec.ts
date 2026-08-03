import { expect } from '@playwright/test'
import { test } from './fixtures'
import { enterCreatedRoom } from './helpers'

/**
 * Tapping a tile in the other-rooms strip has to actually go to that room.
 *
 * Scrolling the strip was fixed by handing horizontal panning back to the browser
 * (`data-vaul-no-drag` + `touch-action: pan-x`). This spec covers the other half of the
 * gesture — the tap — which nothing asserted before, and which was broken: the tile also
 * closed the sheet, and because the sheet is a URL param that close was a second router
 * push in the same click. It won, and the room never changed.
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

    await page.getByTestId('open-room-settings').click()
    await expect(page.getByTestId('settings-sheet')).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(600)

    const tile = page.locator(`[data-testid="room-switcher-tile"][data-slug="${alpha}"]`)
    await expect(tile).toBeVisible()

    await tile.click()
    await expect(page).toHaveURL(new RegExp(`/r/${alpha}$`), { timeout: 10_000 })
    // Arriving is what closes the sheet — nothing calls onClose.
    await expect(page.getByTestId('settings-sheet')).toBeHidden({ timeout: 10_000 })
    await expect(page.locator('h1').first()).toHaveText('Alpha')
})

test('the all-rooms tile leaves the room', async ({ page }) => {
    await createRoom(page, 'Alpha')
    await createRoom(page, 'Beta')

    await page.getByTestId('open-room-settings').click()
    await expect(page.getByTestId('settings-sheet')).toBeVisible({ timeout: 10_000 })

    // No sleep for the sheet's slide: `click()` already waits for the target to hold a stable
    // bounding box, which is the condition the timeout was standing in for.
    await page.getByTestId('room-switcher-all').click()
    // The operational home is `/app`; `/` is the marketing landing this tile deliberately avoids.
    await expect(page).toHaveURL(/\/app$/, { timeout: 10_000 })
})

test('tapping a theme swatch repaints the room', async ({ page }) => {
    await createRoom(page, 'Palette')

    await page.getByTestId('open-room-settings').click()
    await expect(page.getByTestId('settings-sheet')).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(600)

    const swatch = page.locator('[data-testid="theme-swatch"]').nth(2)
    const key = await swatch.getAttribute('data-theme')
    await swatch.click()
    await page.waitForTimeout(2_000)
    await expect(swatch).toHaveAttribute('aria-pressed', 'true')
    expect(key).toBeTruthy()
})
