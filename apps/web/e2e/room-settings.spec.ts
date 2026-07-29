import { expect, test } from '@playwright/test'

test('the room emblem opens settings, rename keeps the link, and people can be added in context', async ({ page }) => {
    test.setTimeout(60_000)

    await page.goto('/new')
    await page.getByTestId('room-name').fill('Weekend away')
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await expect(page.getByTestId('go-to-room')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('go-to-room').click()
    await page.waitForURL(/\/r\/weekend-away-/)

    const permanentUrl = page.url()
    const permanentPath = new URL(permanentUrl).pathname
    expect(permanentPath).toMatch(/^\/r\/weekend-away-/)
    const slug = permanentPath.split('/').at(-1)
    expect(slug).toBeTruthy()

    // The emblem is the settings entry point. The old home link and separate
    // sun-shaped menu control no longer compete with it in the top bar.
    await expect(page.getByTestId('open-room-settings')).toBeVisible()
    await expect(page.getByRole('link', { name: 'All rooms' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Room menu' })).toHaveCount(0)
    await page.getByTestId('open-room-settings').click()

    await expect(page.getByTestId('room-settings')).toBeVisible()
    await expect(page.getByTestId('room-settings-room-section')).toContainText('Room')
    await expect(page.getByTestId('room-settings-people-section')).toContainText('People')
    await expect(page.getByText('Dark mode', { exact: true })).toHaveCount(0)

    const rename = page.waitForResponse(
        (response) =>
            response.request().method() === 'PATCH' && new URL(response.url()).pathname === `/api/rooms/${slug}`
    )
    await page.getByTestId('room-display-name').fill('The great escape')
    await page.getByTestId('save-room-name').click()
    expect((await rename).ok()).toBe(true)
    await expect(page.locator('header h1')).toHaveText('The great escape')
    expect(page.url()).toBe(permanentUrl)
    await expect(page.getByTestId('room-settings-room-section')).toContainText(
        'Renaming the room will never change it.'
    )

    const addFromSettings = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            /\/api\/rooms\/[^/]+\/members$/.test(new URL(response.url()).pathname)
    )
    await page.getByTestId('settings-person-name').fill('Bea')
    await page.getByTestId('settings-add-person').click()
    expect((await addFromSettings).ok()).toBe(true)
    await expect(page.getByTestId('room-settings-roster')).toContainText('Bea')
    await expect(page.locator('[data-testid="avatar-member"][data-member="Bea"]')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('room-settings')).toHaveAttribute('data-state', 'closed')

    // Adding somebody while deciding who shares an expense keeps the current
    // expense open and selects the new person in that split immediately.
    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-split-summary').click()
    await expect(page.getByTestId('add-participant')).toBeVisible()
    await page.getByTestId('add-participant').click()
    const addFromSplit = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            /\/api\/rooms\/[^/]+\/members$/.test(new URL(response.url()).pathname)
    )
    await page.getByTestId('new-participant-name').fill('Cora')
    await page.getByTestId('add-participant-submit').click()
    expect((await addFromSplit).ok()).toBe(true)
    const cora = page.locator('[data-testid="participant-toggle"][data-member="Cora"]')
    await expect(cora).toBeVisible()
    await expect(cora).toHaveAttribute('aria-checked', 'true')

    await page.getByTestId('close-expense').click()
    await page.waitForURL(permanentUrl)
    await page.reload()
    await expect(page.locator('header h1')).toHaveText('The great escape', { timeout: 15_000 })
    expect(page.url()).toBe(permanentUrl)
})
