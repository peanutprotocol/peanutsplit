import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SplitGuideLayout } from '@/components/split-content/GuideLayout'
import { renderSplitGuideBody } from '@/components/split-content/mdx'
import { LOCALES } from '@/i18n/locales'
import { localizedPath } from '@/i18n/paths'
import {
    getSplitCalculator,
    getSplitGuide,
    getSplitHub,
    getSplitToolsHub,
    guideAlternates,
    listSplitCalculators,
    loadSplitContentManifest,
    splitContentPaths,
    splitGuidePaths,
} from './artifact'
import { absoluteUrl } from '@/lib/seo'
import { SPLIT_CONTENT_INDEX_RELEASED_PATHS } from './index-release'
import { SPLIT_CONTENT_GENERATED_ROOT } from './manifest-attestation'
import { splitGuideMetadataFor, splitGuideStaticParams } from './route'

/**
 * The artifact is committed at `src/generated/seo/`, so this reads it the way the running server
 * does — no environment variable, no `describe.runIf`, no sample. The `force-dynamic` guide route
 * renders nothing at build time, which makes this file the only thing between a renderer change
 * and fifteen HTTP 500s in production. It must never be skippable.
 */
const artifactRoot = SPLIT_CONTENT_GENERATED_ROOT

/** react-dom escapes these five on the way into the markup; compare like with like. */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
}

function matchAll(body: string, pattern: RegExp): string[] {
    return [...body.matchAll(pattern)].map((match) => match[1].trim())
}

/**
 * Assert a run of source text reached the markup. GFM turns a bare URL inside prose into an
 * anchor, which splits the surrounding sentence across tags, so compare the parts either side of
 * any bare URL rather than the whole line.
 */
function expectRendered(html: string, text: string, label: string): void {
    const fragments = text
        .split(/(?:https?:\/\/|www\.)[^\s]*[^\s.,;:!?)]/g)
        .map((fragment) => fragment.trim())
        .filter((fragment) => fragment.length > 2)
    for (const fragment of fragments) expect(html, `${label}: ${text}`).toContain(escapeHtml(fragment))
}

/**
 * What the Markdown source promises the page will contain. Derived from the body rather than
 * pinned as literals, so the check follows the corpus when mono publishes the next cohort — and
 * so a node the policy admits but no component renders shows up as missing text, not as a pass.
 */
function sourcePromises(body: string) {
    return {
        headings: [...body.matchAll(/^(#{2,3}) (.+)$/gm)].map((match) => ({
            level: match[1].length,
            text: match[2].trim(),
        })),
        quoteLines: matchAll(body, /^> (.+)$/gm),
        tableCells: [...body.matchAll(/^\|(.+)\|[ \t]*$/gm)]
            .map((match) => match[1])
            .filter((row) => !/^[\s:|-]+$/.test(row))
            .flatMap((row) => row.split('|').map((cell) => cell.trim()))
            .filter((cell) => cell.length > 0),
        // `[^*]` spans newlines on purpose: a citation line wraps in the source, and requiring
        // one line would miss the emphasis in two of the four guides that use it.
        emphasis: matchAll(body, /(?:^|[^*])\*([^*]+?)\*(?!\*)/g),
        externalHrefs: matchAll(body, /\]\((https?:\/\/[^)\s]+)\)/g),
        ctaHrefs: matchAll(body, /<CTA[^>]*\shref="([^"]+)"/g),
        relatedHrefs: matchAll(body, /<RelatedLink[^>]*\shref="([^"]+)"/g),
        stepTitles: matchAll(body, /<Step\s+title="([^"]+)"/g),
        comments: matchAll(body, /\{\/\*([\s\S]*?)\*\/\}/g),
        listItems: matchAll(body, /^- (.+)$/gm),
    }
}

