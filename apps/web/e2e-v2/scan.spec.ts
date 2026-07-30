import { expect, test, type Page } from '@playwright/test'
import { makeRoom, stubTheModel, TINY_JPEG, type Posted } from './helpers'

/**
 * The receipt scan, end to end on a phone-sized viewport: decode → review →
 * assign → delete a wrongly-read row → hand back → save.
 *
 * THE REASON THIS FILE EXISTS is the middle of it. Receipt scanning was pulled
 * out of v1 because "the post-scan overlay proved capable of trapping taps on
 * real devices", and the written condition for turning it back on was a mobile
 * regression test over the image-decoding → review → assignment portal
 * lifecycle. Three separate defects made that one symptom, and each has an
 * assertion here:
 *
 *  1. **The overlay took no taps.** The expense drawer is a modal Radix layer,
 *     and while one is open Radix sets `document.body { pointer-events: none }`
 *     and re-enables them only inside its own content. The scan overlay is
 *     portalled to `document.body` — it has to be, because vaul transforms the
 *     sheet and a `position: fixed` child of a transformed ancestor is
 *     positioned against that ancestor — so it was a sibling of that content and
 *     inherited `none`. It painted on top and every tap fell through to the
 *     drawer still live underneath. → `everythingOnScreenIsTheOverlay`.
 *
 *  2. **The first tap that DID land killed the form.** Radix decides what is
 *     "outside" a layer by containment, so a tap in the overlay was an outside
 *     interaction and dismissed the drawer — and dismissing it clears the URL
 *     state, so the reviewed bill had nothing to come back to. → the drawer is
 *     still there, with what was typed in it, after a scan is cancelled.
 *
 *  3. **The read could deadlock before the review ever appeared.** A ref that
 *     remembered "already scanned this file" meant a remount (React does one on
 *     mount in development, and can anywhere) cancelled the first read and
 *     skipped the second. The overlay sat on "Reading the bill…" forever. → the
 *     review screen appears at all, in a dev-mode run, which is what this is.
 *
 * Every model call is intercepted. This spec is about the lifecycle, not about
 * what a vision model reads, and a test that spends real tokens is a test nobody
 * runs.
 */

/**
 * Hit-test a grid over the whole viewport: what is drawn is what receives the
 * tap, everywhere, not only in the middle. This is the assertion the tap trap
 * fails — it answered "not the overlay" at every point while the overlay was the
 * only thing the user could see.
 */
const everythingOnScreenIsTheOverlay = (page: Page) =>
    page.evaluate(() => {
        const misses: { x: number; y: number; hit: string }[] = []
        for (let column = 1; column <= 3; column++) {
            for (let row = 1; row <= 3; row++) {
                const x = (window.innerWidth * column) / 4
                const y = (window.innerHeight * row) / 4
                const element = document.elementFromPoint(x, y)
                if (!element?.closest('[data-testid="scan-flow"]')) {
                    misses.push({ x, y, hit: element?.tagName ?? 'nothing' })
                }
            }
        }
        return misses
    })

const pickPhoto = (page: Page) =>
    page.locator('input[type="file"]').setInputFiles({
        name: 'bill.jpg',
        mimeType: 'image/jpeg',
        buffer: TINY_JPEG,
    })

/** Open the drawer and hand the scan flow a photo. */
async function startScan(page: Page) {
    await page.getByTestId('open-add-expense').click()
    await expect(page.getByTestId('scan-bill')).toBeVisible({ timeout: 15_000 })
    await pickPhoto(page)
    await expect(page.getByTestId('scan-flow')).toBeVisible({ timeout: 15_000 })
}

