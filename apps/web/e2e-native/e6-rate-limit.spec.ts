import en from '../src/i18n/messages/en.json'
import { API_ORIGIN, expect, test } from './fixtures'

/**
 * E6 (ARCHITECTURE 14.2): a server refusal reaches the app as the server's own answer. The proxy
 * adds Access-Control-Allow-Origin to error responses too; without it the browser hides the 429
 * and the app can only say "could not reach the server".
 */
test('E6: a rate-limited create shows the rate-limit message, not a network error', async ({
    page,
    playwright,
    appIp,
}) => {
    // Spend this device's room-creation budget (20 an hour) from the same address the app uses.
    const sameDevice = await playwright.request.newContext({
        baseURL: API_ORIGIN,
        extraHTTPHeaders: { 'x-forwarded-for': appIp },
    })
    let status = 0
    for (let attempt = 0; attempt < 25 && status !== 429; attempt++) {
        status = (
            await sameDevice.post('/api/rooms', { data: { name: 'Budget', currency: 'EUR', creatorName: 'Ana' } })
        ).status()
    }
    await sameDevice.dispose()
    expect(status, 'the create bucket never ran out').toBe(429)

    await page.goto('/new/')
    await page.getByTestId('room-name').fill('One room too many')
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()

    await expect(page.getByRole('alert').filter({ hasText: en.errors.RATE_LIMITED })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(en.errors.NETWORK_ERROR)).toHaveCount(0)
})
