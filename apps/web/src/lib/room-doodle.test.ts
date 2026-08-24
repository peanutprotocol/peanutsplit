import { describe, expect, it } from 'vitest'
import { DOODLE } from '@/components/ui/doodles'
import { FALLBACK_DOODLE, roomDoodleFor } from '@/lib/room-doodle'

describe('roomDoodleFor', () => {
    it('reads the obvious room names in all three languages', () => {
        expect(roomDoodleFor('Ski trip')).toBe('ski')
        expect(roomDoodleFor('Viaje a la playa')).toBe('island')
        expect(roomDoodleFor('Churrasco do sábado')).toBe('burger')
        expect(roomDoodleFor('Pizza night')).toBe('pizza')
        expect(roomDoodleFor('Aluguel do apê')).toBe('house')
    })

    it('strips accents and punctuation before matching', () => {
        // Both reach the same kebab, so the table only ever spells a keyword one way.
        expect(roomDoodleFor('Café ☕')).toBe('coffee')
        expect(roomDoodleFor('cafe')).toBe('coffee')
        expect(roomDoodleFor('CUMPLEAÑOS DE ANA')).toBe('cake')
    })

    it('prefers the specific keyword over the general one', () => {
        // Both rows match; ordering is what decides, and it is the point of the table.
        expect(roomDoodleFor('Ski trip')).toBe('ski')
        expect(roomDoodleFor('Birthday cake')).toBe('cake')
        expect(roomDoodleFor('Beach holiday')).toBe('island')
    })

    it('gives blues, jazz, and swing rooms a sax', () => {
        expect(roomDoodleFor('Blues weekend')).toBe('sax')
        expect(roomDoodleFor('Jazz night')).toBe('sax')
        expect(roomDoodleFor('Swing dance')).toBe('sax')
        expect(roomDoodleFor('Jazz night at Fabric')).toBe('sax')
    })

    it('gives club nights and well-known venue rooms lips', () => {
        expect(roomDoodleFor('Berghain weekend')).toBe('lips')
        expect(roomDoodleFor('Fabric London')).toBe('lips')
        expect(roomDoodleFor('Lux Frágil Lisbon')).toBe('lips')
        expect(roomDoodleFor('House of Yes NYC')).toBe('lips')
        expect(roomDoodleFor('Rave night')).toBe('lips')
    })

    it('does not confuse ordinary travel or clubs with nightlife', () => {
        expect(roomDoodleFor('Travel plans')).toBe('suitcase')
        expect(roomDoodleFor('Book club')).toBe(FALLBACK_DOODLE)
    })

    it('falls back to the peanut rather than to nothing', () => {
        expect(roomDoodleFor('Quarterly offsite')).toBe(FALLBACK_DOODLE)
        expect(roomDoodleFor('')).toBe(FALLBACK_DOODLE)
        expect(roomDoodleFor('   ')).toBe(FALLBACK_DOODLE)
    })

    it('only ever returns a name the drawing set actually has', () => {
        // The guard that stops a renamed drawing from rendering an empty path — a blank square
        // that looks like a broken image and passes a typecheck.
        const names = ['Ski trip', 'Praia', 'Uber home', 'Supermercado', 'Concert tickets', 'Nothing in the table']
        for (const name of names) {
            expect(DOODLE[roomDoodleFor(name)]).toBeTruthy()
        }
    })
})
