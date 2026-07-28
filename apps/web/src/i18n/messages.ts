/**
 * The one place a catalog is loaded.
 *
 * Two rules, both learned the hard way:
 *
 * 1. **Static import specifiers.** A previous production incident shipped a build whose locale
 *    JSON was read from disk at runtime; the files were not in the deployed bundle and every
 *    single message silently fell back to its bare key. `import('./messages/es.json')` written
 *    out literally is a promise the bundler can see and therefore emit. Never replace this map
 *    with `import(\`./messages/${locale}.json\`)` or an `fs.readFile`.
 *
 * 2. **One catalog per request, lazily.** The map holds *importers*, not modules, so a request
 *    serving `es` never pulls `en` or `pt-BR` into memory. Eager-loading all three, or preloading
 *    the fallback alongside the active locale, is the measured regression this shape exists to
 *    prevent.
 */

import { DEFAULT_LOCALE, type Locale } from './locales'

/** Arbitrarily nested; leaves are ICU MessageFormat strings. */
export type Messages = { [key: string]: string | Messages }

const LOADERS: Record<Locale, () => Promise<{ default: Messages }>> = {
    en: () => import('./messages/en.json'),
    es: () => import('./messages/es.json'),
    'pt-BR': () => import('./messages/pt-BR.json'),
}

const cache = new Map<Locale, Messages>()
/** In-flight dedupe: two concurrent requests for a cold locale must not both parse it. */
const pending = new Map<Locale, Promise<Messages>>()

export async function loadMessages(locale: Locale): Promise<Messages> {
    const cached = cache.get(locale)
    if (cached) return cached

    const inFlight = pending.get(locale)
    if (inFlight) return inFlight

    const promise = LOADERS[locale]()
        .then((module) => {
            cache.set(locale, module.default)
            return module.default
        })
        .finally(() => {
            // Cleared either way — a failed load must be retryable, not permanently pending.
            pending.delete(locale)
        })

    pending.set(locale, promise)
    return promise
}

/**
 * The English catalog, memoised at module level. `loadMessages` already memoises, so this is
 * only a name for "the fallback" — it is never fetched until something actually misses.
 */
export const loadFallbackMessages = (): Promise<Messages> => loadMessages(DEFAULT_LOCALE)
