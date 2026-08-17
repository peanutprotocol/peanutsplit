import { describe, expect, it } from 'vitest'
import { LOCALES } from '@/i18n/locales'
import { DOODLE } from '@/components/ui/doodles'
import type { Chapter } from './chapter-tokens'
import { CHAPTER_BY_SLUG, pageRecipe } from './recipe'
import { CHAPTER_DOODLE_POOLS } from './spot-placer'
import {
    WALLPAPER_MAX_PATH,
    WALLPAPER_MAX_URI,
    WALLPAPER_SLOTS,
    WALLPAPER_TILE,
    wallpaperDataUri,
    wallpaperMotifs,
    wallpaperTileSvg,
} from './wallpaper'

const CHAPTERS = Object.keys(CHAPTER_DOODLE_POOLS) as Chapter[]
const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7919)

const encodedLength = (value: string) => encodeURIComponent(value).length
const filteredPool = (chapter: Chapter) =>
    CHAPTER_DOODLE_POOLS[chapter].filter((name) => DOODLE[name].length <= WALLPAPER_MAX_PATH)

describe('wallpaperTileSvg', () => {
    it('is deterministic — 50 repeated calls per chapter are byte-identical', () => {
        for (const chapter of CHAPTERS) {
            const first = wallpaperTileSvg(1234, chapter)
            for (let attempt = 0; attempt < 50; attempt++) {
                expect(wallpaperTileSvg(1234, chapter), chapter).toBe(first)
            }
        }
    })

    it('is the 210px tile the stylesheet tiles at', () => {
        expect(WALLPAPER_TILE).toBe(210)
        const svg = wallpaperTileSvg(1, 'trips')
        expect(svg).toContain('width="210" height="210"')
        expect(svg).toContain('viewBox="0 0 210 210"')
    })

    it("draws with Doodle.tsx's pen, so the wallpaper and an inline doodle are visibly the same", () => {
        const svg = wallpaperTileSvg(1, 'trips')
        expect(svg).toContain('fill="none"')
        expect(svg).toContain('stroke-width="1.7"')
        expect(svg).toContain('stroke-linecap="round"')
        expect(svg).toContain('stroke-linejoin="round"')
    })

    it('emits no text node of any kind — it is a background image, invisible to assistive tech', () => {
        for (const chapter of CHAPTERS) {
            for (const seed of SEEDS.slice(0, 20)) {
                const svg = wallpaperTileSvg(seed, chapter)
                expect(svg, chapter).not.toMatch(/<text|<tspan|<title|<desc/)
                expect(svg.replace(/<[^>]*>/g, ''), chapter).toBe('')
            }
        }
    })

    it('uses verbatim DOODLE geometry, never a hand-redrawn approximation', () => {
        for (const chapter of CHAPTERS) {
            for (const seed of SEEDS) {
                const motifs = wallpaperMotifs(seed, chapter)
                const svg = wallpaperTileSvg(seed, chapter)
                const drawn = [...svg.matchAll(/<path d="([^"]*)"\/>/g)].map((match) => match[1])
                expect(drawn, `${chapter}:${seed}`).toEqual(motifs.map((motif) => DOODLE[motif.name]))
            }
        }
    })
})

