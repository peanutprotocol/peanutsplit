import { expect, test, type Page } from '@playwright/test'
import { openCurrentRoomSettings } from '../e2e/helpers'
import { makeRoom, mockCamera, stubTheModel, TINY_JPEG, type Posted } from './helpers'

/**
 * The explicit AI consent before a receipt scan is an app-only step (Apple 5.1.2(i)); the web
 * keeps today's flow with its passive provider note and no extra tap. This suite runs the web
 * build, so it pins that boundary: the web never shows the consent step or its settings switch,
 * whatever a device has stored, and the photo is sent exactly once, only after it is picked.
 * The app side of the gate (`scanConsentNeeded`) is unit-tested in `src/lib/use-settings.test.ts`.
 */

const pickPhoto = (page: Page) =>
    page.getByTestId('scan-upload-input').setInputFiles({
        name: 'bill.jpg',
        mimeType: 'image/jpeg',
        buffer: TINY_JPEG,
    })

test('the web scan asks for no AI consent, even with a stored refusal, and sends the photo once', async ({ page }) => {
    // A device that turned consent off in the app shape of the setting. The web must ignore it.
    await page.addInitScript(() => {
        window.localStorage.setItem(
            'ps:settings',
            JSON.stringify({ soundEnabled: true, hapticsEnabled: true, animationsEnabled: true, scanConsent: false })
        )
    })
    await mockCamera(page, 'denied')
    const posted: Posted = {}
    await stubTheModel(page, posted)
    await makeRoom(page, 'Consent trip')

    await page.getByTestId('open-add-expense').click()
    await expect(page.getByTestId('scan-bill')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('scan-bill').click()
    await expect(page.getByTestId('scan-camera')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('scan-consent')).toHaveCount(0)
    await expect(page.locator('#scan-provider-terms')).toBeVisible()
    expect(posted.calls ?? 0).toBe(0)

    await pickPhoto(page)
    await expect(page.getByTestId('scan-item-label').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('scan-consent')).toHaveCount(0)
    expect(posted.calls).toBe(1)

    // The web never writes the setting either; the device's stored answer is left as it was.
    expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('ps:settings') ?? '{}').scanConsent)).toBe(
        false
    )
})

test('web room settings offer no AI consent switch', async ({ page }) => {
    await makeRoom(page, 'Settings trip')
    await openCurrentRoomSettings(page)
    const sheet = page.getByTestId('settings-sheet')
    await expect(sheet.getByTestId('device-row')).toBeVisible()
    await expect(sheet.getByTestId('setting-scan-consent')).toHaveCount(0)
})
