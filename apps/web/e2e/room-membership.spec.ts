import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { test } from './fixtures'
import { openCurrentRoomSettings } from './helpers'
import { expectSlideReset, slideToConfirm } from './slide-to-confirm'
import type { RoomState } from '../src/lib/api-types'

async function prepareRoom(page: Page, request: APIRequestContext, people = 2, debt = false) {
    const created = await request.post('/api/rooms', {
        data: { name: 'Room management', currency: 'EUR', creatorName: 'Ana' },
    })
    expect(created.status()).toBe(201)
    const room = (await created.json()) as RoomState & { memberId: string; memberToken: string }
    const slug = room.room.slug
    if (people > 1) {
        const added = await request.post(`/api/rooms/${slug}/members`, { data: { name: 'Bea' } })
        expect(added.ok()).toBe(true)
        const bea = (await added.json()) as { memberId: string }
        const expense = await request.post(`/api/rooms/${slug}/expenses`, {
            headers: { 'x-member-token': room.memberToken },
            data: {
                description: 'Dinner',
                amountMinor: '1000',
                currency: 'EUR',
                paidById: room.memberId,
                splitMode: 'EQUAL',
                participantIds: debt ? [room.memberId, bea.memberId] : [room.memberId],
            },
        })
        expect(expense.ok()).toBe(true)
    }
    // Write once: an init script would silently restore a removed identity after navigation.
    await page.goto('/app?manage=1')
    await page.evaluate(
        ({ slug, memberId, token }) => {
            localStorage.setItem(`ps:member:${slug}`, JSON.stringify({ memberId, token, name: 'Ana' }))
        },
        { slug, memberId: room.memberId, token: room.memberToken }
    )
    await page.goto(`/r/${slug}`)
    await expect(page.getByTestId('join-gate')).toHaveCount(0)
    await expect(page.getByTestId('open-room-settings')).toBeVisible()
    return { slug, memberId: room.memberId }
}

async function savedRoom(page: Page, slug: string) {
    return page.evaluate(
        (slug) => ({
            saved: JSON.parse(localStorage.getItem('ps:recent') ?? '[]').some(
                (room: { slug: string }) => room.slug === slug
            ),
            identity: localStorage.getItem(`ps:member:${slug}`),
        }),
        slug
    )
}

test('Manage rooms opens Your rooms with a separate add-or-join action', async ({ page, request }) => {
    const { slug } = await prepareRoom(page, request)
    await page.getByTestId('open-room-switcher').click()
    await page.getByRole('link', { name: 'Manage rooms' }).click()
    await expect(page.getByRole('heading', { name: 'Your rooms', exact: true })).toBeVisible()
    await expect(page.locator(`[data-testid="forget-room"][data-room="${slug}"]`)).toBeVisible()
    await page.getByTestId('app-add-or-join').click()
    await expect(page.getByTestId('app-new-split')).toBeInViewport()
    await page.getByTestId('room-link-recovery').locator('summary').click()
    await expect(page.getByTestId('recover-room-input')).toBeVisible()
})

test('removing a room from Settings clears only this device, even with a balance', async ({ page, request }) => {
    const { slug } = await prepareRoom(page, request, 2, true)
    const before = (await (await request.get(`/api/rooms/${slug}`)).json()) as RoomState
    await openCurrentRoomSettings(page)
    await page.getByTestId('remove-room-from-device').click()
    await expect(page.getByTestId('forget-room-confirm')).toContainText('does not take you out of new splits')
    await page.getByTestId('cancel-forget-room').click()
    expect((await savedRoom(page, slug)).saved).toBe(true)
    await page.getByTestId('remove-room-from-device').click()
    await slideToConfirm(page, page.getByTestId('confirm-forget-room'))
    await expect(page).toHaveURL(/\/app\?manage=1$/)
    await page.reload()
    expect(await savedRoom(page, slug)).toEqual({ saved: false, identity: null })
    const after = (await (await request.get(`/api/rooms/${slug}`)).json()) as RoomState
    expect(after.members).toEqual(before.members)
    expect(after.expenses).toEqual(before.expenses)
    expect(after.balances).toEqual(before.balances)
})

test('leaving preserves history and the saved link, and excludes the person from new splits', async ({
    page,
    request,
}) => {
    const { slug, memberId } = await prepareRoom(page, request)
    const before = (await (await request.get(`/api/rooms/${slug}`)).json()) as RoomState
    await openCurrentRoomSettings(page)
    await page.getByTestId('leave-room').click()
    await page.getByTestId('cancel-leave-room').click()
    expect((await savedRoom(page, slug)).identity).not.toBeNull()
    await page.getByTestId('leave-room').click()
    const endpoint = `**/api/rooms/${slug}/members/${memberId}`
    await page.route(endpoint, (route) =>
        route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'TEMPORARY_FAILURE', message: 'Try again' } }),
        })
    )
    await slideToConfirm(page, page.getByTestId('confirm-leave-room'))
    await expect(page.getByTestId('leave-room-sheet').getByRole('alert')).toBeVisible()
    await expectSlideReset(page.getByTestId('confirm-leave-room'))
    expect((await savedRoom(page, slug)).identity).not.toBeNull()
    await page.unroute(endpoint)
    await slideToConfirm(page, page.getByTestId('confirm-leave-room'))
    await expect(page).toHaveURL(/\/app\?manage=1$/)
    expect(await savedRoom(page, slug)).toEqual({ saved: true, identity: null })
    const after = (await (await request.get(`/api/rooms/${slug}`)).json()) as RoomState
    expect(after.members.find((person) => person.id === memberId)?.removedAt).toBeTruthy()
    expect(after.expenses).toEqual(before.expenses)
    expect(after.balances).toEqual(before.balances)
    const bea = after.members.find((person) => person.id !== memberId)!
    const added = await request.post(`/api/rooms/${slug}/expenses`, {
        data: {
            description: 'After Ana left',
            amountMinor: '600',
            currency: 'EUR',
            paidById: bea.id,
            splitMode: 'EQUAL',
        },
    })
    expect(added.ok()).toBe(true)
    const next = (await added.json()) as RoomState
    expect(
        next.expenses.find((expense) => expense.description === 'After Ana left')?.shares.map((share) => share.memberId)
    ).toEqual([bea.id])
})

for (const scenario of [
    { people: 1, debt: false, reason: 'last active person' },
    { people: 2, debt: true, reason: 'Settle your balance' },
]) {
    test(`leaving explains ${scenario.reason} and offers device removal`, async ({ page, request }) => {
        const { slug, memberId } = await prepareRoom(page, request, scenario.people, scenario.debt)
        await openCurrentRoomSettings(page)
        await page.getByTestId('leave-room').click()
        await expect(page.getByTestId('leave-room-sheet')).toContainText(scenario.reason)
        await expect(page.getByTestId('confirm-leave-room')).toHaveCount(0)
        await page.getByTestId('leave-remove-instead').click()
        await expect(page.getByTestId('forget-room-confirm')).toBeVisible()
        const state = (await (await request.get(`/api/rooms/${slug}`)).json()) as RoomState
        expect(state.members.find((person) => person.id === memberId)?.removedAt).toBeNull()
    })
}
