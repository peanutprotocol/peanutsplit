/**
 * Fonts for the OG renderer, plus the exact glyph coverage of each one.
 *
 * Satori has no font fallback chain and no tofu box — an unmapped codepoint is
 * silently dropped or drawn as a blank rectangle depending on the shaper. The
 * only safe posture is to know precisely which characters we ship and sanitize
 * every string down to that set before it reaches the renderer.
 *
 * Gluten and Roboto both come from pinned Fontsource packages. The production image copies the
 * installed dependency tree, so neither needs runtime egress — the container has none.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const FONTSOURCE = path.join(process.cwd(), 'node_modules', '@fontsource')
const GLUTEN_DIR = path.join(FONTSOURCE, 'gluten', 'files')
const ROBOTO_DIR = path.join(FONTSOURCE, 'roboto', 'files')

/**
 * Display face — the Split hero font, a rounded display face under the OFL. It replaced the
 * proprietary Knerd on 2026-09-01, which could not be redistributed once this repository went
 * public. Gluten covers far more than Knerd did: Latin Extended, Vietnamese and most currency
 * signs, so far fewer headlines get downgraded to the body face.
 */
export const DISPLAY_FONT = 'Gluten'
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

const range = (start: number, end: number): string[] =>
    Array.from({ length: end - start + 1 }, (_, index) => String.fromCodePoint(start + index))

/**
 * Verbatim printable cmap of `gluten-all-400-normal.woff` — 565 codepoints. The cmap is identical
 * across every Gluten weight, so the 400 file speaks for the family.
 *
 * Soft hyphen, zero-width space, the U+0300 combining block and the private-use glyph are in the
 * font but deliberately left out: an invisible or combining character must not be what decides a
 * headline's typeface. Regenerate by reading the cmap table straight out of the WOFF if the pinned
 * `@fontsource/gluten` version changes.
 */
export const DISPLAY_CHARS: ReadonlySet<string> = new Set([
    ...range(0x0020, 0x007e), // ASCII printable
    ...range(0x00a1, 0x00ac), // Latin-1 punctuation and symbols
    ...range(0x00ae, 0x0131), // Latin-1 letters into Latin Extended-A
    ...range(0x0134, 0x017e), // Latin Extended-A, remainder
    ...range(0x01c4, 0x01dc), // Latin Extended-B digraphs and carons
    ...range(0x01fa, 0x021b), // Latin Extended-B accented pairs
    ...range(0x022a, 0x022d),
    ...range(0x0230, 0x0233),
    ...range(0x02d8, 0x02dd), // spacing diacritics
    ...range(0x1e80, 0x1e85), // Ẁ–ẅ
    ...range(0x1ea0, 0x1ef9), // Vietnamese
    ...range(0x2074, 0x2079), // superscripts
    ...range(0x2083, 0x2089), // subscripts
    ...range(0x215b, 0x215e), // vulgar fractions
    ...'ƏƒƠơƯưǦǧǪǫȷəʼˆˇˉẞ',
    ...'–—‘’‚“”„†‡•…‰‹›⁄⁰₀₁',
    ...'₡₣₤₦₧₩₫€₭₱₲₵₹₺₼₽№™',
    ...'∆−∕∙∞≈≠≤≥ﬁﬂ',
])

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

/** A headline stays inside the display face's own coverage, with one deliberate expansion:
 * Cyrillic plus the Ukrainian modifier-letter apostrophe, which Roboto draws and Gluten does not.
 * This does not turn every body-font glyph into a reason to restyle an existing title. */
export const HEADLINE_CHARS: ReadonlySet<string> = new Set([...DISPLAY_CHARS, ...CYRILLIC_CHARS, 'ʼ'])

export const headlineFont = (value: string): typeof DISPLAY_FONT | typeof BODY_FONT =>
    [...value].every((char) => DISPLAY_CHARS.has(char)) ? DISPLAY_FONT : BODY_FONT

/** Roboto's Cyrillic fallback needs its bold face to carry the same visual role as the rounded
 * display face; body copy remains regular through the frame's base style. */
export const headlineWeight = (value: string): 400 | 800 => (headlineFont(value) === DISPLAY_FONT ? 400 : 800)

export type OgFont = {
    name: string
    data: ArrayBuffer
    weight: 400 | 800
    style: 'normal'
}

const load = async (dir: string, file: string): Promise<ArrayBuffer> => {
    const buf = await readFile(path.join(dir, file))
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/**
 * Read the three faces off disk. Deliberately not memoised: the SPEC forbids
 * process-lifetime OG caches (a leaked per-locale font/image cache has cost a prior app
 * ~40MB a pod), and a local read of ~215KB is noise next to the rasterizer.
 *
 * All three faces are installed dependencies, so a read failure is a broken image rather than a
 * licensing boundary and is allowed to throw. Satori needs WOFF or TTF and cannot read WOFF2, which
 * is why these are the `.woff` files in each package.
 */
export async function ogFonts(): Promise<OgFont[]> {
    const [display, body, bodyBold] = await Promise.all([
        load(GLUTEN_DIR, 'gluten-all-400-normal.woff'),
        load(ROBOTO_DIR, 'roboto-all-400-normal.woff'),
        load(ROBOTO_DIR, 'roboto-all-900-normal.woff'),
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
        load(ROBOTO_DIR, 'roboto-all-400-normal.woff'),
        load(ROBOTO_DIR, 'roboto-all-900-normal.woff'),
    ])
    return [
        { name: INVITE_FONT, data: regular, weight: 400, style: 'normal' },
        { name: INVITE_FONT, data: bold, weight: 800, style: 'normal' },
    ]
}
