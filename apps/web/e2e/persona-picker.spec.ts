import { expect, test } from '@playwright/test'

test('the shared cast uses the colorful doodle catalog and persists a pick', async ({ page }, testInfo) => {
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Persona picnic')
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await expect(page.getByTestId('go-to-room')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('go-to-room').click()

    await page.getByTestId('open-avatar').click()
    const picker = page.getByTestId('avatar-picker')
    const options = picker.getByTestId('avatar-option')
    await expect(options).toHaveCount(28)
    await expect(picker.locator('[data-avatar="tea-dragon"]')).toContainText('breathes steam, politely')
    await expect(picker.locator('svg')).toHaveCount(28)

    // The larger two-column cards must stay inside a 390px phone.
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

    await page.screenshot({ path: testInfo.outputPath('persona-picker.png'), fullPage: true })

    await page.reload()
    await page.getByTestId('open-avatar').click()
    await expect(page.getByTestId('avatar-picker').locator(`[data-avatar="${targetKey}"]`)).toHaveAttribute(
        'aria-checked',
        'true'
    )
})
