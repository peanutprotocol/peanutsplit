import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SplitGuideLayout } from '@/components/split-content/GuideLayout'
import { renderSplitGuideBody } from '@/components/split-content/mdx'
import { LOCALES } from '@/i18n/locales'
import { getSplitGuide, guideAlternates, loadSplitContentManifest, splitGuidePaths } from './artifact'
import { splitGuideMetadataFor, splitGuideStaticParams } from './route'
import { contentUrl } from './urls'

const configuredRoot = process.env.SPLIT_CONTENT_ARTIFACT_ROOT
const artifactRoot = configuredRoot ? path.resolve(configuredRoot) : null

describe.runIf(artifactRoot)('installed generated Split artifact', () => {
    it('loads, compiles, and renders every manifest entry through the production contracts', async () => {
        expect(fs.statSync(path.join(artifactRoot!, 'manifest.json')).isFile()).toBe(true)

        const manifest = loadSplitContentManifest(artifactRoot!)
        expect(manifest).not.toBeNull()
        expect(manifest!.entries.length).toBeGreaterThan(0)

        const guidePaths = splitGuidePaths(artifactRoot!)
        expect(guidePaths).toEqual(
            manifest!.entries.map((entry) => entry.public_path).sort((left, right) => left.localeCompare(right))
        )

        for (const locale of LOCALES) {
            const expectedSlugs = manifest!.entries
                .filter((entry) => entry.locale === locale)
                .map((entry) => entry.slug)
                .sort((left, right) => left.localeCompare(right))
            expect(splitGuideStaticParams(locale, artifactRoot!)).toEqual(expectedSlugs.map((slug) => ({ slug })))
        }

        const renderedEntries: string[] = []
        for (const entry of manifest!.entries) {
            const identity = `${entry.locale}/${entry.slug}`
            const guide = getSplitGuide(entry.locale, entry.slug, artifactRoot!)
            expect(guide, identity).not.toBeNull()

            const metadata = await splitGuideMetadataFor(entry.locale, entry.slug, artifactRoot!, false)
            const alternates = guideAlternates(entry.slug, artifactRoot!)
            expect(metadata.title, identity).toBe(`${guide!.title} | Peanut`)
            expect(metadata.description, identity).toBe(guide!.description)
            expect(metadata.alternates, identity).toEqual({
                canonical: contentUrl(entry.public_path),
                languages: Object.fromEntries(
                    Object.entries(alternates!).map(([locale, href]) => [locale, contentUrl(href)])
                ),
            })
            expect(metadata.robots, identity).toMatchObject({ index: false, follow: false, noarchive: true })

            const body = await renderSplitGuideBody(guide!.body, { locale: entry.locale, guidePaths })
            const html = renderToStaticMarkup(<SplitGuideLayout guide={guide!}>{body}</SplitGuideLayout>)
            expect(html.match(/<h1\b/g), identity).toHaveLength(1)
            expect(html, identity).toContain(`${guide!.title}</h1>`)
            expect(html, identity).not.toMatch(/href="\/(?:new|app|import|r)(?:[/?#"])/)
            renderedEntries.push(identity)
        }

        expect(renderedEntries.sort()).toEqual(manifest!.entries.map((entry) => `${entry.locale}/${entry.slug}`).sort())
    })
})
