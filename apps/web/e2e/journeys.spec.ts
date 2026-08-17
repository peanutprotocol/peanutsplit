import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { test } from './fixtures'
import { balanceCard, expectBalance, openCurrentRoomSettings } from './helpers'
import { slideToConfirm } from './slide-to-confirm'

/**
 * The journeys a real group hits that the rest of the suite does not already state.
 *
 * Rooms are seeded through the API rather than driven through the creation screens: those screens
 * have their own specs, and a journey that has to click its way to a two-person room with history
 * spends most of its runtime re-proving them. `seedRoom` returns the identity, which is written
 * into the device the same way the app writes it, so the page opens as a known member with no join
 * gate in the way.
 */

interface Seeded {
    slug: string
    ana: string
    bea: string
    token: string
}

const seedRoom = async (request: APIRequestContext, label: string, currency = 'EUR'): Promise<Seeded> => {
    const created = await request.post('/api/rooms', {
        data: { name: `${label} ${Date.now()}`, currency, creatorName: 'Ana' },
    })
    expect(created.status()).toBe(201)
    const room = (await created.json()) as { room: { slug: string }; memberId: string; memberToken: string }

    const member = await request.post(`/api/rooms/${room.room.slug}/members`, {
        data: { name: 'Bea', intent: 'add' },
    })
    expect(member.status()).toBe(201)
    const bea = (await member.json()) as { memberId: string }

    return { slug: room.room.slug, ana: room.memberId, bea: bea.memberId, token: room.memberToken }
}

/** One EQUAL expense Bea paid for, so Ana owes exactly half of it. */
const seedExpense = async (
    request: APIRequestContext,
    room: Seeded,
    description: string,
    amountMinor: string,
    currency = 'EUR'
) => {
    const response = await request.post(`/api/rooms/${room.slug}/expenses`, {
        headers: { 'x-member-token': room.token },
        data: {
            description,
            amountMinor,
            currency,
            paidById: room.bea,
            splitMode: 'EQUAL',
            participantIds: [room.ana, room.bea],
        },
    })
    expect(response.status()).toBe(201)
}

/** Open the room as Ana, on a device that already holds her proven identity. */
const openAsAna = async (page: Page, room: Seeded) => {
    await page.addInitScript(
        ({ slug, memberId, token }) =>
            window.localStorage.setItem(`ps:member:${slug}`, JSON.stringify({ memberId, name: 'Ana', token })),
        { slug: room.slug, memberId: room.ana, token: room.token }
    )
    await page.goto(`/r/${room.slug}`)
    await expect(page.getByTestId('open-room-switcher')).toBeVisible({ timeout: 15_000 })
}

test('a settlement for less than the suggested amount leaves the rest owing, and removing it restores the debt', async ({
    page,
    request,
}) => {
    const room = await seedRoom(request, 'Partial payback')
    await seedExpense(request, room, 'Dinner', '6000')
    await openAsAna(page, room)

    // Bea fronted 60 and they split it, so Ana owes 30 — stated on Bea's card as +3000.
    await expectBalance(page, 'Bea', '3000')

    await page.getByTestId('open-settle').click()
    const transfer = page.getByTestId('transfer-row')
    await expect(transfer).toContainText('€30.00')
    await transfer.click()

    // The suggestion is a default, not a commitment: paying part of it is the ordinary case of
    // somebody sending what they have on them.
    await expect(page.getByTestId('settle-amount')).toHaveValue('30.00')
    await page.getByTestId('settle-amount').fill('10')
    await page.getByTestId('method-cash').click()
    await page.getByTestId('record-settlement').click()

    // 30 owed less 10 paid. The room is NOT settled, which is the whole point of a partial.
    await expectBalance(page, 'Bea', '2000')
    await expect(page.locator('main [data-testid="all-settled"]')).toHaveCount(0)

    const payment = page.getByTestId('settlement-row')
    await expect(payment).toContainText('recorded by you')
    await expect(payment).toContainText('€10.00')

    // The suggestion re-prices itself against what is actually left.
    await page.getByTestId('open-settle').click()
    await expect(page.getByTestId('transfer-row')).toContainText('€20.00')
    // The drawer has no close button of its own; Escape is the way out it offers.
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('transfer-row')).toHaveCount(0)

    // Removing the record puts the whole debt back, without a refresh.
    await payment.getByTestId('remove-settlement').click()
    await slideToConfirm(page, payment.getByTestId('confirm-remove-settlement'))
    await expect(page.getByTestId('settlement-row')).toHaveCount(0)
    await expectBalance(page, 'Bea', '3000')
})

