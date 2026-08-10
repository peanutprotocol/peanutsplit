import { expect } from '@playwright/test'
import { test } from './fixtures'
import { SIMPLE_GROUP } from '../src/lib/__fixtures__/splitwise'
import { SPLITPRO_ACCOUNT_EXPORT, SPLITPRO_FRIEND_CSV } from '../src/lib/__fixtures__/splitpro'
import { enterCreatedRoom, expectBalance, openCurrentRoomSettings } from './helpers'

/**
 * The switch, end to end: a real Splitwise export goes in through the real file input, and the
 * room that comes out is asserted against the balances the file itself states.
 *
 * `data-net` is raw minor units straight off the server, so this is backend truth and not a
 * NumberFlow frame caught mid-animation — the same discipline as the main journey.
 */
test('import a Splitwise export → a room whose balances match the file', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: async () => {},
        })
    })
    await page.goto('/import')

    await page.getByTestId('import-file').setInputFiles({
        name: 'Ski trip_2026-07-28.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(SIMPLE_GROUP, 'utf8'),
    })

    // ── The preview: nothing is written yet ───────────────────────────────
    const roomName = page.getByTestId('import-room-name')
    await expect(roomName).toBeVisible({ timeout: 15_000 })
    // The filename is the only name the export carries, and the date tail is dropped.
    await expect(roomName).toHaveValue('Ski trip')
    await expect(page.getByTestId('import-member-name')).toHaveCount(3)
    await expect(page.getByTestId('import-currency')).toHaveValue('EUR')

    // Nobody is picked to start with, so there is nothing to submit yet: the
    // creator's token goes to whoever this radio names, and guessing costs the
    // person who ran the import their own identity in the room.
    await expect(page.getByTestId('import-submit')).toBeDisabled()
    await page.locator('[data-testid="import-me"][data-member="Ana"]').check()
    await page.getByTestId('import-submit').click()

    // ── The link moment, exactly as a fresh room gets ─────────────────────
    const roomLink = page.getByTestId('room-link')
    await expect(roomLink).toBeVisible({ timeout: 20_000 })
    const roomUrl = (await roomLink.innerText()).trim()
    expect(roomUrl).toContain('/r/ski-trip-')

    // Imported rooms arrive with a durable shared balance, so this primary ready-screen share is
    // the second half of the creator's aha signal. It must count here instead of requiring another
    // share after entering the room.
    await page.getByTestId('share-link').click()
    const slug = new URL(roomUrl).pathname.split('/').at(-1)!
    await expect
        .poll(() =>
            page.evaluate((roomSlug) => {
                const raw = localStorage.getItem(`ps:pwa-room:${roomSlug}`)
                return raw ? JSON.parse(raw) : null
            }, slug)
        )
        .toMatchObject({ origin: 'created_here', qualifiedTrigger: 'balance_and_share' })

    await page.getByTestId('go-to-imported-room').click()

    // ── The proof: the file's own "Total balance" row ─────────────────────
    const balance = (member: string) => page.locator(`[data-testid="balance-card"][data-member="${member}"]`)
    await expect(balance('Ana')).toHaveAttribute('data-net', '1500', { timeout: 20_000 })
    await expect(balance('Bruno')).toHaveAttribute('data-net', '-1500')
    await expect(balance('Carla')).toHaveAttribute('data-net', '0')
    await expect(balance('Ana')).toHaveAttribute('data-balance-direction', 'incoming')
    await expect(balance('Bruno')).toHaveAttribute('data-balance-direction', 'outgoing')
    await expect(balance('Carla')).toHaveAttribute('data-balance-direction', 'neutral')

    // The history came across too, and each old expense explains its own effect
    // on Ana rather than borrowing the room's current aggregate direction.
    const expense = (description: string) =>
        page.locator(`[data-testid="expense-row"][data-description="${description}"]`)
    await expect(expense('Dinner')).toHaveAttribute('data-personal-impact', 'incoming')
    await expect(expense('Dinner')).toHaveAttribute('data-impact-minor', '4000')
    // The row states the direction in the short form it now uses. The long sentence this used to
    // read ("Others owe you from this expense") is gone from the component — its `personalImpact`
    // keys are still in all three message catalogues with nothing importing them.
    await expect(expense('Dinner')).toContainText('you lent')
    await expect(expense('Taxi')).toHaveAttribute('data-personal-impact', 'outgoing')
    await expect(expense('Taxi')).toHaveAttribute('data-impact-minor', '-1000')
    // The other half of the same copy change — see the note on the Dinner row above.
    await expect(expense('Taxi')).toContainText('you borrowed')
    await expect(expense('Groceries')).toHaveAttribute('data-personal-impact', 'outgoing')
    await expect(expense('Groceries')).toHaveAttribute('data-impact-minor', '-1500')

    // The importer never sees a join gate — the token came back with the room.
    await expect(page.getByTestId('join-gate')).toHaveCount(0)
})

