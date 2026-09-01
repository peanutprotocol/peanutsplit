import { readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DISPLAY_CHARS, DISPLAY_FONT, headlineFont, headlineWeight } from './fonts'

const GLUTEN_DIR = path.join(process.cwd(), 'node_modules', '@fontsource', 'gluten', 'files')

describe('the display face', () => {
    // Satori reads WOFF and TTF but not WOFF2 — it has no brotli decoder. Fontsource ships both,
    // and picking the wrong one fails at render time on a route with no test of its own.
    it('reads a WOFF the rasteriser can actually decode, straight out of the package', () => {
        expect(readdirSync(GLUTEN_DIR)).toContain('gluten-all-400-normal.woff')
    })

    it('is the openly licensed face, not the proprietary one it replaced', () => {
        expect(DISPLAY_FONT).toBe('Gluten')
    })
})

describe('DISPLAY_CHARS', () => {
    // The set is a verbatim copy of the font's cmap. If it claims a glyph the font lacks, Satori
    // silently drops the character; if it omits one the font has, headlines needlessly downgrade.
    it('covers the alphabets the product actually ships in', () => {
        for (const sample of ['Ski trip', 'Cañón', 'Kraków', 'Việt Nam', 'Reykjavík', 'Zürich']) {
            expect(
                [...sample].every((char) => DISPLAY_CHARS.has(char)),
                sample
            ).toBe(true)
        }
    })

    it('carries the currency signs a room hero can be titled with', () => {
        for (const sign of ['€', '£', '₫', '₱', '₹', '₩', '$']) expect(DISPLAY_CHARS.has(sign)).toBe(true)
    })

    // Knerd lacked these three; Gluten has them. This pins the coverage gain so a future subset
    // swap that silently narrows the font gets caught here rather than in a share card.
    it('includes the glyphs the previous display face was missing', () => {
        for (const char of ['`', '~', '£', '·']) expect(DISPLAY_CHARS.has(char)).toBe(true)
    })

    it('leaves out invisible and combining characters, which must not pick a typeface', () => {
        for (const char of ['­', '​', '́', '']) expect(DISPLAY_CHARS.has(char)).toBe(false)
    })
})

describe('headlineFont', () => {
    it('keeps the display face for its own alphabet and hands Cyrillic to the body face', () => {
        expect(headlineFont('Ski trip')).toBe(DISPLAY_FONT)
        expect(headlineFont('Việt Nam')).toBe(DISPLAY_FONT)
        expect(headlineFont('Київ')).toBe('Roboto')
    })

    it('asks the body face for its bold weight, so a fallback headline still reads as one', () => {
        expect(headlineWeight('Ski trip')).toBe(400)
        expect(headlineWeight('Київ')).toBe(800)
    })
})
