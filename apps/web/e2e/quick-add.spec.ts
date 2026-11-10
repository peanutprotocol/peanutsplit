import type { APIRequestContext, Page } from '@playwright/test'
import type { RoomState } from '../src/lib/api-types'
import { expect, test } from './fixtures'

type CreatedRoom = RoomState & { memberId: string; memberToken: string }

async function createRoom(request: APIRequestContext, name: string): Promise<CreatedRoom> {
    const response = await request.post('/api/rooms', {
        data: { name, currency: 'EUR', creatorName: 'Ana' },
    })
    expect(response.status()).toBe(201)
    return response.json()
}

async function rememberRooms(page: Page, rooms: CreatedRoom[], withIdentity = true): Promise<void> {
    await page.goto('/app?manage=1')
    await page.evaluate(
        ({ rooms, withIdentity }) => {
            localStorage.setItem(
                'ps:recent',
                JSON.stringify(
                    rooms.map((room, index) => ({
                        slug: room.room.slug,
                        name: room.room.name,
                        lastSeenAt: Date.now() - index * 1_000,
                    }))
                )
            )
            if (withIdentity) {
                for (const room of rooms) {
                    localStorage.setItem(
                        `ps:member:${room.room.slug}`,
                        JSON.stringify({ memberId: room.memberId, token: room.memberToken, name: 'Ana' })
                    )
                }
            }
        },
        { rooms, withIdentity }
    )
}

async function readRoom(request: APIRequestContext, slug: string): Promise<RoomState> {
    const response = await request.get(`/api/rooms/${slug}`)
    expect(response.ok()).toBe(true)
    return response.json()
}

test('quick add opens the newest valid room without writing an expense and stays closed after dismissal', async ({
    page,
    request,
}) => {
    const older = await createRoom(request, 'Older quick-add room')
    const newest = await createRoom(request, 'Newest quick-add room')
    await rememberRooms(page, [newest, older])
    await page.evaluate(() => {
        const rooms = JSON.parse(localStorage.getItem('ps:recent') ?? '[]')
        localStorage.setItem(
            'ps:recent',
            JSON.stringify([{ slug: '../../new', name: 'Tampered entry', lastSeenAt: Date.now() + 60_000 }, ...rooms])
        )
    })
    const before = await readRoom(request, newest.room.slug)

    await page.goto('/app?add=1')
    await expect(page).toHaveURL(`/r/${newest.room.slug}?add=1`)
    await expect(page.getByTestId('expense-drawer')).toBeVisible()
    await expect(page.getByTestId('expense-drawer-room-switcher')).toContainText(newest.room.name)
    await expect(page.getByTestId('expense-amount')).toHaveValue('')
    await expect(page.getByTestId('expense-description')).toHaveValue('')

    await page.reload()
    await expect(page.getByTestId('expense-drawer')).toBeVisible()
    const after = await readRoom(request, newest.room.slug)
    expect(after.expenses).toEqual(before.expenses)
    expect(after.members).toEqual(before.members)
    expect(after.balances).toEqual(before.balances)

    await page.getByTestId('close-expense').click()
    await expect(page.getByTestId('expense-drawer')).toBeHidden()
    await expect(page).toHaveURL(`/r/${newest.room.slug}`)
    await page.reload()
    await expect(page.getByTestId('open-add-expense')).toBeVisible()
    await expect(page.getByTestId('expense-drawer')).toBeHidden()
})

test('changing the quick-add room keeps the add intent and saves only to the selected room', async ({
    page,
    request,
}) => {
    const older = await createRoom(request, 'Dinner group')
    const newest = await createRoom(request, 'Trip group')
    await rememberRooms(page, [newest, older])

    await page.goto('/app?add=1')
    await expect(page.getByTestId('expense-drawer')).toBeVisible()
    await page.getByTestId('expense-drawer-room-switcher').click()
    await expect(page).toHaveURL('/app?manage=1&add=1')
    await expect(page.getByTestId('app-home')).toBeVisible()
    const dinnerRoom = page.getByRole('link', { name: 'Open room: Dinner group' })
    await expect(dinnerRoom).toHaveAttribute('href', `/r/${older.room.slug}?add=1`)
    await dinnerRoom.click()
    await expect(page.getByTestId('expense-drawer')).toBeVisible()
    await expect(page.getByTestId('expense-drawer-room-switcher')).toContainText('Dinner group')

    await page.getByTestId('expense-amount').fill('12.50')
    await page.getByTestId('expense-description').fill('Quick-add lunch')
    await expect(page.getByTestId('expense-drawer-room-switcher')).toBeHidden()
    await expect(page.getByTestId('expense-drawer-room-name')).toHaveText('Dinner group')
    const saved = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname === `/api/rooms/${older.room.slug}/expenses`
    )
    await page.getByTestId('save-expense').click()
    expect((await saved).ok()).toBe(true)
    await expect(page.getByTestId('expense-drawer')).toBeHidden()

    const [selected, untouched] = await Promise.all([
        readRoom(request, older.room.slug),
        readRoom(request, newest.room.slug),
    ])
    expect(selected.expenses).toHaveLength(1)
    expect(selected.expenses[0]).toMatchObject({ description: 'Quick-add lunch', amountMinor: '1250', currency: 'EUR' })
    expect(untouched.expenses).toEqual([])
})

