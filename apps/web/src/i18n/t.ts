/**
 * A translator for code that is not a component.
 *
 * Components use next-intl through hooks and request-scoped server helpers. Plain modules have no
 * request context, so this binds the same next-intl translator to an explicitly loaded catalog.
 * Message lookup, ICU plurals and interpolation therefore have one implementation everywhere.
 */

import { createTranslator } from 'next-intl'
import { asLocale, type Locale } from './locales'
import { loadMessages } from './messages'

/** Values accepted by ICU messages without rich React nodes. */
export type TranslationParams = Record<string, string | number | Date>
export type Translator = (key: string, params?: TranslationParams) => string

export async function translate(locale: string, key: string, params?: TranslationParams): Promise<string> {
    return (await getTranslator(locale))(key, params)
}

/**
 * Bind one standard translator to one lazy-loaded catalog. Catalog parity is enforced by
 * `pnpm i18n:audit`, so a supported locale never needs a second fallback catalog in memory.
 */
export async function getTranslator(locale: string): Promise<Translator> {
    const active: Locale = asLocale(locale)
    const messages = await loadMessages(active)
    const translator = createTranslator({
        locale: active,
        messages,
        onError: (error) => {
            if (process.env.NODE_ENV === 'development') console.warn('[split] i18n', error.message)
        },
        getMessageFallback: ({ key, namespace }) => (namespace ? `${namespace}.${key}` : key),
    })
    return translator as unknown as Translator
}
