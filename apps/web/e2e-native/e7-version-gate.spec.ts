import { expect, test } from './fixtures'

/**
 * E7 (ARCHITECTURE 14.2): the version gate fails open. When `app-config.json` answers 500 or
 * cannot be reached, the app runs.
 *
 * In a browser Capacitor reports the platform as 'web' and no build number, so the gate decides
 * "no gate" before it fetches; on a phone the same failures reach `fetchGateStoreUrl`, whose
 * fail-open answer is pinned in src/lib/native/version-gate.test.ts. What this proves end to end
 * is that a broken config endpoint never walls off the bundled app.
 */
for (const failure of ['http-500', 'network-error'] as const) {
    test(`E7: the app runs when app-config.json fails (${failure})`, async ({ page }) => {
        await page.route('**/app-config.json', (route) =>
            failure === 'http-500' ? route.fulfill({ status: 500, body: 'down' }) : route.abort('internetdisconnected')
        )

        await page.goto('/app/')
        await expect(page.getByTestId('app-home')).toBeVisible({ timeout: 15_000 })
        await expect(page.getByTestId('version-gate')).toHaveCount(0)

        await page.getByTestId('app-new-split').click()
        await expect(page.getByTestId('room-name')).toBeVisible()
        await expect(page.getByTestId('version-gate')).toHaveCount(0)
    })
}
