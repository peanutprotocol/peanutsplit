import { describe, expect, it } from 'vitest'
import { TOOL_SLUGS } from '@/tools/registry'
import { CHAPTER_TOKENS } from './chapter-tokens'
import { CHAPTER_BY_SLUG } from './recipe'
import { TOOL_WALLPAPER_CHAPTER, toolSkin, toolWallpaperChapter } from './tool-skin'

describe('toolSkin', () => {
    it('skins the one tool in the Wave-2 pilot, and no other', () => {
        expect(toolSkin('mileage-split-calculator')).toBe('sticker')
        expect(toolSkin('rent-split-calculator')).toBe('none')
    })

    it("returns 'none' for a slug that is not a tool at all, and never throws", () => {
        expect(() => toolSkin('this-is-not-a-tool')).not.toThrow()
        expect(toolSkin('this-is-not-a-tool')).toBe('none')
    })
})

describe('toolWallpaperChapter', () => {
    it('maps only real tool slugs — a stale key here would paint a page that does not exist', () => {
        for (const slug of Object.keys(TOOL_WALLPAPER_CHAPTER)) {
            expect(TOOL_SLUGS, slug).toContain(slug)
        }
    })

    it('gives every tool a real chapter pool to draw from', () => {
        for (const slug of TOOL_SLUGS) {
            expect(Object.keys(CHAPTER_TOKENS), slug).toContain(toolWallpaperChapter(slug))
        }
    })

    it('draws the mileage tile from the trips pool', () => {
        expect(toolWallpaperChapter('mileage-split-calculator')).toBe('trips')
    })
})

/**
 * The assertion that keeps recipe.test.ts green: the tool half of the skin map exists precisely
 * so no tool slug has to be added to `CHAPTER_BY_SLUG`, which is asserted there to cover exactly
 * the real content slug set.
 */
describe('the tool/content seam', () => {
    it('keeps every tool slug out of CHAPTER_BY_SLUG', () => {
        for (const slug of TOOL_SLUGS) {
            expect(CHAPTER_BY_SLUG, slug).not.toHaveProperty(slug)
        }
    })
})