test('import into an existing room appends in place and an exact retry is a no-op', async ({ page }) => {
    test.setTimeout(60_000)

    // Start with a real populated target. Its existing row is the sentinel that
    // append-import must preserve. Bea deliberately does not match source-person
    // Bruno, so this journey also exercises an explicit select remapping.
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Existing import target')
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await expect(page.getByTestId('roster-checkpoint')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('checkpoint-name').fill('Bea')
    await page.getByTestId('checkpoint-add').click()
    await expect(page.locator('[data-testid="checkpoint-member"][data-member="Bea"]')).toBeVisible()
    const roomUrl = await enterCreatedRoom(page)
    const roomPath = new URL(roomUrl).pathname

    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill('10')
    await page.getByTestId('expense-description').fill('Already here')
    await page.getByTestId('save-expense').click()
    await expect(page.getByRole('dialog', { name: 'First split done' })).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('skip-post-aha-share').click()
    await expect(page.locator('[data-testid="expense-row"][data-description="Already here"]')).toBeVisible({
        timeout: 15_000,
    })

    await openCurrentRoomSettings(page)
    await page.getByTestId('export-row').click()
    await page.getByTestId('open-splitwise-import').click()
    await page.waitForURL(`${roomPath}/import`)
    await expect(page.getByTestId('import-target-room')).toContainText('Existing import target')
    await expect(page.getByTestId('import-target-currency')).toHaveText('EUR')
    await expect(page.getByTestId('import-repeat-warning')).toContainText('A changed export is added in full')

    await page.getByTestId('import-file').setInputFiles({
        name: 'Existing group.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(SIMPLE_GROUP, 'utf8'),
    })
    await expect(page.getByTestId('import-member-mapping')).toHaveCount(3, { timeout: 15_000 })
    await expect(page.getByTestId('import-fixed-currency')).toContainText('EUR')

    const memberTarget = (name: string) => page.locator(`[data-testid="import-member-target"][data-member="${name}"]`)
    await expect(memberTarget('Ana').locator('option:checked')).toHaveText('Ana')
    await expect(memberTarget('Bruno')).toHaveValue('__new_room_member__')
    await memberTarget('Bruno').selectOption({ label: 'Bea' })
    await expect(memberTarget('Bruno').locator('option:checked')).toHaveText('Bea')
    await expect(page.locator('[data-testid="import-new-member-name"][data-member="Bruno"]')).toHaveCount(0)
    await expect(memberTarget('Carla')).toHaveValue('__new_room_member__')
    await expect(page.locator('[data-testid="import-new-member-name"][data-member="Carla"]')).toHaveValue('Carla')
    await expect(page.getByTestId('import-submit')).toBeEnabled()
    await page.getByTestId('import-submit').click()

    const appended = page.getByTestId('import-existing-success')
    await expect(appended).toHaveAttribute('data-already-imported', 'false', { timeout: 20_000 })
    await expect(page.getByTestId('imported-at')).toContainText('3 expenses and 1 new person were added at')
    await expect(page.getByTestId('room-link')).toHaveCount(0)
    await expect(page.getByTestId('join-gate')).toHaveCount(0)
    await page.getByTestId('go-to-imported-room').click()
    await page.waitForURL(roomPath)

    await expect(page.getByTestId('expense-row')).toHaveCount(4, { timeout: 20_000 })
    for (const description of ['Already here', 'Dinner', 'Taxi', 'Groceries']) {
        await expect(page.locator(`[data-testid="expense-row"][data-description="${description}"]`)).toBeVisible()
    }
    await expectBalance(page, 'Ana', '2000')
    await expectBalance(page, 'Bea', '-2000')
    await expectBalance(page, 'Carla', '0')
    await expect(page.locator('[data-testid="balance-card"][data-member="Bruno"]')).toHaveCount(0)

    // The second preview maps Carla to the member created by the first append,
    // while Bruno again defaults to a proposed new person. Submitting that
    // changed target mapping still has to replay before creating Bruno.
    await page.goto(`${roomPath}/import`)
    await page.getByTestId('import-file').setInputFiles({
        name: 'Existing group retry.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(SIMPLE_GROUP, 'utf8'),
    })
    await expect(page.getByTestId('import-member-mapping')).toHaveCount(3, { timeout: 15_000 })
    await expect(memberTarget('Carla').locator('option:checked')).toHaveText('Carla')
    await expect(memberTarget('Bruno')).toHaveValue('__new_room_member__')
    await expect(page.locator('[data-testid="import-new-member-name"][data-member="Bruno"]')).toHaveValue('Bruno')
    await page.getByTestId('import-submit').click()

    await expect(page.getByTestId('import-existing-success')).toHaveAttribute('data-already-imported', 'true', {
        timeout: 20_000,
    })
    await expect(page.getByTestId('imported-at')).toContainText('This exact source data was already imported at')
    await expect(page.getByTestId('imported-at')).toContainText('Nothing was added')
    await page.getByTestId('go-to-imported-room').click()
    await page.waitForURL(roomPath)
    await expect(page.getByTestId('expense-row')).toHaveCount(4, { timeout: 20_000 })
    await expectBalance(page, 'Ana', '2000')
    await expectBalance(page, 'Bea', '-2000')
    await expectBalance(page, 'Carla', '0')
    await expect(page.locator('[data-testid="balance-card"][data-member="Bruno"]')).toHaveCount(0)

    // A genuinely changed export is a new batch. Because the source does not
    // carry stable expense ids, its overlapping rows append in full too.
    await page.goto(`${roomPath}/import`)
    await page.getByTestId('import-file').setInputFiles({
        name: 'Existing group corrected.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(SIMPLE_GROUP.replace(',Taxi,Transportation,', ',Taxi corrected,Transportation,'), 'utf8'),
    })
    await expect(page.getByTestId('import-member-mapping')).toHaveCount(3, { timeout: 15_000 })
    await memberTarget('Bruno').selectOption({ label: 'Bea' })
    await expect(memberTarget('Bruno').locator('option:checked')).toHaveText('Bea')
    await expect(page.getByTestId('import-new-member-name')).toHaveCount(0)
    await page.getByTestId('import-submit').click()
    await expect(page.getByTestId('import-existing-success')).toHaveAttribute('data-already-imported', 'false', {
        timeout: 20_000,
    })
    await expect(page.getByTestId('imported-at')).toContainText('3 expenses and no new people were added at')
    await page.getByTestId('go-to-imported-room').click()
    await page.waitForURL(roomPath)

    await expect(page.getByTestId('expense-row')).toHaveCount(7, { timeout: 20_000 })
    await expect(page.locator('[data-testid="expense-row"][data-description="Already here"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="expense-row"][data-description="Dinner"]')).toHaveCount(2)
    await expect(page.locator('[data-testid="expense-row"][data-description="Taxi"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="expense-row"][data-description="Taxi corrected"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="expense-row"][data-description="Groceries"]')).toHaveCount(2)
    await expectBalance(page, 'Ana', '3500')
    await expectBalance(page, 'Bea', '-3500')
    await expectBalance(page, 'Carla', '0')
    await expect(page.locator('[data-testid="balance-card"][data-member="Bruno"]')).toHaveCount(0)
})

test('an append that creates the first shared balance earns one post-aha share package', async ({ page }) => {
    test.setTimeout(60_000)
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: async () => {},
        })
    })

    // A one-person room can hold private notes without having reached aha.
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Import activation')
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    const roomPath = new URL(await enterCreatedRoom(page)).pathname

    await page.goto(`${roomPath}/import`)
    const upload = async () => {
        await page.getByTestId('import-file').setInputFiles({
            name: 'Activation group.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(SIMPLE_GROUP, 'utf8'),
        })
        await expect(page.getByTestId('import-member-mapping')).toHaveCount(3, { timeout: 15_000 })
        await expect(page.getByTestId('import-submit')).toBeEnabled()
        await page.getByTestId('import-submit').click()
    }

    await upload()
    await expect(page.getByTestId('import-existing-success')).toHaveAttribute('data-already-imported', 'false', {
        timeout: 20_000,
    })
    await expect(page.getByRole('heading', { name: 'First split done' })).toBeVisible()
    await expect(page.getByTestId('room-link')).toBeVisible()
    const activatedSlug = roomPath.split('/').at(-1)!
    await expect
        .poll(() =>
            page.evaluate((slug) => {
                const raw = localStorage.getItem(`ps:pwa-room:${slug}`)
                const state = raw ? JSON.parse(raw) : null
                return typeof state?.deferUntil === 'number' && state.deferUntil > Date.now()
            }, activatedSlug)
        )
        .toBe(true)
    await page.getByTestId('share-link').click()
    await expect
        .poll(() =>
            page.evaluate((slug) => {
                const raw = localStorage.getItem(`ps:pwa-room:${slug}`)
                const state = raw ? JSON.parse(raw) : null
                return {
                    origin: state?.origin,
                    qualifiedTrigger: state?.qualifiedTrigger,
                    deferred: typeof state?.deferUntil === 'number' && state.deferUntil > Date.now(),
                }
            }, activatedSlug)
        )
        .toEqual({ origin: 'created_here', qualifiedTrigger: 'balance_and_share', deferred: false })

    // Replaying the same durable batch is still a useful receipt, but it cannot
    // present or count the first-balance package a second time.
    await page.getByTestId('import-another-file').click()
    await upload()
    await expect(page.getByTestId('import-existing-success')).toHaveAttribute('data-already-imported', 'true', {
        timeout: 20_000,
    })
    await expect(page.getByRole('heading', { name: 'First split done' })).toHaveCount(0)
    await expect(page.getByTestId('room-link')).toHaveCount(0)
})

