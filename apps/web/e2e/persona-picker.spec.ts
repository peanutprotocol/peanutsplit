import { expect, test } from '@playwright/test'

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
    await expect(options).toHaveCount(28)
    await expect(picker.locator('svg')).toHaveCount(28)
    // The vibe lives on ONE caption under the grid, not on all 28 tiles.
    await expect(picker.locator('[data-avatar="tea-dragon"]')).not.toContainText('breathes steam, politely')

    // The larger tiles must stay inside a 390px phone.
    expect(
        await picker.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            return bounds.left >= 0 && bounds.right <= window.innerWidth
        })
    ).toBe(true)

    const teaDragon = picker.locator('[data-avatar="tea-dragon"]')
    const targetKey = (await teaDragon.getAttribute('aria-checked')) === 'true' ? 'vampire-penguin' : 'tea-dragon'
    const target = picker.locator(`[data-avatar="${targetKey}"]`)
    const saved = page.waitForResponse(
        (response) =>
            response.request().method() === 'PATCH' &&
            /\/api\/rooms\/[^/]+\/members\/[^/]+$/.test(new URL(response.url()).pathname)
    )
    await target.click()
    expect((await saved).ok()).toBe(true)
    await expect(target).toHaveAttribute('aria-checked', 'true')
    // The caption follows the selection, and it is the only place the vibe shows.
    await expect(page.getByTestId('avatar-caption')).toContainText(
        targetKey === 'tea-dragon' ? 'breathes steam, politely' : 'tiny, dramatic, mostly harmless'
    )

    await page.screenshot({ path: testInfo.outputPath('persona-picker.png'), fullPage: true })

    await page.reload()
    await page.getByTestId('open-avatar').click()
    await expect(page.getByTestId('avatar-picker').locator(`[data-avatar="${targetKey}"]`)).toHaveAttribute(
        'aria-checked',
        'true'
    )
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
    await expect(page.getByTestId('avatar-random')).toBeVisible()
})
