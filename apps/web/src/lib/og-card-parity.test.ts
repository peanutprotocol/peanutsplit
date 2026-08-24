import { readFile } from 'node:fs/promises'
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
})
