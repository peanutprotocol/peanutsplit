import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHAPTER_TOKENS, type Chapter } from './chapter-tokens'
import { SKIN_TOKENS, skinVars } from './skin'
import { wallpaperMotifs } from './wallpaper'

/**
 * The sticker skin's contrast gate and the shape of the `[data-skin='sticker']` block
 * (fun-engine.md Wave 2 / S2). Follows chapter-tokens.test.ts exactly, including the way that file
 * copied its `luminance`/`contrast` helpers from themes.test.ts — one more copy is cheaper than a
 * shared test util nothing else would import.
 */

type Rgb = readonly [number, number, number]

const rgbOf = (hex: string): Rgb => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
]

/** WCAG relative luminance, taken on 0–255 channels so a composited (fractional) colour works. */
const luminance = ([r, g, b]: Rgb) => {
    const channel = (raw: number) => {
        const value = raw / 255
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

const contrast = (first: string | Rgb, second: string | Rgb) => {
    const lum = (value: string | Rgb) => luminance(typeof value === 'string' ? rgbOf(value) : value)
    const [light, dark] = [lum(first), lum(second)].sort((a, b) => b - a)
    return (light + 0.05) / (dark + 0.05)
}

/** Source-over compositing, the way a browser paints a translucent wallpaper stroke onto paper. */
const over = (hex: string, alpha: number, base: string): Rgb => {
    const [r, g, b] = rgbOf(hex)
    const [br, bg, bb] = rgbOf(base)
    return [alpha * r + (1 - alpha) * br, alpha * g + (1 - alpha) * bg, alpha * b + (1 - alpha) * bb]
}

const TOKENS = SKIN_TOKENS.sticker
const CHAPTERS = Object.keys(CHAPTER_TOKENS) as Chapter[]

describe('sticker ink on every skin ground', () => {
    it('clears 4.5:1 on paper, sticker white, post-it, yellow, green and pink', () => {
        for (const ground of [TOKENS.paper, TOKENS.halo, TOKENS.postit, TOKENS.yellow, TOKENS.green, TOKENS.pink]) {
            expect(contrast(TOKENS.ink, ground), `${TOKENS.ink} on ${ground}`).toBeGreaterThanOrEqual(4.5)
        }
    })

    it('clears 4.5:1 inverted — yellow and pink text on ink', () => {
        expect(contrast(TOKENS.yellow, TOKENS.ink)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(TOKENS.pink, TOKENS.ink)).toBeGreaterThanOrEqual(4.5)
    })
})

describe('the real body grey on every ground the skin paints under it', () => {
    it('clears 4.5:1 on paper and on a sticker face', () => {
        expect(contrast(TOKENS.muted, TOKENS.paper)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(TOKENS.muted, TOKENS.halo)).toBeGreaterThanOrEqual(4.5)
    })

    /**
     * Prose sits DIRECTLY on the wallpapered ground — `mdxComponents.p`/`li` are `text-grey-1`,
     * which is `SKIN_TOKENS.sticker.muted`. So every composited slot colour has to clear 4.5:1
     * against it, not just the paper underneath. This is the assertion the mock's `--mut: #6E675D`
     * could never be: that hex is painted nowhere in this app.
     */
    it('clears 4.5:1 on every composited wallpaper slot, in every chapter', () => {
        for (const chapter of CHAPTERS) {
            for (const motif of wallpaperMotifs(1, chapter)) {
                const ground = over(motif.color, motif.opacity, TOKENS.paper)
                expect(
                    contrast(TOKENS.muted, ground),
                    `${chapter} ${motif.name} ${motif.color}@${motif.opacity}`
                ).toBeGreaterThanOrEqual(4.5)
            }
        }
    })
})

/**
 * Why the skin block has to re-declare `color` wherever it repaints a ground: the chapter block
 * sets `color: var(--chapter-ink, …)` on `.split-section-heading::before` and `.split-step::before`,
 * and those pseudo-elements survive under the skin. Left alone they would ship chapter ink on the
 * skin's pink pill and yellow disc.
 */
describe('the chapter-ink regression this skin has to override', () => {
    it('fails 4.5:1 for all 18 chapter-ink × skin-fill pairs', () => {
        const fills = { pink: TOKENS.pink, yellow: TOKENS.yellow, green: TOKENS.green }
        const measured: number[] = []
        for (const chapter of CHAPTERS) {
            for (const [name, fill] of Object.entries(fills)) {
                const ratio = contrast(CHAPTER_TOKENS[chapter].ink, fill)
                measured.push(ratio)
                expect(ratio, `${chapter} ink on ${name}`).toBeLessThan(4.5)
            }
        }
        expect(measured).toHaveLength(18)
    })
})

/**
 * The stylesheet read as source, the idiom chapter-tokens.test.ts and fonts.tailwind.test.ts use
 * for CSS facts vitest's `node` environment cannot render.
 */
describe("the [data-skin='sticker'] block in globals.css", () => {
    const css = readFileSync(path.resolve(__dirname, '../../styles/globals.css'), 'utf8')
    const START = '/* ---------------------------------------------------------- sticker skin'
    const END = '/* ------------------------------------------------------------------ motion'

    it('is delimited by the two section headers this test slices on', () => {
        expect(css).toContain(START)
        expect(css).toContain(END)
        expect(css.indexOf(START)).toBeLessThan(css.indexOf(END))
    })

    const block = css.slice(css.indexOf(START), css.indexOf(END))
    const bare = block.replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
        selector: selector.trim().replace(/\s+/g, ' '),
        body,
    }))

    /** Top-level commas only — `:is(a, b)` is one selector, not two. */
    const selectorParts = (selector: string) => {
        const parts: string[] = []
        let depth = 0
        let current = ''
        for (const char of selector) {
            if (char === '(') depth += 1
            if (char === ')') depth -= 1
            if (char === ',' && depth === 0) {
                parts.push(current)
                current = ''
            } else current += char
        }
        parts.push(current)
        return parts.map((part) => part.trim())
    }

    it('carries the whole skin — every rule scoped, none of it reachable unskinned', () => {
        expect(rules.length).toBeGreaterThan(25)
        for (const rule of rules) {
            for (const part of selectorParts(rule.selector)) {
                expect(part, rule.selector).toMatch(/^\[data-skin='sticker'\]/)
            }
        }
    })

    it('sets color in every rule that paints a background', () => {
        for (const rule of rules) {
            if (!/(^|[;{\s])background(-color)?\s*:/.test(rule.body)) continue
            expect(rule.body, rule.selector).toMatch(/(^|[;{\s])color\s*:/)
        }
    })

    it('repeats a literal fallback on every --skin-* var it reads', () => {
        const reads = [...bare.matchAll(/var\(\s*(--skin-[a-z-]+)\s*([,)])/g)]
        expect(reads.length).toBeGreaterThan(20)
        for (const [, name, next] of reads) expect(next, `var(${name}) has no fallback`).toBe(',')
    })

    /**
     * `background-image: var(--skin-wall), radial-gradient(…)` is invalid-at-computed-value-time
     * with `--skin-wall` unset, which would take the dot grid down with the wallpaper.
     */
    it('gives --skin-wall its own `none` fallback', () => {
        expect(bare).toContain('var(--skin-wall, none)')
    })

    it('consumes every custom property skinVars paints', () => {
        for (const name of Object.keys(skinVars('sticker', 1, 'trips'))) {
            expect(bare, `${name} is painted but never read`).toContain(`var(${name},`)
        }
    })
})
