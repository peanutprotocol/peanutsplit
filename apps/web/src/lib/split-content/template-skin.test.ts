import { describe, expect, it } from 'vitest'
import { TEMPLATE_SLUGS } from '@/templates/registry'
import { CHAPTER_TOKENS } from './chapter-tokens'
import { CHAPTER_BY_SLUG } from './recipe'
import { TEMPLATE_WALLPAPER_CHAPTER, templateSkin, templateWallpaperChapter } from './template-skin'

describe('templateSkin', () => {
    it('skins every template — a template has no register, so it always takes SKIN_DEFAULT', () => {
        for (const slug of TEMPLATE_SLUGS) expect(templateSkin(slug), slug).toBe('sticker')
    })

    it('skins a slug that is not a template at all, and never throws', () => {
        expect(() => templateSkin('this-is-not-a-template')).not.toThrow()
        expect(templateSkin('this-is-not-a-template')).toBe('sticker')
    })
})

describe('templateWallpaperChapter', () => {
    it('maps only real template slugs — a stale key here would paint a page that does not exist', () => {
        for (const slug of Object.keys(TEMPLATE_WALLPAPER_CHAPTER)) {
            expect(TEMPLATE_SLUGS, slug).toContain(slug)
        }
    })

    /** Over the MAP, not over TEMPLATE_SLUGS: the fallback answers `home` for anything unmapped,
     *  so a loop over every template would pass with the map emptied out. */
    it('names a real chapter in every entry it maps', () => {
        expect(Object.keys(TEMPLATE_WALLPAPER_CHAPTER).length).toBeGreaterThan(0)
        for (const [slug, chapter] of Object.entries(TEMPLATE_WALLPAPER_CHAPTER)) {
            expect(Object.keys(CHAPTER_TOKENS), slug).toContain(chapter)
        }
    })

    it('falls back to a real chapter for a template nobody mapped', () => {
        expect(Object.keys(CHAPTER_TOKENS)).toContain(templateWallpaperChapter('this-is-not-a-template'))
    })

    it('draws the household room from the home pool and the journeys from trips', () => {
        expect(templateWallpaperChapter('flat-monthly')).toBe('home')
        expect(templateWallpaperChapter('villa-week')).toBe('trips')
    })
})

/**
 * Same seam `tool-skin.test.ts` guards, for the same reason: this map exists precisely so no
 * template slug has to be added to `CHAPTER_BY_SLUG`, which recipe.test.ts asserts covers exactly
 * the real content slug set.
 */
describe('the template/content seam', () => {
    it('keeps every template slug out of CHAPTER_BY_SLUG', () => {
        for (const slug of TEMPLATE_SLUGS) {
            expect(CHAPTER_BY_SLUG, slug).not.toHaveProperty(slug)
        }
    })
})
