import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderSplitGuideBody } from '@/components/split-content/mdx'
import { listDocs } from '@/lib/content'
import { renderArticle } from '@/lib/mdx'
import { listSplitGuides, splitGuidePaths } from './artifact'
import { pageChapterOrNull, pageRegisterOrNull } from './recipe'
import { hashSlug } from './seed'

/**
 * Page-weight + narrow-viewport budget (fun-engine.md S5), added after checking two things first:
 * `fonts.ts`/`fonts.tailwind.test.ts` already own font-subsetting weight, so nothing here
 * duplicates that; and no byte-size or overflow assertion already existed — `js-budget.test.ts`
 * walks the *import graph* (client-JS budget), not rendered HTML, and `route.test.tsx` /
 * `published-artifact.test.tsx` render pages without measuring them.
 *
 * `ArticleLayout` cannot be rendered here: it is an async Server Component that itself renders
 * `LanguageLinks`, also async, and `react-dom/server`'s synchronous renderer (this repo's only
 * renderer in `node`-environment vitest) cannot await a NESTED async component — the exact
 * constraint `ArticleLayout.test.tsx` already documents for the same reason. So the native
 * templates measure the compiled article BODY: the actual per-page payload a content author
 * controls, and the thing that can grow unboundedly. Header/breadcrumb/footer chrome is fixed size
 * across every route and shared, not a per-page risk. The guide template's layout (`SplitGuideLayout`)
 * IS sync-renderable — `published-artifact.test.tsx` renders it whole for every real guide — but
 * this file measures its body too, so all three templates report the same, comparable number.
 */

/**
 * 48 KiB — roughly 2x the heaviest real body measured across the whole corpus today (the largest
 * single doc, `alternatives/splitwise-vs-tricount`, renders to ~31KB; the three picked templates
 * below are all under 24KB). Headroom for real content growth; still low enough to catch a runaway
 * page.
 */
const BODY_WEIGHT_BUDGET_BYTES = 49_152

interface RenderedBody {
    label: string
    html: string
}

/** Alphabetically first English doc in the collection — stable across content edits/reorders. */
async function nativeBody(collection: 'blog' | 'capture'): Promise<RenderedBody> {
    const doc = [...listDocs(collection, 'en')].sort((a, b) => a.slug.localeCompare(b.slug))[0]
    if (!doc) throw new Error(`page-weight: no ${collection} doc to measure`)
    const chapter = pageChapterOrNull(doc.collection, doc.slug, doc.frontmatter.tags ?? [], doc.locale)
    const register = pageRegisterOrNull(doc.collection, doc.slug, doc.frontmatter.tags ?? [], doc.locale)
    const context =
        chapter && register
            ? { faq: doc.frontmatter.faqs?.[0], chapter, seed: hashSlug(doc.slug), register }
            : undefined
    const body = await renderArticle(doc.body, doc.locale, context)
    return { label: `${collection}/${doc.slug}`, html: renderToStaticMarkup(body) }
}

/** Alphabetically first English guide — same stability reasoning as `nativeBody`. */
async function guideBody(): Promise<RenderedBody> {
    const guide = [...listSplitGuides('en')].sort((a, b) => a.slug.localeCompare(b.slug))[0]
    if (!guide) throw new Error('page-weight: no guide to measure')
    const body = await renderSplitGuideBody(guide.body, { locale: guide.locale, guidePaths: splitGuidePaths() })
    return { label: `guide/${guide.slug}`, html: renderToStaticMarkup(body) }
}

const VIEWPORT_PX = 360
const REM_PX = 16
const MIN_WIDTH_CLASS = /class="[^"]*\bmin-w-\[(\d+(?:\.\d+)?)(rem|px)\][^"]*"/g

/**
 * Every column in this repo is `max-w-xl` — a responsive ceiling, never a floor, so it cannot by
 * itself force a 360px viewport to scroll sideways. The one thing that can is a `min-w-[...]`
 * floor (the wide comparison table `components.tsx`'s `Table` override renders); that is only safe
 * inside its own `overflow-x-auto` scroll box, which is what the real renderer does —
 * `published-artifact.test.tsx` already asserts both classes appear together for a table. This
 * generalizes that same check to any wide `min-w-[...]`, wherever it appears: it must sit within
 * 400 characters of a preceding `overflow-x-auto`, which is where the real wrapper always puts it.
 */
function assertNoUncontainedOverflow(html: string, label: string): void {
    for (const match of html.matchAll(MIN_WIDTH_CLASS)) {
        const px = match[2] === 'rem' ? Number(match[1]) * REM_PX : Number(match[1])
        if (px <= VIEWPORT_PX) continue
        const precedingWindow = html.slice(Math.max(0, match.index! - 400), match.index!)
        expect(precedingWindow, `${label}: ${match[0]} needs an overflow-x-auto ancestor`).toContain('overflow-x-auto')
    }
}

describe('content page weight + 360px overflow', () => {
    it('keeps the native blog body under budget with no uncontained overflow', async () => {
        const { label, html } = await nativeBody('blog')
        expect(Buffer.byteLength(html, 'utf8'), label).toBeLessThanOrEqual(BODY_WEIGHT_BUDGET_BYTES)
        assertNoUncontainedOverflow(html, label)
    })

    it('keeps the native capture body under budget with no uncontained overflow', async () => {
        const { label, html } = await nativeBody('capture')
        expect(Buffer.byteLength(html, 'utf8'), label).toBeLessThanOrEqual(BODY_WEIGHT_BUDGET_BYTES)
        assertNoUncontainedOverflow(html, label)
    })

    it('keeps a generated guide body under budget with no uncontained overflow', async () => {
        const { label, html } = await guideBody()
        expect(Buffer.byteLength(html, 'utf8'), label).toBeLessThanOrEqual(BODY_WEIGHT_BUDGET_BYTES)
        assertNoUncontainedOverflow(html, label)
    })

    it('the overflow guard actually catches an uncontained wide block', () => {
        const unguarded = '<div class="min-w-[40rem]">wide</div>'
        expect(() => assertNoUncontainedOverflow(unguarded, 'synthetic')).toThrow()

        const guarded = '<div class="overflow-x-auto"><div class="min-w-[40rem]">wide</div></div>'
        expect(() => assertNoUncontainedOverflow(guarded, 'synthetic')).not.toThrow()
    })
})
