import { expect, test, type Page } from '@playwright/test'
import { enterCreatedRoom, openCurrentRoomSettings } from './helpers'

/**
 * Both stores require a privacy link inside the app, and the web carries the same one so the two
 * surfaces never drift. Neither store requires terms, and the only terms that exist today are
 * peanut.me's wallet terms, which contradict the Split listing. So the app surfaces (rooms home
 * and room settings) carry a Privacy link and no terms link. The marketing footer keeps its own.
 */

const expectPrivacyLink = async (page: Page, testId: string) => {
    const link = page.getByTestId(testId)
    await expect(link).toBeVisible()
    await expect(link).toHaveText('Privacy')
    const href = await link.getAttribute('href')
    expect(href).toBeTruthy()
    // An absolute product URL, so the same link works from the store app's bundled origin.
    expect(new URL(href!).pathname).toBe('/privacy')
    const response = await page.request.get(href!)
    expect(response.status()).toBe(200)
}

const noTermsLink = (page: Page) => page.locator('a[href*="/terms"]')

test('the rooms home links to the privacy page and carries no terms link', async ({ page }) => {
    // manage=1 keeps the home on screen even when this device has a recent room.
    await page.goto('/app?manage=1')
    await expect(page.getByTestId('app-home')).toBeVisible({ timeout: 15_000 })
    await expectPrivacyLink(page, 'app-privacy-link')
    await expect(noTermsLink(page)).toHaveCount(0)
})

test('room settings link to the privacy page and carry no terms link', async ({ page }) => {
    await page.goto('/new?name=Privacy%20check&currency=EUR')
    await expect(page.getByTestId('room-name')).toHaveValue('Privacy check')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await enterCreatedRoom(page)

    await openCurrentRoomSettings(page)
    const sheet = page.getByTestId('settings-sheet')
    await sheet.getByTestId('privacy-link').scrollIntoViewIfNeeded()
    await expectPrivacyLink(page, 'privacy-link')
    await expect(sheet.locator('a[href*="/terms"]')).toHaveCount(0)
    // The web does not ask for AI consent, so it offers no switch to change that answer.
    await expect(sheet.getByTestId('setting-scan-consent')).toHaveCount(0)
})
