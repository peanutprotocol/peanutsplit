import { expect } from '@playwright/test'
import { test } from './fixtures'

const createRoom = async (page: import('@playwright/test').Page, name: string) => {
    await page.goto('/new')
    await page.getByTestId('room-name').fill(name)
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await expect(page.getByTestId('roster-checkpoint')).toBeVisible({ timeout: 15_000 })
}

test('creation pauses at a concise roster checkpoint before entering the room', async ({ page }) => {
    await createRoom(page, 'Roster trip')

    await expect(page.getByRole('heading', { name: 'Who’s in?' })).toBeVisible()
    await expect(page.getByText('This can be changed later.')).toBeVisible()
    await expect(page.locator('[data-testid="checkpoint-member"][data-member="Ana"]')).toBeVisible()
    await expect(page.getByTestId('room-share-card')).toHaveCount(0)
    await expect(page.getByTestId('go-to-room')).toHaveText('Skip')
    await expect(page.getByTestId('checkpoint-add')).toHaveAccessibleName('Add')

    await page.getByTestId('checkpoint-name').fill('Bea')
    await page.getByTestId('checkpoint-add').click()
    await expect(page.locator('[data-testid="checkpoint-member"][data-member="Bea"]')).toBeVisible()
    await expect(page.getByTestId('checkpoint-name')).toHaveValue('')
    await expect(page.getByTestId('go-to-room')).toHaveText('Done')

    await page.getByTestId('go-to-room').click()
    await page.waitForURL(/\/r\/roster-trip-/)
    await page.getByTestId('open-room-settings').click()
    await expect(page.locator('[data-testid="person-row"][data-member="Bea"]')).toBeVisible()
})

test('the in-room hand-off keeps copy inline and makes sharing the primary action', async ({ page }) => {
    await createRoom(page, 'Beer trip')
    await page.getByRole('button', { name: 'Skip', exact: true }).click()
    await page.waitForURL(/\/r\/beer-trip-/)

    const inviteRequestPromise = page.waitForRequest((request) => request.url().includes('/card/invite'))
    await page.getByTestId('share-room').click()

    const inviteRequest = await inviteRequestPromise
    expect(inviteRequest.method()).toBe('POST')
    expect(new URL(inviteRequest.url()).search).toBe('')
    expect(Object.keys(inviteRequest.postDataJSON() as Record<string, unknown>)).toEqual(['memberId'])
    expect((inviteRequest.postDataJSON() as { memberId: unknown }).memberId).toEqual(expect.any(String))
    expect(inviteRequest.headers()).not.toHaveProperty('x-member-token')

    const row = page.getByTestId('room-link-row')
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row.getByTestId('room-link')).toContainText('/r/beer-trip-')
    await expect(row.getByTestId('copy-link')).toBeVisible()
    await expect(row.getByTestId('copy-link').locator('svg')).toHaveCount(1)

    const share = page.getByTestId('share-link')
    await expect(share).toBeVisible()
    await expect(share).toHaveClass(/btn-primary/)

    const [rowBox, copyBox] = await Promise.all([row.boundingBox(), row.getByTestId('copy-link').boundingBox()])
    expect(rowBox).not.toBeNull()
    expect(copyBox).not.toBeNull()
    expect(copyBox!.x + copyBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 1)
    expect(copyBox!.y).toBeGreaterThanOrEqual(rowBox!.y)
    expect(copyBox!.y + copyBox!.height).toBeLessThanOrEqual(rowBox!.y + rowBox!.height)

    // Desktop Chromium has no native share sheet. The primary action still does
    // useful work there: it copies the link and the inline icon confirms it.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
        origin: new URL(page.url()).origin,
    })
    await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }))
    await share.click()
    await expect(row.getByTestId('copy-link')).toHaveAccessibleName('Copied!')
})
