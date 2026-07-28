import { describe, expect, it } from 'vitest'
import { groupReactions, isReactionEmoji, REACTION_EMOJIS } from '@/lib/reactions'
import { DEFAULT_THEME, DEFAULT_THEME_KEY, isThemeKey, ROOM_THEMES, themeFor, themeVars } from '@/lib/themes'

const HEX = /^#[0-9A-F]{6}$/

describe('the theme catalog', () => {
    it('has a unique key per entry', () => {
        expect(new Set(ROOM_THEMES.map((theme) => theme.key)).size).toBe(ROOM_THEMES.length)
    })

    it('spells every colour as a full uppercase hex', () => {
        for (const theme of ROOM_THEMES) {
            for (const colour of [theme.field, theme.fieldTint, theme.fieldInk, theme.tint, theme.accent]) {
                expect(colour, `${theme.key}: ${colour}`).toMatch(HEX)
            }
        }
    })

    /**
     * The design system is black ink on a light field with a black border, and
     * every component assumes it. A dark field would need a second ink token
     * everywhere — this is the test that says so out loud, and it is why there
     * is no inverted theme in the catalog.
     */
    it('keeps every field light enough to carry black ink', () => {
        const luminance = (hex: string) => {
            const channel = (offset: number) => {
                const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
                return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
            }
            return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
        }
        // Contrast against black is (L + 0.05) / 0.05; WCAG AA large text wants
        // 3:1, and the header title is 18px bold. Every field clears 4.5:1.
        for (const theme of ROOM_THEMES) {
            const contrast = (luminance(theme.field) + 0.05) / 0.05
            expect(contrast, `${theme.key} field vs black ink`).toBeGreaterThanOrEqual(4.5)
        }
    })

    it('reproduces today’s look exactly under the default key', () => {
        expect(DEFAULT_THEME.key).toBe(DEFAULT_THEME_KEY)
        // These four literals were the constants in `og/card.tsx` and the
        // `bg-primary-1` / `bg-white` classes before themes existed. A change
        // here is a change to every unthemed room in production.
        expect(DEFAULT_THEME.field).toBe('#FFC900')
        expect(DEFAULT_THEME.fieldTint).toBe('#FFD84D')
        expect(DEFAULT_THEME.fieldInk).toBe('#7A5E00')
        expect(DEFAULT_THEME.tint).toBe('#FFFFFF')
    })

    it('accepts only catalog keys', () => {
        for (const theme of ROOM_THEMES) expect(isThemeKey(theme.key)).toBe(true)
        for (const junk of ['', 'CLASSIC', 'neon', '#FF0000', 'classic ', null, 42, {}]) {
            expect(isThemeKey(junk)).toBe(false)
        }
    })

    it('falls back to the default rather than throwing on an unknown key', () => {
        expect(themeFor(null)).toBe(DEFAULT_THEME)
        expect(themeFor(undefined)).toBe(DEFAULT_THEME)
        // A key written by a newer build, then rolled back. A room that renders
        // in the default palette beats a 500 in the middle of a trip.
        expect(themeFor('theme-from-the-future')).toBe(DEFAULT_THEME)
        expect(themeFor('mint').key).toBe('mint')
    })

    it('exports the same variable set whatever the theme', () => {
        const keys = Object.keys(themeVars(null))
        expect(keys).toEqual([
            '--split-theme-field',
            '--split-theme-field-tint',
            '--split-theme-tint',
            '--split-theme-accent',
        ])
        for (const theme of ROOM_THEMES) expect(Object.keys(themeVars(theme.key))).toEqual(keys)
        expect(themeVars(null)['--split-theme-field']).toBe('#FFC900')
        expect(themeVars('sky')['--split-theme-field']).toBe('#90A8ED')
    })
})

describe('the reaction allowlist', () => {
    it('is exactly six emoji, with no duplicates', () => {
        expect(REACTION_EMOJIS).toHaveLength(6)
        expect(new Set(REACTION_EMOJIS).size).toBe(6)
    })

    it('rejects everything outside it, including near misses', () => {
        for (const emoji of REACTION_EMOJIS) expect(isReactionEmoji(emoji)).toBe(true)
        // Skin tone modifier, ZWJ sequence, plain text, an empty string, a
        // lookalike with a variation selector — the swamp the allowlist avoids.
        for (const junk of ['👏🏽', '👨‍👩‍👧', '🔥🔥', '', ' 🔥', '😂️', '<script>', null]) {
            expect(isReactionEmoji(junk), String(junk)).toBe(false)
        }
    })
})

describe('groupReactions', () => {
    const rows = [
        { emoji: '😂', memberId: 'm1' },
        { emoji: '🔥', memberId: 'm2' },
        { emoji: '😂', memberId: 'm2' },
    ]

    it('counts per emoji and flags the reader’s own', () => {
        expect(groupReactions(rows, 'm1')).toEqual([
            { emoji: '🔥', count: 1, mine: false },
            { emoji: '😂', count: 2, mine: true },
        ])
    })

    it('orders by the allowlist, not by count — a pill must not move under a thumb', () => {
        const busy = groupReactions(
            [
                { emoji: '🤑', memberId: 'm1' },
                { emoji: '🔥', memberId: 'm2' },
                { emoji: '🤑', memberId: 'm3' },
            ],
            undefined
        )
        expect(busy.map((group) => group.emoji)).toEqual(['🔥', '🤑'])
    })

    it('claims nothing for a reader with no identity', () => {
        expect(groupReactions(rows, undefined).every((group) => !group.mine)).toBe(true)
    })

    it('ignores an emoji that is no longer on the allowlist', () => {
        // Rows written before a future catalog edit. They stay in the database —
        // nothing here deletes user data — but they stop rendering.
        expect(groupReactions([{ emoji: '💩', memberId: 'm1' }], 'm1')).toEqual([])
    })
})
