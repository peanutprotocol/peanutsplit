import type { Chapter } from './chapter-tokens'
import { skinFor, type Skin } from './skin'

/**
 * The template half of the skin map, and a sibling of `tool-skin.ts` for the same reason that file
 * exists: a template slug never reaches `pageRecipe` — it has no chapter and no `Doc`, and adding
 * one to `CHAPTER_BY_SLUG` would fail recipe.test.ts's exact-coverage assertion against the real
 * content tree. So a template asks the one slug-keyed map directly, through the same `skinFor`
 * gate every content page goes through.
 *
 * Not folded into `tool-skin.ts`: `tool-skin.test.ts` asserts that map holds only real tool slugs,
 * which is the assertion that makes it worth having.
 */

/** A template's skin, from the one map. A template has no register, so it is always the default. */
export function templateSkin(slug: string): Skin {
    return skinFor(slug, 'default')
}

/**
 * Which chapter's doodle pool a template's wallpaper draws from. **Wallpaper only** — never a
 * chapter for analytics, breadcrumbs or ink: a template page emits no `data-chapter` and inherits
 * no `--chapter-*` var, exactly as a tool page does not.
 *
 * A pool is motifs rather than subject matter, which is why `festival` draws from `trips`: the
 * drawing behind a festival room is a tent and a van, and `getting-paid-back` holds cash and
 * receipts. `flat-monthly` is the one room that is a household rather than a journey.
 */
export const TEMPLATE_WALLPAPER_CHAPTER: Record<string, Chapter> = {
    'flat-monthly': 'home',
    'villa-week': 'trips',
    'bali-villa': 'trips',
    'ski-week': 'trips',
    'road-trip': 'trips',
    festival: 'trips',
}

/** The pool a template's wallpaper draws from. `home` for an unmapped slug — a wallpaper is decoration. */
export function templateWallpaperChapter(slug: string): Chapter {
    return TEMPLATE_WALLPAPER_CHAPTER[slug] ?? 'home'
}
