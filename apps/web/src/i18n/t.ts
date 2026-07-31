/**
 * A translator for code that is not a component.
 *
 * next-intl covers React — `useTranslations` in components, `getTranslations` in async server
 * code like `generateMetadata`. Neither reaches a plain module: a cron script, a webhook
 * formatter, an email body. This is the ~40 lines that do, with no React and no request context.
 *
 * It is deliberately NOT an ICU implementation. It substitutes `{param}` and nothing else, so a
 * message written as an ICU plural comes back with its plural syntax intact — if you need
 * plurals outside a component, render them in the component or add a non-ICU key. Keeping the
 * two engines apart is cheaper than half-implementing the second one.
 *
 * The English catalog is the fallback and is loaded lazily, only on the first actual miss, then
 * memoised for the process (`loadMessages` owns both). A request in `es` that misses nothing
 * never touches `en`.
 */

import { asLocale, DEFAULT_LOCALE, type Locale } from './locales'
import { loadMessages, type Messages } from './messages'

/** Values a message can interpolate. Objects would stringify to `[object Object]` in a user's face. */
export type TranslationParams = Record<string, string | number>

/**
 * Walk a dot path to a leaf string. Returns undefined for a missing path AND for a path that
 * lands on a nested object — `t('room')` where `room` is a namespace must miss, not render JSON.
 */
export function pick(messages: Messages, key: string): string | undefined {
    let node: string | Messages | undefined = messages
    for (const segment of key.split('.')) {
        if (typeof node !== 'object' || node === null) return undefined
        node = node[segment]
    }
    return typeof node === 'string' ? node : undefined
}

/**
 * `Hi {name}` + `{name: 'Ana'}` → `Hi Ana`. An unmatched placeholder is left verbatim rather
 * than blanked: `{name}` on screen names the missing param, an empty gap names nothing.
 */
export function interpolate(template: string, params?: TranslationParams): string {
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    )
}

/**
 * Resolve one key: active locale → English → the key itself. The bare key is a last resort and
 * is meant to be conspicuous — if you see one in output, the catalog is wrong, not the caller.
 */
export async function translate(locale: string, key: string, params?: TranslationParams): Promise<string> {
    const active: Locale = asLocale(locale)

    const found = pick(await loadMessages(active), key)
    if (found !== undefined) return interpolate(found, params)

    if (active !== DEFAULT_LOCALE) {
        const fallback = pick(await loadMessages(DEFAULT_LOCALE), key)
        if (fallback !== undefined) return interpolate(fallback, params)
    }

    return key
}

/**
 * A bound translator, for the common case of several messages in one locale. Both catalogs are
 * resolved through the same memoised loader, so this is one await regardless of how many keys
 * the caller goes on to read.
 */
export async function getTranslator(
    locale: string
): Promise<(key: string, params?: TranslationParams) => Promise<string>> {
    const active: Locale = asLocale(locale)
    await loadMessages(active)
    return (key, params) => translate(active, key, params)
}
