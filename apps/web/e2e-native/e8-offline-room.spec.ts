import en from '../src/i18n/messages/en.json'
import {
    appRoomUrl,
    expect,
    goOffline,
    goOfflineBeforeLoad,
    goOnline,
    seedRecentRooms,
    seedRoom,
    test,
} from './fixtures'

/**
 * E8 and E8b (ARCHITECTURE 14.2, INTERACTION 9): a room the API cannot reach shows the calm offline
 * line and a way back to "Your rooms", never the generic load error or an endless skeleton, and
 * loads by itself once the phone is back online.
 */

const offlineLine = (page: import('@playwright/test').Page) => page.getByText(en.room.states.offlineBody)
const yourRoomsLink = (page: import('@playwright/test').Page) =>
    page.getByRole('link', { name: en.marketing.rooms.title, exact: true })
/** The room's data arrived: this device is not a member yet, so the JoinGate shows. */
const roomLoaded = (page: import('@playwright/test').Page) => page.getByTestId('join-gate')

test('E8: an offline cold start opens the recent room offline, with a way back', async ({ page, request }) => {
    const room = await seedRoom(request, 'Airplane trip')

    // A device that has visited the room before: seed its list, then cut the API and hard-load.
    await page.goto('/app/')
    await expect(page.getByTestId('app-home')).toBeVisible({ timeout: 15_000 })
    await seedRecentRooms(page, [room])
    await goOfflineBeforeLoad(page)
    await page.goto('/')

    await expect(page).toHaveURL(appRoomUrl(room.slug), { timeout: 15_000 })
    await expect(offlineLine(page)).toBeVisible({ timeout: 15_000 })
    await expect(yourRoomsLink(page)).toBeVisible()
    await expect(page.getByText(en.room.states.errorTitle)).toHaveCount(0)

    // "Your rooms" shows the list and stays there: no resume back into the failing room.
    await yourRoomsLink(page).click()
    await expect(page.getByTestId('app-home')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('recent-room-list')).toBeVisible()
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('app-home')).toBeVisible()
    expect(page.url()).not.toContain('/room/')

    // Back into the room, then the network returns: it loads without a tap.
    await page.goBack()
    await expect(page).toHaveURL(appRoomUrl(room.slug), { timeout: 15_000 })
    await expect(offlineLine(page)).toBeVisible({ timeout: 15_000 })
    await goOnline(page)
    await expect(roomLoaded(page)).toBeVisible({ timeout: 15_000 })
    await expect(offlineLine(page)).toHaveCount(0)
})

test('E8b: a room opened after the phone went offline shows the offline line, not the skeleton', async ({
    page,
    request,
}) => {
    const room = await seedRoom(request, 'Tunnel list')

    // The list view (`manage=1`), so the app does not resume into the room on its own.
    await page.goto('/app/?manage=1')
    await expect(page.getByTestId('app-home')).toBeVisible({ timeout: 15_000 })
    await seedRecentRooms(page, [room])
    await page.reload()
    await expect(page.getByTestId('recent-room-list')).toBeVisible({ timeout: 15_000 })

    // Offline while running: React Query hears the event and pauses every new read.
    await goOffline(page)
    await page.getByTestId('recent-room-list').getByRole('link').first().click()

    await expect(page).toHaveURL(appRoomUrl(room.slug), { timeout: 15_000 })
    await expect(offlineLine(page)).toBeVisible({ timeout: 15_000 })
    await expect(yourRoomsLink(page)).toBeVisible()
    await expect(yourRoomsLink(page)).toHaveAttribute('href', /\/app\/?\?manage=1$/)
    await expect(page.getByTestId('room-skeleton')).toHaveCount(0)

    await goOnline(page)
    await expect(roomLoaded(page)).toBeVisible({ timeout: 15_000 })
    await expect(offlineLine(page)).toHaveCount(0)
})
