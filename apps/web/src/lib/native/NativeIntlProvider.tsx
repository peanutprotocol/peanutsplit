'use client'

import { useEffect, useState } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import {
    DEFAULT_LOCALE,
    HREFLANG,
    LOCALE_COOKIE,
    localeFromAcceptLanguage,
    localeFromStoredPreference,
    type Locale,
} from '@/i18n/locales'
import { loadMessages, type Messages } from '@/i18n/messages'

/** The app has no server to read a cookie, so the stored choice lives in localStorage under the cookie's name. */
function resolveLocale(): Locale {
    let stored: string | null = null
    try {
        stored = localStorage.getItem(LOCALE_COOKIE)
    } catch {
        // Storage can throw in a locked-down WebView; the device language still applies.
    }
    return (
        localeFromStoredPreference(stored) ??
        localeFromAcceptLanguage((navigator.languages ?? [navigator.language]).join(',')) ??
        DEFAULT_LOCALE
    )
}

/** Keep the web's production behaviour: a missing key renders its path; `i18n:audit` is the gate. */
const ignoreIntlError = () => {}

/**
 * The app's i18n root (ARCHITECTURE 6): stored choice, else device language, else English.
 * Renders nothing until the catalog has loaded; the native splash is still up then.
 */
export function NativeIntlProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<{ locale: Locale; messages: Messages; timeZone: string } | null>(null)

    useEffect(() => {
        let active = true
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
        const apply = (locale: Locale, messages: Messages) => {
            if (!active) return
            document.documentElement.lang = HREFLANG[locale]
            setState({ locale, messages, timeZone })
        }
        const locale = resolveLocale()
        // Catalogs are local chunks, so a failure is a broken build; English still beats a blank app.
        loadMessages(locale)
            .then((messages) => apply(locale, messages))
            .catch(() => loadMessages(DEFAULT_LOCALE).then((messages) => apply(DEFAULT_LOCALE, messages)))
        return () => {
            active = false
        }
    }, [])

    if (!state) return null
    return (
        <NextIntlClientProvider
            locale={state.locale}
            messages={state.messages}
            timeZone={state.timeZone}
            onError={ignoreIntlError}
        >
            {children}
        </NextIntlClientProvider>
    )
}
