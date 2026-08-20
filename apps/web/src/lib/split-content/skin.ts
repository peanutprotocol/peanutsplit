import type { Chapter } from './chapter-tokens'
import { wallpaperDataUri } from './wallpaper'

/**
 * The sticker skin's map and its tokens (fun-engine.md Wave 2 / S1).
 *
 * Sibling of chapter-tokens.ts and shaped like it: hex constants in TS, painted onto one wrapper
 * as custom properties, read by CSS. One source of truth, so the contrast test asserts against the
 * same values the stylesheet paints.
 */

export type Skin = 'none' | 'sticker'

export interface SkinToken {
    ink: string
    pink: string
    yellow: string
    paper: string
    green: string
    /** The mock's `.callout` background. */
    postit: string
    /** The mock's `.stk` box-shadow ring. */
    halo: string
    /**
     * The colour prose ACTUALLY uses — tailwind.config.js's `grey.1` / `n.3`, what
     * `mdxComponents.p`, `li`, `Cast`'s figcaption and `ArticleLayout`'s `<time>` render in. The
     * mock's `--mut: #6E675D` appears nowhere in this repo and is deliberately not carried over:
     * asserting it would gate a colour the app never paints.
     */
    muted: string
    /**
     * The display family. Roboto Flex driven to a real condensed black by `displayStretch` plus
     * `font-weight: 900` — fonts.ts already loads it with `axes: ['wdth']`, so this needs no new
     * asset and renders identically in CI and on Android. See S3's ruling.
     */
    display: string
    /** The `wdth` axis value the display rules set as `font-stretch`. */
    displayStretch: string
    meta: string
}

export const SKIN_TOKENS: Record<Exclude<Skin, 'none'>, SkinToken> = {
    sticker: {
        ink: '#211C17',
        pink: '#FF90E8',
        yellow: '#FFC900',
        paper: '#FAF4F0',
        green: '#98E9AB',
        postit: '#FFF3C4',
        halo: '#FFFFFF',
        muted: '#5F646D',
        display: 'var(--font-roboto), ui-sans-serif, system-ui, sans-serif',
        displayStretch: '75%',
        meta: 'ui-monospace,Menlo,monospace',
    },
}

/** The skin a slug gets when nothing overrides it. Wave 3: the whole corpus wears the sticker. */
export const SKIN_DEFAULT: Skin = 'sticker'

/**
 * Per-slug overrides on top of `SKIN_DEFAULT` — opt-outs to `'none'`, and where a second skin would
 * be keyed once there is one. Empty today, and empty is the correct state: Wave 3 flipped the whole
 * corpus, so this is an override seam, not the rollout gate it was in Wave 2.
 *
 * Content and tool slugs share it deliberately: the whole engine is keyed on slug, and
 * `src/data/static-pages.ts` reserves tool slugs against the content tree, so one flat map stays
 * honest. `pageRecipe` never sees a tool slug (it would throw on the missing chapter); S3's
 * `toolSkin()` reads the same map. CHAPTER_BY_SLUG must NOT grow a tool slug in sympathy —
 * recipe.test.ts asserts it maps exactly the real content slug set.
 */
export const SKIN_BY_SLUG: Record<string, Skin> = {}

/**
 * A skin is decoration: an unmapped slug takes `SKIN_DEFAULT`, never a throw — unlike a chapter,
 * whose absence is a content bug.
 *
 * `register` is consulted BEFORE the map, the same shape `spotPlan` refuses a flat page: the flat
 * register gets no skin (Invariants #5), and putting the gate here means no call site can get the
 * ordering wrong. This is why `splitwise-daily-limit` is pinned structurally rather than by being
 * left out of `SKIN_BY_SLUG` — a later hand adding it to the map still cannot skin it.
 *
 * That gate keys on the register ARGUMENT, not on the slug: a flat-family page that never routes
 * through `pageRecipe` (a hand-built route, or a new flat Collection slug) has to earn its `'flat'`
 * some other way — a `FLAT_REGISTER_SLUGS` entry, or a `'none'` override above. Same contract as
 * recipe.ts's note on that set.
 */
export function skinFor(slug: string, register: 'default' | 'flat'): Skin {
    if (register === 'flat') return 'none'
    return SKIN_BY_SLUG[slug] ?? SKIN_DEFAULT
}

/**
 * The custom properties one wrapper paints for a skin. Pure and string-only so both frames
 * (`ChapterFrame`, S3's `SkinFrame`) share one definition and one test.
 */
export function skinVars(skin: Skin, seed: number, chapter: Chapter): Record<string, string> {
    if (skin === 'none') return {}
    const token = SKIN_TOKENS[skin]
    return {
        '--skin-ink': token.ink,
        '--skin-pink': token.pink,
        '--skin-yellow': token.yellow,
        '--skin-paper': token.paper,
        '--skin-green': token.green,
        '--skin-postit': token.postit,
        '--skin-halo': token.halo,
        '--skin-muted': token.muted,
        '--skin-display': token.display,
        '--skin-display-stretch': token.displayStretch,
        '--skin-meta': token.meta,
        '--skin-wall': wallpaperDataUri(seed, chapter),
    }
}
