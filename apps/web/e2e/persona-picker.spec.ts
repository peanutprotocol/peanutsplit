import { expect, test, type Locator, type Page } from '@playwright/test'
import { AVATARS, AVATAR_KEYS } from '../src/lib/avatars'

/**
 * Longer than one spin. `SPIN_MS` is 800 — 680ms of reels plus the last tile's
 * settle pop — and the loop is driven by the wall clock, so a slow machine skips
 * ticks rather than running long. The margin is for scheduling, not for drift.
 */
const SPIN_SETTLE_MS = 1_200

/** The eight characters currently on the grid, in slot order. */
const dealt = (picker: Locator): Promise<string[]> =>
    picker.getByTestId('avatar-option').evaluateAll((tiles) => tiles.map((tile) => tile.dataset.avatar ?? ''))

/** The eight curated colour-pair keys currently offered, in slot order. */
const dealtPalettes = (picker: Locator): Promise<string[]> =>
    picker.getByTestId('avatar-option').evaluateAll((tiles) => tiles.map((tile) => tile.dataset.avatarPalette ?? ''))

const checkedKey = (picker: Locator): Promise<string | null> =>
    picker.locator('[data-testid="avatar-option"][aria-checked="true"]').first().getAttribute('data-avatar')

const checkedPalette = (picker: Locator): Promise<string | null> =>
    picker.locator('[data-testid="avatar-option"][aria-checked="true"]').first().getAttribute('data-avatar-palette')

async function openOwnCharacterSheet(page: Page, room: string) {
    await page.goto('/new')
    await page.getByTestId('room-name').fill(room)
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await expect(page.getByTestId('go-to-room')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('go-to-room').click()
    await page.getByTestId('open-avatar').click()
    return page.getByTestId('avatar-picker')
}

test('your avatar chip opens your own character sheet and a pick persists', async ({ page }, testInfo) => {
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Persona picnic')
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await expect(page.getByTestId('go-to-room')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('go-to-room').click()

    // Two taps, and the second one is the grid — the chip must not detour
    // through the settings sheet with a member preselected.
    await page.getByTestId('open-avatar').click()
    await expect(page.getByTestId('character-sheet')).toBeVisible()
    await expect(page.getByTestId('settings-sheet')).toHaveCount(0)
    await expect(page.getByTestId('character-sheet')).toContainText('Ana')

    const picker = page.getByTestId('avatar-picker')
    const options = picker.getByTestId('avatar-option')
    // Eight characters and a die: one 3×3 grid, not a wall of forty-eight.
    await expect(options).toHaveCount(8)
    await expect(picker.getByTestId('avatar-shuffle')).toBeVisible()
    // Ana's own character is one of the eight, and it is the only one marked.
    await expect(picker.locator('[data-testid="avatar-option"][aria-checked="true"]')).toHaveCount(1)
    // Every tile carries a scannable title and one short, secondary line.
    await expect(options.first().getByTestId('avatar-option-title')).toBeVisible()
    await expect(options.first().getByTestId('avatar-option-description')).toBeVisible()
    // One SVG, two identical paths: warm-white sticker keyline underneath the
    // dark reviewed ink. Keeping them in one SVG prevents the layers drifting.
    await expect(options.first().locator('svg path')).toHaveCount(2)
    await expect(options.first().locator('svg path').first()).toHaveAttribute('stroke', '#fffdf6')
    const descriptions = AVATAR_KEYS.map((key) => AVATARS[key].vibe)
    expect(
        await options
            .first()
            .getByTestId('avatar-option-description')
            .evaluate((description, everyDescription) => {
                const original = description.textContent
                const style = window.getComputedStyle(description)
                const overflowing = everyDescription.flatMap((text) => {
                    description.textContent = text
                    const fits =
                        description.scrollWidth <= description.clientWidth &&
                        description.clientHeight <= parseFloat(style.lineHeight)
                    return fits ? [] : [{ text, width: description.clientWidth, contentWidth: description.scrollWidth }]
                })
                description.textContent = original
                return overflowing
            }, descriptions)
    ).toEqual([])

    // The tiles must stay inside a 390px phone.
    expect(
        await picker.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            return bounds.left >= 0 && bounds.right <= window.innerWidth
        })
    ).toBe(true)

    const target = picker.locator('[data-testid="avatar-option"][aria-checked="false"]').first()
    const targetKey = await target.getAttribute('data-avatar')
    const targetPalette = await target.getAttribute('data-avatar-palette')
    const saved = page.waitForResponse(
        (response) =>
            response.request().method() === 'PATCH' &&
            /\/api\/rooms\/[^/]+\/members\/[^/]+$/.test(new URL(response.url()).pathname)
    )
    await target.click()
    const response = await saved
    expect(response.ok()).toBe(true)
    expect(response.request().postDataJSON()).toEqual({ avatar: targetKey, avatarPalette: targetPalette })
    await expect(picker.locator(`[data-avatar="${targetKey}"]`)).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('avatar-caption')).toHaveCount(0)

    await page.screenshot({ path: testInfo.outputPath('persona-picker.png'), fullPage: true })

    // Close it first. The sheet is `?character=<id>` now, so it survives a reload the way the
    // share and settle sheets always have — leaving it open would reload straight back into it and
    // the chip would be behind the overlay, which is not what this test is about.
    await page.getByTestId('close-character-sheet').click()
    await expect(page.getByTestId('character-sheet')).toHaveCount(0)

    await page.reload()
    await page.getByTestId('open-avatar').click()
    await expect(page.getByTestId('avatar-picker').locator(`[data-avatar="${targetKey}"]`)).toHaveAttribute(
        'aria-checked',
        'true'
    )
    await expect(
        page.getByTestId('avatar-picker').locator(`[data-avatar="${targetKey}"][aria-checked="true"]`)
    ).toHaveAttribute('data-avatar-palette', targetPalette ?? '')
})

