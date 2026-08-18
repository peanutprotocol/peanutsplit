import { describe, expect, it } from 'vitest'
import { INDEXED_LOCALES } from '@/i18n/locales'
import { listAllTranslations } from '@/lib/content'
import { listSplitGuides } from './artifact'
import { densityScore } from './density'

/**
 * CI-blocking (fun-engine.md S5): this is the baseline the gate protects going forward. Every
 * real doc/guide file resolves a chapter and reaches back into the product today; a future file
 * that breaks either must fail here, not ship silently.
 */
describe('densityScore', () => {
    it('has real content to check against', () => {
        expect(listAllTranslations().length).toBeGreaterThan(0)
        expect(listSplitGuides('en').length).toBeGreaterThan(0)
    })

    it('has no hard fails for any real native doc, in any locale it ships', () => {
        for (const doc of listAllTranslations()) {
            const { hardFails } = densityScore(doc.collection, doc.slug, doc.frontmatter.tags ?? [], doc.body)
            expect(hardFails, `${doc.collection}/${doc.slug}/${doc.locale}`).toEqual([])
        }
    })

    it('has no hard fails for any real guide, in any locale it ships', () => {
        for (const locale of INDEXED_LOCALES) {
            for (const guide of listSplitGuides(locale)) {
                const { hardFails } = densityScore('guide', guide.slug, guide.tags, guide.body)
                expect(hardFails, `guide/${guide.slug}/${locale}`).toEqual([])
            }
        }
    })

    it('hard-fails on an unmapped chapter', () => {
        const { hardFails } = densityScore('blog', 'this-slug-does-not-exist', [], '<CTA text="x" href="/new" />')
        expect(hardFails).toEqual([
            'blog/this-slug-does-not-exist: pageRecipe: no chapter mapped for slug "this-slug-does-not-exist"',
        ])
    })

    it('hard-fails on a body with no CTA or RelatedLink', () => {
        const { hardFails } = densityScore('blog', 'fronting-a-group-trip', [], 'Just some prose, no way out.')
        expect(hardFails).toEqual([
            'blog/fronting-a-group-trip: no CTA or RelatedLink — page has no way back into the product',
        ])
    })

    it('warns on a wall of prose but does not hard-fail it', () => {
        const wall = `${'One plain paragraph.\n\n'.repeat(4)}<CTA text="x" href="/new" />`
        const { hardFails, warnings } = densityScore('blog', 'fronting-a-group-trip', [], wall)
        expect(hardFails).toEqual([])
        expect(warnings.length).toBeGreaterThan(0)
    })
})
