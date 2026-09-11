import { expect, type Page } from '@playwright/test'
import { test } from './fixtures'
import { COMMON_COUNT } from '../src/components/room/CurrencySelect'
import { enterCreatedRoom, expectBalance } from './helpers'

/**
 * The picker's three promises, end to end.
 *
 * 1. It opens on five rows and expands by typing, not by scrolling 162 of them.
 * 2. A market currency can accept an invented expense ticker only through an explicit manual
 *    rate. The field, preview and frozen edit value all agree on direction.
 * 3. Every row it does show is whole. The search field and the footer sit outside the scroller and
 *    neither shrinks, so a height budget that forgets one of them takes the difference out of the
 *    rows — which is how the invent-a-ticker row, the whole point of the feature, came to render
 *    as an 8px sliver.
 */

// Room creation, a redirect, and a dev server compiling each route on first hit.
test.setTimeout(120_000)

/** The rows the open menu is cutting off. Empty is the only acceptable answer whenever the menu is
 *  not already at the viewport's edge. */
const clippedRows = (page: Page) =>
    page.evaluate(() => {
        const list = document.querySelector('[data-currency-menu] [role="listbox"]')
        if (!list) return ['no menu']
        const box = list.getBoundingClientRect()
        return [...list.querySelectorAll('[role="option"]')]
            .filter((row) => {
                const rect = row.getBoundingClientRect()
                return rect.top < box.top - 0.5 || rect.bottom > box.bottom + 0.5
            })
            .map((row) => row.id.split('-options-')[1])
    })

test('an invented ticker can be a room currency and remains its only automatic option', async ({ page }) => {
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Beer fund')

    const roomCurrency = page.getByRole('button', { name: /Room currency,/ })
    await roomCurrency.click()
    // Five rows and one way to reach the rest. No scroll wall.
    await expect(page.getByRole('option')).toHaveCount(COMMON_COUNT)
    await expect(page.getByTestId('room-currency-all')).toBeVisible()
    // All five, not the three that fitted once the field and the footer had taken their share.
    expect(await clippedRows(page)).toEqual([])

    await page.getByTestId('room-currency-search').fill('BEER')
    const customRow = page.getByTestId('currency-custom')
    await expect(customRow).toBeVisible()
    // Nothing real is called BEER, so the offer to make it a currency is the only row.
    await expect(page.getByRole('option')).toHaveCount(1)
    // It is a two-line row and it is the row the reader has to be able to read.
    expect(await clippedRows(page)).toEqual([])
    await customRow.click()

    await expect(page.getByTestId('room-currency')).toHaveValue('BEER')
    // The create form says what the choice costs, at the pick rather than as a warning later.
    await expect(page.getByTestId('room-currency-hint')).toContainText('BEER')

    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await enterCreatedRoom(page)

    await page.getByTestId('open-add-expense').click()
    await page.getByRole('button', { name: /Expense currency, BEER/ }).click()
    await expect(page.getByRole('option')).toHaveCount(1)
    await expect(page.getByRole('option', { name: 'BEER', exact: true })).toBeVisible()
    // The one row this room can offer, whole, with the reason underneath it.
    expect(await clippedRows(page)).toEqual([])
    // EUR has a rate and BEER has none, so there is no rate between them and the row is not there
    // to be picked.
    await page.getByTestId('expense-currency-search').fill('EUR')
    await expect(page.getByRole('option')).toHaveCount(0)
})

