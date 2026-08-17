import { DEFAULT_LOCALE } from '@/i18n/locales'
import { type PageKind, pageRecipe, SplitRecipeError } from './recipe'

/**
 * The density score (fun-engine.md S5): a CI *report*, not a design opinion. `hardFails` covers
 * only what this repo owns and can prove from source alone — an unmapped chapter (a real content
 * bug: recipe.ts's own docstring calls this "a build-time content bug, not a silent default") and
 * a page with no way back into the product. `warnings` are prose-shape signals a human should
 * read, never something CI blocks on — a wall of text is a judgment call, a missing CTA is a bug.
 */

export interface DensityResult {
    hardFails: string[]
    warnings: string[]
}

/**
 * Matches the raw MDX source, not compiled output — this runs over every real doc/guide body in
 * a plain unit test, and compiling each one through `next-mdx-remote` just to look for a tag name
 * would be the slow, indirect way to ask a question the source already answers directly. Every
 * real CTA/RelatedLink usage opens with a spaced attribute or the self-closing slash (never a bare
 * `>`, since both components require at least one attribute — see `mdx-policy.ts`'s
 * `COMPONENT_ATTRIBUTES`), so the tag name is always followed by whitespace or `/`.
 */
const REACHABLE_PATH = /<(?:CTA|RelatedLink)[\s/]/

/** Chosen so three-plus unbroken prose paragraphs (no heading/list/blockquote/component) warn. */
const PROSE_RUN_WARNING_THRESHOLD = 3

/** The block "shape" of one paragraph, from its first line — enough to spot an all-prose page. */
function blockKind(paragraph: string): 'heading' | 'list' | 'blockquote' | 'table' | 'component' | 'prose' {
    const firstLine = paragraph.split('\n', 1)[0]
    if (/^#{1,6}\s/.test(firstLine)) return 'heading'
    if (/^(?:[-*]|\d+\.)\s/.test(firstLine)) return 'list'
    if (/^>\s/.test(firstLine)) return 'blockquote'
    if (/^\|/.test(firstLine)) return 'table'
    if (/^<[A-Z]/.test(firstLine)) return 'component'
    return 'prose'
}

/** Computed, never asserted (fun-engine.md S5): a report for a human, not a CI gate. */
function proseDensityWarnings(body: string): string[] {
    const kinds = body
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map(blockKind)

    const warnings: string[] = []
    let run = 0
    let longestRun = 0
    for (const kind of kinds) {
        run = kind === 'prose' ? run + 1 : 0
        longestRun = Math.max(longestRun, run)
    }
    if (longestRun >= PROSE_RUN_WARNING_THRESHOLD) {
        warnings.push(`${longestRun} consecutive prose paragraphs with no heading/list/block to break them up`)
    }
    if (new Set(kinds).size <= 1) {
        warnings.push('body uses a single block kind — no visual rhythm')
    }
    return warnings
}

/**
 * `kind`/`slug`/`tags` match `pageRecipe`'s own call contract; `body` is the raw doc/guide source.
 * `hardFails` empty is the baseline `density.test.ts` protects going forward — a chapter miss or a
 * dead-end page is a real content bug, not a style opinion.
 */
export function densityScore(kind: PageKind, slug: string, tags: readonly string[], body: string): DensityResult {
    const hardFails: string[] = []

    try {
        pageRecipe(kind, slug, tags, DEFAULT_LOCALE)
    } catch (error) {
        if (!(error instanceof SplitRecipeError)) throw error
        hardFails.push(`${kind}/${slug}: ${error.message}`)
    }

    if (!REACHABLE_PATH.test(body)) {
        hardFails.push(`${kind}/${slug}: no CTA or RelatedLink — page has no way back into the product`)
    }

    return { hardFails, warnings: proseDensityWarnings(body) }
}
