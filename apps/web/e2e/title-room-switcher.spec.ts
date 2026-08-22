import { expect, test, type Page } from '@playwright/test'
import { enterCreatedRoom } from './helpers'

/**
 * The room title opens navigation and room-scoped settings. These tests
 * deliberately use only the public header/sheet contract: the switcher must
 * remain useful even when this device knows one room, and its split actions
 * must never turn the current room into a navigation destination.
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

test('an only room keeps an inert body and one settings action', async ({ page }) => {
    const { path } = await createRoom(page, 'Only room')

    const sheet = await openRoomSwitcher(page)
    const current = sheet.getByTestId('room-switcher-current')

    await expect(current).toBeVisible()
    await expect(current).toContainText('Only room')
    await expect(current).toHaveAttribute('aria-current', 'page')
    const currentSettings = sheet.locator('[data-testid="room-switcher-settings"][data-current="true"]')
    await expect(currentSettings).toHaveCount(1)
    await expect(currentSettings).toHaveAttribute('data-current', 'true')
    await expect(currentSettings).toHaveText('Settings')
    // The descriptive current-room body is inert. Its compound row has Settings
    // as the sole action, alongside rather than nested inside that body.
    await expect(current.locator('a, button')).toHaveCount(0)
    await expect(current.locator('..').locator('a, button')).toHaveCount(1)
    await expect(sheet.getByTestId('room-switcher-tile')).toHaveCount(0)

    const manage = sheet.getByTestId('room-switcher-manage')
    await expect(manage).toHaveAttribute('href', '/app?manage=1')
    await expect(manage).toContainText('Add or join a room')
    await expect(sheet.locator('a a, a button, button a, button button')).toHaveCount(0)
    await expect(sheet.getByText('Recent rooms are saved only on this device.')).toHaveCount(0)
    expect(new URL(page.url()).pathname).toBe(path)
})

test('Settings is available from both the room emblem and the room picker', async ({ page }) => {
    const { path } = await createRoom(page, 'Separate controls')

    await expect(page.getByTestId('open-room-switcher')).toBeVisible()
    const directSettings = page.getByTestId('open-room-settings')
    await expect(directSettings).toBeVisible()
    // The emblem itself is the affordance. A second SVG would be the removed
    // gear badge competing with the separate icon picker in Settings.
    await expect(directSettings.locator('svg')).toHaveCount(1)
    await directSettings.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('settings-sheet')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('close-room-settings').click()
    await expect(page.getByTestId('settings-sheet')).toBeHidden({ timeout: 10_000 })
    await expect(directSettings).toBeFocused()

    const sheet = await openRoomSwitcher(page)
    const settingsButton = sheet.locator('[data-testid="room-switcher-settings"][data-current="true"]')
    await expect(settingsButton).toHaveCount(1)
    await expect(settingsButton).toHaveText('Settings')
    await settingsButton.click()

    await expect(page.getByTestId('settings-sheet')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('room-switcher-sheet')).toBeHidden({ timeout: 10_000 })
    expect(new URL(page.url()).pathname).toBe(path)
})

test('a remembered room can be opened from the title switcher', async ({ page }) => {
    const alpha = await createRoom(page, 'Alpha switcher')
    const beta = await createRoom(page, 'Beta switcher')
    expect(beta.slug).not.toBe(alpha.slug)

    const sheet = await openRoomSwitcher(page)
    const current = sheet.getByTestId('room-switcher-current')
    await expect(current).toContainText('Beta switcher')

    const settings = sheet.getByTestId('room-switcher-settings')
    await expect(settings).toHaveCount(2)
    await expect(
        sheet.locator(`[data-testid="room-switcher-settings"][data-slug="${beta.slug}"][data-current="true"]`)
    ).toHaveCount(1)
    await expect(sheet.locator(`[data-testid="room-switcher-settings"][data-slug="${alpha.slug}"]`)).toHaveCount(1)
    await expect(settings).toHaveText(['Settings', 'Settings'])

    const alphaTile = sheet.locator(`[data-testid="room-switcher-tile"][data-slug="${alpha.slug}"]`)
    await expect(alphaTile).toBeVisible()
    await expect(sheet.locator(`[data-testid="room-switcher-settings"][data-slug="${alpha.slug}"]`)).toHaveAttribute(
        'href',
        `/r/${alpha.slug}?settings=1`
    )
    await expect(current.locator('a, button')).toHaveCount(0)
    await expect(current.locator('..').locator('a, button')).toHaveCount(1)
    await expect(sheet.locator('a a, a button, button a, button button')).toHaveCount(0)
    await alphaTile.click()

    await expect(page).toHaveURL(new RegExp(`${alpha.path}$`), { timeout: 10_000 })
    await expect(page.getByTestId('room-title')).toHaveText('Alpha switcher')
    await expect(page.getByTestId('room-switcher-sheet')).toBeHidden()
})

test('a remembered room Settings action opens that room without using its navigation target', async ({ page }) => {
    const alpha = await createRoom(page, 'Alpha settings target')
    const beta = await createRoom(page, 'Beta stays current')
    expect(beta.slug).not.toBe(alpha.slug)

    const sheet = await openRoomSwitcher(page)
    const alphaSettings = sheet.locator(`[data-testid="room-switcher-settings"][data-slug="${alpha.slug}"]`)
    await expect(alphaSettings).toHaveAttribute('href', `/r/${alpha.slug}?settings=1`)
    await alphaSettings.click()

    await expect(page).toHaveURL(new RegExp(`/r/${alpha.slug}\\?settings=1$`), { timeout: 10_000 })
    await expect(page.getByTestId('settings-sheet')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('room-display-name')).toHaveValue('Alpha settings target')
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