test('a KPW room absent from the static e2e FX table blocks incompatible EUR history', async ({ page }) => {
    await page.goto('/new')
    await page.getByTestId('room-name').fill('KPW import target')
    await page.getByTestId('room-currency').selectOption('KPW')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    const roomPath = new URL(await enterCreatedRoom(page)).pathname

    await page.goto(`${roomPath}/import`)
    await page.getByTestId('import-file').setInputFiles({
        name: 'EUR group.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(SIMPLE_GROUP, 'utf8'),
    })

    const problem = page.getByTestId('import-currency-unsupported')
    await expect(problem).toBeVisible({ timeout: 15_000 })
    await expect(problem).toContainText('EUR')
    await expect(problem).toContainText('KPW')
    await expect(page.getByTestId('import-submit')).toBeDisabled()
})

test('that static-unavailable KPW room accepts same-currency KPW history', async ({ page }) => {
    await page.goto('/new')
    await page.getByTestId('room-name').fill('KPW identity import')
    await page.getByTestId('room-currency').selectOption('KPW')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    const roomPath = new URL(await enterCreatedRoom(page)).pathname

    await page.goto(`${roomPath}/import`)
    await page.getByTestId('import-file').setInputFiles({
        name: 'expenses_with_Natalia.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(SPLITPRO_FRIEND_CSV.replaceAll(',EUR,', ',KPW,'), 'utf8'),
    })

    await expect(page.getByTestId('import-member-mapping')).toHaveCount(2, { timeout: 15_000 })
    await expect(page.getByTestId('import-currency-unsupported')).toHaveCount(0)
    await expect(page.getByTestId('import-submit')).toBeEnabled()
})

