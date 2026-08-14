import { describe, expect, it } from 'vitest'
import { CHAPTER_TOKENS, ink28, type Chapter } from './chapter-tokens'

// Copied from src/lib/themes.test.ts's contrast() idiom — WCAG relative luminance.
const luminance = (hex: string) => {
    const channel = (offset: number) => {
        const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

const contrast = (first: string, second: string) => {
    const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a)
    return (light + 0.05) / (dark + 0.05)
}

const CHAPTERS = Object.keys(CHAPTER_TOKENS) as Chapter[]

describe('CHAPTER_TOKENS', () => {
    it('covers exactly the six chapters', () => {
        expect(CHAPTERS.sort()).toEqual(['currencies', 'getting-paid-back', 'home', 'table', 'trips', 'versus'].sort())
    })

    it('passes 4.5:1 ink contrast against both page backgrounds, for every chapter', () => {
        for (const chapter of CHAPTERS) {
            const ink = CHAPTER_TOKENS[chapter].ink
            expect(contrast(ink, '#FAF4F0'), `${chapter} vs #FAF4F0`).toBeGreaterThanOrEqual(4.5)
            expect(contrast(ink, '#FFFFFF'), `${chapter} vs #FFFFFF`).toBeGreaterThanOrEqual(4.5)
        }
    })

    it('gives no two chapters the same ink', () => {
        const inks = CHAPTERS.map((chapter) => CHAPTER_TOKENS[chapter].ink)
        expect(new Set(inks).size).toBe(inks.length)
    })

    it('spells every wash and hairline as an rgba() string', () => {
        const RGBA = /^rgba\(\d{1,3},\d{1,3},\d{1,3},[\d.]+\)$/
        for (const chapter of CHAPTERS) {
            expect(CHAPTER_TOKENS[chapter].wash, chapter).toMatch(RGBA)
            expect(CHAPTER_TOKENS[chapter].hairline, chapter).toMatch(RGBA)
        }
    })
})

describe('ink28', () => {
    it('returns a valid rgba() string at ~28% alpha, for every chapter', () => {
        for (const chapter of CHAPTERS) {
            const value = ink28(chapter)
            const match = value.match(/^rgba\((\d{1,3}),(\d{1,3}),(\d{1,3}),([\d.]+)\)$/)
            expect(match, value).not.toBeNull()
            expect(Number(match![4])).toBeCloseTo(0.28, 5)
        }
    })

    it('carries the chapter ink’s own RGB channels', () => {
        expect(ink28('trips')).toBe('rgba(77,108,196,0.28)')
    })
})
