import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { newRoomHref } from '@/components/marketing/mdx/blocks'
import { LocaleSwitcher } from '@/components/ui/LocaleSwitcher'
import { INDEXED_LOCALES, asLocale, type Locale } from '@/i18n/locales'
import { localizedPath } from '@/i18n/paths'
import { hrefFor, listDocs } from '@/lib/content'
import { publicFossReleased } from '@/lib/flags'

/** Guides listed by name before the column defers to the hub. Four is the point at which the
 *  column stops being a directory and starts being a second copy of /blog. */
const GUIDES_SHOWN = 4

/** Terms still live on peanut.me; privacy is Split's own page, because peanut.me's policy
 *  describes a wallet with accounts, passkeys and identity documents, and Split has none of that
 *  while it does have an advertising tag peanut.me's policy never mentions.
 *  These are notices, not promotion: no logo, no UTM, no referral code, and the counted
 *  Peanut-reference standard exempts them the way it exempts the settlement method's URL. */
const LEGAL_LINKS = [
    { key: 'termsLink', href: 'https://peanut.me/en/terms' },
    { key: 'privacyLink', href: '/privacy' },
] as const

/**
 * The site's foot: every public Split page, plus one internal source-and-stewardship receipt.
 *
 * The footer deliberately contains no Peanut logo, referral URL or promotional Peanut link — the
 * Terms and Privacy notices in the bottom bar are the one, legally required exception. The
 * dedicated internal page explains Squirrel Labs' stewardship and the official host's bounded,
 * contextual Peanut references without turning every page into a promotion surface.
 *
 * The guide and comparison columns are read off disk for the current locale, so a new markdown
 * file appears here without anyone editing this component. That is the point: a page nothing
 * links to is one Google finds late and re-crawls rarely, and the footer is the one component
 * every page shares. Nothing in either column is hardcoded any more — the Splitwise comparison
 * was the last one, and it is markdown now; `/import` remains English-only and is left bare.
 *
 * `showLocaleSwitcher` exists for the indexed pages. The switcher sets a cookie and reloads,
 * which is right for the app — one URL, three languages. An indexed page states its language in
 * its own URL, so the reload lands on the same page in the same language and the control reads as
 * broken. That holds for `/es-419/blog/…` and just as much for the English `/tricount-alternative` it
 * translates. Every indexed page passes `false` and offers real links to the translations that
 * exist instead (see ArticleLayout / ContentHub).
 */
export function SiteFooter({ showLocaleSwitcher = true }: { showLocaleSwitcher?: boolean }) {
    const t = useTranslations('marketing.footer')
    const tLocale = useTranslations('locale')
    const locale = asLocale(useLocale())
    const hasIndexedContent = (INDEXED_LOCALES as readonly Locale[]).includes(locale)

    const guides = listDocs('blog', locale).slice(0, GUIDES_SHOWN)
    const alternatives = listDocs('alternatives', locale)

    const linkClass = 'flex min-h-9 items-center text-sm leading-5 text-white/70 transition-colors hover:text-white'

    return (
        <footer data-focus-surface="dark" className="mt-auto bg-n-1 pb-[env(safe-area-inset-bottom)] text-white">
            <div className="mx-auto w-full max-w-xl px-5 py-8">
                <nav className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-3">
                    <div>
                        <h2 className="text-h9 uppercase tracking-wide text-white">{t('colSplit')}</h2>
                        <ul className="mt-2 flex flex-col gap-1.5">
                            <li>
                                {/* The page states its language in its URL; `/new` reads a cookie
                                    it never set, so the link says it (`locale-handoff.ts`). */}
                                <Link href={newRoomHref('/new', undefined, locale)} className={linkClass}>
                                    {t('createSplit')}
                                </Link>
                            </li>
                            {/* One link, not three: the hub is where a reader picks between the
                                calculators, and a footer that lists them grows by a line every
                                time one ships. The hub itself is English, so a localized page's
                                inlinks to its own calculators come from the page body — see the
                                ruling in docs/SEO-ISSUES.md. */}
                            <li>
                                <Link href="/tools" className={linkClass}>
                                    {t('toolsLink')}
                                </Link>
                            </li>
                            <li>
                                <Link href="/import" className={linkClass}>
                                    {t('importLink')}
                                </Link>
                            </li>
                            {publicFossReleased() && (
                                <li>
                                    <Link href="/source" className={linkClass}>
                                        {t('sourceStewardship')}
                                    </Link>
                                </li>
                            )}
                        </ul>
                    </div>

                    {(hasIndexedContent || alternatives.length > 0) && (
                        <div>
                            <h2 className="text-h9 uppercase tracking-wide text-white">{t('colCompare')}</h2>
                            <ul className="mt-2 flex flex-col gap-1.5">
                                {alternatives.map((doc) => (
                                    <li key={doc.slug}>
                                        <Link href={hrefFor('alternatives', doc.slug, locale)} className={linkClass}>
                                            {doc.frontmatter.title}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {(hasIndexedContent || guides.length > 0) && (
                        <div>
                            <h2 className="text-h9 uppercase tracking-wide text-white">{t('colGuides')}</h2>
                            <ul className="mt-2 flex flex-col gap-1.5">
                                {guides.map((doc) => (
                                    <li key={doc.slug}>
                                        <Link href={hrefFor('blog', doc.slug, locale)} className={linkClass}>
                                            {doc.frontmatter.title}
                                        </Link>
                                    </li>
                                ))}
                                {hasIndexedContent && (
                                    <li>
                                        <Link href={localizedPath('/blog', locale)} className={linkClass}>
                                            {t('allGuides')}
                                        </Link>
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}
                </nav>
            </div>

            <div className="border-t border-white/20">
                <div className="mx-auto flex w-full max-w-xl flex-wrap items-center justify-between gap-4 px-5 py-4">
                    <p className="text-sm text-white/70">
                        {t('madeByPrefix')}{' '}
                        <a
                            href="https://squirrellabs.dev/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline transition-opacity hover:opacity-80"
                        >
                            {t('madeByBrand')}
                        </a>
                    </p>
                    <ul className="flex items-center gap-4">
                        {LEGAL_LINKS.map((entry) => (
                            <li key={entry.key}>
                                {/* Split's own page is same-origin, so it opens in place; the
                                    notices that still live on peanut.me open in a new tab. */}
                                {entry.href.startsWith('/') ? (
                                    <Link
                                        href={entry.href}
                                        className="text-sm text-white/70 transition-colors hover:text-white"
                                    >
                                        {t(entry.key)}
                                    </Link>
                                ) : (
                                    <a
                                        href={entry.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-white/70 transition-colors hover:text-white"
                                    >
                                        {t(entry.key)}
                                    </a>
                                )}
                            </li>
                        ))}
                    </ul>
                    {showLocaleSwitcher && <LocaleSwitcher label={tLocale('label')} compact />}
                </div>
            </div>
        </footer>
    )
}

export default SiteFooter