test('the die deals another hand and never loses the current character', async ({ page }) => {
    // Explicit, because a headless browser can report `reduce` and quietly send
    // this test down the instant-swap path — leaving the reels untested.
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const picker = await openOwnCharacterSheet(page, 'Dice night')
    const mine = await checkedKey(picker)
    const minePalette = await checkedPalette(picker)
    expect(mine).toBeTruthy()
    expect(minePalette).toBeTruthy()
    const before = await dealt(picker)
    const beforePalettes = await dealtPalettes(picker)

    await picker.getByTestId('avatar-shuffle').click()
    // The reels are moving, and the group says so instead of announcing every frame.
    await expect(picker).toHaveAttribute('aria-busy', 'true')
    await page.waitForTimeout(SPIN_SETTLE_MS)
    // They stop on their own: aria-busy clearing is the one timer finishing.
    await expect(picker).not.toHaveAttribute('aria-busy', 'true')

    const after = await dealt(picker)
    const afterPalettes = await dealtPalettes(picker)
    // Eight of forty-eight — a hand repeating itself is a one-in-millions event.
    expect(after.join()).not.toBe(before.join())
    expect(after).toHaveLength(8)
    expect(new Set(after).size).toBe(8)
    // The pick survives, wherever it landed, and stays selected.
    expect(after).toContain(mine)
    expect(await checkedKey(picker)).toBe(mine)
    // Shuffle redeals the colour offers too, without silently repainting Ana.
    expect(afterPalettes.join()).not.toBe(beforePalettes.join())
    expect(new Set(afterPalettes).size).toBe(8)
    expect(await checkedPalette(picker)).toBe(minePalette)

    // A second tap mid-spin must not stack timers or corrupt the hand.
    await picker.getByTestId('avatar-shuffle').click()
    await picker.getByTestId('avatar-shuffle').click()
    await page.waitForTimeout(SPIN_SETTLE_MS)
    await expect(picker).not.toHaveAttribute('aria-busy', 'true')
    const twice = await dealt(picker)
    expect(new Set(twice).size).toBe(8)
    expect(twice).toContain(mine)
    expect(await checkedKey(picker)).toBe(mine)
    expect(new Set(await dealtPalettes(picker)).size).toBe(8)
    expect(await checkedPalette(picker)).toBe(minePalette)
})

test('reduced motion swaps the hand with no cycling', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const picker = await openOwnCharacterSheet(page, 'Still night')
    const mine = await checkedKey(picker)
    const minePalette = await checkedPalette(picker)
    const before = await dealt(picker)
    const beforePalettes = await dealtPalettes(picker)

    await picker.getByTestId('avatar-shuffle').click()
    // No spin to wait out: on this path the grid is never busy.
    await expect(picker).not.toHaveAttribute('aria-busy', 'true')
    const after = await dealt(picker)
    expect(after.join()).not.toBe(before.join())
    expect(after).toContain(mine)
    expect(await checkedKey(picker)).toBe(mine)
    const afterPalettes = await dealtPalettes(picker)
    expect(afterPalettes.join()).not.toBe(beforePalettes.join())
    expect(new Set(afterPalettes).size).toBe(8)
    expect(await checkedPalette(picker)).toBe(minePalette)
})

test('a person row in Settings opens that person’s character sheet', async ({ page }) => {
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Character casting')
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await expect(page.getByTestId('go-to-room')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('go-to-room').click()

    await page.getByTestId('open-room-settings').click()
    await page.locator('[data-testid="person-row"][data-member="Ana"]').click()
    await expect(page.getByTestId('character-sheet')).toBeVisible()
    await expect(page.getByTestId('character-sheet')).toContainText('Ana')
    await expect(page.getByTestId('avatar-shuffle')).toBeVisible()
})
