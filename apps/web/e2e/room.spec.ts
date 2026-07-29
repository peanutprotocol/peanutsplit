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
    test.setTimeout(60_000)

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
    const joinDialog = bea.getByRole('dialog')
    await expect(joinDialog).toHaveAttribute('aria-modal', 'true')
    await expect(bea.locator('[data-testid="claim-member"][data-member="Ana"]')).toBeFocused()
    await bea.keyboard.press('Shift+Tab')
    await expect(bea.getByTestId('im-new')).toBeFocused()
    await bea.keyboard.press('Tab')
    await expect(bea.locator('[data-testid="claim-member"][data-member="Ana"]')).toBeFocused()
    const viewport = await bea.locator('meta[name="viewport"]').getAttribute('content')
    expect(viewport).not.toContain('user-scalable=no')
    expect(viewport).not.toContain('maximum-scale=1')
    // The room is legible behind the gate — you can see what you are joining.
    await expect(balance(bea, 'Ana')).toBeVisible()
    await bea.getByTestId('im-new').click()
    await expect(bea.getByTestId('join-name')).toBeFocused()
    await bea.getByTestId('join-name').fill('Bea')
    await bea.getByTestId('join-room').click()
    await expect(bea.getByTestId('join-gate')).toHaveCount(0)
    await expectBalance(bea, 'Bea', '0')

    // ── 4. Bea adds an EQUAL expense in the room currency ─────────────────
    await bea.getByTestId('open-add-expense').click()
    await bea.getByTestId('expense-amount').fill('60')
    await bea.getByTestId('expense-description').fill('Dinner')
    await bea.getByTestId('expense-payer-summary').click()
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
    await page.getByTestId('expense-payer-summary').click()
    await page.locator('[data-testid="payer-chip"][data-member="Ana"]').click()
    await page.getByTestId('expense-split-summary').click()
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
    await page.getByTestId('expense-split-summary').click()
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

