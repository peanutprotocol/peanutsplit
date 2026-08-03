import { expect, test } from '@playwright/test'

test('the room hand-off keeps copy inline and makes sharing the primary action', async ({ page }) => {
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Beer trip')
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    const inviteRequestPromise = page.waitForRequest((request) => request.url().includes('/card/invite'))
    await page.getByTestId('create-room').click()

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
    const enter = page.getByTestId('go-to-room')
    await expect(share).toBeVisible()
    await expect(share).toHaveClass(/btn-primary/)
    await expect(enter).toBeVisible()
    await expect(enter).toHaveClass(/btn-stroke/)

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