test('a real-currency room can price an invented expense with a frozen manual rate', async ({ page }) => {
    const customRateProbes: string[] = []
    const expenseWrites: string[] = []
    page.on('request', (request) => {
        if (request.url().includes('/api/rate?') && request.url().includes('from=BEER')) {
            customRateProbes.push(request.url())
        }
        if (request.method() === 'POST' && /\/api\/rooms\/[^/]+\/expenses$/.test(new URL(request.url()).pathname)) {
            expenseWrites.push(request.url())
        }
    })

    await page.goto('/new')
    await page.getByTestId('room-name').fill('Ski trip')
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('room-person-name').first().fill('Bea')
    await page.getByTestId('create-room').click()
    await enterCreatedRoom(page)

    await page.getByTestId('open-add-expense').click()
    await page.getByRole('button', { name: /Expense currency, EUR/ }).click()

    // The menu is portalled out of the sheet so it can escape the sheet's scroll viewport, which
    // puts it outside the drawer's focus trap. Without the release in `CurrencySelect` the trap
    // pulls focus back to the trigger and every `fill` below is a silent no-op.
    const search = page.getByTestId('expense-currency-search')
    await search.click()
    await expect(search).toBeFocused()

    await search.fill('BEER')
    await expect(search).toHaveValue('BEER')
    const custom = page.getByTestId('currency-custom')
    await expect(custom).toContainText('Set what 1 BEER is worth in EUR')
    await custom.click()

    const rate = page.getByTestId('expense-manual-fx-rate')
    await expect(rate).toBeVisible()
    await expect(rate).toHaveAccessibleName('Value of 1 BEER in EUR')
    await expect(page.getByTestId('expense-foreign-note')).not.toContainText('indicative')
    await page.getByTestId('expense-amount').fill('4')
    await page.getByTestId('expense-description').fill('First round')

    // The write is refused locally while the equation is incomplete.
    await page.getByTestId('save-expense').click()
    await expect(rate).toBeFocused()
    await expect(page.locator('#expense-manual-rate-error')).toContainText('Enter how much 1 BEER is worth in EUR')
    expect(expenseWrites).toEqual([])

    // Positive inputs can still be outside the ledger: this pair rounds below one EUR cent, while
    // the next pair converts beyond signed BIGINT. Both stop before mutation/offline enqueue.
    await rate.fill('0.000000000001')
    await page.getByTestId('save-expense').click()
    await expect(page.locator('#expense-manual-rate-error')).toContainText('rounds this expense to zero in EUR')
    expect(expenseWrites).toEqual([])

    await page.getByTestId('expense-amount').fill('92233720368547758.07')
    await rate.fill('2')
    await page.getByTestId('save-expense').click()
    await expect(page.locator('#expense-manual-rate-error')).toContainText('too large for the ledger')
    expect(expenseWrites).toEqual([])

    await page.getByTestId('expense-amount').fill('4')
    await rate.fill('0.5')
    await expect(page.getByTestId('expense-foreign-preview')).toContainText('= €2.00')
    await expect(page.getByTestId('expense-foreign-preview')).not.toContainText('≈')

    // A manual rate belongs to this exact pair. Leaving BEER clears it; returning before any BEER
    // history exists starts blank instead of reviving stale text.
    await page.getByRole('button', { name: /Expense currency, BEER/ }).click()
    await page.getByRole('option', { name: 'EUR', exact: true }).click()
    await expect(page.getByTestId('expense-manual-fx-rate')).toHaveCount(0)
    await page.getByRole('button', { name: /Expense currency, EUR/ }).click()
    await page.getByTestId('expense-currency-search').fill('BEER')
    await page.getByTestId('currency-custom').click()
    await expect(rate).toHaveValue('')
    await rate.fill('0.5')
    await page.getByTestId('save-expense').click()
    await expect(page.getByTestId('skip-post-aha-share')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('skip-post-aha-share').click()
    await expect(page.locator('[data-testid="expense-row"][data-description="First round"]')).toContainText('4.00 BEER')
    await expect(page.getByTestId('expense-saved-fx-rate')).toHaveText('Saved here · 1 BEER = 0.5 EUR')
    await expectBalance(page, 'Bea', '-100')

    // Editing starts from this expense's own frozen rate. Changing it explicitly reprices the room
    // amount; a different expense never inherits that agreement implicitly.
    await page.locator('[data-testid="expense-row"][data-description="First round"]').click()
    await expect(rate).toHaveValue('0.5')
    await expect(page.locator('#expense-manual-rate-hint')).toContainText(
        'Saved only for this expense: 1 BEER = 0.5 EUR'
    )
    await rate.fill('0.75')
    await expect(page.getByTestId('expense-foreign-preview')).toContainText('= €3.00')
    await page.getByTestId('save-expense').click()
    await expectBalance(page, 'Bea', '-150')

    await page.getByTestId('open-add-expense').click()
    await expect(page.getByRole('button', { name: /Expense currency, BEER/ })).toBeVisible()
    await expect(rate).toHaveValue('')
    expect(customRateProbes).toEqual([])

    // Catalog currencies with no configured market rate remain unavailable; the manual escape
    // hatch is intentionally for invented tickers, not an override for real-currency pricing.
    await page.getByRole('button', { name: /Expense currency, BEER/ }).click()
    await page.getByTestId('expense-currency-search').fill('chilean')
    await expect(page.getByRole('option')).toHaveCount(0)

    await page.getByTestId('expense-currency-search').fill('swiss')
    await expect(page.getByRole('option', { name: 'CHF', exact: true })).toBeVisible()
    expect(await clippedRows(page)).toEqual([])
})

test('expense currency remembers only this device’s saved choices in this room', async ({ page, newDevice }) => {
    const createRoom = async (currency: string) => {
        await page.goto('/new')
        await page.getByTestId('room-name').fill('Currency preferences QA')
        await page.getByTestId('room-currency').selectOption(currency)
        await page.getByTestId('creator-name').fill('Ana')
        await page.getByTestId('room-person-name').first().fill('Bea')
        await page.getByTestId('create-room').click()
        return enterCreatedRoom(page)
    }
    const expectMenu = async (device: Page, selected: string, codes: string[]) => {
        await expect(device.getByTestId('expense-currency')).toHaveValue(selected)
        await device.getByRole('button', { name: `Expense currency, ${selected}`, exact: true }).click()
        await expect(device.getByRole('option')).toHaveCount(codes.length)
        for (const [index, code] of codes.entries()) {
            await expect(device.getByRole('option').nth(index)).toHaveAccessibleName(code)
        }
        await device.keyboard.press('Escape')
    }
    const choose = async (code: string) => {
        await page.getByRole('button', { name: /Expense currency,/ }).click()
        await page.getByTestId('expense-currency-search').fill(code)
        await page.getByRole('option', { name: code, exact: true }).click()
    }
    const save = async (code: string, description: string, first = false) => {
        await choose(code)
        await page.getByTestId('expense-amount').fill('10')
        await page.getByTestId('expense-description').fill(description)
        await page.getByTestId('save-expense').click()
        if (first) {
            await expect(page.getByTestId('skip-post-aha-share')).toBeVisible({ timeout: 15_000 })
            await page.getByTestId('skip-post-aha-share').click()
        }
        await expect(page.getByTestId('close-expense')).toHaveCount(0)
        await expect(page.locator(`[data-testid="expense-row"][data-description="${description}"]`)).toBeVisible()
    }

    const roomUrl = await createRoom('GBP')
    await page.getByTestId('open-add-expense').click()
    await expectMenu(page, 'GBP', ['GBP', 'USD', 'EUR'])
    await choose('EUR')
    await page.getByTestId('close-expense').click()
    await page.getByTestId('open-add-expense').click()
    await expectMenu(page, 'GBP', ['GBP', 'USD', 'EUR'])
    await save('EUR', 'Euro expense', true)
    await page.getByTestId('open-add-expense').click()
    await expectMenu(page, 'EUR', ['EUR', 'GBP', 'USD'])
    await save('USD', 'Dollar expense')
    await page.reload()
    await page.getByTestId('open-add-expense').click()
    await expectMenu(page, 'USD', ['USD', 'EUR', 'GBP'])

    // A rejected server write must not turn a draft choice into a preference.
    await choose('CHF')
    await page.getByTestId('expense-amount').fill('10')
    await page.getByTestId('expense-description').fill('Rejected expense')
    await page.route('**/api/rooms/*/expenses', (route) =>
        route.request().method() === 'POST'
            ? route.fulfill({
                  status: 400,
                  contentType: 'application/json',
                  body: JSON.stringify({ error: 'QA rejected save' }),
              })
            : route.continue()
    )
    const rejected = page.waitForResponse(
        (response) => response.status() === 400 && response.url().endsWith('/expenses')
    )
    await page.getByTestId('save-expense').click()
    await rejected
    await page.getByTestId('close-expense').click()
    await page.unroute('**/api/rooms/*/expenses')
    await page.getByTestId('open-add-expense').click()
    await expectMenu(page, 'USD', ['USD', 'EUR', 'GBP'])
    await page.getByTestId('close-expense').click()

    // Editing has its own saved currency even when the next new expense defaults to USD.
    await page.locator('[data-testid="expense-row"][data-description="Euro expense"]').click()
    await expect(page.getByTestId('expense-currency')).toHaveValue('EUR')
    await page.getByTestId('close-expense').click()

    const other = await newDevice()
    await other.goto(roomUrl)
    await other.locator('[data-testid="claim-member"][data-member="Bea"]').click()
    await expect(other.getByTestId('join-gate')).toHaveCount(0)
    await other.getByTestId('open-add-expense').click()
    await expectMenu(other, 'GBP', ['GBP', 'USD', 'EUR'])

    await createRoom('CHF')
    await page.getByTestId('open-add-expense').click()
    await expectMenu(page, 'CHF', ['CHF', 'USD', 'EUR'])
    await page.goto(roomUrl)
    await page.getByTestId('open-add-expense').click()
    await expectMenu(page, 'USD', ['USD', 'EUR', 'GBP'])
})