test('a live no-rate response blocks a catalog-rated foreign currency before submit', async ({ page }) => {
    let probes = 0
    // GBP is present in Playwright's static fallback. The row is blocked only if
    // this intercepted live answer wins, so the assertion cannot pass merely
    // because the test server has remote FX disabled.
    await page.route('**/api/rate?from=GBP&to=EUR', async (route) => {
        probes++
        await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ from: 'GBP', to: 'EUR', rate: null, source: 'static', indicative: true }),
        })
    })
    await page.goto('/import')
    await page.getByTestId('import-file').setInputFiles({
        name: 'expenses_with_Natalia.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(SPLITPRO_FRIEND_CSV.replace(',EUR,', ',GBP,'), 'utf8'),
    })
    await page.locator('[data-testid="import-me"][data-member="You"]').check()

    const problem = page.getByTestId('import-currency-unsupported')
    await expect(problem).toBeVisible({ timeout: 15_000 })
    await expect(problem).toContainText('GBP')
    await expect(problem).toContainText('EUR')
    await expect(page.getByTestId('import-submit')).toBeDisabled()
    expect(probes).toBe(1)
})

test('a file that is not a Splitwise export says so, and writes nothing', async ({ page }) => {
    await page.goto('/import')

    await page.getByTestId('import-file').setInputFiles({
        name: 'statement.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('Transaction Date,Details,Amount\n2026-01-02,COFFEE,-3.40\n', 'utf8'),
    })

    await expect(page.getByTestId('import-error')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('import-room-name')).toHaveCount(0)
})

