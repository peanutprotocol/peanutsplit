import { expect, test, type Page } from '@playwright/test'

/**
 * The room shell, and the sheets its header opens.
 *
 * Every case here is a regression the 2026-07-31 sweep found in the July 30 merge wave. They are
 * assertions rather than measurements on purpose: each one failed before the fix, so a silent
 * return to the old behaviour fails the suite instead of only looking wrong in a screenshot.
 */

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.21' } })

/** A 75-character name. Absurd, but only one character class away from an ordinary one. */
const LONG_NAME = 'Maximiliana Bartholomew Featherstonehaugh-Wintersgill the Third of Somewhere'
/** Ordinary, and long enough to have broken the header at 360px. */
const REAL_NAME = 'Alexandra Christodoulou'

async function openRoom(page: Page, roomName: string, creator: string) {
    await page.goto('/new')
    await page.getByTestId('room-name').fill(roomName)
    await page.getByTestId('creator-name').fill(creator)
    await page.getByTestId('create-room').click()
    await expect(page.getByTestId('room-link')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('go-to-room').click()
    await expect(page.getByTestId('open-room-settings')).toBeVisible({ timeout: 15_000 })
}

const documentOverflow = (page: Page) =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

for (const [label, name] of [
    ['a 75-character name', LONG_NAME],
    ['an ordinary long name', REAL_NAME],
] as const) {
    test(`the header contains ${label} instead of widening the page`, async ({ page }) => {
        await openRoom(page, `Header ${label}`, name)

        // The chip is a <button>, which shrink-wraps: without a bound, the `truncate` on its child
        // span has nothing to truncate against and the name runs past the share button, widening
        // the document and taking the fixed bottom bar with it.
        const chip = await page.getByTestId('open-avatar').boundingBox()
        const viewport = await page.evaluate(() => document.documentElement.clientWidth)

        expect(await documentOverflow(page)).toBe(0)
        expect(chip!.x + chip!.width).toBeLessThanOrEqual(viewport)
    })
}

test('Back closes the settings and avatar sheets rather than leaving the room', async ({ page }) => {
    await openRoom(page, 'Back navigation', 'Ana')
    const roomPath = new URL(page.url()).pathname

    // Both sheets used to be `useState`, so the back gesture — the primary dismiss on Android —
    // skipped past them and exited the room entirely.
    await page.getByTestId('open-room-settings').click()
    await expect(page.getByTestId('settings-sheet')).toBeVisible({ timeout: 10_000 })
    await page.goBack()
    await expect(page.getByTestId('settings-sheet')).toBeHidden({ timeout: 10_000 })
    expect(new URL(page.url()).pathname).toBe(roomPath)

    await page.getByTestId('open-avatar').click()
    await page.waitForTimeout(600)
    await page.goBack()
    await page.waitForTimeout(600)
    expect(new URL(page.url()).pathname).toBe(roomPath)
    await expect(page.getByTestId('open-room-settings')).toBeVisible()
})

test('every roster chip carries a removal control, and the add-people row is thumb-sized', async ({ page }) => {
    await openRoom(page, 'Roster controls', 'Ana')
    await page.getByTestId('share-room').click()

    const toggle = page.getByTestId('add-people-toggle')
    await expect(toggle).toBeVisible({ timeout: 10_000 })
    // Was 356x20. A member who could not be removed used to render with no control at all, which
    // read as a rendering bug rather than a rule.
    expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(40)

    await toggle.click()
    await page.waitForTimeout(400)
    const chips = await page.locator('[data-testid="roster-chip"]').count()
    const controls = await page.locator('[data-testid="roster-chip"] button').count()
    expect(chips).toBeGreaterThan(0)
    expect(controls).toBeGreaterThanOrEqual(chips)
})

test('the room paints without console errors or sideways scroll', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
    page.on('pageerror', (error) => errors.push(String(error)))

    await openRoom(page, 'Clean paint', REAL_NAME)

    expect(errors).toEqual([])
    expect(await documentOverflow(page)).toBe(0)
})
