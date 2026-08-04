import { describe, expect, it } from 'vitest'
import { DOODLE } from '@/components/ui/doodles'
import { emblemChoice, emblemDoodle, roomEmblemDoodle, roomEmblemValue } from '@/lib/room-emblem'
import { encodeRoomDrawing } from '@/lib/room-drawing'
import { doodleDataUri, emblemDataUri } from '@/server/og/emblem'

const custom = encodeRoomDrawing([
    [
        { x: 0.1, y: 0.2 },
        { x: 0.9, y: 0.8 },
    ],
])

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

describe('roomEmblemDoodle', () => {
    it('follows the room name while nothing is stored', () => {
        expect(roomEmblemDoodle(null, 'Ski trip')).toBe('ski')
        expect(roomEmblemDoodle(undefined, 'Pizza night')).toBe('pizza')
        expect(roomEmblemDoodle('', 'Beach holiday')).toBe('island')
    })

    it('prefers a stored drawing over the name', () => {
        expect(roomEmblemDoodle('pizza', 'Ski trip')).toBe('pizza')
        expect(roomEmblemDoodle('🏔️', 'Pizza night')).toBe('mountain')
    })

    it('keeps an unreadable stored value on the peanut instead of re-deriving it', () => {
        // Still a pin — somebody chose a picture we cannot draw, and quietly
        // swapping it for the name's guess would change their room.
        expect(roomEmblemDoodle('🦖', 'Ski trip')).toBe('peanut')
    })

    it('falls back to the peanut when the name says nothing either', () => {
        expect(roomEmblemDoodle(null, 'Quarterly offsite')).toBe('peanut')
    })
})

describe('emblemChoice', () => {
    it('writes nothing when the tapped drawing is already the one on screen', () => {
        expect(emblemChoice('pizza', 'pizza', 'Ski trip')).toBeNull()
        expect(emblemChoice('ski', null, 'Ski trip')).toBeNull()
        // A legacy emoji already draws as the mountain, so re-storing the name of
        // that same drawing is a write with nothing to show for it.
        expect(emblemChoice('mountain', '🏔️', 'Ski trip')).toBeNull()
    })

    it('pins the tapped drawing', () => {
        expect(emblemChoice('pizza', null, 'Ski trip')).toEqual({ emblem: 'pizza' })
        expect(emblemChoice('cake', 'pizza', 'Ski trip')).toEqual({ emblem: 'cake' })
        expect(emblemChoice(custom, null, 'Ski trip')).toEqual({ emblem: custom })
        expect(emblemChoice(custom, custom, 'Ski trip')).toBeNull()
        expect(roomEmblemValue(custom, 'Ski trip')).toBe(custom)
    })

    it('releases the pin when the tapped drawing is the one the name gives', () => {
        expect(emblemChoice('ski', 'pizza', 'Ski trip')).toEqual({ emblem: null })
        // Same drawing either way, but the room goes back to following its name,
        // so a later rename can move it again.
        expect(emblemChoice('peanut', 'peanut', 'Quarterly offsite')).toEqual({ emblem: null })
    })

    it('round-trips a pin and back with no way to get stuck', () => {
        const pinned = emblemChoice('pizza', null, 'Ski trip')
        expect(pinned).toEqual({ emblem: 'pizza' })
        expect(roomEmblemDoodle(pinned?.emblem, 'Ski trip')).toBe('pizza')

        const released = emblemChoice('ski', pinned?.emblem, 'Ski trip')
        expect(released).toEqual({ emblem: null })
        expect(roomEmblemDoodle(released?.emblem, 'Ski trip')).toBe('ski')
        expect(roomEmblemDoodle(released?.emblem, 'Pizza night')).toBe('pizza')
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
        // The whole point is a small self-contained drawing with no CDN fallback.
        for (const name of Object.keys(DOODLE)) {
            expect(doodleDataUri(name as keyof typeof DOODLE).length).toBeLessThan(8000)
        }
    })

    it('renders custom geometry as fixed black SVG rather than stored markup', () => {
        const uri = emblemDataUri(custom)
        expect(uri?.startsWith('data:image/svg+xml;utf8,')).toBe(true)
        const svg = decodeURIComponent(uri!.slice('data:image/svg+xml;utf8,'.length))
        expect(svg).toContain('M3.191 6.413 L28.809 25.587')
        expect(svg).toContain('stroke="#211C17"')
        expect(svg).not.toContain(custom)
        expect(emblemDataUri('drawing:v1:not-valid')).toBeNull()
    })
})
