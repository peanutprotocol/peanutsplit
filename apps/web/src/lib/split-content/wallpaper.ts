import { DOODLE, type DoodleName } from '@/components/ui/doodles'
import type { Chapter } from './chapter-tokens'
import { pick } from './seed'
import { CHAPTER_DOODLE_POOLS } from './spot-placer'

/**
 * The sticker skin's page-wide wallpaper tile, built server-side from the real `DOODLE` stroke
 * geometry (fun-engine.md Wave 2 / S1).
 *
 * The tile lands in an inline `style` attribute on the frame `<div>` — i.e. in the HTML of every
 * skinned page, keyed per slug and therefore uncacheable across pages: ~10–12KB uncompressed,
 * ~3KB gzipped. `page-weight.test.ts` cannot see this (it renders `renderArticle(doc.body)`, the
 * article body only, explicitly excluding the layout frame), which is why the byte cap is asserted
 * here instead.
 */

export const WALLPAPER_TILE = 210 // px — the mock's background-size:210px 210px
export const WALLPAPER_SLOTS = 4 // 3 seeded from the chapter pool + 1 constant peanut

/**
 * Path-length ceiling for a wallpaper motif, in characters of `d`. `DOODLE` paths run 251–5628
 * chars; three fat ones plus the peanut would put a ~14KB data-URI in the HTML of every skinned
 * page. At 2200 every pool keeps at least 8 members.
 */
export const WALLPAPER_MAX_PATH = 2200

/**
 * Hard cap on the emitted `url('data:…')` string, gated in wallpaper.test.ts both per-seed and as
 * a seed-free upper bound, so a future doodle edit fails here rather than in production HTML.
 *
 * 12_500, not the 11_000 the wave spec quoted: that figure was computed against `table`'s worst
 * tile (10,603 encoded path chars). `home`'s longest survivor is `guitar` at 2,197 chars — 2,991
 * encoded — so its worst reachable tile measures 12,172. Lowering WALLPAPER_MAX_PATH far enough to
 * fit 11_000 would cut `home` to six motifs, which costs more variety than the ~1KB buys.
 */
export const WALLPAPER_MAX_URI = 12_500

export interface WallpaperMotif {
    name: DoodleName
    x: number
    y: number
    scale: number
    rotate: number
    color: string
    opacity: number
}

/**
 * Lattice positions, from the mock's `.wall-*` transforms. Constants, not draws: a 32-unit box
 * scaled ≤1 and rotated ≤±10° about any of these never leaves the 210 tile, so no motif is ever
 * clipped at a tile edge.
 */
const SLOT_POSITIONS: readonly (readonly [number, number])[] = [
    [18, 14],
    [120, 40],
    [40, 130],
    [140, 150],
]

/**
 * Ink per slot, fixed. Every alpha is set by the contrast gate, not by taste: prose sits directly
 * on the wallpapered ground (`p`/`li` are text-grey-1 `#5F646D`), so each composited slot colour
 * must still clear 4.5:1 against it — pink .25 → 4.67:1, yellow .35 → 4.76:1, ink .05 → 4.95:1.
 * Yellow at .6 measures 4.35:1 and ink at .35 measures 4.38:1; both fail.
 */
const SLOT_INK: readonly { color: string; opacity: number }[] = [
    { color: '#FF90E8', opacity: 0.25 },
    { color: '#FFC900', opacity: 0.35 },
    { color: '#211C17', opacity: 0.05 },
    { color: '#FF90E8', opacity: 0.25 },
]

const ROTATE_OPTIONS = [-10, -6, 0, 6, 10]
const SCALE_OPTIONS = [0.8, 0.9, 1]

/** The one motif that is in every tile: the brand mark, in slot 3. */
const PEANUT: DoodleName = 'peanut'

const filteredPool = (chapter: Chapter): readonly DoodleName[] =>
    CHAPTER_DOODLE_POOLS[chapter].filter((name) => DOODLE[name].length <= WALLPAPER_MAX_PATH)

/**
 * Deterministic per (seed, chapter) — no locale parameter anywhere in this module, so
 * locale-invariance is a property of the type rather than of a caller remembering.
 *
 * Slots 0–2 draw from the chapter's pool through `pick()` on `wall:*` channels, namespaced so the
 * wallpaper never correlates with `spotPlan`'s `spot:*` / `spot-doodle:*` draws on the same page.
 * Slot 3 is always `peanut`, which is a `DOODLE` key but deliberately NOT a member of any
 * `CHAPTER_DOODLE_POOLS` entry — do not add it there to "simplify" this, or `spotPlan`/`spotDoodle`
 * would start drawing the brand mark as inline chapter art, which is a different decision.
 */
export function wallpaperMotifs(seed: number, chapter: Chapter): WallpaperMotif[] {
    const pool = filteredPool(chapter)

    return SLOT_POSITIONS.map(([x, y], slot) => ({
        name: slot === SLOT_POSITIONS.length - 1 ? PEANUT : pool[pick(seed, `wall:${slot}`, pool.length)],
        x,
        y,
        scale: SCALE_OPTIONS[pick(seed, `wall-scale:${slot}`, SCALE_OPTIONS.length)],
        rotate: ROTATE_OPTIONS[pick(seed, `wall-rotate:${slot}`, ROTATE_OPTIONS.length)],
        color: SLOT_INK[slot].color,
        opacity: SLOT_INK[slot].opacity,
    }))
}

/**
 * The raw `<svg>` string. Stroke-only, `fill="none"`, `stroke-width="1.7"`, round caps and joins —
 * the same attributes `Doodle.tsx` renders with, so the wallpaper and an inline doodle are visibly
 * the same pen. It carries no `<text>`, `<title>`, `<desc>` or `<tspan>`: it is a background image,
 * invisible to assistive tech by construction, so it needs no `aria-hidden` either.
 */
export function wallpaperTileSvg(seed: number, chapter: Chapter): string {
    const motifs = wallpaperMotifs(seed, chapter)
        .map(
            (motif) =>
                `<g stroke="${motif.color}" opacity="${motif.opacity}" transform="translate(${motif.x} ${motif.y}) rotate(${motif.rotate}) scale(${motif.scale})"><path d="${DOODLE[motif.name]}"/></g>`
        )
        .join('')

    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${WALLPAPER_TILE}" height="${WALLPAPER_TILE}"` +
        ` viewBox="0 0 ${WALLPAPER_TILE} ${WALLPAPER_TILE}" fill="none" stroke-width="1.7"` +
        ` stroke-linecap="round" stroke-linejoin="round">${motifs}</svg>`
    )
}

/**
 * `url('data:image/svg+xml,…')`, `encodeURIComponent`-escaped so `#211C17` survives as `%23211C17`
 * and every `"` inside the SVG as `%22`.
 *
 * SINGLE-quoted: `'` is not escaped by `encodeURIComponent` and does not occur inside the SVG, and
 * the quotes cannot be dropped because the encoding leaves `(`/`)` from the `transform` values
 * intact, which an unquoted `url()` may not carry.
 *
 * Note for anyone asserting on rendered HTML: React escapes BOTH `"` (`&quot;`) and `'` (`&#x27;`)
 * inside a `style` attribute, so neither quote style survives a raw `toContain`. Un-escape the
 * markup first — ChapterFrame.test.tsx does. An HTML parser decodes the entities, so the DOM (and
 * therefore CSS, and Playwright's `getAttribute`) sees the string exactly as written here.
 */
export function wallpaperDataUri(seed: number, chapter: Chapter): string {
    return `url('data:image/svg+xml,${encodeURIComponent(wallpaperTileSvg(seed, chapter))}')`
}