test('a Split Pro account backup offers its groups and previews their balances', async ({ page }) => {
    await page.goto('/import')

    await page.getByTestId('import-file').setInputFiles({
        name: 'splitpro_data.json',
        mimeType: 'application/json',
        buffer: Buffer.from(SPLITPRO_ACCOUNT_EXPORT, 'utf8'),
    })

    const choices = page.getByTestId('import-group-choice')
    await expect(choices).toBeVisible({ timeout: 15_000 })
    await expect(choices.locator('option')).toHaveText(['Summer trip', 'The flat'])
    await expect(page.getByTestId('import-room-name')).toHaveValue('Summer trip')
    await expect(page.getByTestId('import-member-name')).toHaveCount(3)
    await expect(page.getByText(/current balances, but not expense history/i)).toBeVisible()

    await choices.selectOption({ label: 'The flat' })
    await expect(page.getByTestId('import-room-name')).toHaveValue('The flat')
    await expect(page.getByTestId('import-currency')).toHaveValue('GBP')
})

test('the importer follows the saved app language without changing the English page shell', async ({ page }) => {
    await page.goto('/')

    for (const [locale, chooseFile] of [
        ['es-419', 'Elegir un archivo'],
        ['pt-br', 'Escolher um arquivo'],
    ] as const) {
        await page.context().addCookies([{ name: 'ps-locale', value: locale, url: page.url() }])
        await page.goto('/import')

        // The indexed article is English, while the product surface explicitly marks and renders
        // its saved locale so a screen reader switches language for the interactive controls.
        await expect(page.locator('html')).toHaveAttribute('lang', 'en')
        await expect(page.getByTestId('import-choose')).toHaveText(chooseFile)
        await expect(page.getByTestId('import-choose').locator('xpath=ancestor::section')).toHaveAttribute(
            'lang',
            locale === 'pt-br' ? 'pt-BR' : locale
        )
    }
})

test('the custom file button is the only keyboard-accessible chooser', async ({ page }) => {
    await page.goto('/import')

    const nativeInput = page.getByTestId('import-file')
    await expect(nativeInput).toHaveAttribute('tabindex', '-1')
    await expect(nativeInput).toHaveAttribute('aria-hidden', 'true')

    await page.keyboard.press('Home')
    for (let attempt = 0; attempt < 12; attempt++) {
        await page.keyboard.press('Tab')
        if (await page.getByTestId('import-choose').evaluate((button) => button === document.activeElement)) break
    }
    await expect(page.getByTestId('import-choose')).toBeFocused()
})

test('the upload action fits in the initial small-phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto('/import')

    const button = await page.getByTestId('import-choose').boundingBox()
    expect(button).not.toBeNull()
    expect(button!.y + button!.height).toBeLessThanOrEqual(700)
})

test('the import preview is fully visible and still with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/import')
    await page.getByTestId('import-file').setInputFiles({
        name: 'Still trip.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(SIMPLE_GROUP, 'utf8'),
    })

    const preview = page.locator('[data-motion-surface]').first()
    await expect(preview).toBeVisible({ timeout: 15_000 })
    await expect(preview).toHaveCSS('opacity', '1')
    await expect(preview).toHaveCSS('transform', 'none')
    expect(
        await preview.evaluate((element) =>
            element
                .getAnimations({ subtree: true })
                .filter((animation) => animation.playState === 'running')
                .map((animation) => animation.animationName)
        )
    ).toEqual([])
})
