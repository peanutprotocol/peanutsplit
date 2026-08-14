import { expect, type Page } from '@playwright/test'
import { test } from './fixtures'
import { enterCreatedRoom } from './helpers'
import { slideToConfirm } from './slide-to-confirm'

test.setTimeout(60_000)

/**
 * Both creation doors run the same funnel, so this helper takes the door.
 *
 * The checkpoint belongs to the ROOM now: whichever door you came through, it stands on
 * `/r/<slug>?roster=1` and the single exit only takes the param off again. Tests therefore
 * assert the room URL here, at the checkpoint, rather than waiting for it after the exit.
 */
async function createAtRosterCheckpoint(page: Page, roomName: string, door: 'new' | 'hero' = 'new') {
    if (door === 'hero') {
        await page.goto('/')
        await page.getByTestId('hero-room-name').fill(roomName)
        await page.getByTestId('hero-currency').selectOption('EUR')
        await page.getByTestId('hero-creator-name').fill('Ana')
        await page.getByTestId('hero-create-room').click()
    } else {
        await page.goto('/new')
        await page.getByTestId('room-name').fill(roomName)
        await page.getByTestId('room-currency').selectOption('EUR')
        await page.getByTestId('creator-name').fill('Ana')
        await page.getByTestId('create-room').click()
    }
    await expect(page.getByTestId('roster-checkpoint')).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/r\/[^/?]+\?roster=1$/)
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
    await expect(page).toHaveURL(/\/r\/adaptive-trip-[^?]*$/)

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
    await expect(genericShare.getByTestId('room-qr')).toBeVisible()
    await expect(genericShare.getByTestId('room-qr')).toHaveAccessibleName('QR code to join Adaptive trip')
    // ShareDrawer owns this density adjustment; the global drawer rhythm stays
    // unchanged while both the in-person code and the link action fit a short
    // phone without first scroll.
    await expect(genericShare.getByTestId('room-qr')).toBeInViewport({ ratio: 1 })
    await expect(genericShare.getByTestId('share-link')).toBeInViewport({ ratio: 1 })
    await genericShare.getByTestId('close-share').click()
    await expect(page.getByTestId('share-room')).toBeFocused()
})

test('a solo first expense returns to the room without opening Share', async ({ page }) => {
    await createAtRosterCheckpoint(page, 'Solo notes')
    await page.getByRole('button', { name: 'Skip', exact: true }).click()
    await expect(page).toHaveURL(/\/r\/solo-notes-[^?]*$/)

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
    await expect(page).toHaveURL(/\/r\/durable-aha-[^?]*$/)

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

test('a room created from the landing hero runs the same funnel through to the first split', async ({ page }) => {
    // The regression this file exists for: the hero used to enter the room directly, so a
    // hero room had no roster, its first expense was solo, and moment 3 could never fire.
    await createAtRosterCheckpoint(page, 'Hero trip', 'hero')

    const checkpoint = page.getByTestId('roster-checkpoint')
    await expect(checkpoint.getByRole('heading', { name: 'Who’s in?' })).toBeVisible()
    await expect(checkpoint.locator('[data-testid="checkpoint-member"][data-member="Ana"]')).toBeVisible()
    await checkpoint.getByRole('textbox', { name: 'Name' }).fill('Bea')
    await checkpoint.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(checkpoint.locator('[data-testid="checkpoint-member"][data-member="Bea"]')).toBeVisible()
    await checkpoint.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page).toHaveURL(/\/r\/hero-trip-[^?]*$/)

    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill('60')
    await page.getByTestId('expense-description').fill('Dinner')
    await page.getByTestId('save-expense').click()

    const postAha = page.getByRole('dialog', { name: 'First split done' })
    await expect(postAha).toBeVisible({ timeout: 15_000 })
    await expect(postAha.getByTestId('first-balance-context')).toContainText('Bea owes Ana')
    await expect(postAha.getByTestId('first-balance-context')).toContainText('€30.00')
})

test('?roster=1 on a room this device did not create is just the room', async ({ page, newDevice }) => {
    await createAtRosterCheckpoint(page, 'Not your checkpoint')
    const url = await enterCreatedRoom(page)

    const bea = await newDevice()
    await bea.goto(`${url}?roster=1`)
    await expect(bea.getByTestId('join-gate')).toBeVisible({ timeout: 15_000 })
    await expect(bea.getByTestId('roster-checkpoint')).toHaveCount(0)

    // Joining hands this device a real member token for this room, and it still gets the
    // room: the created-here marker is the half of the proof no link can carry.
    await bea.getByTestId('im-new').click()
    await bea.getByTestId('join-name').fill('Bea')
    await bea.getByTestId('join-room').click()
    await expect(bea.getByTestId('join-gate')).toHaveCount(0, { timeout: 15_000 })
    await expect(bea.getByTestId('open-room-switcher')).toBeVisible({ timeout: 15_000 })
    await expect(bea.getByTestId('roster-checkpoint')).toHaveCount(0)
})

test('answering the checkpoint costs no history entry', async ({ page }) => {
    await createAtRosterCheckpoint(page, 'One way trip')
    await page.getByTestId('checkpoint-name').fill('Bea')
    await page.getByTestId('checkpoint-add').click()
    await expect(page.locator('[data-testid="checkpoint-member"][data-member="Bea"]')).toBeVisible()
    await page.getByTestId('go-to-room').click()
    await expect(page).toHaveURL(/\/r\/one-way-trip-[^?]*$/)

    // Back leaves the room through the door it came in by. If the exit had pushed instead of
    // replaced, this would land on the answered checkpoint again.
    await page.goBack()
    await expect(page).toHaveURL(/\/new$/)
    await expect(page.getByTestId('room-composer')).toBeVisible()
    await expect(page.getByTestId('roster-checkpoint')).toHaveCount(0)
})
