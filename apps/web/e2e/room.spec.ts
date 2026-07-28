import { expect, test, type Page } from '@playwright/test'

/**
 * The whole product in one journey, against the real API and the real database:
 * create → the link moment → a second device joins → an EQUAL expense → a
 * foreign-currency EXACT expense → balances → settle → all settled → undo.
 *
 * Balances are asserted from `data-net` (raw minor units off the server) rather
 * than the rendered text, so the assertion is backend truth and not a NumberFlow
 * frame caught mid-animation.
 */

const balance = (page: Page, member: string) => page.locator(`[data-testid="balance-card"][data-member="${member}"]`)

/** Scoped to the page body: the settle drawer briefly shows the same celebration
 *  while it animates closed. */
const allSettled = (page: Page) => page.locator('main [data-testid="all-settled"]')

const expectBalance = async (page: Page, member: string, netMinor: string) =>
    expect(balance(page, member)).toHaveAttribute('data-net', netMinor, { timeout: 15_000 })

test('create → share → join → split → settle → undo', async ({ page, browser }) => {
    // ── 1. Create the room ────────────────────────────────────────────────
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Ski trip')
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()

    // ── 2. The link moment ────────────────────────────────────────────────
    const roomLink = page.getByTestId('room-link')
    await expect(roomLink).toBeVisible({ timeout: 15_000 })
    const url = (await roomLink.innerText()).trim()
    expect(url).toContain('/r/ski-trip-')
    await expect(page.getByTestId('copy-link')).toBeVisible()

    await page.getByTestId('go-to-room').click()
    await expectBalance(page, 'Ana', '0')
    // Identity was stored on creation — the creator never sees the join gate.
    await expect(page.getByTestId('join-gate')).toHaveCount(0)

    // ── 3. A second device opens the link and joins ───────────────────────
    const second = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const bea = await second.newPage()
    await bea.goto(url)

    await expect(bea.getByTestId('join-gate')).toBeVisible({ timeout: 15_000 })
    // The room is legible behind the gate — you can see what you are joining.
    await expect(balance(bea, 'Ana')).toBeVisible()
    await bea.getByTestId('im-new').click()
    await bea.getByTestId('join-name').fill('Bea')
    await bea.getByTestId('join-room').click()
    await expect(bea.getByTestId('join-gate')).toHaveCount(0)
    await expectBalance(bea, 'Bea', '0')

    // ── 4. Bea adds an EQUAL expense in the room currency ─────────────────
    await bea.getByTestId('open-add-expense').click()
    await bea.getByTestId('expense-amount').fill('60')
    await bea.getByTestId('expense-description').fill('Dinner')
    await bea.locator('[data-testid="payer-chip"][data-member="Bea"]').click()
    await bea.getByTestId('save-expense').click()

    await expect(bea.getByTestId('expense-row')).toHaveCount(1, { timeout: 15_000 })
    await expectBalance(bea, 'Bea', '3000')
    await expectBalance(bea, 'Ana', '-3000')

    // ── 5. Ana adds a foreign-currency EXACT expense ──────────────────────
    // CHF 100 in a EUR room at the static table (1 CHF = 1.12 USD, 1 EUR = 1.08
    // USD) → EUR 103.70; a 60/40 CHF split lands on 62.22 / 41.48 with no residue.
    await page.reload()
    await expect(page.getByTestId('expense-row')).toHaveCount(1, { timeout: 15_000 })

    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill('100')
    await page.getByTestId('expense-currency').selectOption('CHF')
    await page.getByTestId('expense-description').fill('Lift passes')
    await page.locator('[data-testid="payer-chip"][data-member="Ana"]').click()
    await page.getByTestId('split-exact').click()

    // Switching to EXACT opens EMPTY: the whole amount is still to allocate, and
    // the readout is neutral until the person has actually done the allocating.
    await expect(page.getByTestId('remaining-readout')).toContainText('Left to allocate')
    await expect(page.getByTestId('remaining-readout')).toContainText('CHF 100.00')

    await page.locator('[data-testid="exact-input"][data-member="Ana"]').fill('60')
    await expect(page.getByTestId('remaining-readout')).toContainText('Left to allocate')
    await expect(page.getByTestId('remaining-readout')).toContainText('CHF 40.00')

    // Over-allocating is just as visible as under-allocating.
    await page.locator('[data-testid="exact-input"][data-member="Bea"]').fill('50')
    await expect(page.getByTestId('remaining-readout')).toContainText('Over by')
    await expect(page.getByTestId('remaining-readout')).toContainText('CHF 10.00')

    // And the celebration lands only once it reconciles, after real edits.
    await page.locator('[data-testid="exact-input"][data-member="Bea"]').fill('40')
    await expect(page.getByTestId('remaining-readout')).toContainText('Every cent allocated')

    await page.getByTestId('save-expense').click()
    await expect(page.getByTestId('expense-row')).toHaveCount(2, { timeout: 15_000 })

    // Ana: +103.70 paid − 62.22 share − 30.00 dinner share = +11.48
    await expectBalance(page, 'Ana', '1148')
    await expectBalance(page, 'Bea', '-1148')
    // The foreign row shows the room-currency conversion, labelled indicative.
    await expect(page.locator('[data-testid="expense-row"][data-description="Lift passes"]')).toContainText(
        'indicative'
    )

    // ── 6. Re-opening the EXACT expense must not drift the balances ───────
    await page.locator('[data-testid="expense-row"][data-description="Lift passes"]').click()
    await expect(page.locator('[data-testid="exact-input"][data-member="Ana"]')).toHaveValue('60.00')
    await expect(page.getByTestId('remaining-readout')).toContainText('Every cent allocated')
    await page.getByTestId('save-expense').click()
    await expectBalance(page, 'Ana', '1148')
    await expectBalance(page, 'Bea', '-1148')

    // ── 7. Settle up ──────────────────────────────────────────────────────
    await page.getByTestId('open-settle').click()
    const transfer = page.getByTestId('transfer-row')
    await expect(transfer).toHaveCount(1)
    await expect(transfer).toContainText('€11.48')
    await transfer.click()
    await page.getByTestId('method-cash').click()
    await page.getByTestId('record-settlement').click()

    await expectBalance(page, 'Ana', '0')
    await expectBalance(page, 'Bea', '0')
    await expect(allSettled(page)).toBeVisible({ timeout: 15_000 })

    // ── 8. Delete an expense, then undo it ────────────────────────────────
    await page.locator('[data-testid="expense-row"][data-description="Dinner"]').click()
    await page.getByTestId('delete-expense').click()
    await expect(page.getByTestId('expense-row')).toHaveCount(1, { timeout: 15_000 })

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByTestId('expense-row')).toHaveCount(2, { timeout: 15_000 })
    await expectBalance(page, 'Ana', '0')
    await expect(allSettled(page)).toBeVisible()

    await second.close()
})

test('an unknown slug says so instead of spinning', async ({ page }) => {
    await page.goto('/r/definitely-not-a-room-zzz999')
    await expect(page.getByTestId('room-not-found')).toBeVisible({ timeout: 15_000 })
})
