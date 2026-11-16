import {
    addExpense,
    claimMember,
    expect,
    expenseRow,
    goOffline,
    goOnline,
    openRoomLinkInApp,
    seedRoom,
    test,
} from './fixtures'

/**
 * E5 (ARCHITECTURE 14.2): an expense saved in the app while the API is unreachable reaches the
 * room once the phone is back online, and the web sees it exactly once. Offline here cuts only the
 * API; the app's own files keep loading, as on a device (fixtures.ts).
 */
test('E5: an expense saved offline in the app reaches the web exactly once', async ({ page, request, openWeb }) => {
    const room = await seedRoom(request, 'Tunnel trip', 'Ana', ['Bea'])
    const web = await openWeb()
    await web.goto(`/r/${room.slug}`)
    await claimMember(web, 'Ana')

    await openRoomLinkInApp(page, room.slug)
    await claimMember(page, 'Bea')

    await goOffline(page)
    await addExpense(page, 'Dinner in the tunnel', '42')
    // Nothing reached the server yet.
    const offlineState = (await (await request.get(`/api/rooms/${room.slug}`)).json()) as {
        expenses: Array<{ description: string }>
    }
    expect(offlineState.expenses.filter((expense) => expense.description === 'Dinner in the tunnel')).toHaveLength(0)

    await goOnline(page)
    await expect(expenseRow(web, 'Dinner in the tunnel')).toHaveCount(1, { timeout: 20_000 })
    await expect
        .poll(async () => {
            const state = (await (await request.get(`/api/rooms/${room.slug}`)).json()) as {
                expenses: Array<{ description: string }>
            }
            return state.expenses.filter((expense) => expense.description === 'Dinner in the tunnel').length
        })
        .toBe(1)

    await page.waitForTimeout(2_000)
    await expect(expenseRow(web, 'Dinner in the tunnel')).toHaveCount(1)
    await expect(expenseRow(page, 'Dinner in the tunnel')).toHaveCount(1)
    await expect
        .poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('ps:pending:'))))
        .toHaveLength(0)
})