describe('wallpaperMotifs', () => {
    it('fills every slot', () => {
        for (const chapter of CHAPTERS) {
            expect(wallpaperMotifs(0, chapter), chapter).toHaveLength(WALLPAPER_SLOTS)
        }
    })

    it('draws slots 0–2 from the chapter pool, filtered by the path-length ceiling', () => {
        for (const chapter of CHAPTERS) {
            const pool = filteredPool(chapter)
            for (const seed of SEEDS) {
                for (const motif of wallpaperMotifs(seed, chapter).slice(0, 3)) {
                    expect(pool, `${chapter}:${seed}`).toContain(motif.name)
                    expect(DOODLE[motif.name].length, motif.name).toBeLessThanOrEqual(WALLPAPER_MAX_PATH)
                    expect(motif.name, motif.name).not.toMatch(/^expense_/)
                }
            }
        }
    })

    it("puts the brand mark in slot 3, always — 'peanut' is hard-coded, not drawn", () => {
        for (const chapter of CHAPTERS) {
            for (const seed of SEEDS) {
                expect(wallpaperMotifs(seed, chapter)[3].name, `${chapter}:${seed}`).toBe('peanut')
            }
        }
    })

    it("keeps 'peanut' out of every CHAPTER_DOODLE_POOLS entry — widening a pool is not the fix", () => {
        // The guard on the assertion above: adding `peanut` to a pool would make it pass while
        // starting spotPlan/spotDoodle drawing the brand mark as inline chapter art.
        for (const chapter of CHAPTERS) {
            expect(CHAPTER_DOODLE_POOLS[chapter], chapter).not.toContain('peanut')
        }
    })

    it('assigns ink by slot, at the alphas the contrast gate set', () => {
        for (const chapter of CHAPTERS) {
            const motifs = wallpaperMotifs(123, chapter)
            expect(motifs.map((motif) => [motif.color, motif.opacity])).toEqual([
                ['#FF90E8', 0.25],
                ['#FFC900', 0.35],
                ['#211C17', 0.05],
                ['#FF90E8', 0.25],
            ])
        }
    })

    it('keeps every motif inside the tile — a 32-unit box, scaled ≤1 and rotated ≤±10°', () => {
        const CORNERS = [
            [0, 0],
            [32, 0],
            [0, 32],
            [32, 32],
        ]
        for (const chapter of CHAPTERS) {
            for (const seed of SEEDS) {
                for (const motif of wallpaperMotifs(seed, chapter)) {
                    const radians = (motif.rotate * Math.PI) / 180
                    for (const [boxX, boxY] of CORNERS) {
                        const scaledX = boxX * motif.scale
                        const scaledY = boxY * motif.scale
                        const x = motif.x + scaledX * Math.cos(radians) - scaledY * Math.sin(radians)
                        const y = motif.y + scaledX * Math.sin(radians) + scaledY * Math.cos(radians)
                        expect(x, `${chapter}:${seed}:${motif.name}`).toBeGreaterThanOrEqual(0)
                        expect(y, `${chapter}:${seed}:${motif.name}`).toBeGreaterThanOrEqual(0)
                        expect(x, `${chapter}:${seed}:${motif.name}`).toBeLessThanOrEqual(WALLPAPER_TILE)
                        expect(y, `${chapter}:${seed}:${motif.name}`).toBeLessThanOrEqual(WALLPAPER_TILE)
                    }
                }
            }
        }
    })
})

describe('wallpaperDataUri', () => {
    it("is single-quoted url(…) with no raw '#', so it survives React's style-attribute escaping", () => {
        for (const chapter of CHAPTERS) {
            const uri = wallpaperDataUri(9, chapter)
            expect(uri.startsWith("url('data:image/svg+xml,"), chapter).toBe(true)
            expect(uri.endsWith("')"), chapter).toBe(true)
            expect(uri.slice(4, -1), chapter).not.toContain('#')
            expect(uri, chapter).toContain('%23')
        }
    })

    it('takes no locale — equal recipes across locales produce equal wallpapers', () => {
        for (const slug of Object.keys(CHAPTER_BY_SLUG)) {
            const en = pageRecipe('blog', slug, ['tag-one'], 'en')
            for (const locale of LOCALES) {
                if (locale === 'en') continue
                const other = pageRecipe('blog', slug, ['a-different-tag'], locale)
                expect(wallpaperDataUri(other.seed, other.chapter), `${slug}/${locale}`).toBe(
                    wallpaperDataUri(en.seed, en.chapter)
                )
            }
        }
    })

    it('stays under the byte cap for every chapter across 200 seeds', () => {
        for (const chapter of CHAPTERS) {
            for (const seed of SEEDS) {
                expect(wallpaperDataUri(seed, chapter).length, `${chapter}:${seed}`).toBeLessThan(WALLPAPER_MAX_URI)
            }
        }
    })

    it('stays under the byte cap for the worst tile ANY seed could reach — a doodle edit fails here', () => {
        // encodeURIComponent is per-character, so encoded length is additive over concatenation:
        // the worst tile is three copies of the pool's longest survivor plus the peanut plus the
        // widest fixed overhead the transform numbers can produce.
        const wrapper = "url('data:image/svg+xml,')".length

        for (const chapter of CHAPTERS) {
            const overhead = Math.max(
                ...SEEDS.map((seed) => {
                    const paths = wallpaperMotifs(seed, chapter).reduce(
                        (total, motif) => total + encodedLength(DOODLE[motif.name]),
                        0
                    )
                    return encodedLength(wallpaperTileSvg(seed, chapter)) - paths
                })
            )
            const longest = Math.max(...filteredPool(chapter).map((name) => encodedLength(DOODLE[name])))
            const bound = wrapper + overhead + 3 * longest + encodedLength(DOODLE.peanut)

            expect(bound, chapter).toBeLessThan(WALLPAPER_MAX_URI)
        }
    })
})
