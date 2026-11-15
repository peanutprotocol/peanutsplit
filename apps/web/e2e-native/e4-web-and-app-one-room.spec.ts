import { addExpense, claimMember, createRoomOnWeb, expect, expenseRow, openRoomLinkInApp, test } from './fixtures'

/**
 * E4 (ARCHITECTURE 14.2): the PWA and the app in one room. Two containers, two origins, one truth
 * on the server. Each side sees the other's expense, exactly once, without a reload.
 *
 * The app's stream is observed to open (a 200 on its cross-origin `/events`), so the 10 s budget
 * is a latency bound on a live stream, not a bet on the polling backstop. native.yml reruns this
 * test with the test origin removed from the server's CORS list and expects it to fail.
 */
const LIVE_BUDGET_MS = 10_000

test('E4: web and app in one room see each other’s expense exactly once', async ({ page, openWeb }) => {
    const web = await openWeb()
    const slug = await createRoomOnWeb(web, 'Shared flat', 'Ana', ['Bea'])

    const appStream = page.waitForResponse(
        (response) =>
            response.url().startsWith(`http://localhost:3100/api/rooms/${slug}/events`) && response.status() === 200,
        { timeout: 30_000 }
    )
    await openRoomLinkInApp(page, slug)
    await claimMember(page, 'Bea')
    await appStream

    // Web first, then the app, so both directions are proven.
    await addExpense(web, 'Groceries from the web', '30')
    await expect(expenseRow(page, 'Groceries from the web')).toHaveCount(1, { timeout: LIVE_BUDGET_MS })

    await addExpense(page, 'Taxi from the app', '18')
    await expect(expenseRow(web, 'Taxi from the app')).toHaveCount(1, { timeout: LIVE_BUDGET_MS })

    // Let any late echo (a stream event plus a poll, a replayed write) arrive, then count again.
    await page.waitForTimeout(2_000)
    for (const device of [page, web]) {
        await expect(expenseRow(device, 'Groceries from the web')).toHaveCount(1)
        await expect(expenseRow(device, 'Taxi from the app')).toHaveCount(1)
        await expect(device.getByTestId('expense-row')).toHaveCount(2)
    }
})