test('the exported CSV reconciles with the balances the room is showing', async ({ page, request }) => {
    const room = await seedRoom(request, 'Export truth')
    await seedExpense(request, room, 'Dinner', '6000')
    await seedExpense(request, room, 'Taxi', '2000')
    await openAsAna(page, room)

    // Bea fronted 80 across two expenses and they split both, so Ana owes 40.
    await expectBalance(page, 'Bea', '4000')
    const onScreen = await balanceCard(page, 'Bea').getAttribute('data-net')

    await openCurrentRoomSettings(page)
    await page.getByTestId('export-row').click()
    const exportSheet = page.getByTestId('export-sheet')
    await expect(exportSheet).toBeVisible()

    const downloaded = page.waitForEvent('download')
    await exportSheet.getByRole('button', { name: 'Download CSV' }).click()
    const csvPath = await (await downloaded).path()
    expect(csvPath).not.toBeNull()
    const csv = await readFile(csvPath!, 'utf8')

    // The test's own data carries no commas or quotes, so the export's quoting rules never fire
    // and a split is a faithful read of it.
    const rows = csv
        .trim()
        .split('\n')
        .map((line) => line.split(','))
    const headers = rows[0]!
    const column = (row: string[], name: string) => row[headers.indexOf(name)] ?? ''
    const ofType = (type: string) => rows.slice(1).filter((row) => column(row, 'record_type') === type)

    const names = new Map(ofType('member').map((row) => [column(row, 'id'), column(row, 'name_or_description')]))
    expect([...names.values()].sort()).toEqual(['Ana', 'Bea'])

    const balances = ofType('balance')
    expect(balances).toHaveLength(2)
    const byName = new Map(balances.map((row) => [names.get(column(row, 'member_id')), column(row, 'amount_minor')]))

    // The file states the same number the card does, and the pair still sums to zero — the
    // invariant that makes a ledger a ledger.
    expect(byName.get('Bea')).toBe(onScreen)
    expect(byName.get('Bea')).toBe('4000')
    expect(byName.get('Ana')).toBe('-4000')
    expect(BigInt(byName.get('Ana')!) + BigInt(byName.get('Bea')!)).toBe(0n)

    // Every expense came across with the amount the balances were folded from.
    const expenseAmounts = ofType('expense')
        .map((row) => column(row, 'base_amount_minor'))
        .sort()
    expect(expenseAmounts).toEqual(['2000', '6000'])
})

test('a zero-decimal room states whole yen rather than dividing by a hundred', async ({ page, request }) => {
    const room = await seedRoom(request, 'Tokyo trip', 'JPY')
    // ¥6,000 in a currency with no minor unit: the minor amount IS the yen count.
    await seedExpense(request, room, 'Ramen', '6000', 'JPY')
    await openAsAna(page, room)

    // Half of ¥6,000 is ¥3,000, and JPY has no cents to lose.
    await expectBalance(page, 'Bea', '3000')
    await expect(balanceCard(page, 'Bea')).toContainText('¥3,000')
    await expect(balanceCard(page, 'Bea')).not.toContainText('¥30.00')

    await expect(page.locator('[data-testid="expense-row"][data-description="Ramen"]')).toContainText('¥6,000')

    await page.getByTestId('open-settle').click()
    await expect(page.getByTestId('transfer-row')).toContainText('¥3,000')
})

