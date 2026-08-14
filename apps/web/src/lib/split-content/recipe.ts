import type { Collection } from '@/lib/content'
import type { Locale } from '@/i18n/locales'
import { CHAPTER_TOKENS, type Chapter } from './chapter-tokens'
import { hashSlug } from './seed'

/** Every routed page kind the recipe resolves for — the four Collections plus the standalone guide route. */
export type PageKind = Collection | 'guide'

/**
 * Chapter, keyed on the slug alone — never on kind, tags or locale (fun-engine.md Invariants #1:
 * "keyed on slug never locale"; tags are translated per-locale, so keying on them would let a
 * translation silently repaint the page). A slug that is both a blog/* directory and a generated
 * guide must resolve to the same chapter, which a flat map gives for free — see recipe.test.ts.
 *
 * Covers the 24 real slugs live today: the 4 alternatives/*, 9 blog/*, 4 capture/* directory
 * names, plus the 9 unique guide slugs in src/generated/seo/manifest.json (2 of which —
 * split-a-group-trip-across-countries, split-expenses-across-currencies — are also blog/*
 * directories and share one entry below). recipe.test.ts cross-checks this map against the real
 * content tree and the manifest, so an unmapped slug fails a test rather than falling back
 * silently.
 *
 * A proposal for Konrad's post-build review (fun-engine.md Status), not a final taxonomy.
 */
export const CHAPTER_BY_SLUG: Record<string, Chapter> = {
    // alternatives/*
    'settle-up-alternative': 'versus',
    'splitwise-daily-limit': 'versus',
    'splitwise-vs-tricount': 'versus',
    'tricount-alternative': 'versus',

    // blog/*
    'end-of-trip-expense-recap': 'trips',
    'fronting-a-group-trip': 'trips',
    'scan-a-receipt-to-split-a-bill': 'table',
    'split-a-group-trip-across-countries': 'trips',
    'split-bills-without-an-app': 'table',
    'split-expenses-across-currencies': 'currencies',
    'split-expenses-in-real-time': 'trips',
    'split-expenses-offline': 'trips',
    'who-pays-for-the-wine': 'table',

    // capture/*
    'fair-split-calculator': 'home',
    'group-trip-expenses': 'trips',
    'split-airbnb-cost-unequal-rooms': 'trips',
    'split-bill-no-signup': 'table',

    // guide-only slugs (not also a Collection directory)
    'ask-a-friend-to-pay-you-back': 'getting-paid-back',
    'someone-drops-out-of-a-group-trip': 'trips',
    'split-holiday-house-per-person-or-per-room': 'home',
    'split-shared-house-bills': 'home',
    'splitwise-currency-conversion': 'currencies',
    'splitwise-vs-settle-up': 'versus',
    'why-do-i-owe-someone-i-never-paid': 'getting-paid-back',
}

/**
 * The one live flat-register page this wave.
 *
 * CORRECTED from an earlier draft that denylisted all four capture/* slugs — capture is the
 * Default register per stylebook.md §2's collections table, not flat. The real flat families are
 * stylebook.md §3.10 / §5.5: Splitwise migration, couples splitting by income, and rent-and-
 * utilities fairness. Of those, only the Splitwise-migration family has a live Collection-scoped
 * slug today: `/splitwise-alternative` is named in §5.5 but is not a live directory
 * (alternatives/* has no such slug — see recipe.test.ts), and the by-income and rent-and-utilities
 * families have no live Collection-scoped page yet either. That leaves splitwise-daily-limit as
 * the only real entry; the other two families get a denylist entry once they ship a page.
 */
export const FLAT_REGISTER_SLUGS: ReadonlySet<string> = new Set(['splitwise-daily-limit'])

export class SplitRecipeError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'SplitRecipeError'
    }
}

export interface PageRecipe {
    register: 'default' | 'flat'
    chapter: Chapter
    seed: number
    tokens: (typeof CHAPTER_TOKENS)[Chapter]
}

/**
 * Pure, IO-free resolver: the same (kind, slug, tags, locale) always produces the same recipe.
 * `kind`, `tags` and `locale` are accepted to match the engine's fixed call contract, but every
 * output field is keyed on `slug` alone (fun-engine.md Invariants #1) — see recipe.test.ts's
 * locale-invariance assertion. An unmapped slug is a build-time content bug, not a silent
 * default, so it throws rather than falling back to a chapter.
 */
export function pageRecipe(
    kind: PageKind,
    slug: string,
    tags: readonly string[] | undefined,
    locale: Locale
): PageRecipe {
    const chapter = CHAPTER_BY_SLUG[slug]
    if (!chapter) throw new SplitRecipeError(`pageRecipe: no chapter mapped for slug "${slug}"`)
    return {
        register: FLAT_REGISTER_SLUGS.has(slug) ? 'flat' : 'default',
        chapter,
        seed: hashSlug(slug),
        tokens: CHAPTER_TOKENS[chapter],
    }
}

/**
 * `pageRecipe`'s chapter, or null for an unmapped slug — layout analytics wiring's only concern
 * is that a resolver failure must never break a page render (the same reason `track()` in
 * analytics.ts wraps `posthog.capture` in try/catch: "Analytics must never break a flow"). Real
 * content's coverage is enforced by recipe.test.ts's exhaustive slug check, not by this guard —
 * this exists for route tests that render a layout against a synthetic fixture slug
 * (`synthetic-guide` and friends) that was never meant to be in `CHAPTER_BY_SLUG`.
 */
export function pageChapterOrNull(
    kind: PageKind,
    slug: string,
    tags: readonly string[] | undefined,
    locale: Locale
): Chapter | null {
    try {
        return pageRecipe(kind, slug, tags, locale).chapter
    } catch (error) {
        if (error instanceof SplitRecipeError) return null
        throw error
    }
}

/**
 * `pageRecipe`'s register, or null for an unmapped slug — same null-on-resolver-failure contract
 * as `pageChapterOrNull`, and for the same reason (a synthetic route-test fixture slug).
 *
 * Layouts consult this alongside `pageChapterOrNull` to decide whether a page is wrapped in
 * `ChapterFrame`: `ChapterFrame` is the ONLY thing that sets `--chapter-ink`/`--chapter-wash`/
 * `--chapter-hairline` (fun-engine.md S3), so wrapping a flat-register page in it paints the same
 * chapter-colored section numerals, ledger leader digits and tape-strip as a warm page — exactly
 * the "money-anxiety pages stay calm" case `FLAT_REGISTER_SLUGS` exists to prevent (Invariants
 * #4: "no doodles, no play components, no jokes"). A flat page that resolves a chapter (for
 * analytics/breadcrumb purposes) must still render unframed.
 */
export function pageRegisterOrNull(
    kind: PageKind,
    slug: string,
    tags: readonly string[] | undefined,
    locale: Locale
): PageRecipe['register'] | null {
    try {
        return pageRecipe(kind, slug, tags, locale).register
    } catch (error) {
        if (error instanceof SplitRecipeError) return null
        throw error
    }
}
