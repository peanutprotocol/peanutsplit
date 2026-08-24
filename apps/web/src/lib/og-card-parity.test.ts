import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The landing card lives in two places by necessity and they must stay identical.
 *
 * `public/og-default.png` is what `ARTICLE_IMAGE_URL` names in JSON-LD, and it has to sit at a
 * stable URL because Next hash-suffixes every generated metadata-image route — a hashed URL
 * written into structured data breaks on the next build (see `lib/seo.ts`).
 *
 * `(marketing)/opengraph-image.png` is what social scrapers actually fetch, because Next only
 * injects `og:image` for a file it owns inside the route segment.
 *
 * They drifted once: `seo.ts` described `og-default.png` as "a static render of the landing card"
 * while the unfurl was drawing a different card entirely, so Google and Twitter showed different
 * images for the same page and nobody noticed. This test is the tripwire.
 */
describe('landing OG card', () => {
    it('serves the same bytes to scrapers and to structured data', async () => {
        const web = path.join(process.cwd())
        const [unfurl, structuredData] = await Promise.all([
            readFile(path.join(web, 'src/app/(product-shell)/(marketing)/opengraph-image.png')),
            readFile(path.join(web, 'public/og-default.png')),
        ])

        expect(
            unfurl.equals(structuredData),
            'og-default.png and (marketing)/opengraph-image.png differ — re-render both from design/og/c2-hifi-hl.html'
        ).toBe(true)
    })

    it('is a PNG at the size the metadata promises', async () => {
        const card = await readFile(path.join(process.cwd(), 'public/og-default.png'))
        const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

        expect(card.subarray(0, 8).equals(signature), 'og-default.png is not a PNG').toBe(true)
        // `pageMetadata()` declares summary_large_image site-wide and OG_SIZE says 1200x630. A card
        // committed at another size unfurls letterboxed on every platform, and nothing else checks.
        expect({ width: card.readUInt32BE(16), height: card.readUInt32BE(20) }).toEqual({
            width: 1200,
            height: 630,
        })
    })
})

/**
 * A route segment that renders a page but carries no `opengraph-image` unfurls as a bare grey box,
 * and nothing surfaces it — the page still ships, the share just looks broken. That has happened
 * twice here: `a28313f` (all fifteen guides) and `d15918b` (`/tools` promising summary_large_image
 * and shipping nothing).
 *
 * The e2e suite is the only tier that can see a real unfurl, and it runs nightly, advisory, and
 * only when the branch moved — so it has never blocked a deploy of this class. This list is pinned
 * here instead, in the suite CI actually gates on, so deleting a card or adding a segment without
 * one fails on the push rather than in someone's group chat.
 */
const OG_IMAGE_ROUTES = [
    '(product-shell)/(marketing)/[page]/[country]/opengraph-image.tsx',
    '(product-shell)/(marketing)/[page]/opengraph-image.tsx',
    '(product-shell)/(marketing)/blog/[slug]/opengraph-image.tsx',
    '(product-shell)/(marketing)/blog/opengraph-image.tsx',
    '(product-shell)/(marketing)/es-419/[page]/opengraph-image.tsx',
    '(product-shell)/(marketing)/es-419/blog/[slug]/opengraph-image.tsx',
    '(product-shell)/(marketing)/es-419/blog/opengraph-image.tsx',
    '(product-shell)/(marketing)/import/opengraph-image.tsx',
    '(product-shell)/(marketing)/opengraph-image.alt.txt',
    '(product-shell)/(marketing)/opengraph-image.png',
    '(product-shell)/(marketing)/pt-br/[page]/opengraph-image.tsx',
    '(product-shell)/(marketing)/pt-br/blog/[slug]/opengraph-image.tsx',
    '(product-shell)/(marketing)/pt-br/blog/opengraph-image.tsx',
    '(product-shell)/(marketing)/tools/opengraph-image.tsx',
    '(product-shell)/r/[slug]/opengraph-image.tsx',
    '(product-shell)/r/[slug]/recap/opengraph-image.tsx',
    '(split-content)/es-419/guides/[slug]/opengraph-image.tsx',
    '(split-content)/guides/[slug]/opengraph-image.tsx',
    '(split-content)/pt-br/guides/[slug]/opengraph-image.tsx',
] as const

describe('social image inventory', () => {
    it('matches the routes we know carry a card', async () => {
        const appDir = path.join(process.cwd(), 'src/app')

        const walk = async (dir: string): Promise<string[]> => {
            const entries = await readdir(dir, { withFileTypes: true })
            const found = await Promise.all(
                entries.map(async (entry) => {
                    const full = path.join(dir, entry.name)
                    if (entry.isDirectory()) return walk(full)
                    return entry.name.startsWith('opengraph-image.') ? [path.relative(appDir, full)] : []
                })
            )
            return found.flat()
        }

        expect(
            (await walk(appDir)).sort(),
            'a social image was added or removed — update OG_IMAGE_ROUTES, and if a new page segment has no card, confirm that is deliberate'
        ).toEqual([...OG_IMAGE_ROUTES].sort())
    })
})
