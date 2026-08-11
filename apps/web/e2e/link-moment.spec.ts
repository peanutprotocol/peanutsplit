import { expect } from '@playwright/test'
import { test } from './fixtures'
import { openCurrentRoomSettings, waitForHydratedControl } from './helpers'

const createRoom = async (page: import('@playwright/test').Page, name: string) => {
    await page.goto('/new')
    const roomName = page.getByTestId('room-name')
    await waitForHydratedControl(roomName)
    await roomName.fill(name)
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
    await openCurrentRoomSettings(page)
    await expect(page.locator('[data-testid="person-row"][data-member="Bea"]')).toBeVisible()
})

test('the in-room hand-off keeps copy inline and makes sharing the primary action', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: async (text: string) => {
                    ;(window as Window & { __copiedRoomText?: string }).__copiedRoomText = text
                },
            },
        })
    })
    const previewRequestPromise = page.waitForRequest((request) => request.url().includes('/opengraph-image'))
    await createRoom(page, 'Beer trip')
    const previewRequest = await previewRequestPromise
    expect(previewRequest.method()).toBe('GET')
    expect(new URL(previewRequest.url()).pathname).toMatch(/\/r\/beer-trip-[A-Za-z0-9_-]{22}\/opengraph-image$/)
    expect(previewRequest.headers()).not.toHaveProperty('x-member-token')

    await page.getByRole('button', { name: 'Skip', exact: true }).click()
    await page.waitForURL(/\/r\/beer-trip-/)
    await page.getByTestId('share-room').click()

    const qr = page.getByTestId('room-qr')
    await expect(qr).toBeVisible({ timeout: 15_000 })
    await expect(qr).toHaveAccessibleName('QR code to join Beer trip')
    await expect(qr).toContainText('Scan to join in person')
    await expect(qr.locator('svg')).toHaveCount(1)

    const row = page.getByTestId('room-link-row')
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row.getByTestId('room-link')).toContainText('/r/beer-trip-')
    await expect(row.getByTestId('copy-link')).toBeVisible()
    await expect(row.getByTestId('copy-link').locator('svg')).toHaveCount(1)

    const share = page.getByTestId('share-link')
    await expect(share).toBeVisible()
    await expect(share).toHaveClass(/btn-primary/)
    await expect(share).toHaveText('Share room link')

    const [rowBox, copyBox] = await Promise.all([row.boundingBox(), row.getByTestId('copy-link').boundingBox()])
    expect(rowBox).not.toBeNull()
    expect(copyBox).not.toBeNull()
    expect(copyBox!.x + copyBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 1)
    expect(copyBox!.y).toBeGreaterThanOrEqual(rowBox!.y)
    expect(copyBox!.y + copyBox!.height).toBeLessThanOrEqual(rowBox!.y + rowBox!.height)

    const [qrBox, cardBox] = await Promise.all([
        qr.locator('svg').boundingBox(),
        page.getByTestId('room-share-card').boundingBox(),
    ])
    expect(qrBox).not.toBeNull()
    expect(cardBox).not.toBeNull()
    expect(Math.abs(qrBox!.width - qrBox!.height)).toBeLessThan(1)
    expect(qrBox!.width).toBeGreaterThanOrEqual(112)
    expect(qrBox!.x).toBeGreaterThanOrEqual(cardBox!.x)
    expect(qrBox!.x + qrBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width)

    // Desktop browsers have no native share sheet in this matrix. Stub the
    // clipboard contract directly: Firefox does not support Playwright's
    // Chromium-only clipboard-read permission, but the product promise is the
    // same — the primary action copies the room package and confirms it inline.
    await share.click()
    await expect(row.getByTestId('copy-link')).toHaveAccessibleName('Copied!')
    await expect
        .poll(() => page.evaluate(() => (window as Window & { __copiedRoomText?: string }).__copiedRoomText))
        .toContain('/r/beer-trip-')
})
