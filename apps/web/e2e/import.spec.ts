import { expect, test } from '@playwright/test'
import { SIMPLE_GROUP } from '../src/lib/__fixtures__/splitwise'
import { SPLITPRO_ACCOUNT_EXPORT } from '../src/lib/__fixtures__/splitpro'

/**
 * The switch, end to end: a real Splitwise export goes in through the real file input, and the
 * room that comes out is asserted against the balances the file itself states.
 *
 * `data-net` is raw minor units straight off the server, so this is backend truth and not a
 * NumberFlow frame caught mid-animation — the same discipline as the main journey.
 */
test('import a Splitwise export → a room whose balances match the file', async ({ page }) => {
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
    expect((await roomLink.innerText()).trim()).toContain('/r/ski-trip-')

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
    await expect(expense('Dinner')).toContainText('Others owe you from this expense')
    await expect(expense('Taxi')).toHaveAttribute('data-personal-impact', 'outgoing')
    await expect(expense('Taxi')).toHaveAttribute('data-impact-minor', '-1000')
    await expect(expense('Taxi')).toContainText('Added to what you owe')
    await expect(expense('Groceries')).toHaveAttribute('data-personal-impact', 'outgoing')
    await expect(expense('Groceries')).toHaveAttribute('data-impact-minor', '-1500')

    // The importer never sees a join gate — the token came back with the room.
    await expect(page.getByTestId('join-gate')).toHaveCount(0)
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
