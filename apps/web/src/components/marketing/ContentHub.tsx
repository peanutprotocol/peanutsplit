import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Breadcrumbs } from '@/components/marketing/Breadcrumbs'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { LanguageLinks } from '@/components/marketing/LanguageLinks'
import { Button } from '@/components/ui/Button'
import { STATIC_PAGES } from '@/data/static-pages'
import { listAllDocs } from '@/lib/content'
import { absoluteUrl, breadcrumbSchema, formatDate } from '@/lib/seo'
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/i18n/locales'
import { localizedPath } from '@/i18n/paths'

/**
 * The content hub, in one language.
 *
 * Every indexable article in that language is reachable from here in one click, which is the
 * whole job — an article nothing links to is one Google finds late and re-crawls rarely. It
 * lists whatever markdown exists for the locale, so a new file shows up with no edit here.
 *
 * The hand-built pages in STATIC_PAGES are English-only (the Splitwise page's copy and its
 * FAQPage schema are both English by decision — see `copy.ts`), so they are listed on the English
 * hub and nowhere else. A Spanish hub linking an English page would be a dead end mid-journey.
 */

interface HubEntry {
    href: string
    title: string
    description: string
    /** Omitted for hand-built pages, which have no date to show. */
    date?: string
    tags?: string[]
}

export async function ContentHub({ locale }: { locale: Locale }) {
    const t = await getTranslations({ locale, namespace: 'content' })

    // The landing is bare `/` in every language — it is app shell, so it answers at one URL and
    // has no `/es-419` or `/pt-br` route (see `@/i18n/paths`). Only `/blog` is locale-prefixed here.
    const crumbs = [
        { name: t('home'), href: '/' },
        { name: t('guides'), href: localizedPath('/blog', locale) },
    ]

    const entries: HubEntry[] = [
        ...listAllDocs(locale).map((doc) => ({
            href: doc.href,
            title: doc.frontmatter.title,
            description: doc.frontmatter.description,
            date: doc.frontmatter.date,
            tags: doc.frontmatter.tags,
        })),
        ...(locale === DEFAULT_LOCALE
            ? STATIC_PAGES.filter((page) => page.inHub).map((page) => ({
                  href: page.href,
                  title: page.title,
                  description: page.description,
              }))
            : []),
    ]

    /** ItemList tells a crawler this is a listing and gives it the crawl order we intend. */
    const listSchema = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: entries.map((entry, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: absoluteUrl(entry.href),
            name: entry.title,
        })),
    }

    return (
        <main className="flex min-h-dvh flex-col bg-background">
            <JsonLd data={breadcrumbSchema(crumbs)} />
            <JsonLd data={listSchema} />

            <Breadcrumbs crumbs={crumbs} />

            <div className="mt-4 border-y border-n-1 bg-primary-1">
                <div className="mx-auto w-full max-w-xl px-5 pb-8 pt-8">
                    <h1 className="text-h3 leading-tight text-n-1">{t('hubTitle')}</h1>
                    <p className="mt-3 text-base font-medium leading-6 text-n-1">{t('hubDescription')}</p>
                </div>
            </div>

            <section className="mx-auto w-full max-w-xl px-5 py-8">
                {entries.length === 0 ? (
                    <p className="text-sm text-grey-1">{t('empty')}</p>
                ) : (
                    <ul className="flex flex-col gap-px overflow-hidden rounded-sm border border-n-1">
                        {entries.map((entry) => (
                            <li key={entry.href}>
                                <Link href={entry.href} className="block bg-white px-4 py-4 hover:bg-grey-3">
                                    <span className="block text-h7 text-n-1">{entry.title}</span>
                                    <span className="mt-1 block text-sm leading-5 text-grey-1">
                                        {entry.description}
                                    </span>
                                    {(entry.date || entry.tags?.length) && (
                                        <span className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-grey-1">
                                            {entry.date && (
                                                <time dateTime={entry.date}>{formatDate(entry.date, locale)}</time>
                                            )}
                                            {entry.tags?.map((tag) => (
                                                <span key={tag} className="rounded-sm bg-grey-4 px-1.5 py-0.5">
                                                    {tag}
                                                </span>
                                            ))}
                                        </span>
                                    )}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}

                {/* `/new` is app shell too — one URL, cookie decides the language. `/es-419/new` and
                    `/pt-br/new` are not routes, so prefixing this made the hub's only CTA a 404. */}
                <Link href="/new" className="mt-8 block">
                    <Button variant="primary" shadowSize="4" className="justify-center text-h6">
                        {t('startRoom')}
                    </Button>
                </Link>
                <p className="mt-3 text-center text-sm text-grey-1">{t('startRoomHint')}</p>
            </section>

            <LanguageLinks path="/blog" current={locale} available={[...LOCALES]} />

            <SiteFooter showLocaleSwitcher={false} />
        </main>
    )
}

export default ContentHub
