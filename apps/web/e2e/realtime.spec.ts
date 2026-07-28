import { expect, test, type Page } from '@playwright/test'

/**
 * Two devices in one room, and the proof that the second one hears about a write
 * without asking for it.
 *
 * The budget is the whole assertion: the fallback poll is 8s, so anything that
 * lands inside 6s cannot have come from polling — it came down the event stream.
 * If this ever goes flaky, do not raise the timeout past 8s; that turns the test
 * into "the poll works", which is already covered by room.spec.ts.
 */
const LIVE_BUDGET_MS = 6_000

const balance = (page: Page, member: string) => page.locator(`[data-testid="balance-card"][data-member="${member}"]`)

test('an expense on one device lands on the other without a refresh', async ({ page, browser }) => {
    // ── Ana opens a room ──────────────────────────────────────────────────
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Live room')
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()

    const roomLink = page.getByTestId('room-link')
    await expect(roomLink).toBeVisible({ timeout: 15_000 })
    const url = (await roomLink.innerText()).trim()
    await page.getByTestId('go-to-room').click()
    await expect(balance(page, 'Ana')).toHaveAttribute('data-net', '0', { timeout: 15_000 })

    // ── Bea joins from a second device ────────────────────────────────────
    const second = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const bea = await second.newPage()
    await bea.goto(url)
    await bea.getByTestId('im-new').click()
    await bea.getByTestId('join-name').fill('Bea')
    await bea.getByTestId('join-room').click()
    await expect(bea.getByTestId('join-gate')).toHaveCount(0)

    // Ana sees the new member arrive — the members POST publishes too, so the
    // roster is live before any money is involved.
    await expect(balance(page, 'Bea')).toBeVisible({ timeout: LIVE_BUDGET_MS })

    // ── Bea adds an expense; Ana is not touching her phone ────────────────
    await bea.getByTestId('open-add-expense').click()
    await bea.getByTestId('expense-amount').fill('60')
    await bea.getByTestId('expense-description').fill('Dinner')
    await bea.locator('[data-testid="payer-chip"][data-member="Bea"]').click()
    await bea.getByTestId('save-expense').click()
    await expect(bea.getByTestId('expense-row')).toHaveCount(1, { timeout: 15_000 })

    // No reload, no focus, no tap. Backend truth off `data-net`, not the
    // rendered text, so this is the balance the server computed.
    await expect(page.locator('[data-testid="expense-row"][data-description="Dinner"]')).toBeVisible({
        timeout: LIVE_BUDGET_MS,
    })
    await expect(balance(page, 'Ana')).toHaveAttribute('data-net', '-3000', { timeout: LIVE_BUDGET_MS })

    // ── And the same in reverse: Ana settles, Bea's screen clears ─────────
    await page.getByTestId('open-settle').click()
    const transfer = page.getByTestId('transfer-row')
    await expect(transfer).toHaveCount(1)
    await transfer.click()
    await page.getByTestId('method-cash').click()
    await page.getByTestId('record-settlement').click()
    await expect(balance(page, 'Ana')).toHaveAttribute('data-net', '0', { timeout: 15_000 })

    await expect(balance(bea, 'Bea')).toHaveAttribute('data-net', '0', { timeout: LIVE_BUDGET_MS })

    await second.close()
})
