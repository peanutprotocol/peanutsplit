import { expect, test, type Locator, type Page } from '@playwright/test'
import { enterCreatedRoom } from './helpers'

const openReactionPicker = async (page: Page, row: Locator) => {
    const target = await row.boundingBox()
    if (!target) throw new Error('expense row has no pointer target')

    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2)
    await page.mouse.down()
    await expect(row.locator('..').getByTestId('reaction-strip')).toBeVisible({ timeout: 1_000 })
    await page.mouse.up()
}

const expectSameBox = (before: NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>, after: typeof before) => {
    expect(Math.abs(after.x - before.x)).toBeLessThan(1)
    expect(Math.abs(after.y - before.y)).toBeLessThan(1)
    expect(Math.abs(after.width - before.width)).toBeLessThan(1)
    expect(Math.abs(after.height - before.height)).toBeLessThan(1)
}

for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 700 },
]) {
    test(`the reaction picker overlays the ledger without shifting its expense at ${viewport.width}px`, async ({
        page,
    }, testInfo) => {
        test.setTimeout(45_000)
        await page.setViewportSize(viewport)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto('/new')
        await page.getByTestId('room-name').fill(`Reaction layout ${Date.now()}`)
        await page.getByTestId('creator-name').fill('Ana')
        await page.getByTestId('create-room').click()
        await expect(page.getByTestId('roster-checkpoint')).toBeVisible({ timeout: 15_000 })
        await page.getByTestId('checkpoint-name').fill('Bea')
        await page.getByTestId('checkpoint-add').click()
        await enterCreatedRoom(page)

        await page.getByTestId('open-add-expense').click()
        await page.getByTestId('expense-amount').fill('24')
        await page.getByTestId('expense-description').fill('Lunch')
        await page.getByTestId('save-expense').click()
        await expect(page.getByTestId('skip-post-aha-share')).toBeVisible({ timeout: 15_000 })
        await page.getByTestId('skip-post-aha-share').click()

        const row = page.locator('[data-testid="expense-row"][data-description="Lunch"]')
        const expense = row.locator('..')
        await expect(row).toBeVisible({ timeout: 15_000 })
        const before = await expense.boundingBox()
        if (!before) throw new Error('expense has no layout box before opening reactions')

        const trigger = expense.getByTestId('reaction-add')
        await trigger.focus()
        const afterTriggerFocus = await expense.boundingBox()
        if (!afterTriggerFocus) throw new Error('expense has no layout box after focusing the reaction trigger')
        expectSameBox(before, afterTriggerFocus)

        await openReactionPicker(page, row)

        const after = await expense.boundingBox()
        if (!after) throw new Error('expense has no layout box after opening reactions')
        expectSameBox(before, after)

        const picker = expense.getByTestId('reaction-strip')
        const pickerBox = await picker.boundingBox()
        const viewportSize = page.viewportSize()
        if (!pickerBox || !viewportSize) throw new Error('reaction picker has no viewport layout box')
        expect(pickerBox.x).toBeGreaterThanOrEqual(0)
        expect(pickerBox.x + pickerBox.width).toBeLessThanOrEqual(viewportSize.width)

        await picker.getByTestId('reaction-option').first().click()
        await expect(picker).toHaveCount(0)
        await expect(expense.getByTestId('reaction-pill')).toHaveCount(1, { timeout: 15_000 })

        const withReaction = await expense.boundingBox()
        if (!withReaction) throw new Error('expense has no layout box with a saved reaction')
        await trigger.focus()
        const withReactionFocused = await expense.boundingBox()
        if (!withReactionFocused) throw new Error('expense has no layout box after refocusing the reaction trigger')
        expectSameBox(withReaction, withReactionFocused)

        await openReactionPicker(page, row)
        const reopened = await expense.boundingBox()
        if (!reopened) throw new Error('expense has no layout box after reopening reactions')
        expectSameBox(withReaction, reopened)

        await page.screenshot({ path: testInfo.outputPath('reaction-picker-overlay.png') })

        await picker.getByTestId('reaction-option').first().focus()
        await page.keyboard.press('Escape')
        await expect(picker).toHaveCount(0)
        await expect(trigger).toBeFocused()
    })
}
