import { describe, expect, it } from 'vitest'
import { listAllTranslations } from '@/lib/content'
import { PLAY_TIER_COMPONENT_NAMES } from './register-governor'
import { FLAT_REGISTER_SLUGS, pageRecipe } from './recipe'
import { spotPlan } from './spot-placer'

/**
 * The corpus enforcement test fun-engine.md Invariants #4 asks for — run against every real
 * `FLAT_REGISTER_SLUGS` entry rather than two mechanisms tested only in isolation from each other,
 * and rather than one slug hardcoded here a second time.
 *
 * That set is empty today (Konrad's 20 Aug ruling — see recipe.ts), so every case below is
 * generated from nothing and this file asserts vacuously. Kept, not deleted: it is the corpus gate
 * that runs the moment a page earns the flat register, and it needs no edit to pick that page up.
 * The mechanisms themselves stay covered against a literal `'flat'` by skin.test.ts,
 * spot-placer.test.ts and register-governor.test.ts.
 */
const allTranslations = listAllTranslations()
const flatDocs = [...FLAT_REGISTER_SLUGS].map((slug) => {
    const doc = allTranslations.find((entry) => entry.slug === slug && entry.locale === 'en')
    if (!doc) throw new Error(`flat-register.test.ts: no published en.md found for FLAT_REGISTER_SLUGS slug "${slug}"`)
    return doc
})

it('found a published en.md for every flat-register slug — none to find today', () => {
    expect(flatDocs.length).toBe(FLAT_REGISTER_SLUGS.size)
})

describe.each(flatDocs.map((doc) => [doc.slug, doc] as const))('flat-register page: %s', (slug, doc) => {
    it('carries real structural content to scan, not an empty fixture', () => {
        expect(doc.body).toMatch(/<Steps|<Checklist/)
    })

    const recipe = pageRecipe(doc.collection, slug, doc.frontmatter.tags ?? [], 'en')

    it('resolves to the flat register', () => {
        expect(recipe.register).toBe('flat')
    })

    it('renders no play-tier component — a regex scan of the real body, mirroring content.test.ts’s matchAll idiom', () => {
        const usedComponentNames = new Set([...doc.body.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map((match) => match[1]))
        for (const name of PLAY_TIER_COMPONENT_NAMES) {
            expect(usedComponentNames.has(name), `${name} must never appear on a flat-register page`).toBe(false)
        }
    })

    it('spotPlan places no doodle on this page, at any section count', () => {
        for (const sectionCount of [0, 1, 2, 4, 8, 20]) {
            expect(spotPlan(recipe.seed, recipe.chapter, sectionCount, recipe.register)).toEqual([])
        }
    })
})