test('one person can add a payer and submit an expense on their behalf', async ({ page, browser }) => {
    await page.goto('/new')
    await expect(page.getByTestId('room-composer')).toBeVisible()
    const roomCurrencyTrigger = page.getByRole('button', { name: /Room currency,/ })
    const [roomNameBox, roomCurrencyBox] = await Promise.all([
        page.getByTestId('room-name').boundingBox(),
        roomCurrencyTrigger.boundingBox(),
    ])
    expect(roomNameBox).not.toBeNull()
    expect(roomCurrencyBox).not.toBeNull()
    expect(
        Math.abs(roomNameBox!.y + roomNameBox!.height / 2 - (roomCurrencyBox!.y + roomCurrencyBox!.height / 2))
    ).toBeLessThan(2)
    await page.getByTestId('room-name').fill('Trust room')
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()

    const roomLink = page.getByTestId('room-link')
    await expect(roomLink).toBeVisible({ timeout: 15_000 })
    const url = (await roomLink.innerText()).trim()
    await page.getByTestId('go-to-room').click()

    const expenseWrites: string[] = []
    page.on('request', (request) => {
        if (request.method() === 'POST' && /\/api\/rooms\/[^/]+\/expenses$/.test(request.url())) {
            expenseWrites.push(request.postData() ?? '')
        }
    })

    await page.getByTestId('open-add-expense').click()
    await expect(page.getByTestId('expense-composer')).toBeVisible()
    await expect(page.getByTestId('close-expense')).toBeVisible()
    await expect(page.getByTestId('expense-scroll')).toHaveCSS('overflow-y', 'auto')
    await expect(page.getByTestId('expense-tools-loading')).toHaveCount(0)

    // Money punctuation becomes visible before it can touch the ledger.
    // English grouping is read as grouping and normalised in the editable
    // field; excess precision and leading-zero pseudo-grouping are rejected
    // instead of rounding or multiplying on save.
    await page.getByTestId('expense-description').fill('Leading zero guard')
    await page.getByTestId('expense-amount').fill('0,123')
    await page.getByTestId('save-expense').click()
    await expect(page.locator('#expense-amount-error')).toContainText('separators and decimal places')
    await expect(page.getByTestId('expense-amount')).toHaveValue('0,123')
    await expect(page.getByTestId('expense-drawer')).toHaveAttribute('data-state', 'open')
    expect(expenseWrites).toHaveLength(0)

    await page.getByTestId('expense-amount').fill('1,234')
    await page.getByTestId('expense-amount').press('Tab')
    await expect(page.getByTestId('expense-amount')).toHaveValue('1234.00')
    await expect(page.getByTestId('expense-fields-repaired')).toContainText('Read as 1234.00')
    await page.getByTestId('expense-amount').fill('12.345')
    await page.getByTestId('expense-description').fill('Precision check')
    await page.getByTestId('save-expense').click()
    await expect(page.locator('#expense-amount-error')).toContainText('separators and decimal places')
    await expect(page.getByTestId('expense-drawer')).toHaveAttribute('data-state', 'open')

    const currencyTrigger = page.getByRole('button', { name: /Expense currency, EUR/ })
    await currencyTrigger.click()
    const currencyList = page.getByRole('listbox', { name: 'Expense currency' })
    await expect(currencyList).toHaveAttribute('data-direction', 'down')
    const [triggerBox, listBox] = await Promise.all([currencyTrigger.boundingBox(), currencyList.boundingBox()])
    expect(triggerBox).not.toBeNull()
    expect(listBox).not.toBeNull()
    expect(listBox!.y).toBeGreaterThan(triggerBox!.y)
    await expect(currencyTrigger).toBeFocused()
    const activeCurrency = currencyList.locator('[data-active="true"]')
    const firstActiveCurrency = await activeCurrency.getAttribute('id')
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => activeCurrency.getAttribute('id')).not.toBe(firstActiveCurrency)
    await expect(currencyTrigger).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('expense-drawer')).toHaveAttribute('data-state', 'open')
    await expect(page.getByTestId('expense-composer')).toBeVisible()
    await expect(currencyTrigger).toHaveAttribute('aria-expanded', 'false')
    await currencyTrigger.click()
    await page.getByRole('option', { name: 'EUR', exact: true }).click()
    await expect(page.getByTestId('expense-drawer')).toHaveAttribute('data-state', 'open')
    await page.getByTestId('expense-scroll').evaluate((element) => {
        element.scrollTop = element.scrollHeight
    })
    await expect(page.getByTestId('save-expense')).toBeVisible()
    await expect(page.getByTestId('quick-add')).toHaveCount(0)
    await page.getByTestId('expense-scroll').evaluate((element) => {
        element.scrollTop = 0
    })
    await page.getByTestId('expense-payer-summary').click()
    await expect(page.getByTestId('collapse-payer-editor')).toBeVisible()
    await expect(page.getByTestId('collapse-payer-editor')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(page.getByTestId('collapse-payer-editor')).toHaveCSS('border-top-width', '0px')
    await expect(page.getByTestId('payer-chip')).toHaveCount(1)
    await page.getByTestId('add-payer').click()
    await page.getByTestId('new-payer-name').fill('Bea')
    await page.getByTestId('add-payer-submit').click()

    await expect(page.getByTestId('expense-payer-summary')).toHaveAccessibleName('Bea paid', { timeout: 15_000 })
    await expect(page.getByTestId('payer-editor')).toHaveCount(0)
    await page.getByTestId('expense-split-summary').click()
    await expect(page.locator('[data-testid="participant-toggle"][data-member="Bea"]')).toBeVisible()
    await expect(page.getByTestId('collapse-split-editor')).toBeVisible()
    await page.getByTestId('collapse-split-editor').click()
    await expect(page.getByTestId('split-editor')).toHaveCount(0)

    await page.getByTestId('expense-date-summary').click()
    await expect(page.getByTestId('collapse-date-editor')).toBeVisible()
    await page.getByRole('button', { name: 'Today', exact: true }).click()
    await expect(page.getByTestId('date-editor')).toHaveCount(0)

    // The fields are forgiving when a person types the right values into the
    // wrong lines. Repair happens after the pair is complete, not after the
    // first digit, and the original text is preserved verbatim.
    await page.getByTestId('expense-amount').fill('Dinner Bea covered')
    await page.getByTestId('expense-description').fill('60')
    await page.getByTestId('expense-description').press('Tab')
    await expect(page.getByTestId('expense-amount')).toHaveValue('60')
    await expect(page.getByTestId('expense-description')).toHaveValue('Dinner Bea covered')
    await expect(page.getByTestId('expense-fields-repaired')).toBeVisible()
    await page.getByTestId('save-expense').click()

    await expect(
        page.locator('[data-testid="expense-row"][data-description="Dinner Bea covered"]:not([disabled])')
    ).toContainText('Bea paid', { timeout: 15_000 })
    await expectBalance(page, 'Ana', '-3000')
    await expectBalance(page, 'Bea', '3000')

    // Adding Bea did not switch Ana's device identity. On another device the
    // room link exposes the trusted roster, and Bea can simply claim herself.
    const second = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const bea = await second.newPage()
    await bea.goto(url)
    await expect(bea.getByTestId('join-gate')).toBeVisible({ timeout: 15_000 })
    await bea.locator('[data-testid="claim-member"][data-member="Bea"]').click()
    await expect(bea.getByTestId('join-gate')).toHaveCount(0, { timeout: 15_000 })
    await expectBalance(bea, 'Bea', '3000')

    const slug = new URL(url).pathname.split('/').filter(Boolean).at(-1)
    const storedIdentity = await bea.evaluate((key) => {
        const raw = window.localStorage.getItem(key)
        return raw ? JSON.parse(raw) : null
    }, `ps:member:${slug}`)
    expect(storedIdentity).toMatchObject({ name: 'Bea' })
    expect(storedIdentity.token).toEqual(expect.any(String))
    expect(storedIdentity.token.length).toBeGreaterThan(20)

    // The claimed token is functional, not merely persisted: the social write
    // that requires member proof is now enabled and reaches the real API.
    const beaExpense = bea.locator('[data-testid="expense-row"][data-description="Dinner Bea covered"]').locator('..')
    await expect(beaExpense.getByTestId('reaction-add')).toBeEnabled()
    await beaExpense.getByTestId('reaction-add').click()
    await beaExpense.getByTestId('reaction-option').first().click()
    await expect(beaExpense.getByTestId('reaction-pill')).toHaveCount(1, { timeout: 15_000 })
    await second.close()
})

test('an unknown slug says so instead of spinning', async ({ page }) => {
    await page.goto('/r/definitely-not-a-room-zzz999')
    await expect(page.getByTestId('room-not-found')).toBeVisible({ timeout: 15_000 })
})