test('scan → review → assign → delete a hallucinated row → save', async ({ page }) => {
    const posted: Posted = {}
    await stubTheModel(page, posted)
    await makeRoom(page, 'Scan trip')
    await startScan(page)

    // Defect 3: the read completes and the review screen appears at all.
    await expect(page.getByTestId('scan-item-label').first()).toBeVisible({ timeout: 15_000 })

    // The device prepared an image rather than posting the file through — the
    // HEIC-and-bandwidth argument lives in `scan-image.ts`, and this is the only
    // place it is exercised end to end.
    expect(posted.mimeType).toBe('image/jpeg')
    expect(posted.imageBase64?.startsWith('data:')).toBe(false)
    expect((posted.imageBase64 ?? '').length).toBeGreaterThan(0)

    // Defect 1: the visible surface is the interactive one, everywhere.
    expect(await everythingOnScreenIsTheOverlay(page)).toEqual([])

    // Focus goes where you put it, and stays: the review's fields are the whole
    // point of the screen.
    const firstLabel = page.getByTestId('scan-item-label').first()
    await firstLabel.click()
    await expect(firstLabel).toBeFocused()
    await firstLabel.fill('Pizza margherita')
    await expect(firstLabel).toHaveValue('Pizza margherita')

    // ── Delete the row the model invented ─────────────────────────────────
    await expect(page.getByTestId('scan-item-amount')).toHaveCount(3)
    await expect(page.getByTestId('scan-totals')).toContainText('42.40')

    await page.getByTestId('scan-remove-item').nth(2).click()
    await expect(page.getByTestId('scan-item-amount')).toHaveCount(2)
    // The running total is the sum of what is LEFT. The printed total is still
    // shown and still disagrees — that is information, not a wedge.
    await expect(page.getByTestId('scan-totals')).toContainText('32.50')
    await expect(page.getByTestId('scan-continue')).toBeEnabled()

    // ── Assign, and delete from THIS screen too ───────────────────────────
    await page.getByTestId('scan-continue').click()
    await expect(page.getByTestId('scan-assign-row')).toHaveCount(2)
    // Defect 1 again, on the screen the flow exists for.
    expect(await everythingOnScreenIsTheOverlay(page)).toEqual([])

    // A row is deletable here as well: a bogus line is obvious exactly when
    // nobody's face belongs on it.
    await page.getByTestId('scan-item-remove').nth(1).click()
    await expect(page.getByTestId('scan-assign-row')).toHaveCount(1)

    await page.getByTestId('scan-everyone').first().click()
    await expect(page.getByTestId('scan-unassigned')).toHaveCount(0)
    await page.getByTestId('scan-apply').click()

    // ── Back in the drawer, and the drawer is live again ──────────────────
    await expect(page.getByTestId('scan-flow')).toHaveCount(0)
    await expect(page.getByTestId('expense-amount')).toHaveValue('12.50', { timeout: 15_000 })
    await expect(page.getByTestId('expense-description')).toHaveValue('Da Nino')

    await page.getByTestId('save-expense').scrollIntoViewIfNeeded()
    const saveIsReachable = await page.evaluate(() => {
        const save = document.querySelector('[data-testid="save-expense"]')
        if (!save) return false
        const box = save.getBoundingClientRect()
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        return !!hit && save.contains(hit)
    })
    expect(saveIsReachable).toBe(true)

    // ── The money, from the server ────────────────────────────────────────
    await page.getByTestId('save-expense').click()
    const row = page.locator('[data-testid="expense-row"][data-description="Da Nino"]:not([disabled])')
    await expect(row).toBeVisible({ timeout: 15_000 })
    // What is pinned here is the AMOUNT: the two deleted rows left no trace in
    // the expense that reached the database.
    await expect(row).toContainText('12.50')
})

test('cancelling a scan gives back the drawer, and everything that was in it', async ({ page }) => {
    await stubTheModel(page, {})
    await makeRoom(page, 'Cancel trip')

    // Type something first: this is what the second defect silently destroyed.
    await page.getByTestId('open-add-expense').click()
    await expect(page.getByTestId('scan-bill')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('expense-description').fill('Dinner')

    await pickPhoto(page)
    await expect(page.getByTestId('scan-item-label').first()).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('scan-close').click()
    await expect(page.getByTestId('scan-flow')).toHaveCount(0)

    // Still open, still holding what was typed, still interactive.
    const amount = page.getByTestId('expense-amount')
    await expect(amount).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('expense-description')).toHaveValue('Dinner')
    await amount.click()
    await expect(amount).toBeFocused()
    await amount.fill('9')
    await expect(amount).toHaveValue('9')
})

test('a scan abandoned by closing the drawer does not come back with it', async ({ page }) => {
    await stubTheModel(page, {})
    await makeRoom(page, 'Abandon trip')
    await startScan(page)
    await expect(page.getByTestId('scan-item-label').first()).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('scan-close').click()
    await expect(page.getByTestId('expense-amount')).toBeVisible({ timeout: 15_000 })
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('expense-amount')).toHaveCount(0, { timeout: 15_000 })

    // Reopening must give a clean form, not somebody else's receipt.
    await page.getByTestId('open-add-expense').click()
    await expect(page.getByTestId('scan-flow')).toHaveCount(0)
    await expect(page.getByTestId('expense-amount')).toHaveValue('')
})
