import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, type APIRequestContext } from '@playwright/test'
import { test } from './fixtures'
import { ARTICLE_IMAGE_URL } from '../src/lib/seo'

/**
 * The landing card, as a crawler sees it.
 *
 * The regression this guards actually shipped: `og-default.png` was swapped for a new design and
 * `lib/seo.ts` kept describing it as "a static render of the landing card", but the unfurl came
 * from a generated `BrandCard` route. Google read one image out of JSON-LD while Slack and Twitter
 * drew a different one, and nothing failed.
 *
 * One trap dominates how these tests have to be written. `pageMetadata()` pins
 * `metadataBase: new URL(siteUrl)`, so the landing page advertises
 * `https://peanutsplit.com/opengraph-image-<hash>.png` even when it is served from localhost.
 * Fetching the advertised URL verbatim therefore tests production and never the build in front of
 * you — a local swap of one of the two copies stays green. Every fetch below is rebased onto the
 * origin under test, and the advertised host is asserted separately, on purpose.
 */

/** Width and height out of a PNG's IHDR, so the assertion is the real pixels, not the declared ones. */
function pngSize(bytes: Buffer): { width: number; height: number } {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(bytes.length, 'response is too short to be a PNG').toBeGreaterThan(24)
    expect(bytes.subarray(0, 8).equals(signature), 'response is not a PNG').toBe(true)
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/** Move an absolute URL onto the origin actually under test, keeping path and query. */
function onOriginUnderTest(absolute: string, pageUrl: string): string {
    const target = new URL(absolute)
    return new URL(`${target.pathname}${target.search}`, pageUrl).toString()
}

async function fetchImage(request: APIRequestContext, url: string): Promise<Buffer> {
    const response = await request.get(url)
    expect(response.status(), `${url} did not serve`).toBe(200)
    // `toContain`, not equality: a proxy in front of a live origin may append a charset.
    expect(response.headers()['content-type']).toContain('image/png')
    return response.body()
}

test.describe('landing social card', () => {
    test('advertises a card Next actually serves, at the size it claims', async ({ page, request }) => {
        await page.goto('/')

        // Next mints this URL — a build-scoped hash on the segment plus a cache-busting query — so
        // match the SHAPE and never today's hash. Writing the path by hand is the failure that made
        // every shared room unfurl imageless off a 404.
        const advertised = page.locator('meta[property="og:image"]')
        await expect(advertised).toHaveAttribute('content', /^https?:\/\/[^/]+\/opengraph-image-[a-z0-9]+\.png(\?|$)/)

        const cardUrl = (await advertised.getAttribute('content'))!
        // A card advertised on the wrong host unfurls dead everywhere, while still fetching fine
        // from a machine that can reach it. The landing card follows `metadataBase`, which is now
        // the configured origin (prod: the canonical host; a fork or E2E: its own origin) — so the
        // guard is that the advertised host is the one actually serving the page.
        expect(new URL(cardUrl).origin, 'og:image is advertised on a foreign origin').toBe(new URL(page.url()).origin)

        const card = await fetchImage(request, onOriginUnderTest(cardUrl, page.url()))

        // The declared dimensions have to describe the file, or the card renders letterboxed.
        const { width, height } = pngSize(card)
        expect({ width, height }).toEqual({ width: 1200, height: 630 })
        await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', String(width))
        await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', String(height))

        // twitter:image exists only because Next fills it from openGraph.images; nothing in
        // pageMetadata sets it. This catches someone adding an explicit, diverging twitter.images.
        await expect(
            page.locator('meta[name="twitter:image"], meta[property="twitter:image"]').first()
        ).toHaveAttribute('content', cardUrl)

        const alt = await readFile(
            path.join(process.cwd(), 'src/app/(product-shell)/(marketing)/opengraph-image.alt.txt'),
            'utf8'
        )
        await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', alt.trim())
    })

    test('serves one card to scrapers, to structured data, and from the repo', async ({ page, request }) => {
        await page.goto('/')
        const cardUrl = (await page.locator('meta[property="og:image"]').getAttribute('content'))!

        // Derived from ARTICLE_IMAGE_URL rather than spelled out: renaming the constant would
        // otherwise orphan this comparison onto a file nothing points at any more, and the two
        // surfaces could drift again behind a green test. seo.test.ts already proves the article
        // schema names this exact URL, so there is no need to render a guide page here.
        const structuredDataUrl = onOriginUnderTest(ARTICLE_IMAGE_URL, page.url())

        const [unfurl, structuredData, committed] = await Promise.all([
            fetchImage(request, onOriginUnderTest(cardUrl, page.url())),
            fetchImage(request, structuredDataUrl),
            readFile(path.join(process.cwd(), 'public/og-default.png')),
        ])

        expect(
            unfurl.equals(structuredData),
            `the unfurl and ${structuredDataUrl} are different images — the two halves of the card have drifted`
        ).toBe(true)

        // Pins the served bytes to the repo, so a stale deploy serving two matching but outdated
        // cards fails instead of passing. Against a live origin this reads as "is what is deployed
        // what is committed".
        expect(
            unfurl.equals(committed),
            'the served card is not the one in public/og-default.png — the build is stale, or the card was changed without re-rendering both copies'
        ).toBe(true)
    })
})
