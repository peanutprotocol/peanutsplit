/**
 * Campaign parameters, read in and passed on.
 *
 * A template link is pasted into somebody else's community, so the campaign belongs to whoever
 * posted it. The page reads the one it arrived with and hands the same values to its own CTA
 * rather than tagging that internal hop as a source of its own — a link that re-sources itself
 * overwrites the only attribution that was worth having.
 *
 * Values are reflected into an href on a shared-cacheable page, so they are narrowed to the shape
 * an analytics label actually has instead of being passed through.
 */

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

export type UtmKey = (typeof UTM_KEYS)[number]
export type Utm = Partial<Record<UtmKey, string>>

/** What Next hands a page as `searchParams`, and what `URLSearchParams` can be flattened into. */
export type Query = Record<string, string | string[] | undefined>

const LABEL = /^[a-z0-9](?:[a-z0-9._-]{0,46}[a-z0-9])?$/

/** A campaign value, or null. Lowercased first: `Reddit` and `reddit` are one source. */
export function utmLabel(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const normalised = value.trim().toLowerCase()
    return LABEL.test(normalised) ? normalised : null
}

export const firstValue = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value

export function readUtm(query: Query): Utm {
    const utm: Utm = {}
    for (const key of UTM_KEYS) {
        const label = utmLabel(firstValue(query[key]))
        if (label) utm[key] = label
    }
    return utm
}

/** Append query values to a path, dropping the empty ones and keeping any query already on it. */
export function withParams(path: string, params: Record<string, string | undefined>): string {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value)
    const search = query.toString()
    if (!search) return path
    return `${path}${path.includes('?') ? '&' : '?'}${search}`
}
