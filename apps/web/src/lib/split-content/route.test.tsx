import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SplitGuideLayout } from '@/components/split-content/GuideLayout'
import { renderSplitGuideBody } from '@/components/split-content/mdx'
import { getSplitGuide, guideAlternates, splitGuidePaths } from './artifact'
import { splitGuideMetadataFor, splitGuideStaticParams } from './route'

const FIXTURE = path.join(process.cwd(), 'src/lib/split-content/__fixtures__/valid')

describe('Split guide route contract', () => {
    it('enumerates only manifest-backed slugs for each exact locale', () => {
        for (const locale of ['en', 'es-419', 'pt-br'] as const) {
            expect(splitGuideStaticParams(locale, FIXTURE)).toEqual([{ slug: 'synthetic-guide' }])
        }
        expect(splitGuideStaticParams('en', path.join(FIXTURE, 'absent'))).toEqual([])
    })

    it('derives canonical metadata from the public route and stays noindex while the gate is shut', async () => {
        const metadata = await splitGuideMetadataFor('pt-br', 'synthetic-guide', FIXTURE)
        expect(metadata.title).toBe('Guia sintética em português | Peanut')
        expect(metadata.alternates).toEqual({
            canonical: 'https://peanutsplit.com/pt-br/guides/synthetic-guide',
            languages: undefined,
        })
        expect(metadata.robots).toMatchObject({ index: false, follow: false, noarchive: true })
        expect(await splitGuideMetadataFor('en', 'unknown-guide', FIXTURE)).toEqual({})
    })

    it('omits every unreleased alternate rather than advertising a noindex translation', async () => {
        const metadata = await splitGuideMetadataFor('en', 'synthetic-guide', FIXTURE)
        expect(metadata.robots).toMatchObject({ index: false, follow: false, noarchive: true })
        expect(metadata.alternates).toEqual({
            canonical: 'https://peanutsplit.com/guides/synthetic-guide',
            languages: undefined,
        })
    })

    it('renders the layout-owned H1 and the canary CTA contract without product-relative links', async () => {
        const guide = getSplitGuide('en', 'synthetic-guide', FIXTURE)
        expect(guide).not.toBeNull()
        const body = await renderSplitGuideBody(guide!.body, {
            locale: guide!.locale,
            guidePaths: splitGuidePaths(FIXTURE),
        })
        const html = renderToStaticMarkup(
            <SplitGuideLayout guide={guide!} alternates={guideAlternates('synthetic-guide', FIXTURE)}>
                {body}
            </SplitGuideLayout>
        )

        expect(html.match(/<h1\b/g)).toHaveLength(1)
        expect(html).toContain('Synthetic English guide</h1>')
        expect(html).toContain('Synthetic CTA compatibility proof.')
        expect(html).toContain('href="https://peanutsplit.com/new?locale=en&amp;utm_source=synthetic"')
        expect(html).not.toMatch(/href="\/new/)
        expect(html).toContain('href="/guides/synthetic-guide"')
    })

    it('pins three force-dynamic, no-fallback route adapters in source', () => {
        const files = {
            en: 'src/app/(split-content)/guides/[slug]/page.tsx',
            'es-419': 'src/app/(split-content)/es-419/guides/[slug]/page.tsx',
            'pt-br': 'src/app/(split-content)/pt-br/guides/[slug]/page.tsx',
        } as const

        for (const [locale, file] of Object.entries(files)) {
            const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
            expect(source, file).toContain("export const dynamic = 'force-dynamic'")
            expect(source, file).toContain('export const dynamicParams = false')
            expect(source, file).toContain(`splitGuideRoute('${locale}')`)
        }
        expect(fs.existsSync(path.join(process.cwd(), 'src/app/(split-content)/en'))).toBe(false)
    })
})
