import { expect, type Route } from '@playwright/test'
import { test } from './fixtures'
import { expectSlideReset, slideToConfirm } from './slide-to-confirm'

test('destructive ledger and identity actions require a slide or keyboard confirmation', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    // The limiter is intentionally in-memory per server. A unique synthetic
    // client keeps repeated local verification runs independent.
    await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.slide-${Date.now()}` })

    const roomResponse = await page.request.post('/api/rooms', {
        data: { name: `Slide confirm ${Date.now()}`, currency: 'EUR', creatorName: 'Ana' },
    })
    expect(roomResponse.ok()).toBe(true)
    const room = (await roomResponse.json()) as {
        room: { slug: string }
        memberId: string
        memberToken: string
    }

    const memberResponse = await page.request.post(`/api/rooms/${room.room.slug}/members`, {
        data: { name: 'Bea', intent: 'add' },
    })
    expect(memberResponse.ok()).toBe(true)
    const bea = (await memberResponse.json()) as { memberId: string }

    const addExpense = async (description: string) => {
        const response = await page.request.post(`/api/rooms/${room.room.slug}/expenses`, {
            headers: { 'x-member-token': room.memberToken },
            data: {
                description,
                amountMinor: '1000',
                currency: 'EUR',
                paidById: bea.memberId,
                splitMode: 'EQUAL',
                participantIds: [room.memberId, bea.memberId],
            },
        })
        expect(response.ok()).toBe(true)
        return response.json() as Promise<{
            suggestedTransfers: Array<{ fromId: string; toId: string; amountMinor: string }>
        }>
    }

    await addExpense('Delete me')
    await page.addInitScript(
        ({ slug, memberId, token }) =>
            window.localStorage.setItem(`ps:member:${slug}`, JSON.stringify({ memberId, name: 'Ana', token })),
        { slug: room.room.slug, memberId: room.memberId, token: room.memberToken }
    )
    await page.goto(`/r/${room.room.slug}`)

    await page.locator('[data-testid="expense-row"][data-description="Delete me"]').click()
    await page.getByTestId('delete-expense').click()
    const deleteExpense = page.getByTestId('confirm-delete-expense')

    // Neither a touch tap, mouse click, nor short drag can execute the terminal action.
    if (testInfo.project.name === 'mobile') {
        const handleBox = await deleteExpense.locator('[data-slide-handle]').boundingBox()
        expect(handleBox).not.toBeNull()
        await page.touchscreen.tap(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
        await expect(page.getByTestId('delete-expense-confirm')).toBeVisible()
    }
    await deleteExpense.click()
    await expect(page.getByTestId('delete-expense-confirm')).toBeVisible()
    await slideToConfirm(page, deleteExpense, 0.5)
    await expectSlideReset(deleteExpense)

    // A failed terminal request keeps the warning open and returns the control
    // to a safe, focused starting point. While it is pending, repeated commands
    // are locked out rather than becoming duplicate requests.
    const deletePattern = `**/api/rooms/${room.room.slug}/expenses/*`
    let releaseFailure: (() => void) | undefined
    const failureGate = new Promise<void>((resolve) => {
        releaseFailure = resolve
    })
    let deleteAttempts = 0
    const failDelete = async (route: Route) => {
        deleteAttempts += 1
        if (deleteAttempts === 1) await failureGate
        await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'INTERNAL', message: 'Synthetic delete failure' } }),
        })
    }
    await page.route(deletePattern, failDelete)
    await slideToConfirm(page, deleteExpense)
    await expect(deleteExpense).toHaveAttribute('aria-busy', 'true')
    await deleteExpense.press('Enter')
    expect(deleteAttempts).toBe(1)
    releaseFailure!()
    await expectSlideReset(deleteExpense)
    await expect(deleteExpense).toBeFocused()
    await expect(page.getByTestId('delete-expense-confirm')).toBeVisible()
    await page.unroute(deletePattern, failDelete)

    await slideToConfirm(page, deleteExpense)
    await expect(page.getByTestId('expense-row')).toHaveCount(0)

    const state = await addExpense('Settle me')
    const transfer = state.suggestedTransfers[0]
    expect(transfer).toBeTruthy()
    const settlementResponse = await page.request.post(`/api/rooms/${room.room.slug}/settlements`, {
        headers: { 'x-member-token': room.memberToken },
        data: transfer,
    })
    expect(settlementResponse.ok()).toBe(true)
    await page.reload()

    const payment = page.getByTestId('settlement-row')
    await expect(payment).toBeVisible()
    const removePayment = payment.getByTestId('remove-settlement')
    const staleWarning = page.getByTestId('room-stale-warning')
    if (await staleWarning.isVisible()) {
        await staleWarning.getByRole('button', { name: 'Try again' }).click()
        await expect(staleWarning).toBeHidden()
    }
    await expect(removePayment).toBeEnabled()
    await removePayment.click()
    await payment.getByTestId('confirm-remove-settlement').press('Enter')
    await expect(page.getByTestId('settlement-row')).toHaveCount(0, { timeout: 15_000 })

    await page.getByTestId('open-room-settings').click()
    await page.getByTestId('you-row').click()
    const switchPerson = page.getByTestId('switch-person-confirm')
    await switchPerson.click()
    await expect(page.getByTestId('switch-person-sheet')).toBeVisible()
    await switchPerson.press('Space')
    await expect(page.getByTestId('join-gate')).toBeVisible()
})
