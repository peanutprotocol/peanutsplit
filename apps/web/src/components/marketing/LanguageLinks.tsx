import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { LOCALE_LABELS, type Locale } from '@/i18n/locales'
import { localizedPath } from '@/i18n/paths'

/**
 * Links to the other languages of THIS page.
 *
 * hreflang tells a crawler which URL to serve to whom; it does nothing for a reader who landed on
 * the wrong one. The footer's locale switcher does not help either — it writes a cookie and
 * reloads, which on `/es/blog/…` reloads the same Spanish URL. These links are the only control
 * that actually crosses to the translated page, which is why the indexed pages hide the switcher
 * and render this instead.
 *
 * `available` must be the locales that really have a file. Linking a translation that does not
 * exist sends a reader to a 404 in a language they can read even less than the one they left.
 *
 * Labels are endonyms and deliberately untranslated, for the same reason the switcher's are:
 * someone stranded in a language they cannot read finds the way out by recognising "English".
 */
export async function LanguageLinks({
    /** Unprefixed path, e.g. `/blog/split-a-trip`. */
    path,
    current,
    available,
}: {
    path: string
    current: Locale
    available: Locale[]
}) {
    const others = available.filter((locale) => locale !== current)
    if (others.length === 0) return null

    const t = await getTranslations({ locale: current, namespace: 'content' })

    return (
        <nav aria-label={t('otherLanguages')} className="mx-auto w-full max-w-xl px-5 pb-8">
            <span className="text-xs text-grey-1">{t('otherLanguages')}: </span>
            {others.map((locale, i) => (
                <span key={locale}>
                    {i > 0 && <span className="text-xs text-grey-1"> · </span>}
                    <Link
                        href={localizedPath(path, locale)}
                        hrefLang={locale}
                        lang={locale}
                        translate="no"
                        className="notranslate text-xs text-n-1 underline underline-offset-2"
                    >
                        {LOCALE_LABELS[locale]}
                    </Link>
                </span>
            ))}
        </nav>
    )
}

export default LanguageLinks
