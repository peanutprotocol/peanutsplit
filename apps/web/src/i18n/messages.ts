/**
 * The one place a catalog is loaded.
 *
 * Two rules, both learned the hard way:
 *
 * 1. **Static import specifiers.** A previous production incident shipped a build whose locale
 *    JSON was read from disk at runtime; the files were not in the deployed bundle and every
 *    single message silently fell back to its bare key. `import('./messages/es-419.json')` written
 *    out literally is a promise the bundler can see and therefore emit. Never replace this map
 *    with `import(\`./messages/${locale}.json\`)` or an `fs.readFile`.
 *
 * 2. **One catalog per request, lazily.** The map holds *importers*, not modules, so a request
 *    serving `es-419` never pulls `en` or `pt-br` into memory. Eager-loading all three, or preloading
 *    the fallback alongside the active locale, is the measured regression this shape exists to
 *    prevent.
 */

import type { Locale } from './locales'

/** Arbitrarily nested; leaves are ICU MessageFormat strings. */
export type Messages = { [key: string]: string | Messages }

const LOADERS: Record<Locale, () => Promise<{ default: Messages }>> = {
    en: () => import('./messages/en.json'),
    'es-419': () => import('./messages/es-419.json'),
    'pt-br': () => import('./messages/pt-br.json'),
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
