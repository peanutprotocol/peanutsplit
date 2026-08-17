import { expect, test, type Page } from '@playwright/test'

/**
 * The only spec that drives a skinned page (Wave 2 ship gate).
 *
 * Everything the sticker skin paints is CSS keyed on `[data-skin='sticker']` plus a wallpaper
 * data-URI on the frame, so the unit suite can prove the frame emits the attribute and the
 * stylesheet scopes its rules — but only a browser can prove the two meet on a real route, and
 * only a browser can measure what a 2px border, a 5px halo and a rotation do to a card inside a
 * `max-w-xl` column. Nothing else in the suite navigates a pilot URL: `landing.spec.ts`'s
 * multi-viewport test drives `/`, which renders no `ChapterFrame` and cannot match a skin rule.
 */

/** The Wave-2 pilot: four content routes and one tool route (`SKIN_BY_SLUG`). */
const PILOTS = [
    '/blog/fronting-a-group-trip',
    '/blog/who-pays-for-the-wine',
    '/splitwise-vs-tricount',
    '/fair-split-calculator',
    '/mileage-split-calculator',
] as const

/** A default-register content page outside the pilot — the proof the skin is a rollout gate and
 *  not something every chapter page picked up. */
const UNSKINNED = '/blog/end-of-trip-expense-recap'

/** The flat register (`FLAT_REGISTER_SLUGS`), which never reaches `ChapterFrame` at all. */
const FLAT = '/splitwise-daily-limit'

/** The same list `landing.spec.ts` measures its no-overflow test at, so a column that only breaks
 *  at 320px is caught here too. */
const viewports = [
    { width: 320, height: 740 },
    { width: 360, height: 740 },
    { width: 390, height: 720 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
] as const

const horizontalOverflow = (page: Page) =>
    page.evaluate(() => {
        const root = document.scrollingElement ?? document.documentElement
        return root.scrollWidth - root.clientWidth
    })

test.describe('sticker skin', () => {
    for (const url of PILOTS) {
        test(`${url} wears the skin and never scrolls sideways`, async ({ page }) => {
            for (const viewport of viewports) {
                await page.setViewportSize(viewport)
                await page.goto(url)

                await expect(page.locator('[data-skin="sticker"]')).toHaveCount(1)

                expect(
                    await horizontalOverflow(page),
                    `${url} at ${viewport.width}x${viewport.height} must not create horizontal page overflow`
                ).toBeLessThanOrEqual(0)
            }
        })
    }

    test('a default-register page outside the pilot stays unskinned', async ({ page }) => {
        await page.goto(UNSKINNED)
        await expect(page.locator('[data-chapter]')).toHaveCount(1)
        await expect(page.locator('[data-skin="none"]')).toHaveCount(1)
        await expect(page.locator('[data-skin="sticker"]')).toHaveCount(0)
    })

    test('the flat register renders no chapter frame at all, so it cannot carry a skin', async ({ page }) => {
        await page.goto(FLAT)
        await expect(page.locator('[data-chapter]')).toHaveCount(0)
        await expect(page.locator('[data-skin]')).toHaveCount(0)
    })
})

test.describe('tool page footer pin', () => {
    /**
     * `ToolPage` wraps only the region between the breadcrumbs and the footer in `<SkinFrame>`;
     * wrapping `<main>`'s children instead makes them one non-growing flex item, `mt-auto` finds no
     * free space and the footer floats mid-viewport over bare background. Measured after a scroll
     * to the bottom so the assertion holds whether or not the page is taller than the viewport —
     * the regression is the footer sitting ABOVE the fold with nothing under it, which this catches
     * either way. `ux-foundations.spec.ts` drives this same footer but only reads its outline colour.
     */
    test('pins the footer to the bottom on a short tool page', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 812 })
        await page.goto('/mileage-split-calculator')
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))

        const gap = await page
            .locator('footer')
            .evaluate((footer) => window.innerHeight - footer.getBoundingClientRect().bottom)
        expect(Math.abs(gap), 'the tool page footer must reach the bottom of the viewport').toBeLessThanOrEqual(1)
    })
})
