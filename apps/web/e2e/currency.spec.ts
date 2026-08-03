import { expect, type Page } from '@playwright/test'
import { test } from './fixtures'
import { COMMON_COUNT } from '../src/components/room/CurrencySelect'
import { enterCreatedRoom } from './helpers'

/**
 * The picker's three promises, end to end.
 *
 * 1. It opens on five rows and expands by typing, not by scrolling 162 of them.
 * 2. It never offers a currency the write would refuse. A room settling in an invented ticker
 *    converts nothing, so the only currency its expenses can be in is that same ticker — and the
 *    picker is where that is enforced, not a 400 after the amount has been typed.
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

test('an invented ticker can be a room currency, and then it is the only one', async ({ page }) => {
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

test('a room that settles in a real currency is never offered an invented one', async ({ page }) => {
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Ski trip')
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
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
    // The custom row is suppressed here: an invented code could never convert into a EUR room.
    await expect(page.getByTestId('currency-custom')).toHaveCount(0)
    await expect(page.getByRole('option')).toHaveCount(0)

    // CHANGED BY DESIGN: this used to assert that a EUR room offers CLP. It does not, and must not.
    // `SPLIT_FX_MODE=static` — which is how this suite runs — prices the twelve legacy codes and
    // nothing else, so there is no EUR↔CLP rate and the write would come back 400 NO_RATE. The
    // picker filtering CLP out is SPEC D2 working; the old assertion described the build in which
    // the client never fetched `/api/currencies` and believed all 158 catalog codes were rated.
    await search.fill('chilean')
    await expect(page.getByRole('option')).toHaveCount(0)

    // Typing still expands past the five — the catalog is there, it is just filtered to what this
    // room can actually price. CHF is priceable and is not one of the five this room opens on.
    await search.fill('swiss')
    await expect(page.getByRole('option', { name: 'CHF', exact: true })).toBeVisible()
    expect(await clippedRows(page)).toEqual([])
})