describe('installed generated Split artifact', () => {
    const manifest = loadSplitContentManifest(artifactRoot)
    const guideEntries = (manifest?.entries ?? []).filter((entry) => entry.content_type === 'guide')
    const released: readonly string[] = SPLIT_CONTENT_INDEX_RELEASED_PATHS

    it('installs exactly the guide files the manifest lists', () => {
        expect(fs.statSync(path.join(artifactRoot, 'manifest.json')).isFile()).toBe(true)
        expect(manifest).not.toBeNull()
        expect(manifest!.entries.length).toBeGreaterThan(0)

        // Nothing installed but unlisted, nothing listed but missing. The manifest records the
        // path inside mono; on disk the guides sit under the artifact root.
        const guidesDirectory = path.join(artifactRoot, 'guides')
        const installedFiles = fs
            .readdirSync(guidesDirectory)
            .flatMap((slug) => fs.readdirSync(path.join(guidesDirectory, slug)).map((file) => `guides/${slug}/${file}`))
            .sort()
        expect(installedFiles).toEqual(
            guideEntries.map((entry) => entry.output_path.replace('split-content/published/', '')).sort()
        )
    })

    it('resolves every manifest path through the production loader', () => {
        const guidePaths = splitGuidePaths(artifactRoot)
        expect(guidePaths).toEqual(
            guideEntries.map((entry) => entry.public_path).sort((left, right) => left.localeCompare(right))
        )
        expect(splitContentPaths(artifactRoot)).toEqual(
            manifest!.entries.map((entry) => entry.public_path).sort((left, right) => left.localeCompare(right))
        )

        for (const locale of LOCALES) {
            const expectedSlugs = guideEntries
                .filter((entry) => entry.locale === locale)
                .map((entry) => entry.slug)
                .sort((left, right) => left.localeCompare(right))
            expect(splitGuideStaticParams(locale, artifactRoot)).toEqual(expectedSlugs.map((slug) => ({ slug })))
        }
    })

    // One case per installed output, so a failure names the guide instead of stopping the run at
    // the first bad file. `it.each` over the manifest also means a new cohort gets covered by
    // being installed, with nothing here to remember to update.
    it.each(guideEntries.map((entry) => [`${entry.locale}/${entry.slug}`, entry] as const))(
        'renders %s with everything its source promises',
        async (identity, entry) => {
            const guidePaths = splitGuidePaths(artifactRoot)
            const guide = getSplitGuide(entry.locale, entry.slug, artifactRoot)
            expect(guide, identity).not.toBeNull()

            const metadata = await splitGuideMetadataFor(entry.locale, entry.slug, artifactRoot)
            const alternates = guideAlternates(entry.slug, artifactRoot)
            expect(metadata.title, identity).toBe(`${guide!.title} | Peanut`)
            expect(metadata.description, identity).toBe(guide!.description)
            // Every sibling resolves to a real manifest path. None is advertised as an alternate
            // here, because this suite runs without `SEO_INDEXABLE` — a box that has not claimed
            // to be the indexed deployment renders every guide noindex, released or not.
            for (const href of Object.values(alternates ?? {})) expect(guidePaths, identity).toContain(href)
            expect(metadata.alternates, identity).toEqual({
                canonical: absoluteUrl(entry.public_path),
                languages: undefined,
            })
            expect(metadata.robots, identity).toMatchObject({ index: false, follow: false, noarchive: true })

            const body = await renderSplitGuideBody(guide!.body, { locale: entry.locale, guidePaths })
            const html = renderToStaticMarkup(
                <SplitGuideLayout guide={guide!} alternates={alternates}>
                    {body}
                </SplitGuideLayout>
            )

            expect(html.match(/<h1\b/g), identity).toHaveLength(1)
            expect(html, identity).toContain(`${guide!.title}</h1>`)
            expect(html, identity).not.toMatch(/href="\/(?:new|app|import|r)(?:[/?#"])/)

            // Nothing on the site linked a guide before this: the layout owns the way out. Home,
            // the locale's hub, and every OTHER released guide in the same language — a mesh, so
            // no released guide depends on a slice landing on it.
            expect(html, `${identity} home crumb`).toContain('href="/"')
            expect(html, `${identity} hub link`).toContain(`href="${localizedPath('/blog', entry.locale)}"`)
            const siblings = guideEntries.filter(
                (row) =>
                    row.locale === entry.locale &&
                    row.public_path !== entry.public_path &&
                    released.includes(row.public_path)
            )
            for (const sibling of siblings) {
                expect(html, `${identity} sibling ${sibling.public_path}`).toContain(`href="${sibling.public_path}"`)
            }

            const promised = sourcePromises(guide!.body)

            // Prose. Every heading, quote line and table cell in the source has to survive to the
            // markup — a node the policy admits but no component renders would drop out here.
            for (const heading of promised.headings) {
                expect(html, `${identity} h${heading.level}: ${heading.text}`).toContain(
                    `>${escapeHtml(heading.text)}</h${heading.level}>`
                )
            }
            for (const line of promised.quoteLines) expectRendered(html, line, `${identity} quote`)
            for (const cell of promised.tableCells) expectRendered(html, cell, `${identity} cell`)

            // Elements, and each one carrying a class. MDX falls back to the bare tag when the
            // component map has no override, so `class=` is what separates "the renderer styles
            // this" from "the browser default happens to look close enough".
            if (promised.quoteLines.length > 0) expect(html, identity).toContain('<blockquote class=')
            if (promised.tableCells.length > 0) {
                expect(html, identity).toContain('<table class=')
                expect(html, identity).toContain('<td class=')
                // The comparison tables are wider than the 36rem column on a phone, so they have
                // to scroll inside their own box rather than push the page sideways.
                expect(html, identity).toContain('overflow-x-auto')
                expect(html, identity).toContain('min-w-[32rem]')
            }
            if (promised.emphasis.length > 0) expect(html, identity).toContain('<em class=')
            if (promised.listItems.length > 0) expect(html, identity).toContain('<ul class=')

            // Links. Citations keep their exact target and stay untrusted anchors; siblings and
            // the CTA keep theirs.
            for (const href of promised.externalHrefs) {
                expect(html, `${identity} citation: ${href}`).toContain(`href="${escapeHtml(href)}"`)
                expect(html, identity).toContain('rel="noopener noreferrer"')
            }
            for (const href of [...promised.ctaHrefs, ...promised.relatedHrefs]) {
                expect(html, `${identity} href: ${href}`).toContain(`href="${escapeHtml(href)}"`)
            }
            for (const title of promised.stepTitles) {
                expect(html, `${identity} step: ${title}`).toContain(escapeHtml(title))
            }

            // Provenance markers are source-level. They make the page compile; they must not leak
            // into the served HTML as text.
            for (const comment of promised.comments) {
                expect(html, `${identity} comment leaked`).not.toContain(escapeHtml(comment.slice(0, 40)))
            }
            expect(html, identity).not.toContain('{/*')
        }
    )

    /**
     * Twelve dead links, on pages about to be crawlable: the layout used to build
     * `guidePath(locale, slug)` for every locale in the set, and nine of the fifteen guides ship in
     * one locale only. The synthetic fixture has all three locales, so the fixture-backed suite saw
     * nothing wrong — which is why this reads the installed artifact.
     *
     * Two assertions, because they fail for different reasons: no guide-shaped link anywhere on the
     * page may name a path the manifest does not list, and the language nav must be exactly the
     * manifest's sibling rows for that slug.
     */
    it('links only the locales the manifest installs, on every installed guide', async () => {
        const guidePaths = splitGuidePaths(artifactRoot)
        const navSizes: number[] = []

        for (const entry of guideEntries) {
            const identity = `${entry.locale}/${entry.slug}`
            const guide = getSplitGuide(entry.locale, entry.slug, artifactRoot)!
            const body = await renderSplitGuideBody(guide.body, { locale: entry.locale, guidePaths })
            const html = renderToStaticMarkup(
                <SplitGuideLayout guide={guide} alternates={guideAlternates(entry.slug, artifactRoot)}>
                    {body}
                </SplitGuideLayout>
            )

            // Every root-relative guide link on the page: the language nav and the related links.
            for (const [, href] of html.matchAll(/href="(\/(?:[a-z0-9-]+\/)?guides\/[^"#?]+)"/g)) {
                expect(guidePaths, `${identity} links ${href}`).toContain(href)
            }

            // Read back from the manifest rows rather than from `guideAlternates`, so the nav has
            // to agree with the inventory even if the alternates helper starts lying.
            const siblings = manifest!.entries
                .filter((row) => row.content_type === 'guide' && row.slug === entry.slug)
                .map((row) => row.public_path)
                .filter((publicPath) => publicPath !== entry.public_path)
                .sort()
            // Scoped by testid, not by "first aria-labelled nav": the breadcrumb trail and the
            // footer nav are both labelled and both sit outside this one.
            const nav = /<nav[^>]*data-testid="guide-language-nav"[^>]*>([\s\S]*?)<\/nav>/.exec(html)
            const navHrefs = [...(nav?.[1] ?? '').matchAll(/href="([^"]+)"/g)].map((match) => match[1]).sort()

            expect(navHrefs, identity).toEqual(siblings)
            navSizes.push(navHrefs.length)
        }

        // Guard the extractor itself: a regex that matched nothing would satisfy every check above.
        expect(navSizes).toContain(2)
        expect(navSizes).toContain(0)
    })

    // Every construct the policy admits has to be exercised somewhere in the cohort. Without this
    // a future artifact that happens to drop blockquotes would quietly stop covering them.
    it('exercises every construct the MDX policy admits', async () => {
        const guidePaths = splitGuidePaths(artifactRoot)
        const rendered: string[] = []
        for (const entry of guideEntries) {
            const guide = getSplitGuide(entry.locale, entry.slug, artifactRoot)!
            rendered.push(
                renderToStaticMarkup(await renderSplitGuideBody(guide.body, { locale: entry.locale, guidePaths }))
            )
        }
        const corpus = rendered.join('')
        for (const marker of [
            '<blockquote class=',
            '<table class=',
            '<td class=',
            '<th class=',
            '<em class=',
            '<ul class=',
            '<li class=',
            '<strong class=',
            '<h2 class=',
            '<h3 class=',
            '<p class=',
            'href="https://',
            'href="http://',
            'href="/guides/',
        ]) {
            expect(corpus, marker).toContain(marker)
        }
    })

    it('loads every structured page the manifest declares', () => {
        for (const entry of manifest!.entries.filter((candidate) => candidate.content_type === 'hub')) {
            const hub = getSplitHub(entry.locale, artifactRoot)
            expect(hub?.entry.public_path, entry.public_path).toBe(entry.public_path)
            expect(hub!.payload.content.cards.length, entry.public_path).toBeGreaterThan(0)
        }

        const toolsEntry = manifest!.entries.find((entry) => entry.content_type === 'tools_hub')
        const calculatorEntries = manifest!.entries.filter((entry) => entry.content_type === 'calculator')
        expect(getSplitToolsHub(artifactRoot)?.entry.public_path).toBe(toolsEntry?.public_path)
        expect(getSplitToolsHub(artifactRoot)?.payload.content.calculator_slugs?.length ?? 0).toBe(
            calculatorEntries.length
        )
        expect(
            listSplitCalculators(artifactRoot)
                .map((page) => page.entry.slug)
                .sort()
        ).toEqual(calculatorEntries.map((entry) => entry.slug).sort())
        for (const entry of calculatorEntries) {
            const calculator = getSplitCalculator(entry.slug, artifactRoot)
            expect(calculator?.entry.public_path, entry.slug).toBe(entry.public_path)
            expect(calculator?.payload.canonical, entry.slug).toBe(absoluteUrl(entry.public_path))
        }
    })
})
