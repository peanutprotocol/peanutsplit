import { expect, test } from '@playwright/test'
import { SIMPLE_GROUP } from '../src/lib/splitwise-fixtures'

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

    // Ana is the first member, so she is who the importer is by default.
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

    // The history came across too, not just the arithmetic.
    await expect(page.getByText('Dinner')).toBeVisible()
    await expect(page.getByText('Groceries')).toBeVisible()

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
