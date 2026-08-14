/**
 * The six chapter ink palettes (fun-engine.md S1/S3).
 *
 * Each `ink` is a same-hue, darkened/desaturated derivative of a tailwind.config.js literal named
 * in its comment below — never the literal itself. The literal pastels read fine as a fill (they
 * are the wash) but fail WCAG text contrast on the page backgrounds (chapter-tokens.test.ts
 * asserts every `ink` at 4.5:1 against both #FAF4F0 and #FFFFFF). Precedent for this split:
 * split-fun-mockups.html ships `--ch:#4A63B8` next to secondary-3's literal `#90A8ED`.
 *
 * `versus` is the one exception — its ink is grey-1/n-3 (`#5F646D`) unchanged, because that
 * literal already clears 4.5:1 on its own and needs no derivation.
 */

export type Chapter = 'trips' | 'table' | 'home' | 'getting-paid-back' | 'currencies' | 'versus'

interface ChapterToken {
    wash: string
    ink: string
    hairline: string
}

const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
}

/** Hairline alpha: visibly less than the ink but more than the wash — a rule/underline weight. */
const HAIRLINE_ALPHA = 0.4

const CHAPTER_INK: Record<Chapter, string> = {
    trips: '#4D6CC4',
    table: '#C73F3F',
    home: '#25803B',
    'getting-paid-back': '#8657CE',
    currencies: '#20716E',
    versus: '#5F646D',
}

const CHAPTER_WASH: Record<Chapter, string> = {
    trips: 'rgba(144,168,237,0.16)', // secondary-3 #90A8ED at low alpha
    table: 'rgba(233,152,152,0.18)', // secondary-2 #E99898 at low alpha
    home: 'rgba(152,233,171,0.20)', // green-1 #98E9AB at low alpha
    'getting-paid-back': 'rgba(174,122,255,0.14)', // outline-2 #AE7AFF at low alpha
    // Teal has no tailwind.config.js literal to reuse, so the wash is the ink itself at low
    // alpha rather than a lighter sibling. Flag for Konrad hex sign-off (fun-engine.md Status).
    currencies: 'rgba(32,113,110,0.12)',
    versus: 'rgba(95,100,109,0.10)', // n-3 / grey-1 literal at low alpha
}

export const CHAPTER_TOKENS: Record<Chapter, ChapterToken> = Object.fromEntries(
    (Object.keys(CHAPTER_INK) as Chapter[]).map((chapter) => [
        chapter,
        {
            ink: CHAPTER_INK[chapter],
            wash: CHAPTER_WASH[chapter],
            hairline: hexToRgba(CHAPTER_INK[chapter], HAIRLINE_ALPHA),
        },
    ])
) as Record<Chapter, ChapterToken>

/** The chapter's ink at 28% alpha, for the S3 Callout tape-strip accent. */
export function ink28(chapter: Chapter): string {
    return hexToRgba(CHAPTER_TOKENS[chapter].ink, 0.28)
}
