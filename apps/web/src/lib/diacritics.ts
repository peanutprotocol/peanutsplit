import type { Locale } from '@/i18n/locales'

/**
 * The dropped-accent gate for Spanish and Portuguese copy.
 *
 * A missing diacritic is the one translation error that survives every other check here. It
 * parses, it renders, the style gate has nothing to say about it, and to an English reader — and
 * to an English-reading reviewer — "codigo" and "código" look like the same word. To the reader
 * it is the tell that the page was machine-translated and never read by anyone who speaks the
 * language, which is exactly the impression a comparison page cannot afford.
 *
 * So the rule is mechanical: a short list of unaccented forms that are never the correct spelling
 * in that language, matched on word boundaries, failing the build.
 *
 * **Word boundaries, not substrings.** The repo has been here before: a substring rule for "loo"
 * fired on "floor" and the gate was suppressed rather than fixed. Every pattern below is anchored
 * with `\b` on both sides, and `diacritics.test.ts` holds the specific false-match cases that
 * shape stays honest against.
 *
 * **Ambiguity is scoped, not ignored.** `como`, `quien` and `cuanto` are all real Spanish words
 * unaccented — "tan simple como esto", "la persona quien paga", "en cuanto a las monedas" — and
 * banning them outright would fail correct copy, which is how a gate gets worked around. Their
 * accented forms are interrogative, so they are checked only where an interrogative can stand: at
 * the start of a heading, or after an opening `¿`. That keeps the rule absolute where it applies.
 */

/** A form that is never correct in this language, and what it was meant to be. */
interface DiacriticRule {
    /** The unaccented spelling, lowercase. Used to build the pattern and to name the failure. */
    wrong: string
    /** The correct spelling, printed so the failure says what to write. */
    right: string
}

/**
 * Plural tolerance: `codigos`, `numeros`, `faciles` are the same error one letter later. Written
 * as an optional suffix rather than as more rows, because the singular is what a wordlist is for.
 */
const PLURAL = '(?:e?s)?'

/**
 * Forms shared by both languages — every one of these needs the same accent in Spanish and in
 * Portuguese, so a single list covers both.
 */
const SHARED: readonly DiacriticRule[] = [
    { wrong: 'codigo', right: 'código' },
    { wrong: 'numero', right: 'número' },
    { wrong: 'rapido', right: 'rápido' },
    { wrong: 'facil', right: 'fácil' },
]

/**
 * Spanish-only. `tambien` has no unaccented reading; the Portuguese equivalent is "também", a
 * different string, so it does not belong in `SHARED`.
 */
const SPANISH_ONLY: readonly DiacriticRule[] = [{ wrong: 'tambien', right: 'también' }]

/**
 * Portuguese-only, and the reason this list is not shared: `usuario` is the CORRECT Spanish
 * spelling and the wrong Portuguese one (`usuário`). A single merged wordlist would fail every
 * correct Spanish page that mentions a user.
 */
const PORTUGUESE_ONLY: readonly DiacriticRule[] = [
    { wrong: 'voce', right: 'você' },
    { wrong: 'nao', right: 'não' },
    { wrong: 'divisao', right: 'divisão' },
    { wrong: 'usuario', right: 'usuário' },
]

/**
 * Spanish words whose unaccented form is legitimate everywhere EXCEPT in front of a question.
 * Checked only in interrogative position — see the module docstring.
 *
 * Not applied to Portuguese: "como" is correctly unaccented there ("Como funciona"), and neither
 * "quien" nor "cuanto" is a Portuguese word at all.
 */
const SPANISH_INTERROGATIVE: readonly DiacriticRule[] = [
    { wrong: 'como', right: 'cómo' },
    { wrong: 'quien', right: 'quién' },
    { wrong: 'cuanto', right: 'cuánto' },
]

const rulesFor = (locale: Locale): readonly DiacriticRule[] =>
    locale === 'es-419' ? [...SHARED, ...SPANISH_ONLY] : locale === 'pt-br' ? [...SHARED, ...PORTUGUESE_ONLY] : []

/** The whole wordlist for a locale, for the report and for the test that pins it. */
export const diacriticWordlist = (locale: Locale): readonly string[] => [
    ...rulesFor(locale).map((rule) => rule.wrong),
    ...(locale === 'es-419' ? SPANISH_INTERROGATIVE.map((rule) => rule.wrong) : []),
]

export interface DiacriticHit {
    /** The text as written. */
    found: string
    /** What it should have been. */
    expected: string
}

/**
 * What a diacritic rule is allowed to look at.
 *
 * URLs and slugs are English by decision (`locales.md` §5 — path segments stay in English), so a
 * link target can hold any ASCII word without it being a dropped accent. Inline code is the same
 * argument. Both are removed before matching rather than excepted afterwards, because an
 * exception list is a second place to keep in step.
 */
function proseOnly(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`\n]*`/g, ' ')
        .replace(/\]\([^)]*\)/g, '] ')
        .replace(/\b(?:href|src|url)="[^"]*"/g, ' ')
        .replace(/https?:\/\/\S+/g, ' ')
}

/** Headings, without their `#` markers — where an interrogative would stand. */
const headings = (text: string): string[] => [...text.matchAll(/^#{1,6}\s+(.*)$/gm)].map((match) => match[1].trim())

/**
 * Every dropped diacritic in one page of copy, for one locale. Empty for English, which has none
 * to drop.
 *
 * Case-insensitive: "Codigo" at the start of a sentence is the same error as "codigo" mid-line.
 */
export function findDroppedDiacritics(text: string, locale: Locale): DiacriticHit[] {
    const rules = rulesFor(locale)
    if (rules.length === 0) return []

    const prose = proseOnly(text)
    const hits: DiacriticHit[] = []

    for (const rule of rules) {
        for (const match of prose.matchAll(new RegExp(`\\b${rule.wrong}${PLURAL}\\b`, 'giu'))) {
            hits.push({ found: match[0], expected: rule.right })
        }
    }

    if (locale === 'es-419') {
        // An interrogative can open a heading, or follow the opening `¿` anywhere in the copy.
        const interrogativePositions = [
            ...headings(prose),
            // The `¿` itself is dropped: what the rule anchors to is the first WORD after it.
            ...[...prose.matchAll(/¿\s*([^?\n]*)/g)].map((match) => match[1]),
        ]
        for (const rule of SPANISH_INTERROGATIVE) {
            for (const position of interrogativePositions) {
                // Anchored to the front of the interrogative: "¿Cuanto pagó?" is the error,
                // "¿Sabes en cuanto a esto?" is not the shape this rule is about.
                const match = new RegExp(`^${rule.wrong}\\b`, 'iu').exec(position.trim())
                if (match) hits.push({ found: match[0], expected: rule.right })
            }
        }
    }

    return hits
}
