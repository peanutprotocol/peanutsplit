import { describe, expect, it } from 'vitest'
import { DOODLE } from '@/components/ui/doodles'
import { emblemDoodle } from '@/lib/room-emblem'
import { doodleDataUri, emblemDataUri } from '@/server/og/emblem'

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
})

describe('emblemDataUri', () => {
    it('keeps legacy and unknown stored values inside the doodle system', async () => {
        const prefix = 'data:image/svg+xml;utf8,'
        const known = decodeURIComponent((await emblemDataUri('🏔️')).slice(prefix.length))
        const unknown = decodeURIComponent((await emblemDataUri('unknown-old-emblem')).slice(prefix.length))

        expect(known).toContain(DOODLE.mountain)
        expect(unknown).toContain(DOODLE.peanut)
    })
})
