import { describe, expect, it } from 'vitest'
import { DOODLE } from '@/components/ui/doodles'
import { emblemDoodle, isEmojiEmblem } from '@/lib/room-emblem'
import { doodleDataUri } from '@/server/og/emblem'

describe('emblemDoodle', () => {
    it('recognises a drawn emblem', () => {
        expect(emblemDoodle('mountain')).toBe('mountain')
        expect(emblemDoodle('peanut')).toBe('peanut')
    })

    it('draws legacy room-picker emoji without rewriting stored room data', () => {
        expect(emblemDoodle('🏔️')).toBe('mountain')
        expect(emblemDoodle('🥜')).toBe('peanut')
        expect(emblemDoodle('🧾')).toBe('iconreceipt')
    })

    it('treats an unknown or empty value as not drawn', () => {
        expect(emblemDoodle('helicopter')).toBeNull()
        expect(emblemDoodle('')).toBeNull()
        expect(emblemDoodle(null)).toBeNull()
        expect(emblemDoodle(undefined)).toBeNull()
    })
})

describe('isEmojiEmblem', () => {
    /**
     * This is the guard on the push-notification title. A room whose emblem is drawn must not
     * produce "mountain Ski trip" in someone's lock screen — there is nowhere to render a path
     * in a notification, so the emblem is simply left out.
     */
    it('is true only for what can be pasted into text', () => {
        expect(isEmojiEmblem('🏔️')).toBe(true)
        expect(isEmojiEmblem('mountain')).toBe(false)
        expect(isEmojiEmblem(null)).toBe(false)
        expect(isEmojiEmblem('')).toBe(false)
    })
})

describe('doodleDataUri', () => {
    it('builds a self-contained SVG with the drawing in it, and no network', () => {
        const uri = doodleDataUri('mountain')
        expect(uri.startsWith('data:image/svg+xml;utf8,')).toBe(true)
        const svg = decodeURIComponent(uri.slice('data:image/svg+xml;utf8,'.length))
        expect(svg).toContain('viewBox="0 0 32 32"')
        expect(svg).toContain(DOODLE.mountain)
        // Stroke only. A filled path would come out as a black lump on the unfurl.
        expect(svg).toContain('fill="none"')
    })

    it('produces something small enough to inline on every card', () => {
        // The whole point over the emoji path, which has to fetch a Twemoji glyph from a CDN the
        // production containers cannot reach.
        for (const name of Object.keys(DOODLE)) {
            expect(doodleDataUri(name as keyof typeof DOODLE).length).toBeLessThan(8000)
        }
    })
})
