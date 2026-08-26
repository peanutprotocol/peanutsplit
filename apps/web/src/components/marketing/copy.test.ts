import { describe, expect, it } from 'vitest'

import { marketingCopy } from './copy'

describe('import page copy', () => {
    const groupSize = marketingCopy.importPage.faq.items.find((item) =>
        item.q.includes('How big a group')
    )

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
})
