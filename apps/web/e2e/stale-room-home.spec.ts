import { enterCreatedRoom } from './helpers'
import { expect, test } from './fixtures'

test('a missing newest room is forgotten before room options return to a valid room', async ({ page }) => {
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Still here')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    const validRoomUrl = await enterCreatedRoom(page)
    const validSlug = new URL(validRoomUrl).pathname.split('/')[2]
    const staleSlug = 'departed-room-brave-otter-lamp'

    await page.evaluate((missingSlug) => {
        const remembered = JSON.parse(window.localStorage.getItem('ps:recent') ?? '[]')
        window.localStorage.setItem(
            'ps:recent',
            JSON.stringify([
                {
                    slug: missingSlug,
                    name: 'Departed room',
                    emoji: 'peanut',
                    theme: 'classic',
                    lastSeenAt: Date.now() + 60_000,
                },
                ...remembered,
            ])
        )
    }, staleSlug)

    await page.goto('/app')
    await expect(page).toHaveURL(new RegExp(`/r/${staleSlug}$`), { timeout: 15_000 })
    const notFound = page.getByTestId('room-not-found')
    await expect(notFound).toBeVisible({ timeout: 15_000 })

    await expect
        .poll(() =>
            page.evaluate((missingSlug) => {
                const remembered = JSON.parse(window.localStorage.getItem('ps:recent') ?? '[]')
                return remembered.some((room: { slug: string }) => room.slug === missingSlug)
            }, staleSlug)
        )
        .toBe(false)

    await notFound.getByRole('link').click()
    await expect(page).toHaveURL(/\/app\?manage=1$/, { timeout: 15_000 })
    await expect(page.getByTestId('app-home')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open room: Still here' })).toHaveAttribute('href', `/r/${validSlug}`)

    // The CTA replaces the missing route. Back may return to the room that was
    // open before the failed home attempt, but never to the dead credential.
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/r/${validSlug}$`), { timeout: 15_000 })
    await expect(page.getByTestId('room-title')).toHaveText('Still here')
    expect(
        await page.evaluate((missingSlug) => {
            const remembered = JSON.parse(window.localStorage.getItem('ps:recent') ?? '[]')
            return remembered.some((room: { slug: string }) => room.slug === missingSlug)
        }, staleSlug)
    ).toBe(false)
})

test('a storage write failure still escapes the missing-room redirect loop', async ({ page }) => {
    const staleSlug = 'unwritable-room-brave-otter-lamp'
    await page.addInitScript((missingSlug) => {
        const nativeSetItem = Storage.prototype.setItem
        nativeSetItem.call(
            window.localStorage,
            'ps:recent',
            JSON.stringify([{ slug: missingSlug, name: 'Unwritable room', lastSeenAt: Date.now() }])
        )
        Storage.prototype.setItem = function (key: string, value: string) {
            if (key === 'ps:recent') throw new DOMException('storage denied', 'SecurityError')
            return nativeSetItem.call(this, key, value)
        }
    }, staleSlug)

    await page.goto('/app')
    await expect(page).toHaveURL(new RegExp(`/r/${staleSlug}$`), { timeout: 15_000 })
    const notFound = page.getByTestId('room-not-found')
    await expect(notFound).toBeVisible({ timeout: 15_000 })

    await notFound.getByRole('link').click()
    await expect(page).toHaveURL(/\/app\?manage=1$/, { timeout: 15_000 })
    await expect(page.getByTestId('app-home')).toBeVisible()
    expect(
        await page.evaluate((missingSlug) => {
            const remembered = JSON.parse(window.localStorage.getItem('ps:recent') ?? '[]')
            return remembered.some((room: { slug: string }) => room.slug === missingSlug)
        }, staleSlug)
    ).toBe(true)
})
