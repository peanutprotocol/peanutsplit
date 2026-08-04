import { expect, test, type Locator, type Page } from '@playwright/test'
import { enterCreatedRoom } from './helpers'

const tabbableRadios = (group: Locator) =>
    group
        .getByRole('radio')
        .evaluateAll((radios) => radios.filter((radio) => radio.getAttribute('tabindex') === '0').length)

async function createTwoPersonRoom(page: Page) {
    await page.goto('/new')
    await page.getByTestId('room-name').fill(`Keyboard foundations ${Date.now()}`)
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await page.getByTestId('checkpoint-name').fill('Bea')
    await page.getByTestId('checkpoint-add').click()
    await expect(page.locator('[data-testid="checkpoint-member"][data-member="Bea"]')).toBeVisible()
    await enterCreatedRoom(page)
}

test('focus and placeholder recipes stay visible on light and dark surfaces', async ({ page }) => {
    await page.goto('/new')
    const roomName = page.getByTestId('room-name')
    await roomName.focus()

    await expect
        .poll(() =>
            roomName.evaluate((input) => {
                const style = getComputedStyle(input)
                return [style.outlineColor, style.outlineStyle, style.outlineWidth, style.outlineOffset]
            })
        )
        .toEqual(['rgb(33, 28, 23)', 'solid', '2px', '2px'])
    expect(await roomName.evaluate((input) => getComputedStyle(input, '::placeholder').color)).toBe('rgb(95, 100, 109)')

    const composer = page.getByTestId('room-composer')
    const [inputBox, composerBox] = await Promise.all([roomName.boundingBox(), composer.boundingBox()])
    expect(inputBox).not.toBeNull()
    expect(composerBox).not.toBeNull()
    expect(inputBox!.x - 4).toBeGreaterThanOrEqual(composerBox!.x)
    expect(inputBox!.x + inputBox!.width + 4).toBeLessThanOrEqual(composerBox!.x + composerBox!.width)

    const creatorName = page.getByTestId('creator-name')
    await creatorName.focus()
    await expect.poll(() => creatorName.evaluate((input) => getComputedStyle(input).outlineOffset)).toBe('-2px')
    const drawingSummary = page.getByTestId('room-drawing-summary')
    await drawingSummary.focus()
    await expect.poll(() => drawingSummary.evaluate((button) => getComputedStyle(button).outlineOffset)).toBe('-2px')

    await page.goto('/tools')
    const firstTool = page.locator('ul.overflow-hidden a').first()
    await firstTool.focus()
    await expect.poll(() => firstTool.evaluate((link) => getComputedStyle(link).outlineOffset)).toBe('-2px')

    await page.goto('/mileage-split-calculator')
    const switchInput = page.getByTestId('tool-field-driverShares')
    const switchProxy = switchInput.locator('+ [data-focus-proxy-target]')
    await switchInput.focus()
    await expect
        .poll(() =>
            switchProxy.evaluate((proxy) => {
                const style = getComputedStyle(proxy)
                return [style.outlineColor, style.outlineStyle, style.outlineWidth, style.outlineOffset]
            })
        )
        .toEqual(['rgb(33, 28, 23)', 'solid', '2px', '2px'])

    await page.goto('/')
    const footer = page.locator('footer')
    const footerLink = footer.locator('a').first()
    await footerLink.focus()
    const footerColors = await footerLink.evaluate((link) => [
        getComputedStyle(link).outlineColor,
        getComputedStyle(link.closest('footer')!).backgroundColor,
    ])
    expect(footerColors).toEqual(['rgb(255, 255, 255)', 'rgb(33, 28, 23)'])
})

test('room drawing uses one radio tab stop without arrow-opening the custom editor', async ({ page }) => {
    await page.goto('/new')
    await page.getByTestId('room-drawing-summary').click()
    const editor = page.getByTestId('room-drawing-editor')
    const group = editor.getByRole('radiogroup', { name: 'Room drawing' })
    const radios = group.getByRole('radio')

    await expect(radios).toHaveCount(16)
    expect(await tabbableRadios(group)).toBe(1)
    const selected = group.locator('[role="radio"][aria-checked="true"]')
    await expect(selected).toHaveCount(1)
    await selected.focus()
    await selected.press('End')
    await expect(radios.last()).toHaveAttribute('aria-checked', 'true')
    await expect(radios.last()).toBeFocused()
    await expect(editor).toBeVisible()
    await expect(page.getByTestId('custom-room-drawing-editor')).toHaveCount(0)

    await radios.last().press('ArrowRight')
    await expect(radios.first()).toHaveAttribute('aria-checked', 'true')
    await expect(radios.first()).toBeFocused()
    expect(await tabbableRadios(group)).toBe(1)
})

