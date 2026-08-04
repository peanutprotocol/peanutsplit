import { expect, test, type Page } from '@playwright/test'
import { enterCreatedRoom } from './helpers'

/**
 * The room title is navigation, while the emblem remains an explicit settings
 * control. These tests deliberately use only the public header/sheet contract:
 * the title switcher must remain useful even when this device knows one room,
 * and opening it must not make the current room look like a destination.
 */

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.83' } })

async function createRoom(page: Page, name: string) {
    await page.goto('/new')
    await page.getByTestId('room-name').fill(name)
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await enterCreatedRoom(page)

    return {
        path: new URL(page.url()).pathname,
        slug: new URL(page.url()).pathname.split('/')[2],
    }
}

async function openRoomSwitcher(page: Page) {
    await page.getByTestId('open-room-switcher').click()
    const sheet = page.getByTestId('room-switcher-sheet')
    await expect(sheet).toBeVisible({ timeout: 10_000 })
    return sheet
}

test('an only room remains an inert current-room row', async ({ page }) => {
    const { path } = await createRoom(page, 'Only room')

    const sheet = await openRoomSwitcher(page)
    const current = sheet.getByTestId('room-switcher-current')

    await expect(current).toBeVisible()
    await expect(current).toContainText('Only room')
    await expect(current).toHaveAttribute('aria-current', 'page')
    await expect(
        sheet.locator(
            '[data-testid="room-switcher-current"]:is(a, button), [data-testid="room-switcher-current"] a, [data-testid="room-switcher-current"] button'
        )
    ).toHaveCount(0)
    await expect(sheet.getByTestId('room-switcher-tile')).toHaveCount(0)
    await expect(sheet.getByRole('link')).toHaveCount(1)
    await expect(sheet.getByTestId('room-switcher-manage')).toHaveAttribute('href', '/app?manage=1')
    await expect(sheet.getByText('No other rooms are saved on this device.')).toBeVisible()
    expect(new URL(page.url()).pathname).toBe(path)
})

test('Settings stays a separate header destination', async ({ page }) => {
    const { path } = await createRoom(page, 'Separate controls')

    await expect(page.getByTestId('open-room-switcher')).toBeVisible()
    await expect(page.getByTestId('open-room-settings')).toBeVisible()

    await openRoomSwitcher(page)
    await expect(page.getByTestId('settings-sheet')).toHaveCount(0)
    await page.goBack()
    await expect(page.getByTestId('room-switcher-sheet')).toBeHidden({ timeout: 10_000 })
    expect(new URL(page.url()).pathname).toBe(path)

    await page.getByTestId('open-room-settings').click()
    await expect(page.getByTestId('settings-sheet')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('room-switcher-sheet')).toHaveCount(0)
})

test('a remembered room can be opened from the title switcher', async ({ page }) => {
    const alpha = await createRoom(page, 'Alpha switcher')
    const beta = await createRoom(page, 'Beta switcher')
    expect(beta.slug).not.toBe(alpha.slug)

    const sheet = await openRoomSwitcher(page)
    await expect(sheet.getByTestId('room-switcher-current')).toContainText('Beta switcher')

    const alphaTile = sheet.locator(`[data-testid="room-switcher-tile"][data-slug="${alpha.slug}"]`)
    await expect(alphaTile).toBeVisible()
    await alphaTile.click()

    await expect(page).toHaveURL(new RegExp(`${alpha.path}$`), { timeout: 10_000 })
    await expect(page.getByTestId('room-title')).toHaveText('Alpha switcher')
    await expect(page.getByTestId('room-switcher-sheet')).toBeHidden()
})

test('Back closes the title switcher before leaving the room', async ({ page }) => {
    const { path } = await createRoom(page, 'Back from switcher')

    await openRoomSwitcher(page)
    await page.goBack()

    await expect(page.getByTestId('room-switcher-sheet')).toBeHidden({ timeout: 10_000 })
    expect(new URL(page.url()).pathname).toBe(path)
    await expect(page.getByTestId('open-room-switcher')).toBeVisible()
    await expect(page.getByTestId('open-room-settings')).toBeVisible()
})
