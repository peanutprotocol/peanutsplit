import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SplitGuideLayout } from '@/components/split-content/GuideLayout'
import { renderSplitGuideBody } from '@/components/split-content/mdx'
import { getSplitGuide, splitGuidePaths } from './artifact'
import { splitGuideMetadataFor, splitGuideMetadataForHeaders, splitGuideStaticParams } from './route'
import { SPLIT_CONTENT_INDEX_RENDER_HEADER, SPLIT_EDGE_INDEX_RELEASED_HEADER } from './transport'

const FIXTURE = path.join(process.cwd(), 'src/lib/split-content/__fixtures__/valid')

describe('Split guide route contract', () => {
    it('enumerates only manifest-backed slugs for each exact locale', () => {
        for (const locale of ['en', 'es-419', 'pt-br'] as const) {
            expect(splitGuideStaticParams(locale, FIXTURE)).toEqual([{ slug: 'synthetic-guide' }])
        }
        expect(splitGuideStaticParams('en', path.join(FIXTURE, 'absent'))).toEqual([])
    })

    it('derives canonical and reciprocal language metadata from the public route', async () => {
        const metadata = await splitGuideMetadataFor('pt-br', 'synthetic-guide', FIXTURE, false)
        expect(metadata.title).toBe('Guia sintética em português | Peanut')
        expect(metadata.alternates).toEqual({
            canonical: 'https://peanut.me/pt-br/split/guides/synthetic-guide',
            languages: {
                en: 'https://peanut.me/en/split/guides/synthetic-guide',
                'es-419': 'https://peanut.me/es-419/split/guides/synthetic-guide',
                'pt-BR': 'https://peanut.me/pt-br/split/guides/synthetic-guide',
                'x-default': 'https://peanut.me/en/split/guides/synthetic-guide',
            },
        })
        expect(metadata.robots).toMatchObject({ index: false, follow: false, noarchive: true })
        expect(await splitGuideMetadataFor('en', 'unknown-guide', FIXTURE, false)).toEqual({})
    })

    it('keeps metadata noindex and omits unreleased alternates despite a caller or edge index bit', async () => {
        for (const requestHeaders of [
            new Headers({ [SPLIT_EDGE_INDEX_RELEASED_HEADER]: '1' }),
            new Headers({ [SPLIT_CONTENT_INDEX_RENDER_HEADER]: '1' }),
        ]) {
            const metadata = await splitGuideMetadataForHeaders('en', 'synthetic-guide', requestHeaders, FIXTURE)
            expect(metadata.robots).toMatchObject({ index: false, follow: false, noarchive: true })
            expect(metadata.alternates).toEqual({
                canonical: 'https://peanut.me/en/split/guides/synthetic-guide',
                languages: undefined,
            })
        }
    })

    it('renders the layout-owned H1 and the canary CTA contract without product-relative links', async () => {
        const guide = getSplitGuide('en', 'synthetic-guide', FIXTURE)
        expect(guide).not.toBeNull()
        const body = await renderSplitGuideBody(guide!.body, {
            locale: guide!.locale,
            guidePaths: splitGuidePaths(FIXTURE),
        })
        const html = renderToStaticMarkup(<SplitGuideLayout guide={guide!}>{body}</SplitGuideLayout>)

        expect(html.match(/<h1\b/g)).toHaveLength(1)
        expect(html).toContain('Synthetic English guide</h1>')
        expect(html).toContain('Synthetic CTA compatibility proof.')
        expect(html).toContain('href="https://split.peanut.me/new?locale=en&amp;utm_source=synthetic"')
        expect(html).not.toMatch(/href="\/new/)
        expect(html).toContain('href="/en/split/guides/synthetic-guide"')
    })

    it('pins three force-dynamic, no-fallback route adapters in source', () => {
        for (const locale of ['en', 'es-419', 'pt-br']) {
            const file = path.join(process.cwd(), `src/app/(split-content)/${locale}/split/guides/[slug]/page.tsx`)
            const source = fs.readFileSync(file, 'utf8')
            expect(source).toContain("export const dynamic = 'force-dynamic'")
            expect(source).toContain('export const dynamicParams = false')
            expect(source).toContain(`splitGuideRoute('${locale}')`)
        }
    })
})