test('avatar, payer and split pickers preserve radio focus while selection changes', async ({ page }) => {
    await createTwoPersonRoom(page)

    await page.getByTestId('open-avatar').click()
    const avatarGroup = page.getByTestId('avatar-picker')
    const avatarRadios = avatarGroup.getByRole('radio')
    expect(await tabbableRadios(avatarGroup)).toBe(1)
    await avatarGroup.locator('[role="radio"][aria-checked="true"]').focus()
    await avatarGroup.locator('[role="radio"][aria-checked="true"]').press('End')
    await expect(avatarRadios.last()).toHaveAttribute('aria-checked', 'true')
    await expect(avatarRadios.last()).toBeFocused()
    await expect(avatarGroup.getByTestId('avatar-shuffle')).not.toHaveAttribute('role', 'radio')
    expect(await tabbableRadios(avatarGroup)).toBe(1)
    await page.getByTestId('close-character-sheet').click()

    await page.getByTestId('open-add-expense').click()
    const expenseDescription = page.getByTestId('expense-description')
    await expenseDescription.focus()
    await expect.poll(() => expenseDescription.evaluate((input) => getComputedStyle(input).outlineOffset)).toBe('-2px')
    await page.getByTestId('expense-payer-summary').click()
    const payerEditor = page.getByTestId('payer-editor')
    const payerGroup = payerEditor.getByRole('radiogroup')
    const payerRadios = payerGroup.getByRole('radio')
    expect(await tabbableRadios(payerGroup)).toBe(1)
    await payerGroup.locator('[role="radio"][aria-checked="true"]').focus()
    await payerGroup.locator('[role="radio"][aria-checked="true"]').press('End')
    await expect(payerRadios.last()).toHaveAttribute('aria-checked', 'true')
    await expect(payerRadios.last()).toBeFocused()
    await expect(payerEditor).toBeVisible()
    await payerRadios.last().click()
    await expect(payerEditor).toHaveCount(0)

    await page.getByTestId('expense-split-summary').click()
    const splitEditor = page.getByTestId('split-editor')
    const splitGroup = splitEditor.getByRole('radiogroup')
    expect(await tabbableRadios(splitGroup)).toBe(1)
    await page.getByTestId('split-equal').focus()
    await page.getByTestId('split-equal').press('End')
    await expect(page.getByTestId('split-shares')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('split-shares')).toBeFocused()
    await page.getByTestId('split-shares').press('Home')
    await expect(page.getByTestId('split-equal')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('split-equal')).toBeFocused()
})

test('saved room drawing keyboard changes serialize instead of racing PATCHes', async ({ page }) => {
    await createTwoPersonRoom(page)
    await page.getByTestId('open-room-settings').click()
    await page.getByTestId('room-drawing').click()

    const settings = page.getByTestId('settings-sheet')
    const group = settings.getByRole('radiogroup', { name: 'Room drawing' })
    const radios = group.getByRole('radio')
    let emblemPatches = 0
    await page.route(/\/api\/rooms\/[^/]+$/, async (route) => {
        const request = route.request()
        if (request.method() === 'PATCH' && request.postData()?.includes('emoji')) {
            emblemPatches += 1
            await new Promise((resolve) => setTimeout(resolve, 300))
        }
        await route.continue()
    })

    const selected = group.locator('[role="radio"][aria-checked="true"]')
    await selected.focus()
    await selected.press('End')
    await expect(radios.last()).toHaveAttribute('aria-checked', 'true')
    await expect(radios.last()).toHaveAttribute('aria-disabled', 'true')
    await radios.last().press('Home')
    await page.waitForTimeout(100)
    expect(emblemPatches).toBe(1)
    await expect(radios.last()).toHaveAttribute('aria-checked', 'true')
    await expect(radios.last()).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15_000 })

    await radios.last().press('Home')
    await expect(radios.first()).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => emblemPatches).toBe(2)
    await expect(radios.first()).toBeFocused()
})

test('unknown routes render the translated safe not-found family', async ({ page }) => {
    const response = await page.goto('/definitely-not-a-peanut-route?credential=do-not-render')
    expect(response?.status()).toBe(404)
    const state = page.getByTestId('route-not-found')
    await expect(state.getByRole('heading', { level: 1 })).toHaveText('This page could not be found')
    await expect(state.getByRole('link', { name: 'Back to your rooms' })).toHaveAttribute('href', '/app')
    await expect(state).not.toContainText('credential')
    await expect(state).not.toContainText('do-not-render')
    await expect(state).not.toContainText('Application error')
})
