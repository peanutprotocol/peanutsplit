import { expect, type Page } from '@playwright/test'
import { test } from './fixtures'
import { enterCreatedRoom } from './helpers'

/**
 * The room shell, and the sheets its header opens.
 *
 * Every case here is a regression the 2026-07-31 sweep found in the July 30 merge wave. They are
 * assertions rather than measurements on purpose: each one failed before the fix, so a silent
 * return to the old behaviour fails the suite instead of only looking wrong in a screenshot.
 */

/** A 75-character name. Absurd, but only one character class away from an ordinary one. */
const LONG_NAME = 'Maximiliana Bartholomew Featherstonehaugh-Wintersgill the Third of Somewhere'
/** Ordinary, and long enough to have broken the header at 360px. */
const REAL_NAME = 'Alexandra Christodoulou'

async function openRoom(page: Page, roomName: string, creator: string) {
    await page.goto('/new')
    await page.getByTestId('room-name').fill(roomName)
    await page.getByTestId('creator-name').fill(creator)
    await page.getByTestId('create-room').click()
    await enterCreatedRoom(page)
}

const documentOverflow = (page: Page) =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

for (const [label, name] of [
    ['a 75-character name', LONG_NAME],
    ['an ordinary long name', REAL_NAME],
] as const) {
    test(`the header contains ${label} instead of widening the page`, async ({ page }) => {
        await openRoom(page, `Header ${label}`, name)

        // The whole middle zone is now a button. Its inner name and identity lines
        // must shrink inside the space left by the fixed Settings and Share targets.
        const switcher = await page.getByTestId('open-room-switcher').boundingBox()
        const viewport = await page.evaluate(() => document.documentElement.clientWidth)

        expect(await documentOverflow(page)).toBe(0)
        expect(switcher!.x + switcher!.width).toBeLessThanOrEqual(viewport)
    })
}

test('Back closes the settings and room-switcher sheets rather than leaving the room', async ({ page }) => {
    await openRoom(page, 'Back navigation', 'Ana')
    const roomPath = new URL(page.url()).pathname

    // Header sheets are URL state, so the back gesture — the primary dismiss on Android —
    // closes the surface before it can leave the room.
    await page.getByTestId('open-room-settings').click()
    await expect(page.getByTestId('settings-sheet')).toBeVisible({ timeout: 10_000 })
    await page.goBack()
    await expect(page.getByTestId('settings-sheet')).toBeHidden({ timeout: 10_000 })
    expect(new URL(page.url()).pathname).toBe(roomPath)

    const roomSwitcher = page.getByTestId('open-room-switcher')
    await roomSwitcher.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('room-switcher-sheet')).toBeVisible({ timeout: 10_000 })
    await page.goBack()
    await expect(page.getByTestId('room-switcher-sheet')).toBeHidden({ timeout: 10_000 })
    expect(new URL(page.url()).pathname).toBe(roomPath)
    await expect(roomSwitcher).toBeFocused()
    await expect(page.getByTestId('open-room-settings')).toBeVisible()
})

test('every person row carries a removal control, and the People disclosure is thumb-sized', async ({ page }) => {
    await openRoom(page, 'Roster controls', 'Ana')
    await page.getByTestId('open-room-settings').click()
    await expect(page.getByTestId('settings-sheet')).toBeVisible({ timeout: 10_000 })

    const toggle = page.getByTestId('people-toggle')
    await expect(toggle).toBeVisible({ timeout: 10_000 })
    // Was 356x20. A member who could not be removed used to render with no control at all, which
    // read as a rendering bug rather than a rule.
    expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(40)

    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
    const rows = await page.getByTestId('person-row').count()
    const controls = await page.locator('[data-testid="remove-person"], [data-testid="remove-blocked"]').count()
    expect(rows).toBeGreaterThan(0)
    expect(controls).toBeGreaterThanOrEqual(rows)
})

test('the room paints without console errors or sideways scroll', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
    page.on('pageerror', (error) => errors.push(String(error)))

    await openRoom(page, 'Clean paint', REAL_NAME)

    expect(errors).toEqual([])
    expect(await documentOverflow(page)).toBe(0)
})
