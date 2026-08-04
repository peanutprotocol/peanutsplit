'use client'

/**
 * Three buttons and a page reload. That is the whole feature.
 *
 * There is no locale in the URL, so there is nothing to navigate to — the switcher writes the
 * cookie the server reads and reloads, which re-renders every server component in the new
 * language with no hydration mismatch to manage.
 *
 * The labels are endonyms (see `LOCALE_LABELS`): someone who landed in a language they cannot
 * read finds the way out by recognising "English", not by parsing the UI around it.
 */

import { useLocale } from 'next-intl'
import { LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/locales'
import { cn } from '@/lib/cn'
import { setLocaleAndReload } from '@/lib/locale-cookie'

/**
 * `compact` is the footer-bar form: three words on a dark ground, no boxes and no heading,
 * sized to sit on one line beside the maker credit. The full form is the bordered segmented
 * control, which needs a heading to explain what the three words are.
 *
 * Both forms are the same three buttons doing the same thing, so the testids match — a test
 * does not care which skin the switcher is wearing.
 */
export function LocaleSwitcher({
    label,
    className,
    compact = false,
}: {
    label: string
    className?: string
    compact?: boolean
}) {
    const current = useLocale()

    if (compact) {
        return (
            <div role="group" aria-label={label} className={cn('flex items-center gap-3', className)}>
                {LOCALES.map((locale: Locale) => {
                    const active = current === locale
                    return (
                        <button
                            key={locale}
                            type="button"
                            lang={locale}
                            aria-pressed={active}
                            data-testid={`locale-${locale}`}
                            onClick={() => setLocaleAndReload(locale)}
                            className={cn(
                                'min-h-9 text-sm transition-colors duration-150',
                                active ? 'font-bold text-white underline underline-offset-4' : 'text-white/70'
                            )}
                        >
                            {LOCALE_LABELS[locale]}
                        </button>
                    )
                })}
            </div>
        )
    }

    return (
        <div className={cn('flex flex-col gap-2', className)}>
            <span className="text-h8 uppercase tracking-wide text-grey-1">{label}</span>
            <div role="group" aria-label={label} className="flex overflow-hidden rounded-sm border border-n-1">
                {LOCALES.map((locale: Locale) => {
                    const active = current === locale
                    return (
                        <button
                            key={locale}
                            type="button"
                            lang={locale}
                            aria-pressed={active}
                            data-testid={`locale-${locale}`}
                            data-focus-contained
                            data-focus-tone={active ? 'dark' : 'light'}
                            onClick={() => setLocaleAndReload(locale)}
                            className={cn(
                                'min-h-11 flex-1 px-3 py-2 text-h8 transition-colors duration-150',
                                active ? 'bg-n-1 text-white' : 'bg-white text-n-1'
                            )}
                        >
                            {LOCALE_LABELS[locale]}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

export default LocaleSwitcher
