import { expect, test } from '@playwright/test'

test('the room emblem opens Settings, rename keeps the link, and people can be added in context', async ({ page }) => {
    test.setTimeout(60_000)

    await page.addInitScript(() => {
        let permission: NotificationPermission = 'default'
        Object.defineProperty(window, 'Notification', {
            configurable: true,
            value: {
                get permission() {
                    return permission
                },
                requestPermission: () =>
                    new Promise<NotificationPermission>((resolve) => {
                        window.setTimeout(() => {
                            permission = 'denied'
                            resolve(permission)
                        }, 300)
                    }),
            },
        })
        Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} })
        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: {
                getRegistration: async () => null,
                addEventListener: () => {},
                removeEventListener: () => {},
            },
        })
        // The mobile project emulates an iPhone. Mark it as a home-screen app so the test reaches
        // the permission path instead of the separate iOS install instructions.
        Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
    })

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

    // The emblem is the settings entry point, and the top bar has no way out of
    // the room any more: the old home link is gone and "All rooms" lives in the
    // sheet's dock instead.
    await expect(page.getByTestId('open-room-settings')).toBeVisible()
    await expect(page.locator('header a')).toHaveCount(0)
    await page.getByTestId('open-room-settings').click()

    await expect(page.getByTestId('settings-sheet')).toBeVisible()
    // The current room is the card, never also a tile in the dock — and with no
    // other room on this device the dock does not render at all.
    await expect(page.getByTestId('room-card')).toBeVisible()
    await expect(page.getByTestId('room-switcher')).toHaveCount(0)
    await expect(page.getByTestId('room-display-name')).toHaveValue('Weekend away')
    await expect(page.getByTestId('people-list')).toContainText('Ana')
    await expect(page.getByText('Dark mode', { exact: true })).toHaveCount(0)

    // A denied browser prompt leaves the same control in place with its reason. It must not turn
    // grey and then vanish while the person is waiting for the permission result.
    const notificationToggle = page.getByTestId('push-enable')
    await expect(notificationToggle).toBeVisible()
    await notificationToggle.click()
    await expect(notificationToggle).toHaveAttribute('aria-busy', 'true')
    await expect(notificationToggle).toBeVisible()
    await expect(notificationToggle).toBeDisabled()
    await expect(notificationToggle).toContainText('Blocked in your browser settings.')

    // A live field: no Save button, and the one surviving line only while dirty.
    await expect(page.getByTestId('save-room-name')).toHaveCount(0)
    await page.getByTestId('room-display-name').fill('The great escape')
    await expect(page.getByTestId('room-card')).toContainText('The link stays the same.')

    const rename = page.waitForResponse(
        (response) =>
            response.request().method() === 'PATCH' && new URL(response.url()).pathname === `/api/rooms/${slug}`
    )
    await page.getByTestId('room-display-name').press('Enter')
    expect((await rename).ok()).toBe(true)
    await expect(page.locator('header h1')).toHaveText('The great escape')
    // The claim is that a rename does not move the room, so compare the path. The sheet itself is
    // a URL param now (`?settings=1`, like `?share=1` always was) so that the back gesture closes
    // it instead of leaving the room — and the link people actually share is built from the origin
    // and the slug, never from the address bar.
    expect(new URL(page.url()).pathname).toBe(new URL(permanentUrl).pathname)
    await expect(page.getByTestId('room-card')).not.toContainText('The link stays the same.')

    const addFromSettings = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            /\/api\/rooms\/[^/]+\/members$/.test(new URL(response.url()).pathname)
    )
    await page.getByTestId('add-person').click()
    await page.getByTestId('add-person-name').fill('Bea')
    await page.getByTestId('add-person-submit').click()
    expect((await addFromSettings).ok()).toBe(true)
    // One roster, and every row of it is the tap that opens that person's
    // character sheet. The second inert copy is gone.
    await expect(page.getByTestId('people-list')).toContainText('Bea')
    await expect(page.locator('[data-testid="person-row"][data-member="Bea"]')).toBeVisible()

    // History stays out of the ordinary room payload and loads only when asked.
    // This device created, renamed and edited the roster as Ana, so the audit
    // wording carries both parts of that attribution without exposing its id.
    await page.getByTestId('history-row').click()
    const historySheet = page.getByTestId('history-sheet')
    await expect(historySheet).toBeVisible()
    await expect(historySheet.getByTestId('history-list')).toContainText(
        'Device A acting as Ana edited the room settings'
    )
    await expect(historySheet.getByTestId('history-list')).toContainText('Device A acting as Ana added a person')
    await expect(historySheet.getByTestId('history-list')).toContainText('Device A acting as Ana created the room')
    await page.getByTestId('close-history-sheet').click()
    await expect(historySheet).toHaveAttribute('data-state', 'closed')

    // The device preferences are one row and a nested sheet, and nothing per
    // room is inside it any more.
    const deviceRow = page.getByTestId('device-row')
    await expect(deviceRow).toContainText('English')
    await deviceRow.click()
    const deviceSheet = page.getByTestId('device-sheet')
    await expect(deviceSheet).toBeVisible()
    // Installing is per device too, and it is the first thing in the sheet. Matched by prefix
    // because which of the five states renders depends on the browser this project is running.
    await expect(
        deviceSheet.locator('[data-testid^="install-row-"], [role="group"][aria-label="Language"]').first()
    ).toBeVisible()
    const language = deviceSheet.getByRole('group', { name: 'Language' })
    await expect(language).toBeVisible()
    await expect(language.getByTestId('locale-en')).toHaveAttribute('aria-pressed', 'true')
    await expect(language.getByTestId('locale-es-419')).toHaveAttribute('aria-pressed', 'false')
    await expect(language.getByTestId('locale-pt-br')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('setting-sound')).toBeVisible()
    await expect(page.getByTestId('setting-haptics')).toBeVisible()
    await expect(page.getByTestId('setting-animations')).toBeVisible()
    await page.getByTestId('close-device-sheet').click()
    await expect(page.getByTestId('device-sheet')).toHaveAttribute('data-state', 'closed')

    await page.getByTestId('close-room-settings').click()
    await expect(page.getByTestId('settings-sheet')).toHaveAttribute('data-state', 'closed')

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
    expect(new URL(page.url()).pathname).toBe(new URL(permanentUrl).pathname)

    // Language is a device preference: it reloads the same room in the selected native catalog,
    // persists, and never changes the shared room link.
    await page.getByTestId('open-room-settings').click()
    await expect(page.getByTestId('device-row')).toContainText('English')
    await page.getByTestId('device-row').click()
    const reloaded = page.waitForEvent('framenavigated')
    await page.getByTestId('locale-es-419').click()
    await reloaded

    expect(new URL(page.url()).pathname).toBe(new URL(permanentUrl).pathname)
    await expect(page.locator('html')).toHaveAttribute('lang', 'es-419')
    await expect(page.locator('html')).toHaveAttribute('translate', 'no')
    await expect
        .poll(async () => (await page.context().cookies()).find(({ name }) => name === 'ps-locale')?.value)
        .toBe('es-419')

    const spanishDeviceRow = page.getByTestId('device-row')
    await expect(spanishDeviceRow).toContainText('Este dispositivo')
    await expect(spanishDeviceRow).toContainText('Español')
    await spanishDeviceRow.click()
    const spanishLanguage = page.getByRole('group', { name: 'Idioma' })
    await expect(spanishLanguage.getByTestId('locale-es-419')).toHaveAttribute('aria-pressed', 'true')
})
