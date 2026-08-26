import { describe, expect, it } from 'vitest'

import { ANTI_AI_STRINGS, NEVER_STRINGS } from '@/lib/content.test'
import { marketingCopy } from './copy'

/** Every string leaf of the block, so a new section is gated the day it is added. */
function stringLeaves(value: unknown): string[] {
    if (typeof value === 'string') return [value]
    if (Array.isArray(value)) return value.flatMap(stringLeaves)
    if (value && typeof value === 'object') return Object.values(value).flatMap(stringLeaves)
    return []
}

describe('import page copy', () => {
    const groupSize = marketingCopy.importPage.faq.items.find((item) => item.q.includes('How big a group'))

    it('does not sell 500 expenses as a refusal', () => {
        expect(groupSize).toBeDefined()
        // The importer keeps the most recent expenses and folds older ones into an opening
        // balance, so a file over 500 is carried rather than rejected.
        expect(groupSize?.a).not.toMatch(/(?:up to|maximum of|and)\s+500\s+expenses/i)
        expect(groupSize?.a).toMatch(/Balance brought forward/)
    })

    it('keeps the twenty-person cap, which is a real reject', () => {
        expect(groupSize?.a).toMatch(/20 people/)
    })

    // `marketingCopy` is the one English frame that lives outside `src/content/`, so the content
    // gates never see it. Same sweep as `templates.test.ts`, so the rules stay defined once.
    const meta = `${marketingCopy.importPage.meta.title} ${marketingCopy.importPage.meta.description}`
    const prose = stringLeaves(marketingCopy.importPage).join('\n')

    it.each([...NEVER_STRINGS, ...ANTI_AI_STRINGS].map((rule) => [rule.id, rule] as const))(
        'never says %s',
        (_id, rule) => {
            const subject = rule.target === 'meta' ? meta : prose
            expect(subject.match(rule.pattern)?.[0], rule.why).toBeUndefined()
        }
    )

    it('spends no exclamation mark', () => {
        expect(prose).not.toContain('!')
    })
})
