import { expect, test, type Page } from '@playwright/test'

/**
 * Two devices in one room, and the proof that the second one hears about a write
 * without asking for it.
 *
 * WHAT THIS ACTUALLY PROVES, which is not what the budget alone would: the
 * stream is observed to open (a 200 on `/events`), and then every update lands
 * inside 6s. The budget on its own proves nothing — the fallback poll runs on a
 * uniform phase, so with SSE completely dead roughly three quarters of 8s polls
 * still land inside 6s, and Playwright's retries make that worse rather than
 * better. The `waitForResponse` is the mechanism; the budget is a latency bound
 * on top of it.
 *
 * If this goes flaky, do not raise the timeout past 8s — that turns it back into
 * "the poll works", which room.spec.ts already covers.
 */
const LIVE_BUDGET_MS = 6_000

const balance = (page: Page, member: string) => page.locator(`[data-testid="balance-card"][data-member="${member}"]`)

test('an expense on one device lands on the other without a refresh', async ({ page, browser }) => {
    // Armed BEFORE the room exists, because the room screen opens its stream on
    // mount and a listener attached afterwards would miss it.
    const streamOpened = page.waitForResponse(
        (response) => response.url().includes('/events') && response.status() === 200,
        { timeout: 30_000 }
    )

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

    // The mechanism, observed. Everything below is a latency bound on a stream
    // that is demonstrably open, rather than a bet on poll phase.
    await streamOpened

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
    await bea.getByTestId('expense-payer-summary').click()
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
