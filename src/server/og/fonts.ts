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

/** Display face — the Peanut hero font. Latin-1-ish, no `£`, no `·`, no `~`. */
export const DISPLAY_FONT = 'Knerd'
/** Body face — Sniglet, the app's `font-display`. Full ASCII + Latin-1. */
export const BODY_FONT = 'Sniglet'

const ASCII_NO_BACKTICK_TILDE =
    ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_abcdefghijklmnopqrstuvwxyz{|}'

/** Verbatim cmap of `knerd-filled.ttf` (182 glyphs), printable subset. */
export const DISPLAY_CHARS: ReadonlySet<string> = new Set([
    ...ASCII_NO_BACKTICK_TILDE,
    ...'¢¥©®±ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýÿĐđŁłŒœŠšŸŽž˜‘’“”‰€™−',
])

/** Sniglet covers all of ASCII + Latin-1 + common typography. `฿` is NOT in it. */
export const BODY_CHARS: ReadonlySet<string> = new Set([
    ...ASCII_NO_BACKTICK_TILDE,
    '`',
    '~',
    ...Array.from({ length: 0x60 }, (_, i) => String.fromCharCode(0xa0 + i)),
    ...'ıŁłŒœŠšŸŽžƒ–—‘’‚“”„†‡•…‰‹›€™−',
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

/**
 * Read the three faces off disk. Deliberately not memoised: the SPEC forbids
 * process-lifetime OG caches (a leaked per-locale font/image cache cost wordle
 * ~40MB a pod), and a local read of ~215KB is noise next to the rasterizer.
 */
export async function ogFonts(): Promise<OgFont[]> {
    const [display, body, bodyBold] = await Promise.all([
        load('knerd-filled.ttf'),
        load('sniglet-regular.ttf'),
        load('sniglet-extrabold.ttf'),
    ])
    return [
        { name: DISPLAY_FONT, data: display, weight: 400, style: 'normal' },
        { name: BODY_FONT, data: body, weight: 400, style: 'normal' },
        { name: BODY_FONT, data: bodyBold, weight: 800, style: 'normal' },
    ]
}
