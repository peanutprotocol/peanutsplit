import type { Chapter } from './chapter-tokens'
import { skinFor, type Skin } from './skin'

/**
 * The tool half of the skin map (fun-engine.md Wave 2 / S3).
 *
 * Tool slugs never reach `pageRecipe`: they have no chapter, and adding one to `CHAPTER_BY_SLUG`
 * would fail recipe.test.ts's exact-coverage assertion against the real content tree. So a tool
 * asks `SKIN_BY_SLUG` directly, through the same `skinFor` gate every content page goes through.
 */

/** A tool's skin, from the one map. A tool has no register, so it is always the default one. */
export function toolSkin(slug: string): Skin {
    return skinFor(slug, 'default')
}

/**
 * Which chapter's doodle pool a tool's wallpaper draws from. **Wallpaper only** — never a chapter
 * for analytics, breadcrumbs or ink: a tool page emits no `data-chapter` and inherits no
 * `--chapter-*` var.
 *
 * `mileage-split-calculator` → `trips` (car/fuel/taxi/van/parking, exactly the mock's `.wall-tool`
 * motifs); `rent-split-calculator` → `home`.
 */
export const TOOL_WALLPAPER_CHAPTER: Record<string, Chapter> = {
    'mileage-split-calculator': 'trips',
    'rent-split-calculator': 'home',
}

/** The pool a tool's wallpaper draws from. `home` for an unmapped slug — a wallpaper is decoration. */
export function toolWallpaperChapter(slug: string): Chapter {
    return TOOL_WALLPAPER_CHAPTER[slug] ?? 'home'
}
