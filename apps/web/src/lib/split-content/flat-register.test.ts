import { describe, expect, it } from 'vitest'
import { getDoc } from '@/lib/content'
import { PLAY_TIER_COMPONENT_NAMES } from './register-governor'
import { pageRecipe } from './recipe'
import { spotPlan } from './spot-placer'

/**
 * The corpus enforcement test fun-engine.md Invariants #4 asks for — run against the one real
 * flat-register page rather than two mechanisms tested only in isolation from each other. Loads
 * `splitwise-daily-limit`'s actual `en.md` (verified to carry a live `<Steps>`/`<Checklist>` block)
 * and checks the real, resolved register straight through both the register governor's tag scan
 * and the spot placer's own contract.
 */

describe('the one live flat-register page (splitwise-daily-limit)', () => {
    const doc = getDoc('alternatives', 'splitwise-daily-limit', 'en')

    it('has the real content file to check against', () => {
        expect(doc).not.toBeNull()
        expect(doc!.body).toContain('<Steps')
    })

    const recipe = pageRecipe('alternatives', 'splitwise-daily-limit', doc?.frontmatter.tags ?? [], 'en')

    it('resolves to the flat register', () => {
        expect(recipe.register).toBe('flat')
    })

    it('renders no play-tier component — a regex scan of the real body, mirroring content.test.ts’s matchAll idiom', () => {
        const usedComponentNames = new Set([...doc!.body.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map((match) => match[1]))
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
