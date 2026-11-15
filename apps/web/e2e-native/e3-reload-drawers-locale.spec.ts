import de from '../src/i18n/messages/de.json'
import { appRoomUrl, claimMember, expect, openRoomLinkInApp, seedRoom, test } from './fixtures'

/**
 * E3 (ARCHITECTURE 14.2): the in-app room URL is `/room/?slug=`, and every drawer is a query key
 * next to it. Opening and closing drawers must keep the slug; a reload (Android recreating the
 * WebView, a language switch) must land in the same room through the boot path.
 */
test('E3: drawers, a reload and a language switch all stay in the same room', async ({ page, request }) => {
    const room = await seedRoom(request, 'Drawer trip')
    await openRoomLinkInApp(page, room.slug)
    await claimMember(page, 'Ana')

    // Add expense
    await page.getByTestId('open-add-expense').click()
    await expect(page.getByTestId('expense-amount')).toBeVisible()
    await expect(page).toHaveURL(appRoomUrl(room.slug))
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('expense-amount')).toBeHidden()
    await expect(page).toHaveURL(appRoomUrl(room.slug))

    // Share
    await page.getByTestId('share-room').click()
    await expect(page.getByTestId('room-link-row')).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(appRoomUrl(room.slug))
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('room-link-row')).toBeHidden()
    await expect(page).toHaveURL(appRoomUrl(room.slug))

    // Room switcher, then Settings from it
    await page.getByTestId('open-room-switcher').click()
    await expect(page.getByTestId('room-switcher-sheet')).toBeVisible()
    await expect(page).toHaveURL(appRoomUrl(room.slug))
    await page
        .getByTestId('room-switcher-sheet')
        .locator('[data-testid="room-switcher-settings"][data-current="true"]')
        .click()
    await expect(page.getByTestId('settings-sheet')).toBeVisible()
    await expect(page).toHaveURL(appRoomUrl(room.slug))
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('settings-sheet')).toBeHidden()
    await expect(page).toHaveURL(appRoomUrl(room.slug))

    // A hard reload restores the room, and this device is still Ana (no JoinGate).
    await page.reload()
    await expect(page).toHaveURL(appRoomUrl(room.slug), { timeout: 15_000 })
    await expect(page.getByTestId('open-add-expense')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('join-gate')).toHaveCount(0)

    // The language switch stores the choice and reloads the WebView.
    await page.getByTestId('open-room-switcher').click()
    await page
        .getByTestId('room-switcher-sheet')
        .locator('[data-testid="room-switcher-settings"][data-current="true"]')
        .click()
    await page.getByTestId('device-row').click()
    await expect(page.getByTestId('device-sheet')).toBeVisible()
    await page.getByTestId('locale-de').click()

    await expect(page.locator('html')).toHaveAttribute('lang', 'de', { timeout: 15_000 })
    await expect(page).toHaveURL(appRoomUrl(room.slug))
    await expect(page.getByTestId('open-add-expense').first()).toHaveText(de.room.actions.addExpense, {
        timeout: 15_000,
    })
    await expect(page.getByTestId('join-gate')).toHaveCount(0)
})
