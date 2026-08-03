import { expect, type Page } from '@playwright/test'
import { test } from './fixtures'
import { slideToConfirm } from './slide-to-confirm'

test.setTimeout(60_000)

async function createAtRosterCheckpoint(page: Page, roomName: string) {
    await page.goto('/new')
    await page.getByTestId('room-name').fill(roomName)
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await expect(page.getByTestId('roster-checkpoint')).toBeVisible({ timeout: 15_000 })
}

test('checkpoint → empty room → first shared balance is one adaptive funnel', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await createAtRosterCheckpoint(page, 'Adaptive trip')

    // Moment 1: creation asks only for the roster. The single exit adapts from
    // Skip to Done as soon as the creator adds somebody.
    const checkpoint = page.getByTestId('roster-checkpoint')
    await expect(checkpoint.getByRole('heading', { name: 'Who’s in?' })).toBeVisible()
    await expect(checkpoint.getByText('This can be changed later.')).toBeVisible()
    await expect(checkpoint.locator('[data-testid="checkpoint-member"][data-member="Ana"]')).toBeVisible()
    await expect(checkpoint.getByRole('button', { name: 'Skip', exact: true })).toHaveCount(1)
    await expect(checkpoint.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0)

    await checkpoint.getByRole('textbox', { name: 'Name' }).fill('Bea')
    await checkpoint.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(checkpoint.locator('[data-testid="checkpoint-member"][data-member="Bea"]')).toBeVisible()
    await expect(checkpoint.getByRole('button', { name: 'Skip', exact: true })).toHaveCount(0)
    await expect(checkpoint.getByRole('button', { name: 'Done', exact: true })).toHaveCount(1)
    await checkpoint.getByRole('button', { name: 'Done', exact: true }).click()
    await page.waitForURL(/\/r\/adaptive-trip-/)

    // Moment 2: the empty room owns its two useful actions. There is no settle
    // action and no second fixed-bar copy of Add expense.
    const emptyShare = page.getByTestId('empty-share')
    const emptyAdd = page.getByTestId('open-add-expense')
    await expect(emptyShare).toHaveText('Share room')
    await expect(emptyShare).toHaveClass(/btn-primary/)
    await expect(emptyAdd).toHaveText('Add expense')
    await expect(emptyAdd).toHaveClass(/btn-stroke/)
    await expect(page.getByTestId('open-add-expense')).toHaveCount(1)
    await expect(page.getByTestId('open-settle')).toHaveCount(0)
    const emptyAddBox = await emptyAdd.boundingBox()
    expect(emptyAddBox).not.toBeNull()
    expect(emptyAddBox!.y + emptyAddBox!.height).toBeLessThanOrEqual(568)

    // Moment 3: the first expense that creates a real two-person balance hands
    // directly to Share, with the new balance visible and one explicit exit.
    await emptyAdd.click()
    await page.getByTestId('expense-amount').fill('60')
    await page.getByTestId('expense-description').fill('Dinner')
    await page.getByTestId('save-expense').click()

    const postAha = page.getByRole('dialog', { name: 'First split done' })
    await expect(postAha).toBeVisible({ timeout: 15_000 })
    await expect(postAha.getByTestId('first-balance-context')).toContainText('Bea owes Ana')
    await expect(postAha.getByTestId('first-balance-context')).toContainText('€30.00')
    await expect(postAha.getByTestId('share-link')).toHaveClass(/btn-primary/)
    await expect(postAha.getByRole('button', { name: 'Not now', exact: true })).toHaveCount(1)
    await expect(postAha.getByTestId('close-share')).toHaveCount(0)
    for (const action of [postAha.getByTestId('share-link'), postAha.getByTestId('skip-post-aha-share')]) {
        // Retry through the drawer's entrance animation; the settled action,
        // not its first translated frame, must be fully above the fold.
        await expect(action).toBeInViewport({ ratio: 1 })
    }

    await postAha.getByRole('button', { name: 'Not now', exact: true }).click()
    await expect(postAha).toHaveCount(0)
    await expect(page.getByTestId('expense-row')).toHaveCount(1)
    await page.goBack()
    await expect(page.getByRole('dialog', { name: 'First split done' })).toHaveCount(0)
    await expect(page).not.toHaveURL(/[?&]share=1/)

    // Sharing later from the header is the generic room-share surface, not a
    // replay of the activation moment.
    await page.getByTestId('share-room').click()
    const genericShare = page.getByRole('dialog', { name: 'Share room' })
    await expect(genericShare).toBeVisible()
    await expect(genericShare.getByTestId('first-balance-context')).toHaveCount(0)
    await expect(genericShare.getByRole('button', { name: 'Not now', exact: true })).toHaveCount(0)
    await expect(genericShare.getByTestId('close-share')).toHaveCount(1)
    await expect(genericShare.getByTestId('share-link')).toHaveClass(/btn-primary/)
})

test('a solo first expense returns to the room without opening Share', async ({ page }) => {
    await createAtRosterCheckpoint(page, 'Solo notes')
    await page.getByRole('button', { name: 'Skip', exact: true }).click()
    await page.waitForURL(/\/r\/solo-notes-/)

    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill('12')
    await page.getByTestId('expense-description').fill('Coffee')
    await page.getByTestId('save-expense').click()

    await expect(page.getByTestId('expense-row')).toHaveCount(1, { timeout: 15_000 })
    await expect(page.getByRole('dialog', { name: 'First split done' })).toHaveCount(0)
    await expect(page.getByTestId('room-share-card')).toHaveCount(0)
    await expect(page.getByTestId('skip-post-aha-share')).toHaveCount(0)
    await expect(page.getByTestId('first-balance-context')).toHaveCount(0)
    await expect(page).not.toHaveURL(/[?&]share=1/)
})

test('deleting the activating expense does not re-arm the post-aha prompt', async ({ page }) => {
    await createAtRosterCheckpoint(page, 'Durable aha')
    await page.getByRole('textbox', { name: 'Name' }).fill('Bea')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.waitForURL(/\/r\/durable-aha-/)

    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill('20')
    await page.getByTestId('expense-description').fill('First dinner')
    await page.getByTestId('save-expense').click()
    await page.getByTestId('skip-post-aha-share').click()

    await page.locator('[data-testid="expense-row"][data-description="First dinner"]').click()
    await page.getByTestId('delete-expense').click()
    await slideToConfirm(page, page.getByTestId('confirm-delete-expense'))
    await expect(page.getByTestId('expense-row')).toHaveCount(0, { timeout: 15_000 })

    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill('30')
    await page.getByTestId('expense-description').fill('Second dinner')
    await page.getByTestId('save-expense').click()

    await expect(
        page.locator('[data-testid="expense-row"][data-description="Second dinner"]:not([disabled])')
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('dialog', { name: 'First split done' })).toHaveCount(0)
    await expect(page).not.toHaveURL(/[?&]share=1/)
})
