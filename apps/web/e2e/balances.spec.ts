import { expect, test, type Page } from '@playwright/test'
import { enterCreatedRoom } from './helpers'

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

/**
 * `data-member` names the member the card is ABOUT. In a room of one or three-plus that is one
 * card per person. In a two-person room the strip collapses to a single sentence card about the
 * OTHER person, so the viewer's own net is read off the counterparty's card, negated.
 */
const balance = (page: Page, member: string) => page.locator(`[data-testid="balance-card"][data-member="${member}"]`)

const expectBalance = async (page: Page, member: string, netMinor: string) =>
    expect(balance(page, member)).toHaveAttribute('data-net', netMinor, { timeout: 15_000 })

test('a balance shows its own working, and the working adds up', async ({ page, browser }) => {
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Audit trip')
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()

    const url = await enterCreatedRoom(page)
    await expectBalance(page, 'Ana', '0')
    // One member is one card per person, so nothing is claiming to be the pair shape yet.
    await expect(page.locator('[data-testid="balance-card"][data-pair]')).toHaveCount(0)

    // A second device, so there is a debt to derive.
    const second = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const bea = await second.newPage()
    await bea.goto(url)
    await bea.getByTestId('im-new').click()
    await bea.getByTestId('join-name').fill('Bea')
    await bea.getByTestId('join-room').click()
    // Two people now, so Bea's device shows the one card about Ana.
    await expectBalance(bea, 'Ana', '0')
    // One fact, one card — the whole point of the pair shape. The join is a POST from a second
    // context and the room route is compiled on first hit, so the strip can still be showing the
    // one-member shape here. Same 15s every other assertion in this file waits.
    await expect(bea.locator('[data-testid="balance-card"]')).toHaveCount(1, { timeout: 15_000 })
    await expect(bea.locator('[data-testid="balance-card"][data-pair="true"]')).toHaveCount(1, { timeout: 15_000 })

    // Ana fronts €60, split equally: +6000 paid, −3000 her share, +3000 net.
    await page.reload()
    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill('60')
    await page.getByTestId('expense-description').fill('Dinner')
    await page.getByTestId('expense-payer-summary').click()
    await page.locator('[data-testid="payer-chip"][data-member="Ana"]').click()
    await page.getByTestId('save-expense').click()
    await expect(page.getByTestId('skip-post-aha-share')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('skip-post-aha-share').click()
    // Ana's own +3000, stated as Bea's −3000 on the single pair card.
    await expectBalance(page, 'Bea', '-3000')
    await expect(balance(page, 'Bea')).toHaveAttribute('data-balance-direction', 'incoming')
    await expect(balance(page, 'Bea')).toContainText('Bea owes you')
    await expect(balance(page, 'Bea')).toHaveCSS('background-color', 'rgb(239, 250, 242)')
    await expect(balance(page, 'Bea').getByTestId('open-balance')).toHaveAccessibleName(
        /Bea owes you.*€30\.00.*See how Bea’s balance adds up/
    )

    // The same debt must read in the opposite direction on Bea's device. The arrow, sentence
    // and stable state attribute all agree; none of the meaning depends on the red band alone.
    await expectBalance(bea, 'Ana', '3000')
    await expect(balance(bea, 'Ana')).toHaveAttribute('data-balance-direction', 'outgoing')
    await expect(balance(bea, 'Ana')).toContainText('You owe Ana')
    await expect(balance(bea, 'Ana')).toHaveCSS('background-color', 'rgb(255, 242, 238)')
    await expect(balance(bea, 'Ana').getByTestId('open-balance')).toHaveAccessibleName(
        /You owe Ana.*€30\.00.*See how Ana’s balance adds up/
    )

    // ── The sheet ─────────────────────────────────────────────────────────
    // The card is about Bea in every part of it, so the tap opens Bea's working.
    await balance(page, 'Bea').click()
    const drawer = page.getByTestId('balance-drawer')
    await expect(drawer).toBeVisible()
    // The URL carries it, so the sheet survives a refresh and back closes it.
    await expect(page).toHaveURL(/[?&]balance=/)

    // Bea fronted nothing, so her balance is one line: her half of Ana's €60.
    await expect(drawer.locator('[data-testid="derivation-line"]')).toHaveCount(1)
    await expect(drawer.locator('[data-testid="derivation-line"][data-kind="share"]')).toHaveAttribute(
        'data-amount',
        '-3000'
    )
    // THE assertion: the client's own sum of the lines equals the server's balance.
    await expect(drawer.getByTestId('derivation-total').first()).toHaveAttribute('data-total', '-3000')

    // The pair view is two complete sheets, never an invented pairwise debt. Ana's side is
    // the €60 she put in less her own half, and it is the exact negation of Bea's.
    await drawer.getByTestId('toggle-other-balance').first().click()
    const otherSheet = drawer.getByTestId('derivation-transfer')
    await expect(otherSheet.locator('[data-testid="derivation-line"][data-kind="paid"]')).toHaveAttribute(
        'data-amount',
        '6000'
    )
    await expect(otherSheet.locator('[data-testid="derivation-line"][data-kind="share"]')).toHaveAttribute(
        'data-amount',
        '-3000'
    )
    await expect(drawer.locator('[data-testid="derivation-total"]').nth(1)).toHaveAttribute('data-total', '3000')

    await page.goBack()
    await expect(page.getByTestId('balance-drawer')).toHaveCount(0)

    // ── A settlement joins the derivation ─────────────────────────────────
    await page.getByTestId('open-settle').click()
    await page.getByTestId('transfer-row').click()
    await page.getByTestId('method-cash').click()
    await page.getByTestId('record-settlement').click()
    // Still two people, so still the one card about Bea — Ana's own zero read off her name.
    await expectBalance(page, 'Bea', '0')
    await expect(balance(page, 'Bea')).toHaveAttribute('data-balance-direction', 'neutral')

    await balance(page, 'Bea').click()
    // Bea is the payer, so the payment lands on her sheet as money handed over: +3000 against
    // the -3000 share above it. The same settlement, from the other end.
    await expect(drawer.locator('[data-testid="derivation-line"][data-kind="settlement-sent"]')).toHaveAttribute(
        'data-amount',
        '3000'
    )
    await expect(drawer.getByTestId('derivation-total').first()).toHaveAttribute('data-total', '0')

    await second.close()
})
