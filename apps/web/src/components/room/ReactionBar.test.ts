import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('the reaction picker trigger', () => {
    it('uses a doodle without visible emoji text', () => {
        const source = readFileSync(new URL('./ReactionBar.tsx', import.meta.url), 'utf8')
        const triggerStart = source.indexOf('data-testid="reaction-add"')
        const triggerEnd = source.indexOf('</button>', triggerStart)
        const trigger = source.slice(triggerStart, triggerEnd)

        expect(triggerStart).toBeGreaterThan(-1)
        expect(triggerEnd).toBeGreaterThan(triggerStart)
        expect(trigger).toContain('<Doodle name="reactionlaugh"')
        expect(trigger).not.toMatch(/\p{Extended_Pictographic}/u)
    })
})
