import type { ReactNode } from 'react'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/marketing/Breadcrumbs'
import { ChapterFrame } from '@/components/marketing/ChapterFrame'
import { ContentAnalytics } from '@/components/marketing/ContentAnalytics'
import { JsonLd } from '@/components/marketing/JsonLd'
import { HREFLANG, INDEXED_LOCALES, LOCALE_LABELS, type IndexedLocale } from '@/i18n/locales'
import { localizedPath } from '@/i18n/paths'
import type { SplitGuide } from '@/lib/split-content/artifact'
import { CANONICAL_ORIGIN } from '@/lib/domains'
import { GUIDE_CRUMBS, splitGuideCrumbs, splitGuideSchemas } from '@/lib/split-content/metadata'
import { pageChapterOrNull, pageRegisterOrNull, pageSkinOrNull } from '@/lib/split-content/recipe'
import { sourceReleasedSplitGuides } from '@/lib/split-content/released'
import { hashSlug } from '@/lib/split-content/seed'

const OTHER_LANGUAGES = {
    en: 'Other languages',
    'es-419': 'Otros idiomas',
    'pt-br': 'Outros idiomas',
} as const

/**
 * Links to the other languages of THIS guide — the ones that exist.
 *
 * `alternates` is `guideAlternates()`, so every href is a `public_path` the manifest lists rather
 * than a path this component derived from the locale set. Nine of the fifteen guides ship in one
 * locale only; building `guidePath(locale, slug)` for all three put two 404s on each of them.
 *
 * A locale that exists but is parked (permanently noindex) IS linked. Existence is the test, not
 * indexability: a parked guide renders and answers 200, so the link works for the reader who wants
 * it, and a crawler that follows it reads the page's own noindex and leaves. The crawl-facing
 * signal is a separate layer — `releasedGuideAlternates` drops parked translations from hreflang,
 * where advertising one really would misdirect. Filtering here would also make the markup depend on
 * `SEO_INDEXABLE`, so a dark box would serve different HTML from the indexed one.
 */
function otherLanguageLinks(
    guide: SplitGuide,
    alternates: Record<string, string> | undefined
): Array<{ locale: IndexedLocale; href: string }> {
    return INDEXED_LOCALES.filter((locale) => locale !== guide.locale)
        .map((locale) => ({ locale, href: alternates?.[HREFLANG[locale]] }))
        .filter((link): link is { locale: IndexedLocale; href: string } => link.href !== undefined)
}

export function SplitGuideLayout({
    guide,
    alternates,
    children,
}: {
    guide: SplitGuide
    /** `guideAlternates(guide.slug)` — hreflang code to manifest `public_path`. */
    alternates: Record<string, string> | undefined
    children: ReactNode
}) {
    const schemas = splitGuideSchemas(guide)
    const otherLanguages = otherLanguageLinks(guide, alternates)
    const crumbs = splitGuideCrumbs(guide)
    const hubHref = localizedPath('/blog', guide.locale)
    const chapter = pageChapterOrNull('guide', guide.slug, guide.tags, guide.locale)
    // Flat-register pages resolve a chapter (for analytics) but never get ChapterFrame — see
    // pageRegisterOrNull's docstring.
    const register = pageRegisterOrNull('guide', guide.slug, guide.tags, guide.locale)
    const skin = pageSkinOrNull('guide', guide.slug, guide.tags, guide.locale)
    // Every released sibling rather than a slice: over six English guides a `slice(0, 3)` in
    // manifest order leaves three of them with no inbound link at all, which is the defect this
    // replaces. Revisit past about eight released guides in one locale.
    const siblings = sourceReleasedSplitGuides(guide.locale).filter((sibling) => sibling.href !== guide.href)

    const articleBody = (
        <>
            <div className="mx-auto w-full max-w-xl px-5 pb-3 pt-10">
                {/* `split-page-title` is the skin's display face. A guide can never author its own
                    h1 (mdx-policy caps the body at H2), so this is the only place to hook it. */}
                <h1 className="split-page-title text-h3 leading-tight">{guide.title}</h1>
                <p className="mt-4 text-base leading-7 text-grey-1">{guide.description}</p>
            </div>
            {children}
            <div className="mx-auto w-full max-w-xl px-5 pt-4">
                <time dateTime={guide.date} className="text-xs text-grey-1">
                    {guide.date}
                </time>
            </div>
        </>
    )

    return (
        <main className="min-h-dvh bg-background text-n-1">
            {chapter && <ContentAnalytics template="guide" chapter={chapter} source={guide.slug} />}
            <JsonLd data={schemas.article} />
            <JsonLd data={schemas.breadcrumbs} />
            <JsonLd data={schemas.howTo} />

            <header className="border-b border-n-1 bg-primary-1">
                <div className="mx-auto flex w-full max-w-xl items-center justify-between px-5 py-4">
                    <a href={CANONICAL_ORIGIN} className="font-bold text-n-1 underline-offset-2 hover:underline">
                        Peanut
                    </a>
                    <span className="text-sm font-bold">Split</span>
                </div>
            </header>

            <Breadcrumbs crumbs={crumbs} />

            <article className="pb-8">
                {chapter && register !== 'flat' ? (
                    <ChapterFrame chapter={chapter} skin={skin ?? 'none'} seed={hashSlug(guide.slug)}>
                        {articleBody}
                    </ChapterFrame>
                ) : (
                    articleBody
                )}
            </article>

            {otherLanguages.length > 0 && (
                <nav
                    aria-label={OTHER_LANGUAGES[guide.locale]}
                    data-testid="guide-language-nav"
                    className="mx-auto w-full max-w-xl px-5 pb-8 text-xs"
                >
                    <span className="text-grey-1">{OTHER_LANGUAGES[guide.locale]}: </span>
                    {otherLanguages.map(({ locale, href }, index) => (
                        <span key={locale}>
                            {index > 0 && <span className="text-grey-1"> · </span>}
                            <Link
                                href={href}
                                hrefLang={HREFLANG[locale]}
                                lang={HREFLANG[locale]}
                                className="underline underline-offset-2"
                            >
                                {LOCALE_LABELS[locale]}
                            </Link>
                        </span>
                    ))}
                </nav>
            )}

            <footer className="border-t border-n-1 bg-white">
                <nav
                    aria-label={GUIDE_CRUMBS[guide.locale].hub}
                    data-testid="guide-footer-nav"
                    className="mx-auto w-full max-w-xl px-5 py-6 text-xs text-grey-1"
                >
                    <ul className="flex flex-col gap-2">
                        <li>
                            <Link href={hubHref} className="font-medium text-n-1 underline underline-offset-2">
                                {GUIDE_CRUMBS[guide.locale].hub}
                            </Link>
                        </li>
                        {siblings.map((sibling) => (
                            <li key={sibling.href}>
                                <Link href={sibling.href} className="underline underline-offset-2">
                                    {sibling.title}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
            </footer>
        </main>
    )
}
