import { DEFAULT_LOCALE, LOCALES } from '@/i18n/locales'
import { listAllTranslations, type Doc } from '@/lib/content'
import { getSplitGuide, loadSplitContentManifest, type SplitGuide } from '@/lib/split-content/artifact'
import { CHAPTER_TOKENS } from '@/lib/split-content/chapter-tokens'
import { densityScore } from '@/lib/split-content/density'
import { pageRecipe, type PageKind } from '@/lib/split-content/recipe'
import { CHAPTER_DOODLE_POOLS } from '@/lib/split-content/spot-placer'

/**
 * `/dev-ds/content` (fun-engine.md S5): one row per (kind, slug) this repo actually routes, so a
 * chapter/register/doodle regression is visible on one screen instead of found page by page.
 * `dev-ds/layout.tsx` already stamps `robots: { index: false, follow: false }` on every route
 * under it, this one included — nothing extra to add here.
 */

interface ContactSheetRow {
    kind: PageKind
    slug: string
    chapter: string
    ink: string
    wash: string
    register: 'default' | 'flat'
    doodleNames: string
    hardFails: string[]
    warnings: string[]
}

function rowFor(kind: PageKind, slug: string, tags: readonly string[], body: string): ContactSheetRow {
    const recipe = pageRecipe(kind, slug, tags, DEFAULT_LOCALE)
    const tokens = CHAPTER_TOKENS[recipe.chapter]
    const density = densityScore(kind, slug, tags, body)
    return {
        kind,
        slug,
        chapter: recipe.chapter,
        ink: tokens.ink,
        wash: tokens.wash,
        register: recipe.register,
        doodleNames: CHAPTER_DOODLE_POOLS[recipe.chapter].slice(0, 3).join(', '),
        hardFails: density.hardFails,
        warnings: density.warnings,
    }
}

/** `listAllTranslations()` deduped by slug — one native row per slug, whichever locale hit first. */
function nativeRows(): ContactSheetRow[] {
    const bySlug = new Map<string, Doc>()
    for (const doc of listAllTranslations()) if (!bySlug.has(doc.slug)) bySlug.set(doc.slug, doc)
    return [...bySlug.values()].map((doc) => rowFor(doc.collection, doc.slug, doc.frontmatter.tags ?? [], doc.body))
}

/**
 * Every unique guide slug the manifest carries — not `listSplitGuides('en')`, because one real
 * guide (`split-shared-house-bills`) ships in pt-br only and would silently disappear from the
 * sheet. Reads whichever locale the manifest actually has, in `LOCALES` order.
 */
function guideRows(): ContactSheetRow[] {
    const manifest = loadSplitContentManifest()
    if (!manifest) return []
    const slugs = [...new Set(manifest.entries.filter((entry) => entry.content_type === 'guide').map((e) => e.slug))]
    return slugs.map((slug) => {
        const guide = LOCALES.map((locale) => getSplitGuide(locale, slug)).find(
            (candidate): candidate is SplitGuide => candidate !== null
        )
        if (!guide) throw new Error(`dev-ds/content: manifest guide slug "${slug}" has no locale on disk`)
        return rowFor('guide', guide.slug, guide.tags, guide.body)
    })
}

export default function ContentContactSheetPage() {
    const rows = [...nativeRows(), ...guideRows()].sort(
        (a, b) => a.slug.localeCompare(b.slug) || a.kind.localeCompare(b.kind)
    )

    return (
        <main className="min-h-dvh bg-background p-6 text-n-1">
            <h1 className="text-h4">Content contact sheet</h1>
            <p className="mt-1 max-w-2xl text-sm text-grey-1">
                Every routed (kind, slug) pair this repo serves, its resolved chapter/register, the first three doodles
                its chapter pool would draw from, and the density report.
            </p>
            <div className="mt-6 overflow-x-auto rounded-sm border border-n-1 bg-white">
                <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
                    <thead className="bg-primary-3">
                        <tr>
                            <th className="border-b border-n-1 p-2">Slug</th>
                            <th className="border-b border-n-1 p-2">Kind</th>
                            <th className="border-b border-n-1 p-2">Chapter</th>
                            <th className="border-b border-n-1 p-2">Register</th>
                            <th className="border-b border-n-1 p-2">Doodles</th>
                            <th className="border-b border-n-1 p-2">Density</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={`${row.kind}/${row.slug}`} className="align-top">
                                <td className="border-b border-n-1 p-2 font-mono text-xs">{row.slug}</td>
                                <td className="border-b border-n-1 p-2">{row.kind}</td>
                                <td className="border-b border-n-1 p-2">
                                    <span className="inline-flex items-center gap-2">
                                        <span
                                            aria-hidden="true"
                                            className="inline-block size-4 shrink-0 rounded-full border border-n-1"
                                            style={{ backgroundColor: row.ink }}
                                        />
                                        {row.chapter}
                                    </span>
                                </td>
                                <td className="border-b border-n-1 p-2">{row.register}</td>
                                <td className="border-b border-n-1 p-2 text-xs text-grey-1">{row.doodleNames}</td>
                                <td className="border-b border-n-1 p-2 text-xs">
                                    {row.hardFails.length > 0 ? (
                                        <span className="font-bold text-error">
                                            {row.hardFails.length} hard fail{row.hardFails.length > 1 ? 's' : ''}
                                        </span>
                                    ) : (
                                        <span className="text-grey-1">ok</span>
                                    )}
                                    {row.warnings.length > 0 && (
                                        <span className="ml-2 text-grey-1">
                                            {row.warnings.length} warning{row.warnings.length > 1 ? 's' : ''}
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </main>
    )
}
