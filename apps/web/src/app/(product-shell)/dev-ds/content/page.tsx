import { DEFAULT_LOCALE, INDEXED_LOCALES } from '@/i18n/locales'
import { listAllTranslations, type Doc } from '@/lib/content'
import { getSplitGuide, loadSplitContentManifest, type SplitGuide } from '@/lib/split-content/artifact'
import { CHAPTER_TOKENS, type Chapter } from '@/lib/split-content/chapter-tokens'
import { densityScore } from '@/lib/split-content/density'
import { pageRecipe, type PageKind } from '@/lib/split-content/recipe'
import { hashSlug } from '@/lib/split-content/seed'
import type { Skin } from '@/lib/split-content/skin'
import { CHAPTER_DOODLE_POOLS } from '@/lib/split-content/spot-placer'
import { templateSkin, templateWallpaperChapter } from '@/lib/split-content/template-skin'
import { toolSkin, toolWallpaperChapter } from '@/lib/split-content/tool-skin'
import { wallpaperDataUri } from '@/lib/split-content/wallpaper'
import { TEMPLATES } from '@/templates/registry'
import { TOOLS } from '@/tools/registry'

/**
 * `/dev-ds/content` (fun-engine.md S5): one row per (kind, slug) this repo actually routes, so a
 * chapter/register/doodle regression is visible on one screen instead of found page by page.
 * `dev-ds/layout.tsx` already stamps `robots: { index: false, follow: false }` on every route
 * under it, this one included — nothing extra to add here.
 */

interface ContactSheetRow {
    kind: PageKind
    slug: string
    /** `Chapter`, not `string`: `wallpaperDataUri` takes the union, and a widened field here would
     *  push the narrowing down into the JSX. */
    chapter: Chapter
    ink: string
    wash: string
    register: 'default' | 'flat'
    skin: Skin
    seed: number
    doodleNames: string
    hardFails: string[]
    warnings: string[]
}

/**
 * A whole wallpaper tile, scaled into the cell — `backgroundSize: '100% 100%'` rather than the
 * tile's own 210px. At native size a 48px cell shows only the top-left corner, where three of the
 * four lattice positions and most of the colour/opacity assignments never appear, which is the
 * opposite of "a wallpaper regression is visible on the sheet".
 */
function SkinCell({ skin, seed, chapter }: { skin: Skin; seed: number; chapter: Chapter }) {
    if (skin === 'none') return <span className="text-grey-1">none</span>
    return (
        <span className="inline-flex items-center gap-2">
            <span
                aria-hidden="true"
                className="inline-block size-12 shrink-0 rounded-sm border border-n-1"
                style={{ backgroundImage: wallpaperDataUri(seed, chapter), backgroundSize: '100% 100%' }}
            />
            {skin}
        </span>
    )
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
        skin: recipe.skin,
        seed: hashSlug(slug),
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
        const guide = INDEXED_LOCALES.map((locale) => getSplitGuide(locale, slug)).find(
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
                            <th className="border-b border-n-1 p-2">Skin</th>
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
                                <td className="border-b border-n-1 p-2">
                                    <SkinCell skin={row.skin} seed={row.seed} chapter={row.chapter} />
                                </td>
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

            {/* Tools have no recipe — no chapter, no register, and `pageRecipe` would throw on one —
                so they get their own short table off `toolSkin`. The sheet's job is every routed
                surface on one screen, and a tool page is one. */}
            <h2 className="mt-10 text-h5">Tools</h2>
            <p className="mt-1 max-w-2xl text-sm text-grey-1">
                Tool slugs never reach <code>pageRecipe</code>. Their skin comes from the same map through{' '}
                <code>toolSkin</code>, and their wallpaper borrows a chapter&rsquo;s doodle pool — pool only, never
                chapter ink.
            </p>
            <div className="mt-4 overflow-x-auto rounded-sm border border-n-1 bg-white">
                <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                    <thead className="bg-primary-3">
                        <tr>
                            <th className="border-b border-n-1 p-2">Slug</th>
                            <th className="border-b border-n-1 p-2">Skin</th>
                            <th className="border-b border-n-1 p-2">Wallpaper pool</th>
                        </tr>
                    </thead>
                    <tbody>
                        {TOOLS.map((tool) => (
                            <tr key={tool.slug} className="align-top">
                                <td className="border-b border-n-1 p-2 font-mono text-xs">{tool.slug}</td>
                                <td className="border-b border-n-1 p-2">
                                    <SkinCell
                                        skin={toolSkin(tool.slug)}
                                        seed={hashSlug(tool.slug)}
                                        chapter={toolWallpaperChapter(tool.slug)}
                                    />
                                </td>
                                <td className="border-b border-n-1 p-2 text-xs text-grey-1">
                                    {toolWallpaperChapter(tool.slug)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Templates are the second registry surface, and the same shape as the tools table for
                the same reason: a template slug never reaches `pageRecipe` either. */}
            <h2 className="mt-10 text-h5">Template rooms</h2>
            <p className="mt-1 max-w-2xl text-sm text-grey-1">
                Same seam as the tools above: <code>templateSkin</code> off the one map, and a wallpaper that borrows a
                chapter&rsquo;s doodle pool without carrying its ink.
            </p>
            <div className="mt-4 overflow-x-auto rounded-sm border border-n-1 bg-white">
                <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                    <thead className="bg-primary-3">
                        <tr>
                            <th className="border-b border-n-1 p-2">Slug</th>
                            <th className="border-b border-n-1 p-2">Skin</th>
                            <th className="border-b border-n-1 p-2">Wallpaper pool</th>
                        </tr>
                    </thead>
                    <tbody>
                        {TEMPLATES.map((template) => (
                            <tr key={template.slug} className="align-top">
                                <td className="border-b border-n-1 p-2 font-mono text-xs">{template.slug}</td>
                                <td className="border-b border-n-1 p-2">
                                    <SkinCell
                                        skin={templateSkin(template.slug)}
                                        seed={hashSlug(template.slug)}
                                        chapter={templateWallpaperChapter(template.slug)}
                                    />
                                </td>
                                <td className="border-b border-n-1 p-2 text-xs text-grey-1">
                                    {templateWallpaperChapter(template.slug)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </main>
    )
}
