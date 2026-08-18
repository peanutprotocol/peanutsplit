/**
 * Fonts for the OG renderer, plus the exact glyph coverage of each one.
 *
 * Satori has no font fallback chain and no tofu box — an unmapped codepoint is
 * silently dropped or drawn as a blank rectangle depending on the shaper. The
 * only safe posture is to know precisely which characters we ship and sanitize
 * every string down to that set before it reaches the renderer.
 *
 * Knerd lives in `public/fonts/`, NOT `src/assets/fonts/`; Roboto lives in the
 * pinned Fontsource package. The production image copies both `public` and the
 * installed dependency tree, so neither path needs runtime egress.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts')
const ROBOTO_DIR = path.join(process.cwd(), 'node_modules', '@fontsource', 'roboto', 'files')

/** Display face — the Peanut hero font. Latin-1-ish, no `£`, no `·`, no `~`. */
export const DISPLAY_FONT = 'Knerd'
/**
 * Body face — Roboto's pinned "all" WOFF. The file is part of the installed
 * `@fontsource/roboto` package, copied into the production image, and covers
 * Latin Extended plus Cyrillic without a network request. Using the former
 * Latin-only subset silently removed Ukrainian from room unfurls and share
 * cards before Satori rendered.
 */
export const BODY_FONT = 'Roboto'
/** Neutral app face used by the invite card, landing page and room UI. */
export const INVITE_FONT = 'Roboto'

const ASCII_NO_BACKTICK_TILDE =
    ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_abcdefghijklmnopqrstuvwxyz{|}'

/** Verbatim cmap of `knerd-filled.ttf` (182 glyphs), printable subset. */
export const DISPLAY_CHARS: ReadonlySet<string> = new Set([
    ...ASCII_NO_BACKTICK_TILDE,
    ...'¢¥©®±ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýÿĐđŁłŒœŠšŸŽž˜‘’“”‰€™−',
])

const range = (start: number, end: number): string[] =>
    Array.from({ length: end - start + 1 }, (_, index) => String.fromCodePoint(start + index))

/** Cyrillic coverage in Fontsource's pinned Roboto "all" WOFF. This includes
 * Ukrainian Ґґ, Єє, Іі and Її. The gap at U+0487 is in the font's
 * own cmap, so it stays a gap here too. */
export const CYRILLIC_CHARS: ReadonlySet<string> = new Set([...range(0x0400, 0x0486), ...range(0x0488, 0x0513)])

/**
 * Reviewed printable cmap used by the OG body sanitizer. Keeping this list
 * aligned with the actual file is what lets `bodySafe` distinguish a drawable
 * Ukrainian or Polish letter from a symbol Satori would turn into a gap. `฿`
 * and `₴` are deliberately absent, so `safeAmount` falls back to the ISO code.
 */
export const BODY_CHARS: ReadonlySet<string> = new Set([
    ...range(0x20, 0x7e),
    ...range(0xa0, 0x17f),
    ...'ƏƒƠơƯưǰǺǻǼǽǾǿȘșȚțȷəʼˆ˚˜',
    ...'ḀḁḾḿẀẁẂẃẄẅỲỳỴỵỶỷỸỹ',
    ...'  ​–—‘’‚“”„†•…′″‹›⁄⁴₣₤₦₧₨₩₪₫€₱₹₺₼₽ℓ™−',
    ...CYRILLIC_CHARS,
    '\uFEFF',
    '\uFFFD',
])

/** A headline stays inside Knerd's long-standing budget, with one deliberate
 * expansion: Cyrillic plus the Ukrainian modifier-letter apostrophe. This does
 * not turn every body-font glyph into a reason to restyle an existing title. */
export const HEADLINE_CHARS: ReadonlySet<string> = new Set([...DISPLAY_CHARS, ...CYRILLIC_CHARS, 'ʼ'])

export const headlineFont = (value: string): typeof DISPLAY_FONT | typeof BODY_FONT =>
    [...value].every((char) => DISPLAY_CHARS.has(char)) ? DISPLAY_FONT : BODY_FONT

/** Roboto's Cyrillic fallback needs its bold face to carry the same visual role
 * as chunky Knerd; body copy remains regular through the frame's base style. */
export const headlineWeight = (value: string): 400 | 800 => (headlineFont(value) === DISPLAY_FONT ? 400 : 800)

export type OgFont = {
    name: string
    data: ArrayBuffer
    weight: 400 | 800
    style: 'normal'
}

const load = async (file: string): Promise<ArrayBuffer> => {
    const buf = await readFile(path.join(FONT_DIR, file))
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

const loadRoboto = async (file: string): Promise<ArrayBuffer> => {
    const buf = await readFile(path.join(ROBOTO_DIR, file))
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/**
 * Read the three faces off disk. Deliberately not memoised: the SPEC forbids
 * process-lifetime OG caches (a leaked per-locale font/image cache has cost a prior app
 * ~40MB a pod), and a local read of ~215KB is noise next to the rasterizer.
 */
export async function ogFonts(): Promise<OgFont[]> {
    const [display, body, bodyBold] = await Promise.all([
        load('knerd-filled.ttf'),
        loadRoboto('roboto-all-400-normal.woff'),
        loadRoboto('roboto-all-900-normal.woff'),
    ])
    return [
        { name: DISPLAY_FONT, data: display, weight: 400, style: 'normal' },
        { name: BODY_FONT, data: body, weight: 400, style: 'normal' },
        { name: BODY_FONT, data: bodyBold, weight: 800, style: 'normal' },
    ]
}

/**
 * The invite deliberately uses the product's neutral UI face, not either
 * novelty display face. Fontsource is installed with the app so rendering is
 * deterministic in the no-egress production container.
 */
export async function inviteFonts(): Promise<OgFont[]> {
    const [regular, bold] = await Promise.all([
        loadRoboto('roboto-all-400-normal.woff'),
        loadRoboto('roboto-all-900-normal.woff'),
    ])
    return [
        { name: INVITE_FONT, data: regular, weight: 400, style: 'normal' },
        { name: INVITE_FONT, data: bold, weight: 800, style: 'normal' },
    ]
}
