import { SPLIT_CONTENT_INDEX_RELEASED } from './index-release'

/**
 * Indexing needs the reviewed source flip. A runtime value cannot turn it on; once released, an
 * explicit false (or any malformed configured value) remains an emergency fail-closed override.
 */
export function splitContentIndexableFor(value: string | undefined, released: boolean): boolean {
    if (!released) return false
    return value === undefined || value === 'true'
}

export function splitContentIndexable(): boolean {
    return splitContentIndexableFor(process.env.SEO_INDEXABLE, SPLIT_CONTENT_INDEX_RELEASED)
}