test('quick add waits for a member choice and then opens the expense form', async ({ page, request }) => {
    const room = await createRoom(request, 'Choose your name')
    await rememberRooms(page, [room], false)

    await page.goto('/app?add=1')
    await expect(page).toHaveURL(`/r/${room.room.slug}?add=1`)
    await expect(page.getByTestId('join-gate')).toBeVisible()
    await expect(page.getByTestId('expense-drawer')).toBeHidden()
    expect((await readRoom(request, room.room.slug)).expenses).toEqual([])

    await page.locator('[data-testid="claim-member"][data-member="Ana"]').click()
    await expect(page.getByTestId('join-gate')).toBeHidden()
    await expect(page.getByTestId('expense-drawer')).toBeVisible()
    await expect(page.getByTestId('expense-drawer-room-switcher')).toContainText(room.room.name)
    expect((await readRoom(request, room.room.slug)).expenses).toEqual([])
})

test('pasting a room into quick-add recovery preserves the add intent through member choice', async ({
    page,
    request,
}) => {
    const room = await createRoom(request, 'Recovered quick-add room')
    await page.goto('/app?add=1')
    await page.getByTestId('room-link-recovery').locator('summary').click()
    await page.getByTestId('recover-room-input').fill(`https://peanutsplit.com/r/${room.room.slug}`)
    await page.getByTestId('recover-room-submit').click()

    await expect(page).toHaveURL(`/r/${room.room.slug}?add=1`)
    await expect(page.getByTestId('join-gate')).toBeVisible()
    await page.locator('[data-testid="claim-member"][data-member="Ana"]').click()
    await expect(page.getByTestId('expense-drawer')).toBeVisible()
    await expect(page.getByTestId('expense-drawer-room-switcher')).toContainText(room.room.name)
    expect((await readRoom(request, room.room.slug)).expenses).toEqual([])
})

for (const storage of ['empty', 'malformed', 'denied'] as const) {
    test(`quick add provides create and recovery actions with ${storage} recent-room storage`, async ({ page }) => {
        await page.addInitScript((mode) => {
            if (mode === 'malformed') localStorage.setItem('ps:recent', '{invalid-json')
            if (mode === 'denied') {
                const nativeGetItem = Storage.prototype.getItem
                Storage.prototype.getItem = function (key: string) {
                    if (key === 'ps:recent') throw new DOMException('storage denied', 'SecurityError')
                    return nativeGetItem.call(this, key)
                }
            }
        }, storage)

        await page.goto('/app?add=1')
        await expect(page.getByTestId('app-home')).toBeVisible()
        await expect(page.getByTestId('app-new-split')).toHaveAttribute('href', '/new')
        await expect(page.getByTestId('room-link-recovery')).toBeVisible()
        await expect(page).toHaveURL('/app?add=1')
        await expect(page.getByTestId('expense-drawer')).toBeHidden()
    })
}

test('a missing quick-add room can be replaced without losing the expense intent', async ({ page, request }) => {
    const valid = await createRoom(request, 'Still available')
    await rememberRooms(page, [valid])
    const missingSlug = 'missing-quick-add-brave-otter-lamp'
    await page.evaluate((slug) => {
        const rooms = JSON.parse(localStorage.getItem('ps:recent') ?? '[]')
        localStorage.setItem(
            'ps:recent',
            JSON.stringify([{ slug, name: 'Missing room', lastSeenAt: Date.now() + 60_000 }, ...rooms])
        )
    }, missingSlug)

    await page.goto('/app?add=1')
    await expect(page).toHaveURL(`/r/${missingSlug}?add=1`)
    const notFound = page.getByTestId('room-not-found')
    await expect(notFound).toBeVisible()
    await notFound.getByRole('link').click()
    await expect(page).toHaveURL('/app?manage=1&add=1')
    await page.getByRole('link', { name: 'Open room: Still available' }).click()
    await expect(page).toHaveURL(`/r/${valid.room.slug}?add=1`)
    await expect(page.getByTestId('expense-drawer')).toBeVisible()
})