test('a character picked on one device reaches the other without a reload', async ({ page, request, newDevice }) => {
    const room = await seedRoom(request, 'Character crew')
    await openAsAna(page, room)

    // Bea is watching the room the whole time — the point is that she never asks for the update.
    const bea = await newDevice()
    await bea.addInitScript(
        ({ slug, memberId }) =>
            window.localStorage.setItem(`ps:member:${slug}`, JSON.stringify({ memberId, name: 'Bea', token: '' })),
        { slug: room.slug, memberId: room.bea }
    )
    await bea.goto(`/r/${room.slug}`)
    await openCurrentRoomSettings(bea)
    await expect(bea.getByTestId('people-list')).toBeVisible({ timeout: 15_000 })
    const anaRow = bea.locator('[data-testid="person-row"][data-member="Ana"]')
    const before = (await anaRow.innerText()).trim()

    // Ana picks a character that is not the one she was dealt.
    await openCurrentRoomSettings(page)
    const anaSettings = page.getByTestId('settings-sheet')
    await expect(anaSettings).toBeVisible()
    const peopleToggle = anaSettings.getByTestId('people-toggle')
    if ((await peopleToggle.getAttribute('aria-expanded')) === 'false') await peopleToggle.click()
    await anaSettings.locator('[data-testid="person-row"][data-member="Ana"]').click()
    await expect(page.getByTestId('character-sheet')).toBeVisible()
    const options = page.getByTestId('avatar-option')
    const unchosen = options.filter({ hasNot: page.locator('[aria-checked="true"]') })
    const pick = unchosen.nth(0)
    const pickedLabel = (await pick.getByTestId('avatar-option-title').innerText()).trim()
    await pick.click()

    // Bea's open sheet renames the row to Ana's new character. Same 6s live budget realtime.spec
    // uses, for the same reason: the 8s fallback poll must not be able to pass this on its own.
    await expect(anaRow).toContainText(pickedLabel, { timeout: 6_000 })
    expect(anaRow).not.toBe(before)
})

test('a theme chosen on one device repaints the other without a reload', async ({ page, request, newDevice }) => {
    const room = await seedRoom(request, 'Repaint')
    await openAsAna(page, room)

    const bea = await newDevice()
    await bea.goto(`/r/${room.slug}`)
    await bea.getByTestId('im-new').click()
    await bea.getByTestId('join-name').fill('Cleo')
    await bea.getByTestId('join-room').click()
    await expect(bea.getByTestId('join-gate')).toHaveCount(0, { timeout: 15_000 })

    const painted = bea.locator('[data-theme]').first()
    await expect(painted).toHaveAttribute('data-theme', 'classic')

    await openCurrentRoomSettings(page)
    await expect(page.getByTestId('settings-sheet')).toBeVisible({ timeout: 10_000 })
    const swatch = page.locator('[data-testid="theme-swatch"]').nth(2)
    const key = await swatch.getAttribute('data-theme')
    expect(key).toBeTruthy()
    await swatch.click()
    await expect(swatch).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 })

    // The theme is room state on the server, not a device preference, so the other phone repaints.
    await expect(painted).toHaveAttribute('data-theme', key!, { timeout: 6_000 })
})

test('the locale cookie puts the room into Spanish', async ({ page, context, request, baseURL }) => {
    const room = await seedRoom(request, 'Sala')
    await seedExpense(request, room, 'Cena', '6000')

    // The cookie is what the SERVER reads, so it has to be there before the first request — which
    // means seeding it against the base URL rather than the page, which has not navigated yet.
    await context.addCookies([{ name: 'ps-locale', value: 'es-419', url: baseURL! }])
    await openAsAna(page, room)

    // One string per surface rather than a full catalogue diff — the key-parity audit already
    // owns completeness; this states that the room actually resolves the cookie.
    await expect(page.getByRole('heading', { name: 'Saldos' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('open-settle')).toContainText('Saldar cuentas')
    await expect(page.getByTestId('open-add-expense')).toContainText('Agregar gasto')

    await page.getByTestId('open-settle').click()
    await expect(page.getByTestId('transfer-row')).toBeVisible()
    // Money stays in the room's currency and is formatted BY the chosen locale. Latin American
    // Spanish is not European Spanish, so the separator is a dot — asserting "30,00" here would
    // be asserting the wrong Spanish. The symbol, not the ISO code, is what `narrowSymbol` buys:
    // Spanish resolves plain `currencyDisplay: 'symbol'` to "EUR 30.00", which `money.ts` fixes.
    await expect(page.getByTestId('transfer-row')).toContainText('€30.00')
})
