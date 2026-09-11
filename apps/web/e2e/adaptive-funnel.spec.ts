import { expect, type Page } from '@playwright/test'
import { test } from './fixtures'
import { draftRoomPeople, enterCreatedRoom } from './helpers'
import { slideToConfirm } from './slide-to-confirm'

test.setTimeout(60_000)

/** Both creation surfaces draft the same people before creating the room. */
async function createRoom(page: Page, roomName: string, names: string[] = [], door: 'new' | 'hero' = 'new') {
    const prefix = door === 'hero' ? 'hero-' : ''
    await page.goto(door === 'hero' ? '/' : '/new')
    await page.getByTestId(door === 'hero' ? 'hero-currency' : 'room-currency').selectOption('EUR')
    await page.getByTestId(`${prefix}room-name`).fill(roomName)
    await page.getByTestId(`${prefix}creator-name`).fill('Ana')
    // Refill after the companion field to tolerate cold WebKit hydration.
    await page.getByTestId(`${prefix}room-name`).fill(roomName)
    await draftRoomPeople(page, names)
    await page.getByTestId(`${prefix}create-room`).click()
    return enterCreatedRoom(page)
}

test('creating a group leads from its empty room to the first shared balance', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await createRoom(page, 'Adaptive trip', ['Bea'])

    // The empty room owns its two useful actions. There is no settle
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

    // The first expense that creates a real two-person balance hands
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
    await createRoom(page, 'Solo notes')
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
    await createRoom(page, 'Durable aha', ['Bea'])
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
    await createRoom(page, 'Hero trip', ['Bea'], 'hero')

    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill('60')
    await page.getByTestId('expense-description').fill('Dinner')
    await page.getByTestId('save-expense').click()

    const postAha = page.getByRole('dialog', { name: 'First split done' })
    await expect(postAha).toBeVisible({ timeout: 15_000 })
    await expect(postAha.getByTestId('first-balance-context')).toContainText('Bea owes Ana')
    await expect(postAha.getByTestId('first-balance-context')).toContainText('€30.00')
})

test('legacy ?roster=1 links open the ordinary room for creators and new devices', async ({ page, newDevice }) => {
    const url = await createRoom(page, 'Legacy room link')

    await page.goto(`${url}?roster=1`)
    await expect(page.getByTestId('open-room-switcher')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('join-gate')).toHaveCount(0)
    await expect(page.getByTestId('roster-checkpoint')).toHaveCount(0)
    await expect(page.getByTestId('open-add-expense')).toBeVisible()

    const bea = await newDevice()
    await bea.goto(`${url}?roster=1`)
    await expect(bea.getByTestId('join-gate')).toBeVisible({ timeout: 15_000 })
    await expect(bea.getByTestId('roster-checkpoint')).toHaveCount(0)

    // The obsolete parameter does not change the normal join and identity flow.
    await bea.getByTestId('im-new').click()
    await bea.getByTestId('join-name').fill('Bea')
    await bea.getByTestId('join-room').click()
    await expect(bea.getByTestId('join-gate')).toHaveCount(0, { timeout: 15_000 })
    await expect(bea.getByTestId('open-room-switcher')).toBeVisible({ timeout: 15_000 })
    await expect(bea.getByTestId('roster-checkpoint')).toHaveCount(0)
})

test('Back after creation returns directly to the setup form', async ({ page }) => {
    await createRoom(page, 'One way trip', ['Bea'])
    await expect(page).toHaveURL(/\/r\/one-way-trip-[^?]*$/)

    await page.goBack()
    await expect(page).toHaveURL(/\/new$/)
    await expect(page.getByTestId('room-composer')).toBeVisible()
    await expect(page.getByTestId('roster-checkpoint')).toHaveCount(0)
})
