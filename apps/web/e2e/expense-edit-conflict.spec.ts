import { expect, type APIRequestContext, type Page } from '@playwright/test'
import type { RoomState } from '../src/lib/api-types'
import { test } from './fixtures'

const conflictMessage = 'Someone just edited the expense. Refresh to edit'

async function createExpense(request: APIRequestContext) {
    const created = await request.post('/api/rooms', {
        data: { name: 'Concurrent expense edits', currency: 'EUR', creatorName: 'Ana' },
    })
    expect(created.status()).toBe(201)
    const { room, memberId } = (await created.json()) as { room: { slug: string }; memberId: string }
    const joined = await request.post(`/api/rooms/${room.slug}/members`, { data: { name: 'Bea' } })
    expect(joined.status()).toBe(201)
    const createdExpense = await request.post(`/api/rooms/${room.slug}/expenses`, {
        data: {
            description: 'Dinner',
            amountMinor: '3000',
            currency: 'EUR',
            paidById: memberId,
            splitMode: 'EQUAL',
        },
    })
    expect(createdExpense.status()).toBe(201)
    const state = (await createdExpense.json()) as RoomState
    expect(state.expenses).toHaveLength(1)
    const expense = state.expenses[0]
    expect(expense.revision).toEqual(expect.any(String))
    return { slug: room.slug, expense }
}

async function openExpense(page: Page, url: string, name: string) {
    await page.goto(url)
    await page.locator(`[data-testid="claim-member"][data-member="${name}"]`).click()
    await expect(page.getByTestId('join-gate')).toHaveCount(0)
    await page.getByTestId('expense-row').click()
    await expect(page.getByTestId('expense-amount')).toHaveValue('30.00')
    await expect(page.getByTestId('expense-description')).toHaveValue('Dinner')
}

test('a stale edit cannot undo another device after its room state refreshes', async ({
    page,
    request,
    newDevice,
    baseURL,
}, testInfo) => {
    test.setTimeout(60_000)
    const { slug, expense } = await createExpense(request)
    const expensePath = `/api/rooms/${slug}/expenses/${expense.id}`
    const roomPath = `/api/rooms/${slug}`
    const url = new URL(`/r/${slug}`, baseURL).href
    const bea = await newDevice()

    await openExpense(page, url, 'Ana')
    await openExpense(bea, url, 'Bea')
    await page.getByTestId('expense-amount').fill('40')
    await bea.getByTestId('expense-description').fill('Dinner with friends')

    // Observe the real room refresh before Bea saves: updating her cached expense
    // must not replace the revision belonging to the form she already opened.
    const refreshed = bea.waitForResponse(async (response) => {
        if (
            response.request().method() !== 'GET' ||
            new URL(response.url()).pathname !== roomPath ||
            response.status() !== 200
        )
            return false
        const state = (await response.json()) as RoomState
        return state.expenses.some((row) => row.id === expense.id && row.amountMinor === '4000')
    })
    const firstSave = page.waitForResponse(
        (response) => response.request().method() === 'PATCH' && new URL(response.url()).pathname === expensePath
    )
    await page.getByTestId('save-expense').click()
    const saved = await firstSave
    expect(saved.status()).toBe(200)
    expect(saved.request().postDataJSON().expectedRevision).toBe(expense.revision)
    const savedState = (await saved.json()) as RoomState
    const updated = savedState.expenses.find((row) => row.id === expense.id)!
    expect(updated.revision).not.toBe(expense.revision)
    await expect(page.getByTestId('expense-drawer')).toHaveCount(0)

    await refreshed
    await expect(bea.locator('[data-testid="balance-card"][data-member="Ana"]')).toHaveAttribute('data-net', '2000')
    await expect(bea.getByTestId('expense-amount')).toHaveValue('30.00')
    await expect(bea.getByTestId('expense-description')).toHaveValue('Dinner with friends')
    const staleSave = bea.waitForResponse(
        (response) => response.request().method() === 'PATCH' && new URL(response.url()).pathname === expensePath
    )
    await bea.getByTestId('save-expense').click()
    const rejected = await staleSave
    expect(rejected.request().postDataJSON().expectedRevision).toBe(expense.revision)
    expect(rejected.status()).toBe(409)
    expect(await rejected.json()).toEqual({ error: { code: 'EXPENSE_EDIT_CONFLICT', message: conflictMessage } })
    await expect(bea.getByTestId('expense-drawer').getByRole('alert')).toHaveText(conflictMessage)
    await expect(bea.getByTestId('expense-description')).toHaveValue('Dinner with friends')
    if (testInfo.project.name === 'mobile') {
        await bea.screenshot({ path: testInfo.outputPath('expense-edit-conflict.png') })
    }

    const afterConflict = (await (await request.get(roomPath)).json()) as RoomState
    expect(afterConflict.expenses.find((row) => row.id === expense.id)).toEqual(updated)

    await bea.reload()
    await expect(bea.getByTestId('expense-amount')).toHaveValue('40.00')
    await expect(bea.getByTestId('expense-description')).toHaveValue('Dinner')
    await bea.getByTestId('expense-description').fill('Dinner with friends')
    const retry = bea.waitForResponse(
        (response) => response.request().method() === 'PATCH' && new URL(response.url()).pathname === expensePath
    )
    await bea.getByTestId('save-expense').click()
    const retried = await retry
    expect(retried.request().postDataJSON().expectedRevision).toBe(updated.revision)
    expect(retried.status()).toBe(200)
    const finalState = (await retried.json()) as RoomState
    expect(finalState.expenses.find((row) => row.id === expense.id)).toMatchObject({
        amountMinor: '4000',
        description: 'Dinner with friends',
    })
    await expect(bea.getByTestId('expense-drawer')).toHaveCount(0)
    await expect(bea.getByTestId('expense-row')).toHaveAttribute('data-description', 'Dinner with friends')
})

test('an older client without an expense revision is asked to refresh', async ({ request }) => {
    const { slug, expense } = await createExpense(request)
    const response = await request.patch(`/api/rooms/${slug}/expenses/${expense.id}`, {
        data: {
            description: 'Old cached edit',
            amountMinor: '3000',
            currency: 'EUR',
            paidById: expense.paidById,
            splitMode: 'EQUAL',
            participantIds: expense.shares.map((share) => share.memberId),
            expectedSplitMode: 'EQUAL',
        },
    })
    expect(response.status()).toBe(409)
    expect(await response.json()).toEqual({ error: { code: 'EXPENSE_EDIT_CONFLICT', message: conflictMessage } })
    const state = (await (await request.get(`/api/rooms/${slug}`)).json()) as RoomState
    expect(state.expenses.find((row) => row.id === expense.id)).toEqual(expense)
})
