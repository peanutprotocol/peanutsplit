import { expect, test, type Page } from '@playwright/test'

/**
 * The auditable balance, end to end: a real room, real expenses, real settlement, and the
 * derivation sheet re-deriving the same number the server put on the card.
 *
 * The assertions are on raw minor units (`data-net`, `data-amount`, `data-total`), not on
 * rendered money, for the same reason the main journey is: a locale-formatted string caught
 * mid-animation proves nothing about the maths.
 */

// Two browser contexts, a room, three writes and a dev server compiling each route on first
// hit — comfortably past Playwright's 30s default, and nothing here is a performance
// assertion.
test.setTimeout(120_000)

const balance = (page: Page, member: string) => page.locator(`[data-testid="balance-card"][data-member="${member}"]`)

const expectBalance = async (page: Page, member: string, netMinor: string) =>
    expect(balance(page, member)).toHaveAttribute('data-net', netMinor, { timeout: 15_000 })

test('a balance shows its own working, and the working adds up', async ({ page, browser }) => {
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Audit trip')
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()

    const roomLink = page.getByTestId('room-link')
    await expect(roomLink).toBeVisible({ timeout: 15_000 })
    const url = (await roomLink.innerText()).trim()
    await page.getByTestId('go-to-room').click()
    await expectBalance(page, 'Ana', '0')

    // A second device, so there is a debt to derive.
    const second = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const bea = await second.newPage()
    await bea.goto(url)
    await bea.getByTestId('im-new').click()
    await bea.getByTestId('join-name').fill('Bea')
    await bea.getByTestId('join-room').click()
    await expectBalance(bea, 'Bea', '0')

    // Ana fronts €60, split equally: +6000 paid, −3000 her share, +3000 net.
    await page.reload()
    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill('60')
    await page.getByTestId('expense-description').fill('Dinner')
    await page.locator('[data-testid="payer-chip"][data-member="Ana"]').click()
    await page.getByTestId('save-expense').click()
    await expectBalance(page, 'Ana', '3000')

    // ── The sheet ─────────────────────────────────────────────────────────
    await balance(page, 'Ana').click()
    const drawer = page.getByTestId('balance-drawer')
    await expect(drawer).toBeVisible()
    // The URL carries it, so the sheet survives a refresh and back closes it.
    await expect(page).toHaveURL(/[?&]balance=/)

    await expect(drawer.locator('[data-testid="derivation-line"]')).toHaveCount(2)
    await expect(drawer.locator('[data-testid="derivation-line"][data-kind="paid"]')).toHaveAttribute(
        'data-amount',
        '6000'
    )
    await expect(drawer.locator('[data-testid="derivation-line"][data-kind="share"]')).toHaveAttribute(
        'data-amount',
        '-3000'
    )
    // THE assertion: the client's own sum of the lines equals the server's balance.
    await expect(drawer.getByTestId('derivation-total').first()).toHaveAttribute('data-total', '3000')

    // The pair view is two complete sheets, never an invented pairwise debt.
    await drawer.getByTestId('toggle-other-balance').first().click()
    await expect(drawer.locator('[data-testid="derivation-total"]').nth(1)).toHaveAttribute('data-total', '-3000')

    await page.goBack()
    await expect(page.getByTestId('balance-drawer')).toHaveCount(0)

    // ── A settlement joins the derivation ─────────────────────────────────
    await page.getByTestId('open-settle').click()
    await page.getByTestId('transfer-row').click()
    await page.getByTestId('method-cash').click()
    await page.getByTestId('record-settlement').click()
    await expectBalance(page, 'Ana', '0')

    await balance(page, 'Ana').click()
    await expect(drawer.locator('[data-testid="derivation-line"][data-kind="settlement-received"]')).toHaveAttribute(
        'data-amount',
        '-3000'
    )
    await expect(drawer.getByTestId('derivation-total').first()).toHaveAttribute('data-total', '0')

    await second.close()
})
