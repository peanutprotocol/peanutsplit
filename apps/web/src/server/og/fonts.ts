/**
 * Fonts for the OG renderer, plus the exact glyph coverage of each one.
 *
 * Satori has no font fallback chain and no tofu box — an unmapped codepoint is
 * silently dropped or drawn as a blank rectangle depending on the shaper. The
 * only safe posture is to know precisely which characters we ship and sanitize
 * every string down to that set before it reaches the renderer.
 *
 * The files live in `public/fonts/`, NOT `src/assets/fonts/`, on purpose: Next's
 * standalone output ships `.next` + `public` and nothing else, so a `src/` path
 * resolves in dev and 404s inside the container.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts')
const ROBOTO_DIR = path.join(process.cwd(), 'node_modules', '@fontsource', 'roboto', 'files')

/** Display face — the Peanut hero font. Latin-1-ish, no `£`, no `·`, no `~`. */
export const DISPLAY_FONT = 'Knerd'
/**
 * Body face — Roboto Latin Extended. The product catalogs now include Polish,
 * whose letters sit beyond Latin-1; using the old Sniglet subset silently
 * removed them from room unfurls and achievement cards before Satori rendered.
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

/**
 * Verbatim printable cmap of Fontsource's Roboto Latin Extended subset. Keeping
 * this list aligned with the actual file is what lets `bodySafe` distinguish a
 * drawable Polish letter from a symbol Satori would turn into a gap. `฿` is
 * deliberately absent, so `safeAmount` still falls back to the ISO code.
 */
export const BODY_CHARS: ReadonlySet<string> = new Set([
    ...range(0x20, 0x7e),
    ...range(0xa0, 0x17f),
    ...'ƏƒƠơƯưǰǺǻǼǽǾǿȘșȚțȷəʼˆ˚˜',
    ...'ḀḁḾḿẀẁẂẃẄẅỲỳỴỵỶỷỸỹ',
    ...'  ​–—‘’‚“”„†•…′″‹›⁄⁴₣₤₦₧₨₩₪₫€₱₹₺₼₽ℓ™−',
    '\uFEFF',
    '\uFFFD',
])

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
        loadRoboto('roboto-latin-ext-400-normal.woff'),
        loadRoboto('roboto-latin-ext-900-normal.woff'),
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
        loadRoboto('roboto-latin-ext-400-normal.woff'),
        loadRoboto('roboto-latin-ext-900-normal.woff'),
    ])
    return [
        { name: INVITE_FONT, data: regular, weight: 400, style: 'normal' },
        { name: INVITE_FONT, data: bold, weight: 800, style: 'normal' },
    ]
}
