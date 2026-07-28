'use client'

/**
 * Three buttons and a page reload. That is the whole feature.
 *
 * There is no locale in the URL, so there is nothing to navigate to — the switcher writes the
 * cookie the server reads and reloads, which re-renders every server component in the new
 * language with no hydration mismatch to manage.
 *
 * The labels are endonyms and are NOT translated (see `LOCALE_LABELS`): someone who landed in a
 * language they can't read finds the way out by recognising "English", not by parsing the UI
 * around it.
 */

import { useLocale } from 'next-intl'
import { LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/locales'
import { cn } from '@/lib/cn'
import { setLocaleAndReload } from '@/lib/locale-cookie'

export function LocaleSwitcher({ label, className }: { label: string; className?: string }) {
    const current = useLocale()

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
                            // Endonyms must survive Chrome's auto-translate, or the escape
                            // hatch gets rewritten into the language you are trying to leave.
                            translate="no"
                            aria-pressed={active}
                            data-testid={`locale-${locale}`}
                            onClick={() => setLocaleAndReload(locale)}
                            className={cn(
                                'notranslate min-h-11 flex-1 px-3 py-2 text-h8 transition-colors duration-150',
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
