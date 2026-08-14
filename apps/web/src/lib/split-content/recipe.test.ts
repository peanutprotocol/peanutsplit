import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOCALES } from '@/i18n/locales'
import { listAllTranslations } from '@/lib/content'
import { loadSplitContentManifest } from './artifact'
import { CHAPTER_BY_SLUG, FLAT_REGISTER_SLUGS, SplitRecipeError, pageRecipe, type PageKind } from './recipe'

/** Every (slug, collection) pair that actually has a file under src/content/, deduped by slug. */
const REAL_COLLECTION_SLUGS = [...new Map(listAllTranslations().map((doc) => [doc.slug, doc.collection])).entries()]

/**
 * Every collection/* directory name on disk, bypassing listAllTranslations()'s runtime filters
 * (published, v2Only). CHAPTER_BY_SLUG covers slugs by directory name, not by "currently
 * rendered" — a v2Only directory (scan-a-receipt-to-split-a-bill) is a real slug even when
 * NEXT_PUBLIC_SPLIT_V2_ENABLED is unset in this test run, and must still resolve.
 */
const CONTENT_ROOT = path.join(process.cwd(), 'src/content')
const REAL_COLLECTION_DIR_SLUGS: [string, PageKind][] = (['alternatives', 'blog', 'capture'] as const).flatMap(
    (collection) =>
        fs
            .readdirSync(path.join(CONTENT_ROOT, collection), { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry): [string, PageKind] => [entry.name, collection])
)

/** Every guide slug the generated manifest actually carries, deduped across its locale rows. */
const manifest = loadSplitContentManifest()
const REAL_GUIDE_SLUGS = manifest
    ? [...new Set(manifest.entries.filter((entry) => entry.content_type === 'guide').map((entry) => entry.slug))]
    : []

/** One representative kind per real slug, for calls that need *a* valid kind. */
const KIND_BY_SLUG = new Map<string, PageKind>([
    ...REAL_COLLECTION_SLUGS,
    ...REAL_GUIDE_SLUGS.filter((slug) => !REAL_COLLECTION_SLUGS.some(([s]) => s === slug)).map(
        (slug): [string, PageKind] => [slug, 'guide']
    ),
])

describe('pageRecipe', () => {
    it('has real content to check against', () => {
        expect(REAL_COLLECTION_SLUGS.length).toBeGreaterThan(0)
        expect(REAL_GUIDE_SLUGS.length).toBeGreaterThan(0)
    })

    it('resolves every real Collection slug without throwing', () => {
        for (const [slug, collection] of REAL_COLLECTION_SLUGS) {
            expect(() => pageRecipe(collection, slug, undefined, 'en')).not.toThrow()
        }
    })

    it('resolves every real manifest guide slug without throwing', () => {
        for (const slug of REAL_GUIDE_SLUGS) {
            expect(() => pageRecipe('guide', slug, undefined, 'en')).not.toThrow()
        }
    })

    it('throws SplitRecipeError for an unknown slug', () => {
        expect(() => pageRecipe('blog', 'this-slug-does-not-exist', undefined, 'en')).toThrow(SplitRecipeError)
    })

    it('is invariant to locale (and to tags) for every real slug', () => {
        for (const [slug, kind] of KIND_BY_SLUG) {
            const en = pageRecipe(kind, slug, ['tag-one'], 'en')
            for (const locale of LOCALES) {
                if (locale === 'en') continue
                expect(pageRecipe(kind, slug, ['a-different-tag'], locale)).toEqual(en)
            }
        }
    })

    it('maps the one flat-register slug to a real alternatives/* directory name', () => {
        expect(FLAT_REGISTER_SLUGS.size).toBe(1)
        const alternativesDirs = fs
            .readdirSync(path.join(process.cwd(), 'src/content/alternatives'), { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
        for (const slug of FLAT_REGISTER_SLUGS) expect(alternativesDirs).toContain(slug)
    })

    it('resolves every capture/* slug to the default register', () => {
        const captureDirs = fs
            .readdirSync(path.join(process.cwd(), 'src/content/capture'), { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
        expect(captureDirs.length).toBeGreaterThan(0)
        for (const slug of captureDirs) expect(pageRecipe('capture', slug, undefined, 'en').register).toBe('default')
    })

    it('resolves the two dual-kind slugs (blog and guide) to the same chapter, no duplicate-key issue', () => {
        const dualSlugs = ['split-a-group-trip-across-countries', 'split-expenses-across-currencies']
        for (const slug of dualSlugs) {
            expect(REAL_GUIDE_SLUGS).toContain(slug)
            expect(REAL_COLLECTION_SLUGS.some(([s]) => s === slug)).toBe(true)
            expect(pageRecipe('guide', slug, undefined, 'en').chapter).toBe(
                pageRecipe('blog', slug, undefined, 'en').chapter
            )
        }
    })

    it('maps exactly the real slug set — an unmapped slug is a test failure, not a silent default', () => {
        const realSlugs = new Set([...REAL_COLLECTION_DIR_SLUGS.map(([slug]) => slug), ...REAL_GUIDE_SLUGS])
        expect(new Set(Object.keys(CHAPTER_BY_SLUG))).toEqual(realSlugs)
    })
})
