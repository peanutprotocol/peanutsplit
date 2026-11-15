import { claimMember, createRoomOnWeb, expect, openRoomLinkInApp, test } from './fixtures'

/**
 * E1 (ARCHITECTURE 14.2): someone made a room in a browser and shared its link; a friend with
 * the app taps it. The app cold-starts on the link path, shows the room behind the JoinGate, and
 * a tap on an existing name makes this device that member.
 */
test('E1: a web room link opens cold in the app and an existing name claims it', async ({ page, openWeb }) => {
    const web = await openWeb()
    const slug = await createRoomOnWeb(web, 'Cold open trip', 'Ana', ['Bea'])

    await openRoomLinkInApp(page, slug)
    await expect(page.getByTestId('join-gate')).toBeVisible({ timeout: 15_000 })
    await claimMember(page, 'Bea')

    await expect(page.getByTestId('open-add-expense')).toBeVisible()
    const member = await page.evaluate((key) => localStorage.getItem(key), `ps:member:${slug}`)
    expect(member, 'the claim is stored on this device').not.toBeNull()
})
