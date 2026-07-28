import Image from 'next/image'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import peanutLogo from '@/assets/logos/peanut-logo.svg'
import { LocaleSwitcher } from '@/components/ui/LocaleSwitcher'
import { asLocale } from '@/i18n/locales'
import { localizedPath } from '@/i18n/paths'
import { hrefFor, listDocs } from '@/lib/content'

/** Guides listed by name before the column defers to the hub. Four is the point at which the
 *  column stops being a directory and starts being a second copy of /blog. */
const GUIDES_SHOWN = 4

/** Paths on peanut.me, which is a different app with its own routing — nothing here can be
 *  derived from Split's own route table, so it is written out once. */
const PEANUT_LINKS = [
    { key: 'peanutHome', path: '' },
    { key: 'peanutHelp', path: '/help' },
    { key: 'peanutTerms', path: '/terms' },
    { key: 'peanutPrivacy', path: '/privacy' },
] as const

/**
 * The site's foot: the Peanut mark, and every page Split has, grouped.
 *
 * It used to be one centred row of four grey links, which is the shape a footer takes when
 * nobody has decided what it is for. This is the shape peanut.me uses — logo and maker credit on
 * the left, named columns beside it, a thin bar underneath — because Split is a Peanut product
 * and the two feet should rhyme.
 *
 * BRAND GUARDRAIL, unchanged: Peanut appears here as a mark and nowhere else on the page. What
 * changed is that the mark is now the real logo rather than the word set in the display face and
 * painted `secondary-1`. Pink is still reserved — this footer and the Peanut settle option, and
 * nowhere else in Split.
 *
 * The guide and comparison columns are read off disk for the current locale, so a new markdown
 * file appears here without anyone editing this component. That is the point: a page nothing
 * links to is one Google finds late and re-crawls rarely, and the footer is the one component
 * every page shares. The hand-built pages (`/splitwise-alternative`, `/import`) are English-only
 * by decision and are therefore NOT run through `localizedPath` — a `/es/import` would 404.
 *
 * `showLocaleSwitcher` exists for the indexed pages. The switcher sets a cookie and reloads,
 * which is right for the app — one URL, three languages. On `/es/blog/…` it would reload the same
 * Spanish URL, so it reads as a broken control. Those pages pass `false` and offer real links to
 * the translations that exist instead (see ArticleLayout / ContentHub).
 */
export function SiteFooter({
    showCompareLink = true,
    showLocaleSwitcher = true,
}: {
    showCompareLink?: boolean
    showLocaleSwitcher?: boolean
}) {
    const t = useTranslations('marketing.footer')
    const tLocale = useTranslations('locale')
    const locale = asLocale(useLocale())

    const guides = listDocs('blog', locale).slice(0, GUIDES_SHOWN)
    const alternatives = listDocs('alternatives', locale)

    const linkClass = 'flex min-h-9 items-center text-sm text-white/70 transition-colors hover:text-white'

    return (
        <footer className="mt-auto bg-n-1 pb-[env(safe-area-inset-bottom)] text-white">
            <div className="mx-auto w-full max-w-xl px-5 py-8">
                <a
                    href="https://peanut.me?utm_source=split&utm_medium=footer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex transition-opacity hover:opacity-80"
                >
                    <Image src={peanutLogo} alt={t('logoAlt')} width={104} height={38} unoptimized />
                </a>
                <p className="mt-2 text-sm text-white/70">{t('tagline')}</p>

                <nav className="mt-7 grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-4">
                    <div>
                        <h2 className="text-h9 uppercase tracking-wide text-white">{t('colSplit')}</h2>
                        <ul className="mt-2 flex flex-col">
                            <li>
                                <Link href="/" className={linkClass}>
                                    {t('createSplit')}
                                </Link>
                            </li>
                            <li>
                                <Link href="/import" className={linkClass}>
                                    {t('importLink')}
                                </Link>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-h9 uppercase tracking-wide text-white">{t('colCompare')}</h2>
                        <ul className="mt-2 flex flex-col">
                            {showCompareLink && (
                                <li>
                                    <Link href="/splitwise-alternative" className={linkClass}>
                                        {t('compareLink')}
                                    </Link>
                                </li>
                            )}
                            {alternatives.map((doc) => (
                                <li key={doc.slug}>
                                    <Link href={hrefFor('alternatives', doc.slug, locale)} className={linkClass}>
                                        {doc.frontmatter.title}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-h9 uppercase tracking-wide text-white">{t('colGuides')}</h2>
                        <ul className="mt-2 flex flex-col">
                            {guides.map((doc) => (
                                <li key={doc.slug}>
                                    <Link href={hrefFor('blog', doc.slug, locale)} className={linkClass}>
                                        {doc.frontmatter.title}
                                    </Link>
                                </li>
                            ))}
                            {/* The hub is the only internal link every article shares — it is how
                                a crawler that lands on any page finds the rest of them. */}
                            <li>
                                <Link href={localizedPath('/blog', locale)} className={linkClass}>
                                    {t('allGuides')}
                                </Link>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-h9 uppercase tracking-wide text-white">{t('colPeanut')}</h2>
                        <ul className="mt-2 flex flex-col">
                            {PEANUT_LINKS.map((entry) => (
                                <li key={entry.key}>
                                    <a
                                        href={`https://peanut.me${entry.path}?utm_source=split&utm_medium=footer`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={linkClass}
                                    >
                                        {t(entry.key)}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
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
                    {showLocaleSwitcher && <LocaleSwitcher label={tLocale('label')} compact />}
                </div>
            </div>
        </footer>
    )
}

export default SiteFooter
